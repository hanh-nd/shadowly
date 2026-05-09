import { type WordTimestamp, WorkerMessageType } from '../types';

export interface AudioSegment {
  id: string;
  start: number;
  end: number;
  audioLength: number;
}

export class TranscriptionClient {
  private pipeWorker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private onDownloadProgress?: (p: number) => void;

  async ensureModels(onDownloadProgress?: (p: number) => void) {
    this.onDownloadProgress = onDownloadProgress;

    if (!this.pipeWorker) {
      this.pipeWorker = new Worker(
        new URL('./transcribe.worker.ts', import.meta.url),
        {
          type: 'module',
        },
      );

      this.workerReady = new Promise((resolve, reject) => {
        this.pipeWorker!.onmessage = (e) => {
          const { type, payload } = e.data;
          switch (type) {
            case WorkerMessageType.Ready:
              resolve();
              break;
            case WorkerMessageType.Progress:
              this.onDownloadProgress?.(Math.round(payload));
              break;
            case WorkerMessageType.Error:
              reject(new Error(payload));
              break;
          }
        };

        this.pipeWorker!.onerror = (err) => {
          const e = err as ErrorEvent;
          console.error('Worker error details:', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
          });
          reject(new Error(e.message || 'Worker script error'));
        };
      });

      this.pipeWorker.postMessage({
        type: WorkerMessageType.Init,
      });
    }

    await this.workerReady;
  }

  async getSegments(
    audio: Float32Array,
    signal?: AbortSignal,
  ): Promise<AudioSegment[]> {
    if (!this.pipeWorker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const segments: AudioSegment[] = [];
      const id = crypto.randomUUID();

      const cleanup = () => {
        this.pipeWorker!.removeEventListener('message', handler);
      };

      const handler = (e: MessageEvent) => {
        const {
          type,
          segmentId,
          start,
          end,
          audioLength,
          payload,
          id: msgId,
        } = e.data;
        if (msgId !== id) return;

        switch (type) {
          case WorkerMessageType.SegmentFound:
            segments.push({ id: segmentId, start, end, audioLength });
            break;
          case WorkerMessageType.VadDone:
            cleanup();
            resolve(segments);
            break;
          case WorkerMessageType.Error:
            cleanup();
            reject(new Error(payload));
            break;
        }
      };

      this.pipeWorker!.addEventListener('message', handler);
      this.pipeWorker!.postMessage({
        type: WorkerMessageType.RunVAD,
        audio,
        id,
      });

      signal?.addEventListener(
        'abort',
        () => {
          cleanup();
          resolve([]);
        },
        { once: true },
      );
    });
  }

  async transcribe(
    segmentId: string,
    signal?: AbortSignal,
  ): Promise<{ text: string; wordTimestamps: WordTimestamp[] }> {
    if (signal?.aborted) return { text: '', wordTimestamps: [] };
    if (!this.pipeWorker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      const cleanup = () => {
        this.pipeWorker!.removeEventListener('message', handler);
      };

      const handler = (e: MessageEvent) => {
        const { type, payload, id: messageId } = e.data;
        if (messageId !== id) return;

        cleanup();
        if (type === WorkerMessageType.Result) resolve(payload);
        else if (type === WorkerMessageType.Error) reject(new Error(payload));
      };

      this.pipeWorker!.addEventListener('message', handler);
      this.pipeWorker!.postMessage({
        type: WorkerMessageType.Transcribe,
        segmentId,
        id,
      });

      signal?.addEventListener(
        'abort',
        () => {
          this.pipeWorker!.postMessage({
            type: WorkerMessageType.Abort,
            id,
          });
          cleanup();
          resolve({ text: '', wordTimestamps: [] });
        },
        { once: true },
      );
    });
  }

  async transcribeBatch(
    audio: Float32Array,
    signal?: AbortSignal,
  ): Promise<{ text: string; wordTimestamps: WordTimestamp[] }> {
    if (signal?.aborted) return { text: '', wordTimestamps: [] };
    if (!this.pipeWorker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      const cleanup = () => {
        this.pipeWorker!.removeEventListener('message', handler);
      };

      const handler = (e: MessageEvent) => {
        const { type, payload, id: messageId } = e.data;
        if (messageId !== id) return;

        cleanup();
        if (type === WorkerMessageType.Result) resolve(payload);
        else if (type === WorkerMessageType.Error) reject(new Error(payload));
      };

      this.pipeWorker!.addEventListener('message', handler);
      this.pipeWorker!.postMessage(
        {
          type: WorkerMessageType.TranscribeBatch,
          audio,
          id,
        },
        [audio.buffer],
      );

      signal?.addEventListener(
        'abort',
        () => {
          this.pipeWorker!.postMessage({
            type: WorkerMessageType.Abort,
            id,
          });
          cleanup();
          resolve({ text: '', wordTimestamps: [] });
        },
        { once: true },
      );
    });
  }
}

export const transcriptionClient = new TranscriptionClient();
