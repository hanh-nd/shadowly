import type { ModelLoadProgressCallback } from '../../types';

export interface IpaInferenceBackend {
  ensureModels(onProgress?: ModelLoadProgressCallback): Promise<void>;
  inferIpa(audio: Float32Array): Promise<string>;
}
