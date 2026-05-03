import {
  AutoFeatureExtractor,
  AutoModel,
  env,
  type ProgressInfo,
} from "@huggingface/transformers";
import { WordScore, type WordTimestamp } from "../types";

// Polyfill for String.prototype.replaceAll (required by some environments)
if (typeof String.prototype.replaceAll !== "function") {
  String.prototype.replaceAll = function (search, replacement) {
    if (search instanceof RegExp) return this.replace(search, replacement);
    return this.replace(
      new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      replacement,
    );
  };
}

// Skip local model check for faster loading in worker
env.allowLocalModels = false;

// Scoring worker message types
interface ScoringWorkerRequest {
  type: "score";
  segmentId: number;
  refAudio: Float32Array;
  userAudio: Float32Array;
  wordTimestamps: WordTimestamp[];
  generation: number;
}

interface ScoringWorkerModelProgress {
  type: "modelProgress";
  progress: number;
}

const WAV2VEC2_MODEL = "Xenova/hubert-base-ls960";
const HOP_STEP = 0.02; // seconds per output frame
const SAMPLE_RATE = 16000; // Expected sample rate for extraction

let model = null;
let featureExtractor = null;
let inFlight: { segmentId: number; generation: number } | null = null;

async function ensureWav2Vec2Pipeline(): Promise<void> {
  if (model && featureExtractor) return;

  try {
    const progress_callback = (p: ProgressInfo) => {
      const info = p as { progress: number };
      if (!info.progress) return;
      const msg: ScoringWorkerModelProgress = {
        type: "modelProgress",
        progress: info.progress,
      };
      self.postMessage(msg);
    };

    [model, featureExtractor] = await Promise.all([
      AutoModel.from_pretrained(WAV2VEC2_MODEL, {
        dtype: "q8", // fp32 required for high-frequency consonant resolution
        device: "wasm",
        progress_callback,
      }),
      AutoFeatureExtractor.from_pretrained(WAV2VEC2_MODEL, {
        progress_callback,
      }),
    ]);
  } catch (err) {
    console.error("Worker | Failed to initialize Wav2Vec2 components:", err);
    throw err;
  }
}

function cosineDistance(v1: Float32Array, v2: Float32Array): number {
  let dot = 0;
  let mag1 = 0;
  let mag2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    mag1 += v1[i] * v1[i];
    mag2 += v2[i] * v2[i];
  }
  const mag = Math.sqrt(mag1) * Math.sqrt(mag2);
  if (mag === 0) return 1.0;
  return 1.0 - dot / mag;
}

async function getEmbeddings(audio: Float32Array): Promise<Float32Array[]> {
  if (!model || !featureExtractor)
    throw new Error("Model or feature extractor not initialized");

  try {
    // 1. Preprocess audio using the feature extractor
    const inputs = await featureExtractor(audio);

    // 2. Run the model with the preprocessed inputs
    const output = await model(inputs);

    // 3. Extract the last hidden state (the embeddings)
    const lastHiddenState =
      output.last_hidden_state ||
      (output.hidden_states &&
        output.hidden_states[output.hidden_states.length - 1]);

    if (!lastHiddenState) {
      throw new Error("Model output missing hidden states");
    }

    const dims = lastHiddenState.dims;
    const numFrames = dims.length === 3 ? dims[1] : dims[0];
    const hiddenSize = dims[dims.length - 1]; // Should be 768
    const data = lastHiddenState.data as Float32Array;

    const embeddings: Float32Array[] = [];
    for (let i = 0; i < numFrames; i++) {
      embeddings.push(data.slice(i * hiddenSize, (i + 1) * hiddenSize));
    }
    return embeddings;
  } catch (err) {
    console.error("Worker | Error in getEmbeddings:", err);
    throw err;
  }
}

class SimpleDTW {
  public matrix: number[][];
  constructor(
    private s1: Float32Array[], // Reference
    private s2: Float32Array[], // User
    private distFn: (v1: Float32Array, v2: Float32Array) => number,
  ) {
    this.matrix = this.compute(s1, s2);
  }

