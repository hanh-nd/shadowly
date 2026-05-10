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

  const [status, setStatus] = useState<PlaybackStatus>(PlaybackStatus.Idle);

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

      stop();

      try {
        const ctx = await getRunningContext();

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = speed;
        source.connect(ctx.destination);

        const duration = Math.max(
          segment.end - segment.start,
          MIN_SEGMENT_DURATION,
        );

        source.onended = () => {
          if (currentSourceRef.current === source) {
            setStatus(PlaybackStatus.Idle);
            currentSourceRef.current = null;
          }
        };

        currentSourceRef.current = source;
        source.start(0, segment.start, duration);
        setStatus(PlaybackStatus.Playing);
      } catch (err) {
        console.error('Playback failed:', err);
        stop();
      }
    },
    [audioBuffer, speed, stop, getRunningContext],
  );

  /**
   * Play audio from a URL.
   */
  const playUrl = useCallback(
    async (url: string, onEnded?: () => void) => {
      stop();

      try {
        const ctx = await getRunningContext();

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

        const source = ctx.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(ctx.destination);

        source.onended = () => {
          if (currentSourceRef.current === source) {
            setStatus(PlaybackStatus.Idle);
            currentSourceRef.current = null;
            onEnded?.();
          }
        };

        currentSourceRef.current = source;
        source.start(0);
        setStatus(PlaybackStatus.Playing);
      } catch (err) {
        console.error('URL playback failed:', err);
        stop();
        onEnded?.();
      }
    },
    [stop, getRunningContext],
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

  return {
    play,
    playUrl,
    stop,
    status,
    isPlaying: status === PlaybackStatus.Playing,
  };
}
