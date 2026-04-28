import { useRef, useState, useEffect } from 'react';
import type { Segment } from '../types';

export function useAudioPlayer(audioBuffer: AudioBuffer | null, speed: number) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  function getContext(): AudioContext {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }

  function stop() {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {
        // already stopped
      }
      currentSourceRef.current = null;
    }
    setIsPlaying(false);
  }

  async function play(segment: Segment) {
    if (!audioBuffer) return;
    stop();

    const ctx = getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = speed;
    source.connect(ctx.destination);

    const duration = Math.max(segment.end - segment.start, 0.1);
    source.start(0, segment.start, duration);
    source.onended = () => setIsPlaying(false);

    currentSourceRef.current = source;
    setIsPlaying(true);
  }

  useEffect(() => {
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { play, stop, isPlaying };
}