  private compute(s1: Float32Array[], s2: Float32Array[]): number[][] {
    const n = s1.length;
    const m = s2.length;
    if (n === 0 || m === 0) return [];

    const dtw = Array.from({ length: n }, () => new Array(m).fill(Infinity));

    // This severely punishes the algorithm for stretching or compressing time.
    // If you drop a syllable, it forces a failure rather than stretching the survivor.
    const STEP_PENALTY = 1.5;

    // Subsequence DTW: Allow unconstrained start on the user axis
    for (let j = 0; j < m; j++) {
      dtw[0][j] = this.distFn(s1[0], s2[j]);
    }

    // Strict accumulation on the reference axis
    for (let i = 1; i < n; i++) {
      dtw[i][0] = dtw[i - 1][0] + this.distFn(s1[i], s2[0]) * STEP_PENALTY;
    }

    for (let i = 1; i < n; i++) {
      for (let j = 1; j < m; j++) {
        const cost = this.distFn(s1[i], s2[j]);
        const match = dtw[i - 1][j - 1] + cost;
        const insertion = dtw[i - 1][j] + cost * STEP_PENALTY;
        const deletion = dtw[i][j - 1] + cost * STEP_PENALTY;

        dtw[i][j] = Math.min(match, insertion, deletion);
      }
    }
    return dtw;
  }

  getPath(): [number, number][] {
    const n = this.s1.length;
    const m = this.s2.length;
    if (n === 0 || m === 0) return [];

    // Subsequence DTW: Find the lowest cost endpoint on the user axis
    let minCost = Infinity;
    let endJ = m - 1;
    for (let j = 0; j < m; j++) {
      if (this.matrix[n - 1][j] < minCost) {
        minCost = this.matrix[n - 1][j];
        endJ = j;
      }
    }

    let i = n - 1;
    let j = endJ;
    const path: [number, number][] = [[i, j]];

    // Trace back strictly to the start of the reference audio
    while (i > 0) {
      if (j === 0) {
        i--;
      } else {
        const diag = this.matrix[i - 1][j - 1];
        const up = this.matrix[i - 1][j]; // insertion
        const left = this.matrix[i][j - 1]; // deletion

        const min = Math.min(diag, up, left);

        if (min === diag) {
          i--;
          j--;
        } else if (min === up) i--;
        else j--;
      }
      path.push([i, j]);
    }
    return path.reverse();
  }
}

