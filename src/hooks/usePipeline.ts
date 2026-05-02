import { useRef, useState, useCallback } from 'react';
import { ProcessingState } from '../types';
import type { Segment, TranscribingProgress } from '../types';
import { engine } from '../lib/TranscriptionEngine';

export interface PipelineHook {
  process: (arrayBuffer: ArrayBuffer) => Promise<void>;
  reset: () => void;
  segments: Segment[];
  patchSegment: (id: number, patch: Partial<Pick<Segment, 'text' | 'recordingUrl'>>) => void;
  status: ProcessingState;
  progress: TranscribingProgress | null;
  downloadProgress: number;
  error: string | null;
}

export function usePipeline(): PipelineHook {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [status, setStatus] = useState<ProcessingState>(ProcessingState.Idle);
  const [progress, setProgress] = useState<TranscribingProgress | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus(ProcessingState.Idle);
    setError(null);
    setSegments([]);
    setProgress(null);
  }, []);

  const process = async (arrayBuffer: ArrayBuffer) => {
    // Cancel any ongoing run
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    setSegments([]);
    setProgress(null);
    setError(null);
    setStatus(ProcessingState.LoadingModel);

    try {
      await engine.ensureModels((p) => {
        if (!signal.aborted) setDownloadProgress(p);
      });
      if (signal.aborted) return;

      const float32 = await engine.resampleTo16kHz(arrayBuffer);
      if (signal.aborted) return;

      setStatus(ProcessingState.VADRunning);
      const audioSegments = await engine.getSegments(float32, signal);
      if (signal.aborted) return;

      if (audioSegments.length === 0) {
        setError('No speech detected.');
        setStatus(ProcessingState.Error);
        return;
      }

      // Phase 1: Show all segments immediately
      const initialSegments: Segment[] = audioSegments.map((s, i) => ({
        id: i,
        text: '...',
        start: s.start / 1000,
        end: s.end / 1000,
        recordingUrl: null,
      }));
      setSegments(initialSegments);
      setProgress({ current: 0, total: audioSegments.length });

      // Phase 2: Transcribe segments one by one
      setStatus(ProcessingState.Transcribing);
      for (let i = 0; i < audioSegments.length; i++) {
        if (signal.aborted) return;

        const text = await engine.transcribe(audioSegments[i].audio, signal);
        if (signal.aborted) return;

        setSegments((prev) =>
          prev.map((s) => (s.id === i ? { ...s, text } : s))
        );
        setProgress((prev) => (prev ? { ...prev, current: i + 1 } : null));
      }

      setStatus(ProcessingState.Ready);
    } catch (err) {
      if (signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Transcription failed.';
      setError(msg);
      setStatus(ProcessingState.Error);
    }
  };

  const patchSegment = useCallback((id: number, patch: Partial<Pick<Segment, 'text' | 'recordingUrl'>>) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  return {
    process,
    reset,
    segments,
    patchSegment,
    status,
    progress,
    downloadProgress,
    error,
  };
}
