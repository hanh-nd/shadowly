import './worker-polyfills';

import { WorkerMessageType } from '../types';
import { TranscriptionEngine } from './TranscriptionEngine';

const transcriptionEngine = new TranscriptionEngine();
const controllers = new Map<string, AbortController>();

self.onmessage = async (e) => {
  const { type, audio, id } = e.data;

  try {
    switch (type) {
      case WorkerMessageType.Abort: {
        const controller = controllers.get(id);
        if (controller) {
          controller.abort();
          controllers.delete(id);
        }
        break;
      }
      case WorkerMessageType.Init: {
        await transcriptionEngine.init((progress) => {
          self.postMessage({
            type: WorkerMessageType.Progress,
            payload: progress,
            id,
          });
        });
        self.postMessage({ type: WorkerMessageType.Ready, id });
        break;
      }

      case WorkerMessageType.TranscribeBatch: {
        const controller = new AbortController();
        controllers.set(id, controller);
        try {
          const result = await transcriptionEngine.transcribe(
            audio,
            controller.signal,
          );

          self.postMessage({
            type: WorkerMessageType.Result,
            payload: result,
            id,
          });
        } finally {
          controllers.delete(id);
        }
        break;
      }
    }
  } catch (err) {
    self.postMessage({
      type: WorkerMessageType.Error,
      payload: err instanceof Error ? err.message : String(err),
      id,
    });
  }
};
