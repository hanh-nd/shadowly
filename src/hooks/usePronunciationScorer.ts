import { useCallback, useEffect, useRef } from 'react';
import type { WordTimestamp } from '../types';
import { WordScore } from '../types';
import {
  decodeAndResampleTo16kHz,
  resampleFloat32ArrayTo16kHz,
} from '../utils';
import type { PipelineHook } from './usePipeline';

interface ScoringWorkerResponse {
  type: 'result';
  segmentId: number;
  wordScores: WordScore[];
  generation: number;
}

interface ScoringWorkerError {
  type: 'error';
  segmentId: number;
  generation: number;
}

interface ScoringWorkerModelProgress {
  type: 'modelProgress';
  progress: number;
}

export function usePronunciationScorer(params: {
  patchSegment: PipelineHook['patchSegment'];
}) {
  const { patchSegment } = params;
  const workerRef = useRef<Worker | null>(null);
  const generationRef = useRef<Map<number, number>>(new Map());
  const inFlightRef = useRef<{ segmentId: number; generation: number } | null>(
    null,
  );

  const initWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(
      new URL('../lib/scoring.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    );

    worker.onmessage = (
      e: MessageEvent<
        ScoringWorkerResponse | ScoringWorkerError | ScoringWorkerModelProgress
      >,
    ) => {
      const msg = e.data;

      if (msg.type === 'modelProgress') {
        // Model downloading — segment stays isScoring:true, no action needed
        return;
      }

      const currentGen = generationRef.current.get(msg.segmentId);

      if (msg.generation !== currentGen) {
        return; // Stale result
      }

      if (msg.type === 'result') {
        patchSegment(msg.segmentId, {
          wordScores: msg.wordScores,
          isScoring: false,
        });
      } else if (msg.type === 'error') {
        patchSegment(msg.segmentId, { isScoring: false });
      }

      if (
        inFlightRef.current?.segmentId === msg.segmentId &&
        inFlightRef.current?.generation === msg.generation
      ) {
        inFlightRef.current = null;
      }
    };

    worker.onerror = (e) => {
      console.error('Scoring worker error:', e);
      if (inFlightRef.current) {
        patchSegment(inFlightRef.current.segmentId, { isScoring: false });
        inFlightRef.current = null;
      }
    };

    workerRef.current = worker;
    return worker;
  }, [patchSegment]);

  const score = useCallback(
    (
      segmentId: number,
      wordTimestamps: WordTimestamp[],
      refSlice: Float32Array,
      refSampleRate: number,
      blob: Blob,
    ) => {
      const MIN_AUDIO_BLOB_SIZE = 4096;
      if (wordTimestamps.length === 0 || blob.size < MIN_AUDIO_BLOB_SIZE) {
        patchSegment(segmentId, { isScoring: false });
        return;
      }

      const currentGen = (generationRef.current.get(segmentId) ?? 0) + 1;
      generationRef.current.set(segmentId, currentGen);

      // Fire-and-forget
      (async () => {
        try {
          const userAudio = await decodeAndResampleTo16kHz(blob);
          const refAudio = await resampleFloat32ArrayTo16kHz(
            refSlice,
            refSampleRate,
          );

          // Stale check
          if (generationRef.current.get(segmentId) !== currentGen) return;

          const worker = initWorker();
          inFlightRef.current = { segmentId, generation: currentGen };

          worker.postMessage(
            {
              type: 'score',
              segmentId,
              refAudio,
              userAudio,
              wordTimestamps,
              generation: currentGen,
            },
            [refAudio.buffer, userAudio.buffer],
          );
        } catch (err) {
          console.error('Failed to prepare scoring:', err);
          patchSegment(segmentId, { isScoring: false });
        }
      })();
    },
    [patchSegment, initWorker],
  );

  const clearScores = useCallback((segmentId: number) => {
    const nextGen = (generationRef.current.get(segmentId) ?? 0) + 1;
    generationRef.current.set(segmentId, nextGen);
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { score, clearScores };
}
