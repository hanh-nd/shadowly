/* eslint-disable */
import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import { WordScore, type WordTimestamp } from '../types';

// Scoring worker message types
interface ScoringWorkerRequest {
  type: 'score';
  segmentId: number;
  refAudio: Float32Array;
  refSampleRate: number;
  userAudio: Float32Array;
  userSampleRate: number;
  wordTimestamps: WordTimestamp[];
  generation: number;
}

interface EssentiaInstance {
  arrayToVector: (audio: Float32Array) => any;
  vectorToArray: (vector: any) => Float32Array;
  deleteVector: (vector: any) => void;
  FrameGenerator: (audio: any, size: number, hop: number) => {
    size: () => number;
    get: (i: number) => any;
  };
  Windowing: (frame: any, normalized?: boolean, size?: number, type?: string, zeroPadding?: number, zeroPhase?: boolean) => { frame: any };
  Spectrum: (frame: any, size?: number) => { spectrum: any };
  MFCC: (spectrum: any, dctType?: number, highFrequencyBound?: number, inputSize?: number, liftering?: number, logType?: string, lowFrequencyBound?: number, normalize?: string, numberBands?: number, numberCoefficients?: number, sampleRate?: number) => { mfcc: any; bands: any };
}

let essentia: EssentiaInstance | null = null;
let inFlight: { segmentId: number; generation: number } | null = null;

async function ensureEssentia() {
  if (!essentia) {
    try {
      let wasmModule;
      if (typeof EssentiaWASM === 'function') {
        wasmModule = await (EssentiaWASM as any)();
      } else {
        wasmModule = EssentiaWASM;
      }
      essentia = new (Essentia as any)(wasmModule) as EssentiaInstance;
    } catch (err) {
      console.error('Worker | Failed to initialize Essentia:', err);
      throw err;
    }
  }
}

// Portable resample using linear interpolation
function resample(audio: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return audio;
  const ratio = fromRate / toRate;
  const newLength = Math.round(audio.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const fraction = pos - index;
    if (index + 1 < audio.length) {
      result[i] = audio[index] * (1 - fraction) + audio[index + 1] * fraction;
    } else {
      result[i] = audio[index];
    }
  }
  return result;
}

function normalizeMFCCs(mfccs: number[][]): number[][] {
  if (mfccs.length === 0) return mfccs;
  const numCoeffs = mfccs[0].length;
  const means = new Float32Array(numCoeffs);
  const stds = new Float32Array(numCoeffs);

  // Mean
  for (const m of mfccs) {
    for (let i = 0; i < numCoeffs; i++) means[i] += m[i];
  }
  for (let i = 0; i < numCoeffs; i++) means[i] /= mfccs.length;

  // Std
  for (const m of mfccs) {
    for (let i = 0; i < numCoeffs; i++) {
      const diff = m[i] - means[i];
      stds[i] += diff * diff;
    }
  }
  for (let i = 0; i < numCoeffs; i++) stds[i] = Math.sqrt(stds[i] / mfccs.length) + 1e-6;

  // Normalize
  return mfccs.map(m => m.map((val, i) => (val - means[i]) / stds[i]));
}

function getMFCC(audio: Float32Array) {
  if (!essentia) throw new Error('Essentia not initialized');
  
  const frameSize = 512;
  const hopSize = 256;
  const sampleRate = 16000;
  const mfccCoeffs = 13;
  const spectrumSize = (frameSize / 2) + 1;

  let frames;
  try {
    frames = essentia.FrameGenerator(audio, frameSize, hopSize);
  } catch (err) {
    const vec = essentia.arrayToVector(audio);
    frames = essentia.FrameGenerator(vec, frameSize, hopSize);
  }

  const numFrames = frames.size();
  const mfccs: number[][] = [];
  
  for (let i = 0; i < numFrames; i++) {
    const frame = frames.get(i);
    if (!frame) continue;
    
    try {
      const winRes = essentia.Windowing(frame, true, frameSize, 'hann', 0, true);
      const specRes = essentia.Spectrum(winRes.frame, frameSize);
      
      const mfccRes = essentia.MFCC(
        specRes.spectrum, 
        2,
        8000,
        spectrumSize,
        0,
        'dbamp',
        0,
        'unit_sum',
        40,
        mfccCoeffs,
        sampleRate
      );
      
      const mfccArray = essentia.vectorToArray(mfccRes.mfcc);
      mfccs.push(Array.from(mfccArray));
      
      if (winRes.frame && winRes.frame.delete) winRes.frame.delete();
      if (specRes.spectrum && specRes.spectrum.delete) specRes.spectrum.delete();
      if (mfccRes.mfcc && mfccRes.mfcc.delete) mfccRes.mfcc.delete();
      if (mfccRes.bands && mfccRes.bands.delete) mfccRes.bands.delete();
      if (frame && frame.delete) frame.delete();
    } catch (err) {
      break; 
    }
  }
  
  if (frames && (frames as any).delete) (frames as any).delete();
  return normalizeMFCCs(mfccs);
}

