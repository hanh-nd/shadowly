import { useCallback, useEffect, useRef, useState } from 'react';

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
) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);

  const [status, setStatus] = useState<PlaybackStatus>(PlaybackStatus.Idle);
  const [currentTime, setCurrentTime] = useState(0);
  const [prevBuffer, setPrevBuffer] = useState<AudioBuffer | null>(audioBuffer);

  if (audioBuffer !== prevBuffer) {
    setPrevBuffer(audioBuffer);
    setCurrentTime(0);
  }

  const duration = audioBuffer?.duration ?? 0;

  const getRunningContext = useCallback(async (): Promise<AudioContext> => {
    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === AudioContextStateEnum.Closed) {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
    }
    if (ctx.state !== AudioContextStateEnum.Running) {
      await ctx.resume();
    }
    return ctx;
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

        // Wake the earphone codec before scheduling real audio. The real audio
        // is delayed by baseLatency + outputLatency, giving the codec enough
        // time to fully initialize before audible content arrives.
        primeHardware(ctx);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = speed;
        source.connect(ctx.destination);

        source.onended = () => {
          if (currentSourceRef.current === source) {
            setStatus(PlaybackStatus.Idle);
            currentSourceRef.current = null;
            onEnded?.();
          }
        };

        currentSourceRef.current = source;
        const scheduledAt =
          ctx.currentTime + ctx.baseLatency + (ctx.outputLatency ?? 0);
        startTimeRef.current = scheduledAt;
        startOffsetRef.current = offset;
        setCurrentTime(offset);

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

  /**
   * Play a segment from the provided AudioBuffer.
   */
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

  /**
   * Play the whole buffer from a given offset.
   */
  const playFrom = useCallback(
    async (offset: number) => {
      if (!audioBuffer) return;
      await startPlayback(audioBuffer, offset);
    },
    [audioBuffer, startPlayback],
  );

  /**
   * Play audio from a URL.
   */
  const playUrl = useCallback(
    async (url: string, onEnded?: () => void) => {
      try {
        const ctx = await getRunningContext();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

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
      }
    };
  }, [stop]);

  /**
   * Seek to a specific time.
   * If playing, restarts playback from the new offset.
   * If stopped, just updates the current time.
   */
  const seek = useCallback(
    async (time: number) => {
      const clamped = Math.max(0, Math.min(duration, time));
      if (status === PlaybackStatus.Playing && audioBuffer) {
        await startPlayback(audioBuffer, clamped);
      } else {
        setCurrentTime(clamped);
      }
    },
    [status, audioBuffer, duration, startPlayback],
  );

  const warmup = useCallback(async () => {
    await getRunningContext();
  }, [getRunningContext]);

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
