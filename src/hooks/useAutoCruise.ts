import { useCallback, useEffect, useRef } from 'react';

import { MS_PER_SECOND } from '../constants';
import type { Segment } from '../types';
import { ShadowingPhase } from '../types';

export interface UseAutoCruiseParams {
  autoStopEnabled: boolean;
  autoCruiseEnabled: boolean;
  scoringEnabled: boolean;
  bufferTime: number;
  loopCount: number;
  segments: Segment[];
  activeIndex: number;
  phase: ShadowingPhase;
  isScoring: boolean;
  recordingUrl: string | null;
  isPlayingOriginal: boolean;
  isRecording: boolean;
  micError: string | null;
  onPlayOriginal: (segment: Segment) => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onPlayMine: (url: string, onEnded: () => void) => void;
  onNavigateNext: () => void;
  onPhaseChange: (phase: ShadowingPhase) => void;
}

export interface UseAutoCruiseReturn {
  startCruise: () => void;
  cancelCruise: () => void;
}

export function useAutoCruise({
  autoStopEnabled,
  autoCruiseEnabled,
  scoringEnabled,
  bufferTime,
  loopCount,
  segments,
  activeIndex,
  phase,
  isScoring,
  recordingUrl,
  isPlayingOriginal,
  isRecording,
  micError,
  onPlayOriginal,
  onStartRecord,
  onStopRecord,
  onPlayMine,
  onNavigateNext,
  onPhaseChange,
}: UseAutoCruiseParams): UseAutoCruiseReturn {
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStartedRecordingRef = useRef(false);

  // 1. Move basic state refs
  const onStopRecordRef = useRef(onStopRecord);
  const segmentsRef = useRef(segments);
  const activeIndexRef = useRef(activeIndex);
  const bufferTimeRef = useRef(bufferTime);
  const loopCountRef = useRef(loopCount);
  const loopIterationRef = useRef(0);
  const recordingUrlRef = useRef(recordingUrl);
  const onPlayMineRef = useRef(onPlayMine);

  // 2. Define cancelCruise (before it's used in handlePlayMineEnded)
  const cancelCruise = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (scoringTimeoutRef.current) {
      clearTimeout(scoringTimeoutRef.current);
      scoringTimeoutRef.current = null;
    }
    hasStartedRecordingRef.current = false;
    loopIterationRef.current = 0;
    onPhaseChange(ShadowingPhase.Idle);
  }, [onPhaseChange]);

  // 3. Define handlePlayMineEnded (before its ref)
  const handlePlayMineEnded = useCallback(() => {
    if (loopIterationRef.current + 1 < loopCountRef.current) {
      loopIterationRef.current++;
      onPhaseChange(ShadowingPhase.PlayingOriginal);
      onPlayOriginal(segmentsRef.current[activeIndexRef.current]);
    } else {
      const isLast = activeIndexRef.current === segmentsRef.current.length - 1;
      if (isLast) {
        cancelCruise();
      } else {
        loopIterationRef.current = 0;
        onPhaseChange(ShadowingPhase.PlayingOriginal);
        onNavigateNext();
        onPlayOriginal(segmentsRef.current[activeIndexRef.current + 1]);
      }
    }
  }, [onNavigateNext, onPlayOriginal, cancelCruise, onPhaseChange]);

  // 4. Define remaining refs that depend on above functions
  const handlePlayMineEndedRef = useRef(handlePlayMineEnded);

  useEffect(() => {
    onStopRecordRef.current = onStopRecord;
    segmentsRef.current = segments;
    activeIndexRef.current = activeIndex;
    bufferTimeRef.current = bufferTime;
    loopCountRef.current = loopCount;
    recordingUrlRef.current = recordingUrl;
    onPlayMineRef.current = onPlayMine;
    handlePlayMineEndedRef.current = handlePlayMineEnded;
  }, [
    onStopRecord,
    segments,
    activeIndex,
    bufferTime,
    loopCount,
    recordingUrl,
    onPlayMine,
    handlePlayMineEnded,
  ]);

  const startCruise = useCallback(() => {
    if (!autoCruiseEnabled) return;
    onPhaseChange(ShadowingPhase.PlayingOriginal);
  }, [autoCruiseEnabled, onPhaseChange]);

  // Cancel cruise when autoCruise is disabled while a session is active
  useEffect(() => {
    if (!autoCruiseEnabled && phase !== ShadowingPhase.Idle) {
      cancelCruise();
    }
  }, [autoCruiseEnabled, phase, cancelCruise]);

  // Effect A — Auto-stop timer
  useEffect(() => {
    const isAutoStopping = autoStopEnabled && phase === ShadowingPhase.Idle;
    const isCruiseRecording = phase === ShadowingPhase.Recording;

    if (isRecording && (isAutoStopping || isCruiseRecording)) {
      if (!autoStopTimerRef.current) {
        const seg = segmentsRef.current[activeIndexRef.current];
        const segDuration = seg.end - seg.start;
        autoStopTimerRef.current = setTimeout(
          () => {
            onStopRecordRef.current();
            autoStopTimerRef.current = null;
          },
          (segDuration + bufferTimeRef.current) * MS_PER_SECOND,
        );
      }
    } else if (!isRecording && autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    return () => {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    };
  }, [isRecording, autoStopEnabled, phase]);

  // Effect B — Phase Driver: Idle -> PlayingOriginal
  useEffect(() => {
    if (phase === ShadowingPhase.PlayingOriginal && !isPlayingOriginal) {
      onPlayOriginal(segmentsRef.current[activeIndex]);
    }
  }, [phase, isPlayingOriginal, activeIndex, onPlayOriginal]);

  // Effect C — Phase Driver: PlayingOriginal Finished -> Recording
  useEffect(() => {
    if (phase === ShadowingPhase.PlayingOriginal && !isPlayingOriginal) {
      hasStartedRecordingRef.current = false; // Reset for new recording session
      onPhaseChange(ShadowingPhase.Recording);
      onStartRecord();
    }
  }, [phase, isPlayingOriginal, onStartRecord, onPhaseChange]);

  // Effect D — Phase Driver: Recording Finished -> Scoring (or PlayingMine)
  useEffect(() => {
    if (phase === ShadowingPhase.Recording && isRecording) {
      hasStartedRecordingRef.current = true;
    }

    if (
      phase === ShadowingPhase.Recording &&
      hasStartedRecordingRef.current &&
      !isRecording
    ) {
      if (scoringEnabled) {
        onPhaseChange(ShadowingPhase.Scoring);
      } else {
        onPhaseChange(ShadowingPhase.PlayingMine);
      }
    }
  }, [phase, isRecording, scoringEnabled, onPhaseChange]);

  // Effect E — Phase Driver: Scoring Finished & Scored -> PlayingMine
  useEffect(() => {
    if (phase === ShadowingPhase.Scoring && !isScoring && recordingUrl) {
      if (scoringTimeoutRef.current) {
        clearTimeout(scoringTimeoutRef.current);
        scoringTimeoutRef.current = null;
      }
      onPhaseChange(ShadowingPhase.PlayingMine);
      onPlayMine(recordingUrl, handlePlayMineEnded);
      hasStartedRecordingRef.current = false;
    }
  }, [
    phase,
    isScoring,
    recordingUrl,
    onPlayMine,
    handlePlayMineEnded,
    onPhaseChange,
  ]);

  // Effect E2 — Phase Driver: Bypassed Scoring -> PlayingMine (triggered by recordingUrl)
  useEffect(() => {
    if (
      phase === ShadowingPhase.PlayingMine &&
      !scoringEnabled &&
      recordingUrl &&
      hasStartedRecordingRef.current
    ) {
      onPlayMine(recordingUrl, handlePlayMineEnded);
      hasStartedRecordingRef.current = false;
    }
  }, [phase, scoringEnabled, recordingUrl, onPlayMine, handlePlayMineEnded]);

  // Effect F — Scoring timeout
  useEffect(() => {
    if (phase === ShadowingPhase.Scoring) {
      scoringTimeoutRef.current = setTimeout(() => {
        const url = recordingUrlRef.current;
        if (url) {
          onPhaseChange(ShadowingPhase.PlayingMine);
          onPlayMineRef.current(url, handlePlayMineEndedRef.current);
        } else {
          cancelCruise();
        }
        scoringTimeoutRef.current = null;
      }, 2000);
    }

    return () => {
      if (scoringTimeoutRef.current) {
        clearTimeout(scoringTimeoutRef.current);
        scoringTimeoutRef.current = null;
      }
    };
  }, [phase, cancelCruise, onPhaseChange]);

  // Effect G — Mic error guard
  useEffect(() => {
    if (micError && phase !== ShadowingPhase.Idle) {
      cancelCruise();
    }
  }, [micError, phase, cancelCruise]);

  return { startCruise, cancelCruise };
}
