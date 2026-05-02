import { useState } from 'react';
import { ProcessingState, NavigationDirection } from './types';
import type { Segment } from './types';
import { usePipeline } from './hooks/usePipeline';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useRecorder } from './hooks/useRecorder';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ProgressBar } from './components/ProgressBar';
import { LoadingOverlay } from './components/LoadingOverlay';
import { SentenceView } from './components/SentenceView';

export function App() {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [totalDuration, setTotalDuration] = useState(0);

  const pipeline = usePipeline();
  const player = useAudioPlayer(audioBuffer, playbackSpeed);
  const recorder = useRecorder();

  async function handleFileSelect(file: File) {
    player.stop();
    setActiveIndex(0);

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
    } catch {
      return;
    }

    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      ctx.close();
      setAudioBuffer(decoded);
      setTotalDuration(decoded.duration);
    } catch {
      return;
    }

    pipeline.process(arrayBuffer);
  }

  function handlePlayOriginal(segment: Segment) {
    player.play(segment);
  }

  async function handleStopRecord() {
    const blob = await recorder.stopRecording();
    const newUrl = URL.createObjectURL(blob);
    const old = pipeline.segments.find((s) => s.id === activeIndex);
    if (old?.recordingUrl) URL.revokeObjectURL(old.recordingUrl);
    pipeline.patchSegment(activeIndex, { recordingUrl: newUrl });
  }

  function handlePlayMine(url: string) {
    const audio = new Audio(url);
    audio.play();
  }

  function handleNavigate(dir: NavigationDirection) {
    player.stop();
    setActiveIndex((i) => {
      const delta = dir === NavigationDirection.Prev ? -1 : 1;
      return Math.max(0, Math.min(pipeline.segments.length - 1, i + delta));
    });
  }

  function handleJump(index: number) {
    player.stop();
    setActiveIndex(index);
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex antialiased">
      <Sidebar
        onFileSelect={handleFileSelect}
        speed={playbackSpeed}
        onSpeedChange={setPlaybackSpeed}
      />

      <main className="flex-1 lg:ml-64 relative min-h-screen">
        <TopBar />
        <ProgressBar activeIndex={activeIndex} total={pipeline.segments.length} />

        <LoadingOverlay
          state={pipeline.status}
          downloadProgress={pipeline.downloadProgress}
          progress={pipeline.progress ?? undefined}
          errorMessage={pipeline.error}
          onRetry={pipeline.reset}
        />

        {(pipeline.status === ProcessingState.Ready || pipeline.status === ProcessingState.Transcribing) && pipeline.segments.length > 0 && (
          <SentenceView
            segments={pipeline.segments}
            activeIndex={activeIndex}
            isPlayingOriginal={player.isPlaying}
            isRecording={recorder.isRecording}
            totalDuration={totalDuration}
            onNavigate={handleNavigate}
            onPlayOriginal={handlePlayOriginal}
            onStartRecord={recorder.startRecording}
            onStopRecord={handleStopRecord}
            onPlayMine={handlePlayMine}
            onJump={handleJump}
          />
        )}

        {pipeline.status === ProcessingState.Idle && (
          <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
            <span className="material-symbols-outlined text-outline text-[64px]">mic_external_on</span>
            <p className="font-headline-md text-headline-md text-on-surface">Ready to practice</p>
            <p className="text-on-surface-variant text-body-md max-w-sm">
              Upload an audio file from the sidebar to get started.
            </p>
          </div>
        )}

        {recorder.micError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-error-container text-on-error-container px-4 py-3 rounded-lg font-label-sm text-label-sm shadow-lg z-50">
            {recorder.micError}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
