import { useCallback, useEffect, useState } from 'react';

import { TRANSCRIBING_TEXT } from '../constants';
import type { Segment, WordTimestamp } from '../types';
import { NavigationDirection, ShadowingPhase } from '../types';
import { useAudioPlayer } from './useAudioPlayer';
import { useAutoCruise } from './useAutoCruise';
import { useModelLoader } from './useModelLoader';
import { usePipeline } from './usePipeline';
import { usePracticeSettings } from './usePracticeSettings';
import { usePronunciationScorer } from './usePronunciationScorer';
import { useRecorder } from './useRecorder';

export function useShadowingManager() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<ShadowingPhase>(ShadowingPhase.Idle);
  const pipeline = usePipeline();
  const settings = usePracticeSettings();
  const modelLoader = useModelLoader({
    scoringEnabled: settings.scoringEnabled,
  });
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

  const handleStopRecord = useCallback(async () => {
    const blob = await recorder.stopRecording();
    const newUrl = URL.createObjectURL(blob);

    if (currentSegment?.recordingUrl) {
      URL.revokeObjectURL(currentSegment.recordingUrl);
    }

    if (settings.scoringEnabled) {
      pipeline.patchSegment(activeIndex, {
        recordingUrl: newUrl,
        isScoring: true,
      });

      if (pipeline.audioBuffer && currentSegment) {
        scorer.score(activeIndex, blob);
      } else {
        pipeline.patchSegment(activeIndex, { isScoring: false });
      }
    } else {
      pipeline.patchSegment(activeIndex, {
        recordingUrl: newUrl,
        isScoring: false,
      });
    }
  }, [
    recorder,
    pipeline,
    activeIndex,
    scorer,
    currentSegment,
    settings.scoringEnabled,
  ]);

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
    autoStopEnabled: settings.autoStopEnabled,
    autoCruiseEnabled: settings.autoCruiseEnabled,
    scoringEnabled: settings.scoringEnabled,
    bufferTime: settings.bufferTime,
    loopCount: settings.loopCount,
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
    if (!settings.scoringEnabled) return;
    const segment = pipeline.segments[activeIndex];
    const { audioBuffer } = pipeline;
    const isReady =
      segment?.text && segment.text !== TRANSCRIBING_TEXT && audioBuffer;

    if (!isReady) return;

    const sr = audioBuffer.sampleRate;
    const startFrame = Math.floor(segment.start * sr);
    const endFrame = Math.floor(segment.end * sr);
    const refSlice = audioBuffer.getChannelData(0).slice(startFrame, endFrame);
    scorer.precompute(activeIndex, segment.text, refSlice, sr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeIndex,
    settings.scoringEnabled,
    currentSegment?.text,
    pipeline.audioBuffer,
  ]);

  const pipelineReset = pipeline.reset;
  const { clearLoadError } = modelLoader;
  const reset = useCallback(() => {
    pipelineReset();
    clearLoadError();
  }, [pipelineReset, clearLoadError]);

  const startSession = useCallback(
    (input: File | string, wordTimestamps?: WordTimestamp[]) => {
      setPhase(ShadowingPhase.Idle);
      originalPlayer.stop();
      minePlayer.stop();
      setActiveIndex(0);
      pipeline.process(input, wordTimestamps);
    },
    [originalPlayer, minePlayer, pipeline],
  );

  const upload = useCallback(
    (file: File) => startSession(file),
    [startSession],
  );

  const loadUrl = useCallback(
    (url: string, wordTimestamps?: WordTimestamp[]) =>
      startSession(url, wordTimestamps),
    [startSession],
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

      if (settings.autoCruiseEnabled && phase === ShadowingPhase.Idle) {
        setPhase(ShadowingPhase.PlayingOriginal);
      }
    },
    [
      originalPlayer,
      recorder,
      handleStopRecord,
      settings.autoCruiseEnabled,
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
    error: pipeline.error ?? modelLoader.loadError,
    audioBuffer: pipeline.audioBuffer,
    totalDuration: pipeline.totalDuration,
    filename: pipeline.filename,
    isPlayingOriginal: originalPlayer.isPlaying,
    isPlayingMine: minePlayer.isPlaying,
    isRecording: recorder.isRecording,
    micError: recorder.micError,
    activeLoads: [
      ...(pipeline.modelLoadTask ? [pipeline.modelLoadTask] : []),
      ...modelLoader.activeLoads,
    ],

    // Actions
    upload,
    loadUrl,
    reset,
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
      autoStopEnabled: settings.autoStopEnabled,
      autoCruiseEnabled: settings.autoCruiseEnabled,
      scoringEnabled: settings.scoringEnabled,
      bufferTime: settings.bufferTime,
      loopCount: settings.loopCount,
      toggleMaskMode: settings.toggleMaskMode,
      setPlaybackSpeed: settings.setPlaybackSpeed,
      toggleAutoStop: settings.toggleAutoStop,
      toggleAutoCruise: settings.toggleAutoCruise,
      toggleScoring: settings.toggleScoring,
      setBufferTime: settings.setBufferTime,
      setLoopCount: settings.setLoopCount,
    },

    // Automation (Auto-Cruise)
    automation: {
      cruisePhase: phase,
      startCruise: cruise.startCruise,
      cancelCruise: cruise.cancelCruise,
    },
  };
}
