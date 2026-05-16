import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SettingsStorage } from '../utils/settings-storage';
import { localStorageSettingsStorage } from '../utils/settings-storage';

export function usePracticeSettings(
  storage: SettingsStorage = localStorageSettingsStorage,
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const saved = useMemo(() => storage.load(), []);

  const [maskMode, setMaskMode] = useState(saved.maskMode ?? true);
  const [playbackSpeed, setPlaybackSpeed] = useState(
    saved.playbackSpeed ?? 1.0,
  );
  const [autoStopEnabled, setAutoStopEnabled] = useState(
    saved.autoStopEnabled ?? true,
  );
  const [autoCruiseEnabled, setAutoCruiseEnabled] = useState(
    saved.autoCruiseEnabled ?? true,
  );
  const [scoringEnabled, setScoringEnabled] = useState(
    saved.scoringEnabled ?? false,
  );
  const [bufferTime, setBufferTime] = useState(saved.bufferTime ?? 2);
  const [loopCount, setLoopCount] = useState(saved.loopCount ?? 3);

  useEffect(() => {
    storage.save({
      maskMode,
      playbackSpeed,
      autoStopEnabled,
      autoCruiseEnabled,
      scoringEnabled,
      bufferTime,
      loopCount,
    });
    // storage is intentionally excluded — expected to be a stable reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    maskMode,
    playbackSpeed,
    autoStopEnabled,
    autoCruiseEnabled,
    scoringEnabled,
    bufferTime,
    loopCount,
  ]);

  const toggleMaskMode = useCallback(() => {
    setMaskMode((prev) => !prev);
  }, []);

  const toggleAutoStop = useCallback(() => {
    setAutoStopEnabled((prev) => !prev);
  }, []);

  const toggleAutoCruise = useCallback(() => {
    setAutoCruiseEnabled((prev) => !prev);
  }, []);

  const toggleScoring = useCallback(() => {
    setScoringEnabled((prev) => !prev);
  }, []);

  return {
    maskMode,
    playbackSpeed,
    autoStopEnabled,
    autoCruiseEnabled,
    scoringEnabled,
    bufferTime,
    loopCount,
    toggleMaskMode,
    setPlaybackSpeed,
    toggleAutoStop,
    toggleAutoCruise,
    toggleScoring,
    setBufferTime,
    setLoopCount,
  };
}
