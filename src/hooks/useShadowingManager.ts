import { useState, useCallback } from 'react';
import { NavigationDirection, CruisePhase } from '../types';
import type { Segment } from '../types';
import { usePipeline } from './usePipeline';
import { useAudioPlayer } from './useAudioPlayer';
import { useRecorder } from './useRecorder';
import { useAutoCruise } from './useAutoCruise';

export function useShadowingManager() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const pipeline = usePipeline();
  const originalPlayer = useAudioPlayer(pipeline.audioBuffer, playbackSpeed);
  const minePlayer = useAudioPlayer(null, 1.0);
  const recorder = useRecorder();

  const handleStopRecord = useCallback(async () => {
    const blob = await recorder.stopRecording();
    const newUrl = URL.createObjectURL(blob);
    const currentSegment = pipeline.segments.find((s) => s.id === activeIndex);
    
    if (currentSegment?.recordingUrl) {
      URL.revokeObjectURL(currentSegment.recordingUrl);
    }
    
    pipeline.patchSegment(activeIndex, { recordingUrl: newUrl });
  }, [recorder, pipeline, activeIndex]);

  const handleNavigate = useCallback((dir: NavigationDirection) => {
    originalPlayer.stop();
    minePlayer.stop();
    setActiveIndex((i) => {
      const delta = dir === NavigationDirection.Prev ? -1 : 1;
      return Math.max(0, Math.min(pipeline.segments.length - 1, i + delta));
    });
  }, [originalPlayer, minePlayer, pipeline.segments.length]);

  const cruise = useAutoCruise({
    segments: pipeline.segments,
    activeIndex: activeIndex,
    isPlayingOriginal: originalPlayer.isPlaying,
    isRecording: recorder.isRecording,
    micError: recorder.micError,
    activeSegmentRecordingUrl: pipeline.segments[activeIndex]?.recordingUrl ?? null,
    onPlayOriginal: useCallback((seg: Segment) => {
      minePlayer.stop();
      originalPlayer.play(seg);
    }, [originalPlayer, minePlayer]),
    onStartRecord: recorder.startRecording,
    onStopRecord: handleStopRecord,
    onPlayMine: useCallback((url: string, onEnded: () => void) => {
      originalPlayer.stop();
      minePlayer.playUrl(url, onEnded);
    }, [originalPlayer, minePlayer]),
    onNavigateNext: useCallback(() => handleNavigate(NavigationDirection.Next), [handleNavigate]),
  });

  const interruptCruise = useCallback(() => {
    if (cruise.cruisePhase !== CruisePhase.Idle) {
      cruise.cancelCruise();
    }
  }, [cruise]);

  const upload = useCallback((file: File) => {
    interruptCruise();
    originalPlayer.stop();
    minePlayer.stop();
    setActiveIndex(0);
    pipeline.process(file);
  }, [interruptCruise, originalPlayer, minePlayer, pipeline]);

  const playOriginal = useCallback((segment: Segment) => {
    if (originalPlayer.isPlaying) {
      originalPlayer.stop();
      interruptCruise();
      return;
    }

    if (recorder.isRecording) {
      if (cruise.cruisePhase === CruisePhase.Recording) {
        // Normal auto-cruise flow, just stop and proceed
      } else {
        cruise.cancelCruise();
      }
      handleStopRecord();
      interruptCruise();
    } else {
      const isIdle = cruise.cruisePhase === CruisePhase.Idle;
      if (cruise.autoCruiseEnabled && isIdle) {
        cruise.startCruise();
      } else {
        interruptCruise();
      }
    }

    minePlayer.stop();
    originalPlayer.play(segment);
  }, [originalPlayer, recorder, handleStopRecord, cruise, minePlayer, interruptCruise]);

  const startRecord = useCallback(() => {
    interruptCruise();
    originalPlayer.stop();
    minePlayer.stop();
    recorder.startRecording();
  }, [interruptCruise, originalPlayer, minePlayer, recorder]);

  const stopRecord = useCallback(() => {
    const isInterrupted = cruise.cruisePhase !== CruisePhase.Idle && cruise.cruisePhase !== CruisePhase.Recording;
    if (isInterrupted) {
      cruise.cancelCruise();
    }
    handleStopRecord();
  }, [cruise, handleStopRecord]);

  const playMine = useCallback((url: string) => {
    if (minePlayer.isPlaying) {
      minePlayer.stop();
      interruptCruise();
      return;
    }
    
    interruptCruise();
    originalPlayer.stop();
    minePlayer.playUrl(url);
  }, [minePlayer, originalPlayer, interruptCruise]);

  const navigate = useCallback((dir: NavigationDirection) => {
    interruptCruise();
    handleNavigate(dir);
  }, [interruptCruise, handleNavigate]);

  const jump = useCallback((index: number) => {
    interruptCruise();
    originalPlayer.stop();
    minePlayer.stop();
    setActiveIndex(index);
  }, [interruptCruise, originalPlayer, minePlayer]);

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
    playbackSpeed,
    isPlayingOriginal: originalPlayer.isPlaying,
    isPlayingMine: minePlayer.isPlaying,
    isRecording: recorder.isRecording,
    micError: recorder.micError,

    // Actions
    upload,
    reset: pipeline.reset,
    setPlaybackSpeed,
    playOriginal,
    startRecord,
    stopRecord,
    playMine,
    navigate,
    jump,

    // Automation (Auto-Cruise)
    automation: {
      autoStopEnabled: cruise.autoStopEnabled,
      autoCruiseEnabled: cruise.autoCruiseEnabled,
      bufferTime: cruise.bufferTime,
      loopCount: cruise.loopCount,
      cruisePhase: cruise.cruisePhase,
      toggleAutoStop: cruise.toggleAutoStop,
      toggleAutoCruise: cruise.toggleAutoCruise,
      setBufferTime: cruise.setBufferTime,
      setLoopCount: cruise.setLoopCount,
    }
  };
}
