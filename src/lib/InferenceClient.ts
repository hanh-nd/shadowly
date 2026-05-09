import { InferenceEndpoint, type WordTimestamp } from '../types';
import { encodeWav } from '../utils/wav-encoder';

export interface TranscribeResponse {
  text: string;
  wordTimestamps: WordTimestamp[];
}

export interface ScoreResponse {
  text: string;
}

export class InferenceClient {
  private static BASE_URL = import.meta.env.VITE_INFERENCE_BASE_URL;
  private static AUTH_KEY = import.meta.env.VITE_INFERENCE_KEY;
  private static AUTH_SECRET = import.meta.env.VITE_INFERENCE_SECRET;

  /**
   * High-level transcription method. Handles audio encoding and typed response.
   */
  static async transcribe(audio: Float32Array): Promise<TranscribeResponse> {
    return this.infer<TranscribeResponse>(InferenceEndpoint.Transcribe, audio);
  }

  /**
   * High-level scoring method. Handles audio encoding and typed response.
   */
  static async score(audio: Float32Array): Promise<ScoreResponse> {
    return this.infer<ScoreResponse>(InferenceEndpoint.Score, audio);
  }

  private static async infer<T>(
    endpoint: InferenceEndpoint,
    audio: Float32Array,
  ): Promise<T> {
    if (!this.BASE_URL || !this.AUTH_KEY || !this.AUTH_SECRET) {
      throw new Error(
        'Inference configuration missing. Ensure VITE_INFERENCE_BASE_URL, VITE_INFERENCE_KEY, and VITE_INFERENCE_SECRET are set.',
      );
    }

    const wavBytes = encodeWav(audio);
    const audioBlob = new Blob([wavBytes.buffer as ArrayBuffer], {
      type: 'audio/wav',
    });

    const formData = new FormData();
    formData.append('audio_file', audioBlob, 'audio.wav');

    try {
      const response = await fetch(`${this.BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'X-Shadowly-Key': this.AUTH_KEY,
          'X-Shadowly-Secret': this.AUTH_SECRET,
        },
        body: formData,
      });

      if (!response.ok) {
        let errorDetail = '';
        try {
          const errorJson = await response.json();
          errorDetail = errorJson.detail || JSON.stringify(errorJson);
        } catch {
          errorDetail = await response.text();
        }
        throw new Error(
          `Inference API error (${response.status}): ${errorDetail}`,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // If it's already our normalized error, rethrow
        if (error.message.startsWith('Inference API error')) throw error;

        // Otherwise, it's likely a network error
        throw new Error(`Network error during inference: ${error.message}`, {
          cause: error,
        });
      }
      throw new Error('An unknown error occurred during inference', {
        cause: error,
      });
    }
  }
}
