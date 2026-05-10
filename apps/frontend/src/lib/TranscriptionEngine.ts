import { type WordTimestamp } from '../types';
import { InferenceClient } from './InferenceClient';

export class TranscriptionEngine {
  private isReady = false;

  async init(onProgress: (progress: number) => void): Promise<void> {
    onProgress(100);
    this.isReady = true;
  }

  async transcribe(
    audio: Float32Array,
    signal?: AbortSignal,
  ): Promise<{ text: string; wordTimestamps: WordTimestamp[] }> {
    if (!this.isReady) {
      throw new Error('Engine not initialized');
    }

    const output = await InferenceClient.transcribe(audio, signal);

    return {
      text: output.text,
      wordTimestamps: output.wordTimestamps,
    };
  }
}
