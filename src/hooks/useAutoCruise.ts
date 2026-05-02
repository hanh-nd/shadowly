import { useCallback, useEffect, useRef, useState } from 'react';
import type { Segment } from '../types';
import { CruisePhase } from '../types';

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
  bufferTime: number;
  loopCount: number;
  toggleAutoStop: () => void;
  toggleAutoCruise: () => void;
  startCruise: () => void;
  cancelCruise: () => void;
  setBufferTime: (t: number) => void;
  setLoopCount: (n: number) => void;
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
  const [autoStopEnabled, setAutoStopEnabled] = useState(true);
  const [autoCruiseEnabled, setAutoCruiseEnabled] = useState(true);
  const [cruisePhase, setCruisePhase] = useState(CruisePhase.Idle);
  const [bufferTime, setBufferTime] = useState(2);
  const [loopCount, setLoopCount] = useState(3);

  const prevIsPlayingRef = useRef(false);
  const prevIsRecordingRef = useRef(false);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingForUrlRef = useRef(false);

  // Use refs for values that shouldn't trigger timer resets
  const onStopRecordRef = useRef(onStopRecord);
  const segmentsRef = useRef(segments);
  const activeIndexRef = useRef(activeIndex);
  const bufferTimeRef = useRef(2);
  const loopCountRef = useRef(3);
  const loopIterationRef = useRef(0);

  useEffect(() => { onStopRecordRef.current = onStopRecord; }, [onStopRecord]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { bufferTimeRef.current = bufferTime; }, [bufferTime]);
  useEffect(() => { loopCountRef.current = loopCount; }, [loopCount]);

  const cancelCruise = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    waitingForUrlRef.current = false;
    loopIterationRef.current = 0;
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
    if (loopIterationRef.current + 1 < loopCountRef.current) {
      loopIterationRef.current++;
      setCruisePhase(CruisePhase.PlayingOriginal);
      onPlayOriginal(segmentsRef.current[activeIndexRef.current]);
    } else {
      const isLast = activeIndexRef.current === segmentsRef.current.length - 1;
      if (isLast) {
        cancelCruise();
      } else {
        loopIterationRef.current = 0;
        setCruisePhase(CruisePhase.PlayingOriginal);
        onNavigateNext();
        onPlayOriginal(segmentsRef.current[activeIndexRef.current + 1]);
      }
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
        }, (segDuration + bufferTimeRef.current) * 1000);
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
    bufferTime,
    loopCount,
    toggleAutoStop,
    toggleAutoCruise,
    startCruise,
    cancelCruise,
    setBufferTime,
    setLoopCount,
  };
}
