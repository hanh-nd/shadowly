import { useCallback, useRef, useState } from 'react';

import { transcriptionClient } from '../lib/TranscriptionClient';
import type {
  LibraryItem,
  ModelLoadTask,
  Segment,
  TranscribingProgress,
  WordTimestamp,
} from '../types';
import { ModelId, ProcessingState } from '../types';
import { resampleAudioBufferTo16kHz } from '../utils';
import { groupWordsIntoSegments } from '../utils/transcription-mapping';

export interface PipelineHook {
  process: (input: File | LibraryItem) => Promise<void>;
  reset: () => void;
  segments: Segment[];
  patchSegment: (
    id: number,
    patch: Partial<
      Pick<
        Segment,
        | 'text'
        | 'recordingUrl'
        | 'isScoring'
        | 'wordScores'
        | 'wordTimestamps'
        | 'chunks'
      >
    >,
  ) => void;
  status: ProcessingState;
  progress: TranscribingProgress | null;
  modelLoadTask: ModelLoadTask | null;
  error: string | null;
  audioBuffer: AudioBuffer | null;
  totalDuration: number;
  filename: string | null;
}

export function usePipeline(): PipelineHook {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [status, setStatus] = useState<ProcessingState>(ProcessingState.Idle);
  const [progress, setProgress] = useState<TranscribingProgress | null>(null);
  const [modelLoadTask, setModelLoadTask] = useState<ModelLoadTask | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [totalDuration, setTotalDuration] = useState(0);
  const [filename, setFilename] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus(ProcessingState.Idle);
    setError(null);
    setSegments([]);
    setProgress(null);
    setModelLoadTask(null);
    setAudioBuffer(null);
    setTotalDuration(0);
    setFilename(null);
  }, []);

  const process = async (input: File | LibraryItem) => {
    // Cancel any ongoing run
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setSegments([]);
    setProgress(null);
    setError(null);
    setAudioBuffer(null);
    setTotalDuration(0);

    const targetName = input instanceof File ? input.name : input.name;
    setFilename(targetName);
    setModelLoadTask(null);

    try {
      let arrayBuffer: ArrayBuffer;

      if (!(input instanceof File)) {
        setStatus(ProcessingState.Fetching);
        const response = await fetch(input.fileUrl, { signal });
        if (!response.ok)
          throw new Error(`Failed to fetch audio: ${response.statusText}`);
        arrayBuffer = await response.arrayBuffer();
      } else {
        arrayBuffer = await input.arrayBuffer();
      }

      if (signal.aborted) return;

      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close();
      if (signal.aborted) return;

      if (decoded.duration > 300) {
        throw new Error('Audio exceeds 5-minute limit.');
      }

      setAudioBuffer(decoded);
      setTotalDuration(decoded.duration);

      let wordTimestamps: WordTimestamp[] = [];

      if (!(input instanceof File)) {
        wordTimestamps = input.wordTimestamps || [];
        if (wordTimestamps.length === 0 && input.manifestUrl) {
          try {
            const jsonRes = await fetch(input.manifestUrl, { signal });
            if (jsonRes.ok) {
              const data = await jsonRes.json();
              if (data && Array.isArray(data.wordTimestamps)) {
                wordTimestamps = data.wordTimestamps;
              }
            }
          } catch (e) {
            console.warn(
              'Failed to load sidecar transcription from manifest, falling back to engine',
              e,
            );
          }
        }
      }

      if (wordTimestamps.length === 0) {
        await transcriptionClient.ensureModels((p) =>
          setModelLoadTask({
            id: ModelId.Transcription,
            label: 'Downloading transcription model…',
            progress: p,
          }),
        );
        setModelLoadTask(null);
        if (signal.aborted) return;

        const resampledAudio = await resampleAudioBufferTo16kHz(decoded);
        if (signal.aborted) return;

        // Batch Transcription
        setStatus(ProcessingState.Transcribing);
        setProgress({ current: 0, total: 1 });
        const result = await transcriptionClient.transcribeBatch(
          resampledAudio,
          signal,
        );
        wordTimestamps = result.wordTimestamps;
      }

      if (signal.aborted) return;

      const derivedSegments = groupWordsIntoSegments(wordTimestamps);
      if (derivedSegments.length === 0) {
        setError('No speech detected.');
        setStatus(ProcessingState.Error);
        return;
      }

      setSegments(derivedSegments);
      setProgress({ current: 1, total: 1 });

      setStatus(ProcessingState.Ready);
    } catch (err) {
      if (signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Processing failed.';
      setError(msg);
      setStatus(ProcessingState.Error);
    }
  };

  const patchSegment = useCallback(
    (
      id: number,
      patch: Partial<
        Pick<
          Segment,
          | 'text'
          | 'recordingUrl'
          | 'isScoring'
          | 'wordScores'
          | 'wordTimestamps'
          | 'chunks'
        >
      >,
    ) => {
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
    },
    [],
  );

  return {
    process,
    reset,
    segments,
    patchSegment,
    status,
    progress,
    modelLoadTask,
    error,
    audioBuffer,
    totalDuration,
    filename,
  };
}
