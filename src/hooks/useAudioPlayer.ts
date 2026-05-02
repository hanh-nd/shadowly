import { useRef, useState, useEffect, useCallback } from 'react';
import type { Segment } from '../types';
import { PlaybackStatus, AudioContextStateEnum } from '../types';

const MIN_SEGMENT_DURATION = 0.1;

/**
 * Hook for playing segments from an AudioBuffer.
 * Manages the AudioContext lifecycle and playback state.
 */
export function useAudioPlayer(audioBuffer: AudioBuffer | null, speed: number) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>(PlaybackStatus.Idle);

  const getContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const stop = useCallback(() => {
    const source = currentSourceRef.current;
    if (source) {
      try {
        source.stop();
      } catch {
        // Already stopped or not started
      }
      source.disconnect();
      currentSourceRef.current = null;
    }
    setStatus(PlaybackStatus.Idle);
  }, []);

  const play = useCallback(async (segment: Segment) => {
    if (!audioBuffer) return;
    
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

      const duration = Math.max(segment.end - segment.start, MIN_SEGMENT_DURATION);
      
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
      setStatus(PlaybackStatus.Idle);
    }
  }, [audioBuffer, speed, stop, getContext]);

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
    stop, 
    status,
    isPlaying: status === PlaybackStatus.Playing 
  };
}
