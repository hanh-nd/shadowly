export interface IpaInferenceBackend {
  ensureModels(onProgress?: (p: number, label?: string) => void): Promise<void>;
  inferIpa(audio: Float32Array): Promise<string>;
}