self.onmessage = async (e: MessageEvent<ScoringWorkerRequest>) => {
  const { type, segmentId, refAudio, userAudio, wordTimestamps, generation } =
    e.data;
  if (type !== "score") return;

  try {
    inFlight = { segmentId, generation };

    await ensureWav2Vec2Pipeline();

    const refEmb = await getEmbeddings(refAudio);
    const userEmb = await getEmbeddings(userAudio);

    if (refEmb.length === 0 || userEmb.length === 0) {
      throw new Error("Could not extract embeddings");
    }

    // --- 1. SMART MICRO-VAD PRECOMPUTATION ---
    const frameEnergies: number[] = [];
    const samplesPerFrame = Math.floor(HOP_STEP * SAMPLE_RATE);

    for (let i = 0; i < refEmb.length; i++) {
      const start = i * samplesPerFrame;
      const end = Math.min(start + samplesPerFrame, refAudio.length);
      let sumSquares = 0;
      for (let j = start; j < end; j++) {
        sumSquares += refAudio[j] * refAudio[j];
      }
      frameEnergies.push(Math.sqrt(sumSquares / Math.max(1, end - start)));
    }

    // Dynamic Noise Floor: Find the 10th percentile of volume (the baseline room static)
    const sortedEnergies = [...frameEnergies].sort((a, b) => a - b);
    const noiseFloor =
      sortedEnergies[Math.floor(sortedEnergies.length * 0.1)] || 0.001;

    // Threshold is explicitly 3x the room static.
    // This perfectly captures quiet consonants without capturing room hiss.
    const SILENCE_THRESHOLD = noiseFloor * 3.0;

    // Calculate absolute final frame of acoustic speech
    let lastSpeechFrame = refEmb.length - 1;
    for (let i = refEmb.length - 1; i >= 0; i--) {
      if (frameEnergies[i] > SILENCE_THRESHOLD) {
        // Add a tiny 2-frame (40ms) buffer to safely capture the very tail of the final plosive
        lastSpeechFrame = Math.min(refEmb.length - 1, i + 2);
        break;
      }
    }
    // ------------------------------------

    const dtw = new SimpleDTW(refEmb, userEmb, cosineDistance);
    const path = dtw.getPath();

    if (path.length === 0) {
      console.warn(
        "Worker | DTW path blocked by band or empty. Returning Good for all words.",
      );
      self.postMessage({
        type: "result",
        segmentId,
        wordScores: wordTimestamps.map(() => WordScore.Good),
        generation,
      });
      return;
    }

    const wordScores: WordScore[] = [];
    const pathCosts: Map<number, number[]> = new Map();

    for (let i = 0; i < path.length; i++) {
      const [rIdx, uIdx] = path[i];
      const dist = cosineDistance(refEmb[rIdx], userEmb[uIdx]);
      if (!pathCosts.has(rIdx)) pathCosts.set(rIdx, []);
      pathCosts.get(rIdx)!.push(dist);
    }

    const PADDING_SECONDS = 0.1;
    const paddingFrames = Math.ceil(PADDING_SECONDS / HOP_STEP);
    const wordInfos: { avgCost: number; hasCoverage: boolean; word: string }[] =
      [];

    for (let wIdx = 0; wIdx < wordTimestamps.length; wIdx++) {
      const wt = wordTimestamps[wIdx];
      const isLastWord = wIdx === wordTimestamps.length - 1;

      const startFrame = Math.max(
        0,
        Math.floor(wt.start / HOP_STEP) - paddingFrames,
      );

      const endFrame = isLastWord
        ? Math.max(startFrame, lastSpeechFrame) // Clean terminal truncation
        : Math.min(
            refEmb.length - 1,
            Math.ceil(wt.end / HOP_STEP) + paddingFrames,
          );

      let totalCost = 0,
        count = 0;

      for (let f = startFrame; f <= endFrame; f++) {
        // NO HOLE-PUNCHING. We evaluate every continuous frame inside the boundaries
        // to ensure vowels and quiet consonants are all graded together.
        const costs = pathCosts.get(f);
        if (costs) {
          for (const c of costs) {
            totalCost += c;
            count++;
          }
        }
      }

      if (count > 0) {
        wordInfos.push({
          avgCost: totalCost / count,
          hasCoverage: true,
          word: wt.word,
        });
      } else {
        wordInfos.push({ avgCost: 1.0, hasCoverage: false, word: wt.word });
      }
    }

    const PERFECT_DIST = 0.4;
    const FAIL_DIST = 0.75;

    for (const info of wordInfos) {
      if (!info.hasCoverage) {
        wordScores.push(WordScore.Bad);
        continue;
      }

      // Linear map bounded to 0-100 percentage scale
      let scorePercentage =
        100 * (1 - (info.avgCost - PERFECT_DIST) / (FAIL_DIST - PERFECT_DIST));
      scorePercentage = Math.max(0, Math.min(100, scorePercentage));
      const finalScore = Math.round(scorePercentage);

      // Map to Enum for UI consumption
      if (finalScore >= 80) {
        wordScores.push(WordScore.Good);
      } else if (finalScore >= 50) {
        wordScores.push(WordScore.Neutral);
      } else {
        wordScores.push(WordScore.Bad);
      }
    }

    self.postMessage({ type: "result", segmentId, wordScores, generation });
  } catch (err) {
    console.error("Worker | Scoring error:", err);
    self.postMessage({
      type: "error",
      segmentId: inFlight?.segmentId ?? segmentId,
      generation: inFlight?.generation ?? generation,
      error: err.toString(),
    });
  } finally {
    inFlight = null;
  }
};
