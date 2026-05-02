import { useCallback, useEffect, useRef, useState } from 'react';
import { CruisePhase } from '../types';
import type { Segment } from '../types';

export interface UseAutoCruiseParams {
  segments: Segment[];
  activeIndex: number;
  isPlayingOriginal: boolean;
  isRecording: boolean;
  micError: string | null;
  activeSegmentRecordingUrl: string | null;
  onPlayOriginal: (segment: Segment) => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onPlayMine: (url: string, onEnded: () => void) => void;
  onNavigateNext: () => void;
}

export interface UseAutoCruiseReturn {
  autoStopEnabled: boolean;
  autoCruiseEnabled: boolean;
  cruisePhase: CruisePhase;
  toggleAutoStop: () => void;
  toggleAutoCruise: () => void;
  startCruise: () => void;
  cancelCruise: () => void;
}

export function useAutoCruise({
  segments,
  activeIndex,
  isPlayingOriginal,
  isRecording,
  micError,
  activeSegmentRecordingUrl,
  onPlayOriginal,
  onStartRecord,
  onStopRecord,
  onPlayMine,
  onNavigateNext,
}: UseAutoCruiseParams): UseAutoCruiseReturn {
  const [autoStopEnabled, setAutoStopEnabled] = useState(false);
  const [autoCruiseEnabled, setAutoCruiseEnabled] = useState(false);
  const [cruisePhase, setCruisePhase] = useState(CruisePhase.Idle);

  const prevIsPlayingRef = useRef(false);
  const prevIsRecordingRef = useRef(false);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingForUrlRef = useRef(false);

  // Use refs for values that shouldn't trigger timer resets
  const onStopRecordRef = useRef(onStopRecord);
  const segmentsRef = useRef(segments);
  const activeIndexRef = useRef(activeIndex);

  useEffect(() => { onStopRecordRef.current = onStopRecord; }, [onStopRecord]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

  const cancelCruise = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    waitingForUrlRef.current = false;
    setCruisePhase(CruisePhase.Idle);
  }, []);

  const startCruise = useCallback(() => {
    if (!autoCruiseEnabled) return;
    setCruisePhase(CruisePhase.PlayingOriginal);
  }, [autoCruiseEnabled]);

  const toggleAutoStop = useCallback(() => {
    setAutoStopEnabled((prev) => !prev);
  }, []);

  const toggleAutoCruise = useCallback(() => {
    setAutoCruiseEnabled((prev) => {
      const next = !prev;
      if (!next && cruisePhase !== CruisePhase.Idle) {
        cancelCruise();
      }
      return next;
    });
  }, [cruisePhase, cancelCruise]);

  const handlePlayMineEnded = useCallback(() => {
    const isLast = activeIndexRef.current === segmentsRef.current.length - 1;
    if (isLast) {
      cancelCruise();
    } else {
      setCruisePhase(CruisePhase.PlayingOriginal);
      onNavigateNext();
      onPlayOriginal(segmentsRef.current[activeIndexRef.current + 1]);
    }
  }, [cancelCruise, onNavigateNext, onPlayOriginal]);

  // Effect A — Auto-stop timer
  useEffect(() => {
    const isAutoStopping = autoStopEnabled && cruisePhase === CruisePhase.Idle;
    const isCruiseRecording = cruisePhase === CruisePhase.Recording;

    if (isRecording && (isAutoStopping || isCruiseRecording)) {
      if (!autoStopTimerRef.current) {
        const seg = segmentsRef.current[activeIndexRef.current];
        const segDuration = seg.end - seg.start;
        autoStopTimerRef.current = setTimeout(() => {
          onStopRecordRef.current();
          autoStopTimerRef.current = null;
        }, (segDuration + 1) * 1000);
      }
    } else if (!isRecording && autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    return () => {
      if (!isRecording && autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    };
  }, [isRecording, autoStopEnabled, cruisePhase]);

  // Effect B — PlayingOriginal → Recording transition
  useEffect(() => {
    if (cruisePhase === CruisePhase.PlayingOriginal && prevIsPlayingRef.current && !isPlayingOriginal) {
      queueMicrotask(() => {
        setCruisePhase(CruisePhase.Recording);
        onStartRecord();
      });
    }
    prevIsPlayingRef.current = isPlayingOriginal;
  }, [isPlayingOriginal, cruisePhase, onStartRecord]);

  // Effect C — Recording stops → begin waiting for URL
  useEffect(() => {
    if (cruisePhase === CruisePhase.Recording && prevIsRecordingRef.current && !isRecording) {
      waitingForUrlRef.current = true;
    }
    prevIsRecordingRef.current = isRecording;
  }, [isRecording, cruisePhase]);

  // Effect D — URL arrives → PlayingMine
  useEffect(() => {
    if (cruisePhase === CruisePhase.Recording && waitingForUrlRef.current && activeSegmentRecordingUrl) {
      queueMicrotask(() => {
        waitingForUrlRef.current = false;
        setCruisePhase(CruisePhase.PlayingMine);
        onPlayMine(activeSegmentRecordingUrl, handlePlayMineEnded);
      });
    }
  }, [activeSegmentRecordingUrl, cruisePhase, onPlayMine, handlePlayMineEnded]);

  // Effect E — Mic error guard
  useEffect(() => {
    if (micError && cruisePhase !== CruisePhase.Idle) {
      queueMicrotask(() => {
        cancelCruise();
      });
    }
  }, [micError, cruisePhase, cancelCruise]);

  return {
    autoStopEnabled,
    autoCruiseEnabled,
    cruisePhase,
    toggleAutoStop,
    toggleAutoCruise,
    startCruise,
    cancelCruise,
  };
}
