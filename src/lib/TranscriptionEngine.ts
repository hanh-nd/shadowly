import {
  AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
} from '@huggingface/transformers';
import { NonRealTimeVAD } from '@ricky0123/vad-web';

import { type WordTimestamp } from '../types';

env.allowLocalModels = false;
env.useBrowserCache = true;

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
  private pipe: Awaited<AutomaticSpeechRecognitionPipeline> | null = null;
  private vadInstance: VADInstance | null = null;

  async init(
    model: string,
    onProgress: (progress: number) => void,
  ): Promise<void> {
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

    env.allowLocalModels = false;
    this.pipe = await pipeline('automatic-speech-recognition', model, {
      device: 'wasm',
      dtype: 'q8',
      session_options: {
        graphOptimizationLevel: 'basic',
      },
      progress_callback: (p) => {
        const info = p as { progress: number };
        if (!info.progress) return;
        onProgress(info.progress);
      },
    });
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
    if (!this.pipe) {
      throw new Error('Pipeline not initialized');
    }

    const output = await this.pipe(audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const outputArray = Array.isArray(output) ? output : [output];
    const text = outputArray
      .map((item) => item.text)
      .join(' ')
      .trim();
    const chunks = outputArray.flatMap((item) => item.chunks);
    const wordTimestamps: WordTimestamp[] = (chunks || [])
      .filter(
        (chunk) =>
          chunk &&
          chunk.timestamp &&
          chunk.timestamp[0] !== null &&
          chunk.timestamp[1] !== null,
      )
      .map((chunk) => ({
        word: chunk!.text.trim(),
        start: chunk!.timestamp[0]!,
        end: chunk!.timestamp[1]!,
      }));

    return { text, wordTimestamps };
  }
}
