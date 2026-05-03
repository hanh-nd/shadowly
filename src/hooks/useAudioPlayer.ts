import { useRef, useState, useEffect, useCallback } from 'react';
import type { Segment } from '../types';
import { PlaybackStatus, AudioContextStateEnum } from '../types';

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
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const [status, setStatus] = useState<PlaybackStatus>(PlaybackStatus.Idle);

  const getContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const stop = useCallback(() => {
    // Stop AudioBufferSourceNode (Web Audio API)
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Already stopped or not started
      }
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }

    // Stop HTMLAudioElement (HTML5 Audio)
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
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
        const ctx = getContext();

        if (ctx.state === AudioContextStateEnum.Suspended) {
          await ctx.resume();
        }

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
    [audioBuffer, speed, stop, getContext],
  );

  /**
   * Play audio from a URL.
   */
  const playUrl = useCallback(
    async (url: string, onEnded?: () => void) => {
      stop();

      try {
        const audio = new Audio(url);
        currentAudioRef.current = audio;

        audio.onended = () => {
          if (currentAudioRef.current === audio) {
            setStatus(PlaybackStatus.Idle);
            currentAudioRef.current = null;
            onEnded?.();
          }
        };

        await audio.play();
        setStatus(PlaybackStatus.Playing);
      } catch (err) {
        console.error('URL playback failed:', err);
        stop();
      }
    },
    [stop],
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
