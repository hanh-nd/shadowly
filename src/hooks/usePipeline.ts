import { useRef, useState, useCallback } from 'react';
import { pipeline } from '@huggingface/transformers';
import type { Segment, ProcessingState, TranscribingProgress } from '../types';

// Access global vad from script tag
interface GlobalVAD {
  NonRealTimeVAD: {
    new: (options: {
      preSpeechPadMs: number;
      redemptionMs: number;
      minSpeechMs: number;
      positiveSpeechThreshold: number;
      model: string;
      onnxWASMBasePath: string;
      ortConfig: (ort: { env: { wasm: { simd: boolean; proxy: boolean } } }) => void;
    }) => Promise<{
      run: (audio: Float32Array, sr: number) => AsyncIterable<{ audio: Float32Array; start: number; end: number }>;
    }>;
  };
}
declare const vad: GlobalVAD;

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
  const [status, setStatus] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState<TranscribingProgress | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pipeRef = useRef<Awaited<ReturnType<typeof pipeline>> | null>(null);
  const vadRef = useRef<{ run: (audio: Float32Array, sr: number) => AsyncIterable<{ audio: Float32Array; start: number; end: number }> } | null>(null);
  const runIdRef = useRef<number>(0);

  const reset = useCallback(() => {
    runIdRef.current++; // Invalidate current run
    setStatus('idle');
    setError(null);
    setSegments([]);
    setProgress(null);
  }, []);

  const resampleTo16kHz = async (arrayBuffer: ArrayBuffer): Promise<Float32Array> => {
    const audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    audioCtx.close();

    if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
      return decoded.getChannelData(0);
    }

    const targetLength = Math.round(decoded.duration * 16000);
    const offlineCtx = new OfflineAudioContext(1, targetLength, 16000);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start();
    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0);
  };

  const ensureWhisper = async () => {
    if (!pipeRef.current) {
      pipeRef.current = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny.en',
        {
          device: 'wasm',
          dtype: 'q8',
          session_options: {
            graphOptimizationLevel: 'basic',
          },
          progress_callback: (p: { progress?: number }) => {
            if (p.progress != null && !isNaN(p.progress)) {
              setDownloadProgress(Math.round(p.progress));
            }
          },
        }
      );
    }
  };

  const ensureVAD = async () => {
    if (!vadRef.current) {
      if (typeof vad === 'undefined') {
        throw new Error('VAD library not loaded from CDN');
      }
      vadRef.current = await vad.NonRealTimeVAD.new({
        preSpeechPadMs: 200,
        redemptionMs: 400,
        minSpeechMs: 250,
        positiveSpeechThreshold: 0.6,
        model: 'v5',
        onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/',
        ortConfig: (ort: { env: { wasm: { simd: boolean; proxy: boolean } } }) => {
          ort.env.wasm.simd = true;
          ort.env.wasm.proxy = false;
        },
      });
    }
  };

  const process = async (arrayBuffer: ArrayBuffer) => {
    const myRunId = ++runIdRef.current;
    
    setSegments([]);
    setProgress(null);
    setError(null);
    setStatus('loading-model');

    try {
      await Promise.all([ensureWhisper(), ensureVAD()]);
      if (runIdRef.current !== myRunId) return;

      const float32 = await resampleTo16kHz(arrayBuffer);
      if (runIdRef.current !== myRunId) return;

      setStatus('vad-running');
      let chunkCount = 0;
      let firstChunk = true;

      for await (const { audio, start, end } of vadRef.current.run(float32, 16000)) {
        if (runIdRef.current !== myRunId) return;
        
        chunkCount++;

        if (firstChunk) {
          setStatus('transcribing');
          firstChunk = false;
        }

        const startSec = start / 1000;
        const endSec = end / 1000;

        let text = '';
        try {
          const result = await pipeRef.current(audio);
          text = result.text.trim();
        } catch (err) {
          console.error(`Whisper chunk ${chunkCount} error:`, err);
          text = '[unintelligible]';
        }

        if (runIdRef.current !== myRunId) return;

        setSegments((prev) => [
          ...prev,
          { id: prev.length, text, start: startSec, end: endSec, recordingUrl: null },
        ]);
        setProgress({ current: chunkCount, total: chunkCount });
      }

      if (runIdRef.current !== myRunId) return;

      if (chunkCount === 0) {
        setError('No speech detected.');
        setStatus('error');
        return;
      }

      setStatus('ready');
    } catch (err) {
      if (runIdRef.current !== myRunId) return;
      const msg = err instanceof Error ? err.message : 'Transcription failed.';
      setError(msg);
      setStatus('error');
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
