import { useCallback, useEffect, useRef, useState } from 'react';

import { TRANSCRIBING_TEXT } from '../constants';
import type { LibraryItem, Segment } from '../types';
import { NavigationDirection, ShadowingPhase } from '../types';
import { getSegmentIndexAtTime } from '../utils/segment-time';
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
  const isFullTrackSyncEnabledRef = useRef(false);
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

  const syncActiveIndexForTime = useCallback(
    (time: number) => {
      const nextIndex = getSegmentIndexAtTime(pipeline.segments, time);

      if (nextIndex === null || nextIndex === activeIndex) {
        return;
      }

      setActiveIndex(nextIndex);
    },
    [activeIndex, pipeline.segments],
  );

  const disableFullTrackSync = useCallback(() => {
    isFullTrackSyncEnabledRef.current = false;
  }, []);

  const stopOriginalPlayback = useCallback(() => {
    disableFullTrackSync();
    originalPlayer.stop();
  }, [disableFullTrackSync, originalPlayer]);

  const playPracticeOriginal = useCallback(
    (segment: Segment) => {
      disableFullTrackSync();
      originalPlayer.play(segment);
    },
    [disableFullTrackSync, originalPlayer],
  );

  const playFullTrackFromCurrentTime = useCallback(() => {
    isFullTrackSyncEnabledRef.current = true;
    originalPlayer.playFrom(originalPlayer.currentTime);
  }, [originalPlayer]);

  const seekFullTrack = useCallback(
    (time: number) => {
      isFullTrackSyncEnabledRef.current = true;
      syncActiveIndexForTime(time);
      originalPlayer.seek(time);
    },
    [originalPlayer, syncActiveIndexForTime],
  );

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
      stopOriginalPlayback();
      minePlayer.stop();
      setActiveIndex((i) => {
        const delta = dir === NavigationDirection.Prev ? -1 : 1;
        return Math.max(0, Math.min(pipeline.segments.length - 1, i + delta));
      });
    },
    [stopOriginalPlayback, minePlayer, pipeline.segments.length],
  );

  const performStartRecord = useCallback(() => {
    minePlayer.stop();
    stopOriginalPlayback();

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
  }, [
    minePlayer,
    stopOriginalPlayback,
    pipeline,
    activeIndex,
    scorer,
    recorder,
  ]);

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
        playPracticeOriginal(seg);
      },
      [playPracticeOriginal, minePlayer],
    ),
    onStartRecord: performStartRecord,
    onStopRecord: handleStopRecord,
    onPlayMine: useCallback(
      (url: string, onEnded: () => void) => {
        stopOriginalPlayback();
        minePlayer.playUrl(url, onEnded);
      },
      [stopOriginalPlayback, minePlayer],
    ),
    onNavigateNext: useCallback(
      () => handleNavigate(NavigationDirection.Next),
      [handleNavigate],
    ),
    onPhaseChange: setPhase,
  });

  // Prime the original player's audio hardware as soon as the audio buffer is
  // ready. This ensures the earphone codec is initialized before the user
  // clicks play for the first time (avoids the outputLatency=0 cold-start).
  useEffect(() => {
    if (pipeline.audioBuffer) {
      originalPlayer.warmup();
    }
  }, [pipeline.audioBuffer, originalPlayer]);

  useEffect(() => {
    if (!isFullTrackSyncEnabledRef.current) return;

    const frameId = requestAnimationFrame(() => {
      syncActiveIndexForTime(originalPlayer.currentTime);
    });

    return () => cancelAnimationFrame(frameId);
  }, [originalPlayer.currentTime, syncActiveIndexForTime]);

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
    disableFullTrackSync();
    pipelineReset();
    clearLoadError();
  }, [disableFullTrackSync, pipelineReset, clearLoadError]);

  const startSession = useCallback(
    (input: File | LibraryItem) => {
      setPhase(ShadowingPhase.Idle);
      stopOriginalPlayback();
      minePlayer.stop();
      setActiveIndex(0);
      pipeline.process(input);
    },
    [stopOriginalPlayback, minePlayer, pipeline],
  );

  const upload = useCallback(
    (file: File) => startSession(file),
    [startSession],
  );

  const loadUrl = useCallback(
    (item: LibraryItem) => startSession(item),
    [startSession],
  );

  const playOriginal = useCallback(
    (segment: Segment) => {
      if (originalPlayer.isPlaying) {
        stopOriginalPlayback();
        setPhase(ShadowingPhase.Idle);
        return;
      }

      if (recorder.isRecording) {
        handleStopRecord();
      }

      minePlayer.stop();
      playPracticeOriginal(segment);

      if (settings.autoCruiseEnabled && phase === ShadowingPhase.Idle) {
        setPhase(ShadowingPhase.PlayingOriginal);
      }
    },
    [
      originalPlayer,
      stopOriginalPlayback,
      recorder,
      handleStopRecord,
      settings.autoCruiseEnabled,
      phase,
      minePlayer,
      playPracticeOriginal,
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
      stopOriginalPlayback();
      minePlayer.playUrl(url);
    },
    [minePlayer, stopOriginalPlayback],
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
      const segment = pipeline.segments[index];
      if (!segment) return;

      setPhase(ShadowingPhase.Idle);
      setActiveIndex(index);

      if (isFullTrackSyncEnabledRef.current) {
        originalPlayer.seek(segment.start);
        return;
      }

      stopOriginalPlayback();
      minePlayer.stop();
    },
    [originalPlayer, stopOriginalPlayback, minePlayer, pipeline.segments],
  );

  const playFullAudio = useCallback(() => {
    if (originalPlayer.isPlaying) {
      stopOriginalPlayback();
    } else {
      playFullTrackFromCurrentTime();
    }
  }, [
    originalPlayer.isPlaying,
    playFullTrackFromCurrentTime,
    stopOriginalPlayback,
  ]);

  const seekTo = useCallback(
    (time: number) => {
      seekFullTrack(time);
    },
    [seekFullTrack],
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
    currentTime: originalPlayer.currentTime,
    duration: originalPlayer.duration,

    // Actions
    upload,
    loadUrl,
    reset,
    playOriginal,
    playFullAudio,
    seekTo,
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
      scoringUnavailable: settings.scoringUnavailable,
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
