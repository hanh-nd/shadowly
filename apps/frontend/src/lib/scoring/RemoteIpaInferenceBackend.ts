import { InferenceClient } from '../InferenceClient';
import { type IpaInferenceBackend } from './IpaInferenceBackend';

export class RemoteIpaInferenceBackend implements IpaInferenceBackend {
  ensureModels(): Promise<void> {
    return Promise.resolve();
  }

  async inferIpa(audio: Float32Array): Promise<string> {
    const output = await InferenceClient.score(audio);
    return output.text || '';
  }
}
