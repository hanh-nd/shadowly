import { WorkerMessageType } from '../types';

const WHISPER_MODEL = 'Xenova/whisper-tiny.en';
const VAD_MODEL = 'v5';
const ORT_WASM_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/';

interface VADInstance {
  run: (audio: Float32Array, sr: number) => AsyncIterable<{ audio: Float32Array; start: number; end: number }>;
}

// Access global vad from script tag
interface GlobalVAD {
  NonRealTimeVAD: {
    new: (options: {
      preSpeechPadMs: number;
      redemptionMs: number;
      minSpeechMs: number;
      positiveSpeechThreshold: number;
      model: string;
      onnxWASMBasePath: string;
      ortConfig: (ort: { env: { wasm: { simd: boolean; proxy: boolean } } }) => void;
    }) => Promise<VADInstance>;
  };
}
declare const vad: GlobalVAD;

export interface AudioSegment {
  audio: Float32Array;
  start: number;
  end: number;
}

export class TranscriptionEngine {
  private pipeWorker: Worker | null = null;
  private vadInstance: VADInstance | null = null;
  private workerReady: Promise<void> | null = null;
  private onDownloadProgress?: (p: number) => void;

  async ensureModels(onDownloadProgress?: (p: number) => void) {
    this.onDownloadProgress = onDownloadProgress;
    
    if (!this.pipeWorker) {
      this.pipeWorker = new Worker(new URL('./transcribe.worker.ts', import.meta.url), {
        type: 'module'
      });

      this.workerReady = new Promise((resolve, reject) => {
        this.pipeWorker!.onmessage = (e) => {
          const { type, payload } = e.data;
          switch (type) {
            case WorkerMessageType.Ready:
              resolve();
              break;
            case WorkerMessageType.Progress:
              this.onDownloadProgress?.(Math.round(payload));
              break;
            case WorkerMessageType.Error:
              reject(new Error(payload));
              break;
          }
        };

        this.pipeWorker!.onerror = () => reject(new Error('Worker script error'));
      });

      this.pipeWorker.postMessage({ 
        type: WorkerMessageType.Init, 
        model: WHISPER_MODEL 
      });
    }

    if (!this.vadInstance) {
      if (typeof vad === 'undefined') {
        throw new Error('VAD library not loaded from CDN');
      }
      this.vadInstance = await vad.NonRealTimeVAD.new({
        preSpeechPadMs: 200,
        redemptionMs: 400,
        minSpeechMs: 250,
        positiveSpeechThreshold: 0.6,
        model: VAD_MODEL,
        onnxWASMBasePath: ORT_WASM_BASE,
        ortConfig: (ort: { env: { wasm: { simd: boolean; proxy: boolean } } }) => {
          ort.env.wasm.simd = true;
          ort.env.wasm.proxy = false;
        },
      });
    }

    await this.workerReady;
  }

  async resampleTo16kHz(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
    const audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    audioCtx.close();

    if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
      return decoded.getChannelData(0);
    }

    const targetLength = Math.round(decoded.duration * 16000);
    const offlineCtx = new OfflineAudioContext(1, targetLength, 16000);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start();
    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0);
  }

  async getSegments(audio: Float32Array, signal?: AbortSignal): Promise<AudioSegment[]> {
    if (!this.vadInstance) throw new Error('VAD not initialized');
    const segments: AudioSegment[] = [];
    for await (const segment of this.vadInstance.run(audio, 16000)) {
      if (signal?.aborted) break;
      segments.push(segment);
    }
    return segments;
  }

  async transcribe(audio: Float32Array, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return '';
    if (!this.pipeWorker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      
      const handler = (e: MessageEvent) => {
        const { type, payload, id: messageId } = e.data;
        if (messageId !== id) return;

        this.pipeWorker!.removeEventListener('message', handler);
        if (type === WorkerMessageType.Result) resolve(payload);
        else if (type === WorkerMessageType.Error) reject(new Error(payload));
      };

      this.pipeWorker!.addEventListener('message', handler);
      this.pipeWorker!.postMessage({ type: WorkerMessageType.Transcribe, audio, id });

      signal?.addEventListener('abort', () => {
        this.pipeWorker!.removeEventListener('message', handler);
        resolve('');
      }, { once: true });
    });
  }
}

export const engine = new TranscriptionEngine();
