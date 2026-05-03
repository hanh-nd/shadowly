import {
  AutoFeatureExtractor,
  AutoModel,
  env,
  FeatureExtractor,
  PreTrainedModel,
  type ProgressInfo,
} from '@huggingface/transformers';

import { TARGET_SAMPLE_RATE as SAMPLE_RATE } from '../constants';
import { WordScore, type WordTimestamp } from '../types';

// --- INJECT EXPORTS/REQUIRE POLYFILL ---
// Polyfill for String.prototype.replaceAll (required by some environments)
if (typeof String.prototype.replaceAll !== 'function') {
  String.prototype.replaceAll = function (
    search: string | RegExp,
    replacement: ((substring: string, ...args: unknown[]) => string) | string,
  ) {
    if (typeof replacement === 'string') {
      if (search instanceof RegExp) return this.replace(search, replacement);
      return this.replace(
        new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        replacement,
      );
    } else {
      if (search instanceof RegExp) return this.replace(search, replacement);
      return this.replace(
        new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        replacement,
      );
    }
  };
}
// Fixes Vite/Webpack bundling errors for vad-web and onnxruntime-web
if (typeof self.exports === 'undefined') {
  self.exports = {};
}
if (typeof self.require === 'undefined') {
  self.require = function () {
    return {};
  } as unknown as NodeJS.Require;
}
// -------------------------------

env.allowLocalModels = false;

interface ScoringWorkerRequest {
  type: 'score';
  segmentId: number;
  refAudio: Float32Array;
  userAudio: Float32Array;
  wordTimestamps: WordTimestamp[];
  generation: number;
}

interface ScoringWorkerModelProgress {
  type: 'modelProgress';
  progress: number;
}

const WAV2VEC2_MODEL = 'Xenova/hubert-base-ls960';
const HOP_STEP = 0.02; // seconds per output frame

let model: PreTrainedModel | null = null;
let featureExtractor: FeatureExtractor | null = null;
let inFlight: { segmentId: number; generation: number } | null = null;

async function ensureWav2Vec2Pipeline(): Promise<void> {
  if (model && featureExtractor) return;

  try {
    const progress_callback = (p: ProgressInfo) => {
      const info = p as { progress: number };
      if (!info.progress) return;
      const msg: ScoringWorkerModelProgress = {
        type: 'modelProgress',
        progress: info.progress,
      };
      self.postMessage(msg);
    };

    [model, featureExtractor] = await Promise.all([
      AutoModel.from_pretrained(WAV2VEC2_MODEL, {
        dtype: 'q8', // fp32 required for high-frequency consonant resolution
        device: 'wasm',
        progress_callback,
      }),
      AutoFeatureExtractor.from_pretrained(WAV2VEC2_MODEL, {
        progress_callback,
      }),
    ]);
  } catch (err) {
    console.error('Worker | Failed to initialize Wav2Vec2 components:', err);
    throw err;
  }
}