function euclideanDistance(v1: number[], v2: number[]): number {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

class SimpleDTW {
  private matrix: number[][];
  constructor(private s1: number[][], private s2: number[][], private distFn: (v1: number[], v2: number[]) => number) {
    this.matrix = this.compute(s1, s2);
  }
  private compute(s1: number[][], s2: number[][]): number[][] {
    const n = s1.length;
    const m = s2.length;
    if (n === 0 || m === 0) return [];
    const dtw = Array.from({ length: n }, () => Array(m).fill(Infinity));
    dtw[0][0] = this.distFn(s1[0], s2[0]);
    for (let i = 1; i < n; i++) dtw[i][0] = dtw[i - 1][0] + this.distFn(s1[i], s2[0]);
    for (let j = 1; j < m; j++) dtw[0][j] = dtw[0][j - 1] + this.distFn(s1[0], s2[j]);
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < m; j++) {
        const cost = this.distFn(s1[i], s2[j]);
        dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
      }
    }
    return dtw;
  }
  getPath(): [number, number][] {
    const n = this.s1.length;
    const m = this.s2.length;
    if (n === 0 || m === 0) return [];
    let i = n - 1, j = m - 1;
    const path: [number, number][] = [[i, j]];
    while (i > 0 || j > 0) {
      if (i === 0) j--;
      else if (j === 0) i--;
      else {
        const min = Math.min(this.matrix[i - 1][j], this.matrix[i][j - 1], this.matrix[i - 1][j - 1]);
        if (min === this.matrix[i - 1][j - 1]) { i--; j--; }
        else if (min === this.matrix[i - 1][j]) i--;
        else j--;
      }
      path.push([i, j]);
    }
    return path.reverse();
  }
}

self.onmessage = async (e: MessageEvent<ScoringWorkerRequest>) => {
  const { type, segmentId, refAudio, refSampleRate, userAudio, userSampleRate, wordTimestamps, generation } = e.data;
  if (type !== 'score') return;

  try {
    inFlight = { segmentId, generation };
    await ensureEssentia();
    
    const ref16 = resample(refAudio, refSampleRate, 16000);
    const user16 = resample(userAudio, userSampleRate, 16000);

    const refMFCC = getMFCC(ref16);
    const userMFCC = getMFCC(user16);

    if (refMFCC.length === 0 || userMFCC.length === 0) throw new Error('Could not extract MFCC features');

    const dtw = new SimpleDTW(refMFCC, userMFCC, euclideanDistance);
    const path = dtw.getPath();

    const hopStep = 256 / 16000;
    const wordScores: WordScore[] = [];
    const pathCosts: Map<number, number[]> = new Map();
    
    for (let i = 0; i < path.length; i++) {
      const [rIdx, uIdx] = path[i];
      const dist = euclideanDistance(refMFCC[rIdx], userMFCC[uIdx]);
      if (!pathCosts.has(rIdx)) pathCosts.set(rIdx, []);
      pathCosts.get(rIdx)!.push(dist);
    }
    
    const allWordAvgCosts: number[] = [];
    const wordInfos: { avgCost: number; hasCoverage: boolean }[] = [];
    
    for (const wt of wordTimestamps) {
      const startFrame = Math.floor(wt.start / hopStep);
      const endFrame = Math.ceil(wt.end / hopStep);
      let totalCost = 0, count = 0;
      for (let f = startFrame; f <= endFrame; f++) {
        const costs = pathCosts.get(f);
        if (costs) {
          for (const c of costs) {
            totalCost += c;
            count++;
          }
        }
      }
      if (count > 0) {
        const avg = totalCost / count;
        wordInfos.push({ avgCost: avg, hasCoverage: true });
        allWordAvgCosts.push(avg);
      } else {
        wordInfos.push({ avgCost: 0, hasCoverage: false });
      }
    }
    
    allWordAvgCosts.sort((a, b) => a - b);
    const medianCost = allWordAvgCosts.length > 0 ? allWordAvgCosts[Math.floor(allWordAvgCosts.length / 2)] : 1.0;
    
    // Normalized distance threshold. After Z-score normalization, 
    // a distance of 3-4 is quite significant.
    const ABSOLUTE_BAD_THRESHOLD = 4;
    const adaptiveThreshold = Math.min(medianCost * 1.5, ABSOLUTE_BAD_THRESHOLD);

    console.log(`Worker | seg: ${segmentId}, median: ${medianCost.toFixed(2)}, threshold: ${adaptiveThreshold.toFixed(2)}`);

    for (const info of wordInfos) {
      console.log(`Worker | word cost: ${info.avgCost.toFixed(2)} vs ${adaptiveThreshold.toFixed(2)}`);
      const isGood = !info.hasCoverage || info.avgCost <= adaptiveThreshold;
      wordScores.push(isGood ? WordScore.Good : WordScore.Bad);
    }
    
    self.postMessage({ type: 'result', segmentId, wordScores, generation });
    inFlight = null;
  } catch (err: any) {
    console.error('Worker | Scoring error:', err);
    self.postMessage({
      type: 'error',
      segmentId: inFlight?.segmentId ?? segmentId,
      generation: inFlight?.generation ?? generation,
      error: err.toString()
    });
    inFlight = null;
  }
};
