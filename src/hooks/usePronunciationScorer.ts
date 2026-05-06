import { useCallback, useEffect, useRef } from 'react';

import { type IpaChunk, ScoringWorkerMessageType, WordScore } from '../types';
import {
  decodeAndResampleTo16kHz,
  resampleFloat32ArrayTo16kHz,
} from '../utils';
import type { ModelLoaderHook } from './useModelLoader';
import type { PipelineHook } from './usePipeline';

interface ScoringWorkerBase {
  segmentId: number;
  generation: number;
}

interface ScoringWorkerResponse extends ScoringWorkerBase {
  type: ScoringWorkerMessageType.Result;
  wordScores: (WordScore | null)[];
}

interface ScoringWorkerPrecomputeResult extends ScoringWorkerBase {
  type: ScoringWorkerMessageType.PrecomputeResult;
  chunks: IpaChunk[];
}

interface ScoringWorkerError extends ScoringWorkerBase {
  type: ScoringWorkerMessageType.Error;
  error?: string;
}

interface ScoringWorkerLifecycle {
  type:
    | ScoringWorkerMessageType.ModelProgress
    | ScoringWorkerMessageType.ModelsReady
    | ScoringWorkerMessageType.ModelsLoadError;
}

type ScoringWorkerIncoming =
  | ScoringWorkerResponse
  | ScoringWorkerPrecomputeResult
  | ScoringWorkerError
  | ScoringWorkerLifecycle;

export function usePronunciationScorer(params: {
  patchSegment: PipelineHook['patchSegment'];
  modelLoader: ModelLoaderHook;
}) {
  const { patchSegment, modelLoader } = params;
  const generationRef = useRef<Map<number, number>>(new Map());
  const inFlightRef = useRef<{ segmentId: number; generation: number } | null>(
    null,
  );

  useEffect(() => {
    const worker = modelLoader.scoringWorker;
    if (!worker) return;

    const handler = (e: MessageEvent<ScoringWorkerIncoming>) => {
      const msg = e.data;

      // Lifecycle messages are handled by useModelLoader; scorer ignores them
      if (
        msg.type === ScoringWorkerMessageType.ModelProgress ||
        msg.type === ScoringWorkerMessageType.ModelsReady ||
        msg.type === ScoringWorkerMessageType.ModelsLoadError
      ) {
        return;
      }

      // msg is now narrowed to ScoringWorkerResponse | ScoringWorkerPrecomputeResult | ScoringWorkerError
      const scoringMsg = msg as ScoringWorkerBase;
      const currentGen = generationRef.current.get(scoringMsg.segmentId);

      if (scoringMsg.generation !== currentGen) {
        return; // Stale result
      }

      if (msg.type === ScoringWorkerMessageType.PrecomputeResult) {
        patchSegment(msg.segmentId, { chunks: msg.chunks });
        return;
      }

      if (msg.type === ScoringWorkerMessageType.Result) {
        patchSegment(msg.segmentId, {
          wordScores: msg.wordScores,
          isScoring: false,
        });
      } else if (msg.type === ScoringWorkerMessageType.Error) {
        console.error(`Worker error for segment ${msg.segmentId}:`, msg.error);
        patchSegment(msg.segmentId, { isScoring: false });
      }

      if (
        inFlightRef.current?.segmentId === scoringMsg.segmentId &&
        inFlightRef.current?.generation === scoringMsg.generation
      ) {
        inFlightRef.current = null;
      }
    };

    const errorHandler = (e: ErrorEvent) => {
      console.error('Scoring worker error:', e);
      if (inFlightRef.current) {
        patchSegment(inFlightRef.current.segmentId, { isScoring: false });
        inFlightRef.current = null;
      }
    };

    worker.addEventListener('message', handler);
    worker.addEventListener('error', errorHandler);

    return () => {
      worker.removeEventListener('message', handler);
      worker.removeEventListener('error', errorHandler);
    };
  }, [modelLoader.scoringWorker, patchSegment]);

  const precompute = useCallback(
    (
      segmentId: number,
      refText: string,
      refSlice: Float32Array,
      refSampleRate: number,
    ) => {
      const currentGen = (generationRef.current.get(segmentId) ?? 0) + 1;
      generationRef.current.set(segmentId, currentGen);

      (async () => {
        try {
          const refAudio = await resampleFloat32ArrayTo16kHz(
            refSlice,
            refSampleRate,
          );

          if (generationRef.current.get(segmentId) !== currentGen) return;

          if (modelLoader.scoringWorker) {
            modelLoader.scoringWorker.postMessage(
              {
                type: ScoringWorkerMessageType.Precompute,
                segmentId,
                generation: currentGen,
                refText,
                refAudio,
              },
              [refAudio.buffer],
            );
          }
        } catch (err) {
          console.error('Failed to precompute scoring:', err);
        }
      })();
    },
    [modelLoader.scoringWorker],
  );

  const score = useCallback(
    (segmentId: number, blob: Blob) => {
      const MIN_AUDIO_BLOB_SIZE = 4096;
      if (blob.size < MIN_AUDIO_BLOB_SIZE) {
        patchSegment(segmentId, { isScoring: false });
        return;
      }

      const currentGen = generationRef.current.get(segmentId) ?? 0;

      // Fire-and-forget
      (async () => {
        try {
          const userAudio = await decodeAndResampleTo16kHz(blob);

          // Stale check
          if (generationRef.current.get(segmentId) !== currentGen) return;

          if (modelLoader.scoringWorker) {
            inFlightRef.current = { segmentId, generation: currentGen };
            modelLoader.scoringWorker.postMessage(
              {
                type: ScoringWorkerMessageType.Score,
                segmentId,
                generation: currentGen,
                userAudio,
              },
              [userAudio.buffer],
            );
          }
        } catch (err) {
          console.error('Failed to prepare scoring:', err);
          patchSegment(segmentId, { isScoring: false });
        }
      })();
    },
    [patchSegment, modelLoader.scoringWorker],
  );

  const clearScores = useCallback((segmentId: number) => {
    const nextGen = (generationRef.current.get(segmentId) ?? 0) + 1;
    generationRef.current.set(segmentId, nextGen);
  }, []);

  return {
    precompute,
    score,
    clearScores,
  };
}
