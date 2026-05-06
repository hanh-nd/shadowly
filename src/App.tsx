import { LoadingOverlay } from './components/LoadingOverlay';
import { SentenceView } from './components/SentenceView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { useShadowingManager } from './hooks/useShadowingManager';
import { ProcessingState } from './types';

export function App() {
  const manager = useShadowingManager();

  return (
    <div className="bg-background text-on-background min-h-screen flex antialiased">
      <Sidebar
        onFileSelect={manager.upload}
        speed={manager.settings.playbackSpeed}
        onSpeedChange={manager.settings.setPlaybackSpeed}
        autoStopEnabled={manager.settings.autoStopEnabled}
        autoCruiseEnabled={manager.settings.autoCruiseEnabled}
        scoringEnabled={manager.settings.scoringEnabled}
        maskModeEnabled={manager.settings.maskMode}
        bufferTime={manager.settings.bufferTime}
        loopCount={manager.settings.loopCount}
        onToggleAutoStop={manager.settings.toggleAutoStop}
        onToggleAutoCruise={manager.settings.toggleAutoCruise}
        onToggleScoring={manager.settings.toggleScoring}
        onToggleMaskMode={manager.settings.toggleMaskMode}
        onBufferTimeChange={manager.settings.setBufferTime}
        onLoopCountChange={manager.settings.setLoopCount}
      />

      <main className="flex-1 lg:ml-64 relative min-h-screen">
        <TopBar
          filename={manager.filename}
          activeIndex={manager.activeIndex}
          total={manager.segments.length}
        />

        <LoadingOverlay
          state={manager.status}
          progress={manager.progress ?? undefined}
          errorMessage={manager.error}
          onRetry={manager.reset}
          activeLoads={manager.activeLoads}
        />

        {(manager.status === ProcessingState.Ready ||
          manager.status === ProcessingState.Transcribing) &&
          manager.segments.length > 0 && (
            <SentenceView
              segments={manager.segments}
              activeIndex={manager.activeIndex}
              isPlayingOriginal={manager.isPlayingOriginal}
              isPlayingMine={manager.isPlayingMine}
              isRecording={manager.isRecording}
              maskModeEnabled={manager.settings.maskMode}
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
            <span className="material-symbols-outlined text-outline text-[64px]">
              mic_external_on
            </span>
            <p className="font-headline-md text-headline-md text-on-surface">
              Ready to practice
            </p>
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
