import { useCallback, useRef } from 'react';

import { scoringClient } from '../lib/scoring/ScoringClient';
import {
  decodeAndResampleTo16kHz,
  resampleFloat32ArrayTo16kHz,
} from '../utils';
import type { PipelineHook } from './usePipeline';

export function usePronunciationScorer(params: {
  patchSegment: PipelineHook['patchSegment'];
}) {
  const { patchSegment } = params;
  const generationRef = useRef<Map<number, number>>(new Map());

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

          const { chunks } = await scoringClient.precompute(
            segmentId,
            refText,
            refAudio,
          );

          if (generationRef.current.get(segmentId) === currentGen) {
            patchSegment(segmentId, { chunks });
          }
        } catch (err) {
          console.error('Failed to precompute scoring:', err);
        }
      })();
    },
    [patchSegment],
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

          if (generationRef.current.get(segmentId) !== currentGen) return;

          const { wordScores } = await scoringClient.score(
            segmentId,
            userAudio,
          );

          if (generationRef.current.get(segmentId) === currentGen) {
            patchSegment(segmentId, {
              wordScores,
              isScoring: false,
            });
          }
        } catch (err) {
          console.error('Failed to prepare or score audio:', err);
          if (generationRef.current.get(segmentId) === currentGen) {
            patchSegment(segmentId, { isScoring: false });
          }
        }
      })();
    },
    [patchSegment],
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
