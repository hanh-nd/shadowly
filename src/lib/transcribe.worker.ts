import { pipeline, env } from '@huggingface/transformers';
import { WorkerMessageType } from '../types';

// Skip local model check for faster loading in worker
env.allowLocalModels = false;

type WhisperPipeline = Awaited<ReturnType<typeof pipeline>>;

let pipe: WhisperPipeline | null = null;

self.onmessage = async (e) => {
  const { type, audio, model, id } = e.data;

  try {
    switch (type) {
      case WorkerMessageType.Init: {
        pipe = await pipeline('automatic-speech-recognition', model, {
          device: 'wasm',
          dtype: 'q8',
          session_options: {
            graphOptimizationLevel: 'basic',
          },
          progress_callback: (p: { progress: number }) => {
            self.postMessage({ type: WorkerMessageType.Progress, payload: p.progress, id });
          }
        });
        self.postMessage({ type: WorkerMessageType.Ready, id });
        break;
      }

      case WorkerMessageType.Transcribe: {
        if (!pipe) {
          throw new Error('Pipeline not initialized');
        }
        const result = await pipe(audio);
        self.postMessage({ type: WorkerMessageType.Result, payload: result.text.trim(), id });
        break;
      }
    }
  } catch (err) {
    self.postMessage({ 
      type: WorkerMessageType.Error, 
      payload: err instanceof Error ? err.message : 'Unknown error', 
      id 
    });
  }
};
