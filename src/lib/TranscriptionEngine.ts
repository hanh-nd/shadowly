import { NonRealTimeVAD } from '@ricky0123/vad-web';

import { type WordTimestamp } from '../types';
import { InferenceClient } from './InferenceClient';

const ORT_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/';
const VAD_MODEL_URL =
  'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/silero_vad_legacy.onnx';

interface VADInstance {
  run: (
    audio: Float32Array,
    sr: number,
  ) => AsyncIterable<{ audio: Float32Array; start: number; end: number }>;
}

export class TranscriptionEngine {
  private vadInstance: VADInstance | null = null;
  private isReady = false;

  async init(onProgress: (progress: number) => void): Promise<void> {
    onProgress(10);
    this.vadInstance = await NonRealTimeVAD.new({
      preSpeechPadMs: 200,
      redemptionMs: 400,
      minSpeechMs: 250,
      positiveSpeechThreshold: 0.6,
      modelURL: VAD_MODEL_URL,
      ortConfig: (ort) => {
        ort.env.wasm.simd = true;
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmPaths = ORT_WASM_BASE;
      },
    });
    onProgress(100);
    this.isReady = true;
  }

  async *runVAD(audio: Float32Array): AsyncGenerator<{
    audio: Float32Array;
    start: number;
    end: number;
    id: string;
  }> {
    if (!this.vadInstance) {
      throw new Error('VAD not initialized');
    }

    for await (const segment of this.vadInstance.run(audio, 16000)) {
      yield {
        audio: segment.audio,
        start: segment.start,
        end: segment.end,
        id: crypto.randomUUID(),
      };
    }
  }

  async transcribe(
    audio: Float32Array,
  ): Promise<{ text: string; wordTimestamps: WordTimestamp[] }> {
    if (!this.isReady) {
      throw new Error('Engine not initialized');
    }

    const output = await InferenceClient.transcribe(audio);

    return {
      text: output.text,
      wordTimestamps: output.wordTimestamps,
    };
  }
}
