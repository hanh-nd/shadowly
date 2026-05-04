import { useCallback, useState } from 'react';

export function usePracticeSettings() {
  const [maskMode, setMaskMode] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const toggleMaskMode = useCallback(() => {
    setMaskMode((prev) => !prev);
  }, []);

  return {
    maskMode,
    playbackSpeed,
    toggleMaskMode,
    setPlaybackSpeed,
  };
}
