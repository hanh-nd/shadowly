import { useCallback, useEffect, useRef, useState } from 'react';

import type { Segment } from '../types';
import { NavigationDirection, ShadowingPhase } from '../types';
import { useAudioPlayer } from './useAudioPlayer';
import type { UseAutoCruiseReturn } from './useAutoCruise';
import { useAutoCruise } from './useAutoCruise';
import { usePipeline } from './usePipeline';
import { usePracticeSettings } from './usePracticeSettings';
import { usePronunciationScorer } from './usePronunciationScorer';
import { useRecorder } from './useRecorder';

export function useShadowingManager() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<ShadowingPhase>(ShadowingPhase.Idle);

  const settings = usePracticeSettings();

  const pipeline = usePipeline();
  const originalPlayer = useAudioPlayer(
    pipeline.audioBuffer,
    settings.playbackSpeed,
  );
  const minePlayer = useAudioPlayer(null, 1.0);
  const recorder = useRecorder();
  const scorer = usePronunciationScorer({
    patchSegment: pipeline.patchSegment,
  });

  const currentSegment = pipeline.segments[activeIndex];
  const cruiseRef = useRef<UseAutoCruiseReturn | null>(null);

  const handleStopRecord = useCallback(async () => {
    const blob = await recorder.stopRecording();
    const newUrl = URL.createObjectURL(blob);

    if (currentSegment?.recordingUrl) {
      URL.revokeObjectURL(currentSegment.recordingUrl);
    }

    // Automation settings are handled by the cruise hook
    const isScoringEnabled = cruiseRef.current?.scoringEnabled ?? true;

    if (isScoringEnabled) {
      pipeline.patchSegment(activeIndex, {
        recordingUrl: newUrl,
        isScoring: true,
      });

      if (pipeline.audioBuffer && currentSegment?.wordTimestamps?.length) {
        const sr = pipeline.audioBuffer.sampleRate;
        const startFrame = Math.floor(currentSegment.start * sr);
        const endFrame = Math.floor(currentSegment.end * sr);
        const refSlice = pipeline.audioBuffer
          .getChannelData(0)
          .slice(startFrame, endFrame);
        scorer.score(
          activeIndex,
          currentSegment.wordTimestamps,
          refSlice,
          sr,
          blob,
        );
      } else {
        pipeline.patchSegment(activeIndex, { isScoring: false });
      }
    } else {
      pipeline.patchSegment(activeIndex, {
        recordingUrl: newUrl,
        isScoring: false,
      });
    }
  }, [recorder, pipeline, activeIndex, scorer, currentSegment]);

  const handleNavigate = useCallback(
    (dir: NavigationDirection) => {
      originalPlayer.stop();
      minePlayer.stop();
      setActiveIndex((i) => {
        const delta = dir === NavigationDirection.Prev ? -1 : 1;
        return Math.max(0, Math.min(pipeline.segments.length - 1, i + delta));
      });
    },
    [originalPlayer, minePlayer, pipeline.segments.length],
  );

  const performStartRecord = useCallback(() => {
    minePlayer.stop();
    originalPlayer.stop();

    const segment = pipeline.segments[activeIndex];
    if (segment?.recordingUrl) {
      URL.revokeObjectURL(segment.recordingUrl);
    }

    scorer.clearScores(activeIndex);
    pipeline.patchSegment(activeIndex, {
      wordScores: null,
      isScoring: false,
      recordingUrl: null,
    });
    recorder.startRecording();
  }, [minePlayer, originalPlayer, pipeline, activeIndex, scorer, recorder]);

  const cruise = useAutoCruise({
    segments: pipeline.segments,
    activeIndex: activeIndex,
    phase,
    isScoring: currentSegment?.isScoring ?? false,
    recordingUrl: currentSegment?.recordingUrl ?? null,
    isPlayingOriginal: originalPlayer.isPlaying,
    isRecording: recorder.isRecording,
    micError: recorder.micError,
    onPlayOriginal: useCallback(
      (seg: Segment) => {
        minePlayer.stop();
        originalPlayer.play(seg);
      },
      [originalPlayer, minePlayer],
    ),
    onStartRecord: performStartRecord,
    onStopRecord: handleStopRecord,
    onPlayMine: useCallback(
      (url: string, onEnded: () => void) => {
        originalPlayer.stop();
        minePlayer.playUrl(url, onEnded);
      },
      [originalPlayer, minePlayer],
    ),
    onNavigateNext: useCallback(
      () => handleNavigate(NavigationDirection.Next),
      [handleNavigate],
    ),
    onPhaseChange: setPhase,
  });

  useEffect(() => {
    cruiseRef.current = cruise;
  }, [cruise]);

  const upload = useCallback(
    (file: File) => {
      setPhase(ShadowingPhase.Idle);
      originalPlayer.stop();
      minePlayer.stop();
      setActiveIndex(0);
      pipeline.process(file);
    },
    [originalPlayer, minePlayer, pipeline],
  );

  const playOriginal = useCallback(
    (segment: Segment) => {
      if (originalPlayer.isPlaying) {
        originalPlayer.stop();
        setPhase(ShadowingPhase.Idle);
        return;
      }

      if (recorder.isRecording) {
        handleStopRecord();
      }

      minePlayer.stop();
      originalPlayer.play(segment);

      if (cruise.autoCruiseEnabled && phase === ShadowingPhase.Idle) {
        setPhase(ShadowingPhase.PlayingOriginal);
      }
    },
    [
      originalPlayer,
      recorder,
      handleStopRecord,
      cruise.autoCruiseEnabled,
      phase,
      minePlayer,
    ],
  );

  const startRecord = useCallback(() => {
    setPhase(ShadowingPhase.Idle);
    performStartRecord();
  }, [performStartRecord]);

  const stopRecord = useCallback(() => {
    if (phase !== ShadowingPhase.Idle && phase !== ShadowingPhase.Recording) {
      setPhase(ShadowingPhase.Idle);
    }
    handleStopRecord();
  }, [phase, handleStopRecord]);

  const playMine = useCallback(
    (url: string) => {
      if (minePlayer.isPlaying) {
        minePlayer.stop();
        setPhase(ShadowingPhase.Idle);
        return;
      }

      setPhase(ShadowingPhase.Idle);
      originalPlayer.stop();
      minePlayer.playUrl(url);
    },
    [minePlayer, originalPlayer],
  );

  const navigate = useCallback(
    (dir: NavigationDirection) => {
      setPhase(ShadowingPhase.Idle);
      handleNavigate(dir);
    },
    [handleNavigate],
  );

  const jump = useCallback(
    (index: number) => {
      setPhase(ShadowingPhase.Idle);
      originalPlayer.stop();
      minePlayer.stop();
      setActiveIndex(index);
    },
    [originalPlayer, minePlayer],
  );

  return {
    // State
    activeIndex,
    segments: pipeline.segments,
    status: pipeline.status,
    progress: pipeline.progress,
    downloadProgress: pipeline.downloadProgress,
    error: pipeline.error,
    audioBuffer: pipeline.audioBuffer,
    totalDuration: pipeline.totalDuration,
    isPlayingOriginal: originalPlayer.isPlaying,
    isPlayingMine: minePlayer.isPlaying,
    isRecording: recorder.isRecording,
    micError: recorder.micError,

    // Actions
    upload,
    reset: pipeline.reset,
    playOriginal,
    startRecord,
    stopRecord,
    playMine,
    navigate,
    jump,

    // Settings
    settings: {
      maskMode: settings.maskMode,
      playbackSpeed: settings.playbackSpeed,
      toggleMaskMode: settings.toggleMaskMode,
      setPlaybackSpeed: settings.setPlaybackSpeed,
    },

    // Automation (Auto-Cruise)
    automation: {
      autoStopEnabled: cruise.autoStopEnabled,
      autoCruiseEnabled: cruise.autoCruiseEnabled,
      scoringEnabled: cruise.scoringEnabled,
      bufferTime: cruise.bufferTime,
      cruisePhase: phase,
      loopCount: cruise.loopCount,
      setBufferTime: cruise.setBufferTime,
      setLoopCount: cruise.setLoopCount,
      startCruise: cruise.startCruise,
      cancelCruise: cruise.cancelCruise,
      toggleAutoStop: cruise.toggleAutoStop,
      toggleAutoCruise: cruise.toggleAutoCruise,
      toggleScoring: cruise.toggleScoring,
    },
  };
}