// Zero-centers embeddings to fix Neural Anisotropy (the "narrow cone" problem)
function centerEmbeddings(embeddings: Float32Array[]): Float32Array[] {
  if (embeddings.length === 0) return embeddings;
  const hiddenSize = embeddings[0].length;
  const centered: Float32Array[] = [];

  for (let i = 0; i < embeddings.length; i++) {
    const frame = embeddings[i];
    let mean = 0;
    for (let d = 0; d < hiddenSize; d++) mean += frame[d];
    mean /= hiddenSize;

    const centeredFrame = new Float32Array(hiddenSize);
    for (let d = 0; d < hiddenSize; d++) centeredFrame[d] = frame[d] - mean;
    centered.push(centeredFrame);
  }
  return centered;
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
    throw new Error('Model or feature extractor not initialized');

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
      throw new Error('Model output missing hidden states');
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
    console.error('Worker | Error in getEmbeddings:', err);
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

    // Flat Additive Tax: Prevents the DTW from cheating by stretching time infinitely
    const WARP_TAX = 0.05;

    for (let j = 0; j < m; j++) dtw[0][j] = this.distFn(s1[0], s2[j]);
    for (let i = 1; i < n; i++)
      dtw[i][0] = dtw[i - 1][0] + this.distFn(s1[i], s2[0]) + WARP_TAX;

    for (let i = 1; i < n; i++) {
      for (let j = 1; j < m; j++) {
        const cost = this.distFn(s1[i], s2[j]);
        dtw[i][j] = Math.min(
          dtw[i - 1][j - 1] + cost, // Match
          dtw[i - 1][j] + cost + WARP_TAX, // Insertion
          dtw[i][j - 1] + cost + WARP_TAX, // Deletion
        );
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
  if (type !== 'score') return;

  try {
    inFlight = { segmentId, generation };

    await ensureWav2Vec2Pipeline();

    let refEmb = await getEmbeddings(refAudio);
    let userEmb = await getEmbeddings(userAudio);

    if (refEmb.length === 0 || userEmb.length === 0) {
      throw new Error('Could not extract embeddings');
    }

    // Fix the latent space narrow cone
    refEmb = centerEmbeddings(refEmb);
    userEmb = centerEmbeddings(userEmb);

    // --- 1. DUAL-LAYER VAD ARCHITECTURE ---
    const isSpeechFrame = new Array(refEmb.length).fill(false);
    let lastSpeechFrame = 0;

    try {
      // Layer A: Neural VAD
      const vadModule = await import('@ricky0123/vad-web');
      const nrtVAD = await vadModule.NonRealTimeVAD.new({
        positiveSpeechThreshold: 0.5,
        minSpeechMs: 90,
      });

      for await (const segment of nrtVAD.run(refAudio, SAMPLE_RATE)) {
        const startFrame = Math.max(
          0,
          Math.floor(segment.start / SAMPLE_RATE / HOP_STEP),
        );
        const endFrame = Math.min(
          refEmb.length - 1,
          Math.ceil(segment.end / SAMPLE_RATE / HOP_STEP),
        );

        for (let f = startFrame; f <= endFrame; f++) isSpeechFrame[f] = true;
        if (endFrame > lastSpeechFrame) lastSpeechFrame = endFrame;
      }

      if (lastSpeechFrame === 0) {
        throw new Error('VAD found no speech.');
      }

      lastSpeechFrame = Math.min(refEmb.length - 1, lastSpeechFrame + 2); // 40ms trailing consonant safety
    } catch (vadErr) {
      console.warn('Worker | Neural VAD skipped. Using Math VAD.', vadErr);

      // Layer B: Math VAD Fallback
      isSpeechFrame.fill(true);
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
      const NOISE_FLOOR_PERCENTILE = 0.1;
      const MIN_NOISE_FLOOR = 0.001;
      const sortedEnergies = [...frameEnergies].sort((a, b) => a - b);
      const noiseFloor =
        sortedEnergies[
          Math.floor(sortedEnergies.length * NOISE_FLOOR_PERCENTILE)
        ] || MIN_NOISE_FLOOR;

      // Threshold is explicitly 3x the room static.
      // This perfectly captures quiet consonants without capturing room hiss.
      const SILENCE_THRESHOLD = noiseFloor * 3.0;

      lastSpeechFrame = refEmb.length - 1;
      for (let i = refEmb.length - 1; i >= 0; i--) {
        if (frameEnergies[i] > SILENCE_THRESHOLD) {
          // Add a tiny 2-frame (40ms) buffer to safely capture the very tail of the final plosive
          lastSpeechFrame = Math.min(refEmb.length - 1, i + 2);
          break;
        }
      }
    }
    // --------------------------------------------------

    const dtw = new SimpleDTW(refEmb, userEmb, cosineDistance);
    const path = dtw.getPath();

    if (path.length === 0) {
      console.warn(
        'Worker | DTW path blocked by band or empty. Returning Good for all words.',
      );
      self.postMessage({
        type: 'result',
        segmentId,
        wordScores: wordTimestamps.map(() => WordScore.Good),
        generation,
      });
      return;
    }

    const pathCosts: Map<number, number[]> = new Map();
    for (let i = 0; i < path.length; i++) {
      const [rIdx, uIdx] = path[i];
      if (!pathCosts.has(rIdx)) pathCosts.set(rIdx, []);
      pathCosts.get(rIdx)!.push(cosineDistance(refEmb[rIdx], userEmb[uIdx]));
    }

    const PADDING_SECONDS = 0.1;
    const paddingFrames = Math.ceil(PADDING_SECONDS / HOP_STEP);
    const wordInfos: { cost: number; hasCoverage: boolean; word: string }[] =
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

      const frameCosts: number[] = [];
      let hasValidFrames = false;

      for (let f = startFrame; f <= endFrame; f++) {
        if (isSpeechFrame[f]) {
          const costs = pathCosts.get(f);
          if (costs) {
            hasValidFrames = true;
            for (const c of costs) frameCosts.push(c);
          }
        }
      }

      // Fallback if Whisper mapped to pure silence
      if (!hasValidFrames) {
        for (let f = startFrame; f <= endFrame; f++) {
          const costs = pathCosts.get(f);
          if (costs) {
            for (const c of costs) frameCosts.push(c);
          }
        }
      }

      if (frameCosts.length > 0) {
        // --- SLIDING WINDOW PEAK PENALTY ---
        // Prevents good consonants from hiding a totally failed vowel
        let maxWindowCost = 0;
        const WINDOW_SIZE = 3; // 60ms chunks

        if (frameCosts.length >= WINDOW_SIZE) {
          for (let i = 0; i <= frameCosts.length - WINDOW_SIZE; i++) {
            let windowSum = 0;
            for (let j = 0; j < WINDOW_SIZE; j++)
              windowSum += frameCosts[i + j];
            if (windowSum / WINDOW_SIZE > maxWindowCost)
              maxWindowCost = windowSum / WINDOW_SIZE;
          }
        } else {
          // If the word is insanely short, just average it
          let sum = 0;
          for (const c of frameCosts) sum += c;
          maxWindowCost = sum / frameCosts.length;
        }

        wordInfos.push({
          cost: maxWindowCost,
          hasCoverage: true,
          word: wt.word,
        });
      } else {
        wordInfos.push({ cost: 1.0, hasCoverage: false, word: wt.word });
      }
    }

    // Calibrated for Centered Vectors with Peak Penalty Scoring
    const PERFECT_DIST = 0.45;
    const FAIL_DIST = 0.85;

    const wordScores: WordScore[] = [];
    for (const info of wordInfos) {
      if (!info.hasCoverage) {
        wordScores.push(WordScore.Bad);
        continue;
      }

      // Linear map bounded to 0-100 percentage scale
      const MAX_SCORE_PERCENTAGE = 100;
      let scorePercentage =
        MAX_SCORE_PERCENTAGE *
        (1 - (info.cost - PERFECT_DIST) / (FAIL_DIST - PERFECT_DIST));
      scorePercentage = Math.max(
        0,
        Math.min(MAX_SCORE_PERCENTAGE, scorePercentage),
      );
      const finalScore = Math.round(scorePercentage);

      const SCORE_THRESHOLD_GOOD = 80;
      const SCORE_THRESHOLD_NEUTRAL = 50;
      // Map to Enum for UI consumption
      if (finalScore >= SCORE_THRESHOLD_GOOD) {
        wordScores.push(WordScore.Good);
      } else if (finalScore >= SCORE_THRESHOLD_NEUTRAL) {
        wordScores.push(WordScore.Neutral);
      } else {
        wordScores.push(WordScore.Bad);
      }
    }

    self.postMessage({ type: 'result', segmentId, wordScores, generation });
  } catch (err) {
    console.error('Worker | Scoring error:', err);
    self.postMessage({
      type: 'error',
      segmentId: inFlight?.segmentId ?? segmentId,
      generation: inFlight?.generation ?? generation,
      error: err instanceof Error ? err.toString() : String(err),
    });
  } finally {
    inFlight = null;
  }
};
