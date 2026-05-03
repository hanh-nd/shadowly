import { useCallback, useRef, useState } from 'react';
import { MS_PER_SECOND } from '../constants';
import { engine } from '../lib/TranscriptionEngine';
import type { Segment, TranscribingProgress } from '../types';
import { ProcessingState } from '../types';
import { decodeAndResampleTo16kHz } from '../utils';

export interface PipelineHook {
  process: (file: File) => Promise<void>;
  reset: () => void;
  segments: Segment[];
  patchSegment: (id: number, patch: Partial<Pick<Segment, 'text' | 'recordingUrl' | 'isScoring' | 'wordScores' | 'wordTimestamps'>>) => void;
  status: ProcessingState;
  progress: TranscribingProgress | null;
  downloadProgress: number;
  error: string | null;
  audioBuffer: AudioBuffer | null;
  totalDuration: number;
}

export function usePipeline(): PipelineHook {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [status, setStatus] = useState<ProcessingState>(ProcessingState.Idle);
  const [progress, setProgress] = useState<TranscribingProgress | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [totalDuration, setTotalDuration] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus(ProcessingState.Idle);
    setError(null);
    setSegments([]);
    setProgress(null);
    setAudioBuffer(null);
    setTotalDuration(0);
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
    setStatus(ProcessingState.LoadingModel);

    try {
      const arrayBuffer = await file.arrayBuffer();
      if (signal.aborted) return;

      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      ctx.close();
      if (signal.aborted) return;

      setAudioBuffer(decoded);
      setTotalDuration(decoded.duration);

      await engine.ensureModels((p) => {
        if (!signal.aborted) setDownloadProgress(p);
      });
      if (signal.aborted) return;

      const resampledAudio = await decodeAndResampleTo16kHz(arrayBuffer);
      if (signal.aborted) return;

      setStatus(ProcessingState.VADRunning);
      const audioSegments = await engine.getSegments(resampledAudio, signal);
      if (signal.aborted) return;

      if (audioSegments.length === 0) {
        setError('No speech detected.');
        setStatus(ProcessingState.Error);
        return;
      }

      // Phase 1: Show all segments immediately
      const initialSegments: Segment[] = audioSegments.map((s, i) => ({
        id: i,
        text: '(transcribing...)',
        start: s.start / MS_PER_SECOND,
        end: s.end / MS_PER_SECOND,
        recordingUrl: null,
      }));
      setSegments(initialSegments);
      setProgress({ current: 0, total: audioSegments.length });

      // Phase 2: Transcribe segments one by one
      setStatus(ProcessingState.Transcribing);
      for (let i = 0; i < audioSegments.length; i++) {
        if (signal.aborted) return;

        const { text, wordTimestamps } = await engine.transcribe(audioSegments[i].audio, signal);
        if (signal.aborted) return;

        setSegments((prev) =>
          prev.map((s) => (s.id === i ? { ...s, text, wordTimestamps } : s))
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

  const patchSegment = useCallback((id: number, patch: Partial<Pick<Segment, 'text' | 'recordingUrl' | 'isScoring' | 'wordScores' | 'wordTimestamps'>>) => {
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
    audioBuffer,
    totalDuration,
  };
}
