import {
  type IpaChunk,
  ScoringWorkerMessageType,
  WordScore,
} from '../../types';

export class ScoringClient {
  private worker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private onProgress?: (p: number, label?: string) => void;

  async ensureModels(
    onProgress?: (p: number, label?: string) => void,
  ): Promise<void> {
    if (onProgress) {
      this.onProgress = onProgress;
    }

    if (!this.worker) {
      this.worker = new Worker(
        new URL('../scoring.worker.ts', import.meta.url),
        {
          type: 'module',
        },
      );

      this.workerReady = new Promise((resolve, reject) => {
        const initHandler = (e: MessageEvent) => {
          const { type, progress, label, error } = e.data;
          switch (type) {
            case ScoringWorkerMessageType.ModelsReady:
              this.worker!.removeEventListener('message', initHandler);
              resolve();
              break;
            case ScoringWorkerMessageType.ModelProgress:
              this.onProgress?.(progress, label);
              break;
            case ScoringWorkerMessageType.ModelsLoadError:
              this.worker!.removeEventListener('message', initHandler);
              reject(new Error(error));
              break;
          }
        };

        this.worker!.addEventListener('message', initHandler);
        this.worker!.onerror = (err) => {
          const e = err as ErrorEvent;
          console.error('Scoring worker error details:', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
          });
          reject(new Error(e.message || 'Scoring worker script error'));
        };
      });

      this.worker.postMessage({ type: ScoringWorkerMessageType.LoadModels });
    }

    await this.workerReady;
  }

  async precompute(
    segmentId: number,
    refText: string,
    refAudio: Float32Array,
  ): Promise<{ chunks: IpaChunk[] }> {
    if (!this.worker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      const cleanup = () => {
        this.worker!.removeEventListener('message', handler);
      };

      const handler = (e: MessageEvent) => {
        const { type, chunks, error, id: msgId } = e.data;
        if (msgId !== id) return;

        switch (type) {
          case ScoringWorkerMessageType.PrecomputeResult:
            cleanup();
            resolve({ chunks });
            break;
          case ScoringWorkerMessageType.Error:
            cleanup();
            reject(new Error(error));
            break;
        }
      };

      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage(
        {
          type: ScoringWorkerMessageType.Precompute,
          id,
          segmentId,
          refText,
          refAudio,
        },
        [refAudio.buffer],
      );
    });
  }

  async score(
    segmentId: number,
    userAudio: Float32Array,
  ): Promise<{ wordScores: (WordScore | null)[] }> {
    if (!this.worker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      const cleanup = () => {
        this.worker!.removeEventListener('message', handler);
      };

      const handler = (e: MessageEvent) => {
        const { type, wordScores, error, id: msgId } = e.data;
        if (msgId !== id) return;

        switch (type) {
          case ScoringWorkerMessageType.Result:
            cleanup();
            resolve({ wordScores });
            break;
          case ScoringWorkerMessageType.Error:
            cleanup();
            reject(new Error(error));
            break;
        }
      };

      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage(
        {
          type: ScoringWorkerMessageType.Score,
          id,
          segmentId,
          userAudio,
        },
        [userAudio.buffer],
      );
    });
  }
}

export const scoringClient = new ScoringClient();
