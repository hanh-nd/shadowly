import { ProcessingState } from './types';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ProgressBar } from './components/ProgressBar';
import { LoadingOverlay } from './components/LoadingOverlay';
import { SentenceView } from './components/SentenceView';
import { useShadowingManager } from './hooks/useShadowingManager';

export function App() {
  const manager = useShadowingManager();

  return (
    <div className="bg-background text-on-background min-h-screen flex antialiased">
      <Sidebar
        onFileSelect={manager.upload}
        speed={manager.playbackSpeed}
        onSpeedChange={manager.setPlaybackSpeed}
        autoStopEnabled={manager.automation.autoStopEnabled}
        autoCruiseEnabled={manager.automation.autoCruiseEnabled}
        scoringEnabled={manager.automation.scoringEnabled}
        bufferTime={manager.automation.bufferTime}
        loopCount={manager.automation.loopCount}
        onToggleAutoStop={manager.automation.toggleAutoStop}
        onToggleAutoCruise={manager.automation.toggleAutoCruise}
        onToggleScoring={manager.automation.toggleScoring}
        onBufferTimeChange={manager.automation.setBufferTime}
        onLoopCountChange={manager.automation.setLoopCount}
      />

      <main className="flex-1 lg:ml-64 relative min-h-screen">
        <TopBar />
        <ProgressBar activeIndex={manager.activeIndex} total={manager.segments.length} />

        <LoadingOverlay
          state={manager.status}
          downloadProgress={manager.downloadProgress}
          progress={manager.progress ?? undefined}
          errorMessage={manager.error}
          onRetry={manager.reset}
        />

        {(manager.status === ProcessingState.Ready || manager.status === ProcessingState.Transcribing) && manager.segments.length > 0 && (
          <SentenceView
            segments={manager.segments}
            activeIndex={manager.activeIndex}
            isPlayingOriginal={manager.isPlayingOriginal}
            isPlayingMine={manager.isPlayingMine}
            isRecording={manager.isRecording}
            totalDuration={manager.totalDuration}
            onNavigate={manager.navigate}
            onPlayOriginal={manager.playOriginal}
            onStartRecord={manager.startRecord}
            onStopRecord={manager.stopRecord}
            onPlayMine={manager.playMine}
            onJump={manager.jump}
          />
        )}

        {manager.status === ProcessingState.Idle && (
          <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
            <span className="material-symbols-outlined text-outline text-[64px]">mic_external_on</span>
            <p className="font-headline-md text-headline-md text-on-surface">Ready to practice</p>
            <p className="text-on-surface-variant text-body-md max-w-sm">
              Upload an audio file from the sidebar to get started.
            </p>
          </div>
        )}

        {manager.micError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-error-container text-on-error-container px-4 py-3 rounded-lg font-label-sm text-label-sm shadow-lg z-50">
            {manager.micError}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
