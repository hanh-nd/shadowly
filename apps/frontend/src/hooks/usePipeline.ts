import { useCallback, useRef, useState } from 'react';

import { transcriptionClient } from '../lib/TranscriptionClient';
import type { ModelLoadTask, Segment, TranscribingProgress } from '../types';
import { ModelId, ProcessingState } from '../types';
import { resampleAudioBufferTo16kHz } from '../utils';
import { groupWordsIntoSegments } from '../utils/transcription-mapping';

export interface PipelineHook {
  process: (file: File) => Promise<void>;
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

  const process = async (file: File) => {
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
    setFilename(file.name);
    setModelLoadTask(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
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
      const { wordTimestamps } = await transcriptionClient.transcribeBatch(
        resampledAudio,
        signal,
      );
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
      const msg = err instanceof Error ? err.message : 'Transcription failed.';
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
