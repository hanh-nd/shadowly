import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { Segment } from '../types';
import { AudioContextStateEnum, PlaybackStatus } from '../types';

const MIN_SEGMENT_DURATION = 0.1;

/**
 * A reusable hook for audio playback.
 * Supports playing segments from an AudioBuffer or playing from a URL.
 */
export function useAudioPlayer(
  audioBuffer: AudioBuffer | null,
  speed: number = 1.0,
  sharedCtxRef?: RefObject<AudioContext | null>,
) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const playbackEndRef = useRef<number | undefined>(undefined);
  const decodedUrlRef = useRef<{ url: string; buffer: AudioBuffer } | null>(
    null,
  );

  const [status, setStatus] = useState<PlaybackStatus>(PlaybackStatus.Idle);
  const [currentTime, setCurrentTime] = useState(0);
  const [prevBuffer, setPrevBuffer] = useState<AudioBuffer | null>(audioBuffer);

  if (audioBuffer !== prevBuffer) {
    setPrevBuffer(audioBuffer);
    setCurrentTime(0);
  }

  const duration = audioBuffer?.duration ?? 0;

  const getRunningContext = useCallback(async (): Promise<AudioContext> => {
    // Adopt context created by another hook instance sharing the same ref
    if (
      sharedCtxRef?.current &&
      sharedCtxRef.current !== audioContextRef.current
    ) {
      audioContextRef.current = sharedCtxRef.current;
    }
    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === AudioContextStateEnum.Closed) {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
      if (sharedCtxRef) sharedCtxRef.current = ctx;
    }
    if (ctx.state !== AudioContextStateEnum.Running) {
      await ctx.resume();
    }
    return ctx;
    // sharedCtxRef is a stable ref object — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play a silent 1-sample buffer through the context's destination.
  // This wakes the earphone codec from its power-save state so that real
  // audio scheduled shortly after (baseLatency + outputLatency ahead) arrives
  // at a fully-initialized hardware output path.
  const primeHardware = useCallback((ctx: AudioContext) => {
    const silentBuf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const waker = ctx.createBufferSource();
    waker.buffer = silentBuf;
    waker.connect(ctx.destination);
    waker.start(ctx.currentTime);
  }, []);

  const stop = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Already stopped or not started
      }
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }

    setStatus(PlaybackStatus.Idle);
  }, []);

  const startPlayback = useCallback(
    async (
      buffer: AudioBuffer,
      offset: number,
      playbackDuration?: number,
      onEnded?: () => void,
    ) => {
      stop();

      try {
        const ctx = await getRunningContext();

        primeHardware(ctx);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = speed;
        source.connect(ctx.destination);

        source.onended = () => {
          if (currentSourceRef.current === source) {
            setStatus(PlaybackStatus.Idle);
            currentSourceRef.current = null;
            playbackEndRef.current = undefined;
            onEnded?.();
          }
        };

        currentSourceRef.current = source;
        const scheduledAt =
          ctx.currentTime + ctx.baseLatency + (ctx.outputLatency ?? 0);
        startTimeRef.current = scheduledAt;
        startOffsetRef.current = offset;
        setCurrentTime(offset);

        playbackEndRef.current =
          playbackDuration !== undefined
            ? offset + playbackDuration
            : undefined;

        if (playbackDuration !== undefined) {
          source.start(scheduledAt, offset, playbackDuration);
        } else {
          source.start(scheduledAt, offset);
        }

        setStatus(PlaybackStatus.Playing);
      } catch (err) {
        console.error('Playback failed:', err);
        stop();
      }
    },
    [speed, stop, getRunningContext, primeHardware],
  );

  useEffect(() => {
    let frameId: number;

    const update = () => {
      if (status !== PlaybackStatus.Playing || !audioContextRef.current) return;

      const ctx = audioContextRef.current;
      const elapsed = Math.max(
        0,
        (ctx.currentTime - startTimeRef.current) * speed,
      );
      const current = startOffsetRef.current + elapsed;
      setCurrentTime(Math.min(current, duration));
      frameId = requestAnimationFrame(update);
    };

    if (status === PlaybackStatus.Playing) {
      frameId = requestAnimationFrame(update);
    }

    return () => cancelAnimationFrame(frameId);
  }, [status, speed, duration]);

  useEffect(() => {
    if (currentSourceRef.current) {
      currentSourceRef.current.playbackRate.value = speed;
    }
  }, [speed]);

  const play = useCallback(
    async (segment: Segment) => {
      if (!audioBuffer) {
        console.warn(
          'useAudioPlayer: No audioBuffer provided for segment playback.',
        );
        return;
      }

      const segmentDuration = Math.max(
        segment.end - segment.start,
        MIN_SEGMENT_DURATION,
      );

      await startPlayback(audioBuffer, segment.start, segmentDuration);
    },
    [audioBuffer, startPlayback],
  );

  const playFrom = useCallback(
    async (offset: number) => {
      if (!audioBuffer) return;
      await startPlayback(audioBuffer, offset);
    },
    [audioBuffer, startPlayback],
  );

  const playUrl = useCallback(
    async (url: string, onEnded?: () => void) => {
      try {
        const ctx = await getRunningContext();
        let decodedBuffer: AudioBuffer;

        if (decodedUrlRef.current?.url === url) {
          decodedBuffer = decodedUrlRef.current.buffer;
        } else {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
          decodedUrlRef.current = { url, buffer: decodedBuffer };
        }

        await startPlayback(decodedBuffer, 0, undefined, onEnded);
      } catch (err) {
        console.error('URL playback failed:', err);
        stop();
        onEnded?.();
      }
    },
    [stop, getRunningContext, startPlayback],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
        if (sharedCtxRef) sharedCtxRef.current = null;
      }
    };
    // sharedCtxRef is a stable ref object — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  const seek = useCallback(
    async (time: number) => {
      const clamped = Math.max(0, Math.min(duration, time));
      if (status === PlaybackStatus.Playing && audioBuffer) {
        const remainingDuration =
          playbackEndRef.current !== undefined
            ? Math.max(0, playbackEndRef.current - clamped)
            : undefined;
        await startPlayback(audioBuffer, clamped, remainingDuration);
      } else {
        setCurrentTime(clamped);
      }
    },
    [status, audioBuffer, duration, startPlayback],
  );

  const warmup = useCallback(async () => {
    const ctx = await getRunningContext();
    primeHardware(ctx);
  }, [getRunningContext, primeHardware]);

  return {
    play,
    playFrom,
    playUrl,
    warmup,
    stop,
    seek,
    status,
    currentTime,
    setCurrentTime,
    duration,
    isPlaying: status === PlaybackStatus.Playing,
  };
}
