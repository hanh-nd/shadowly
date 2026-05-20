import { useState } from 'react';

import { AudioLibrary } from './components/AudioLibrary';
import { LoadingOverlay } from './components/LoadingOverlay';
import { SentenceView } from './components/SentenceView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { UploadZone } from './components/UploadZone';
import { useShadowingManager } from './hooks/useShadowingManager';
import { AppView } from './types';

export function App() {
  const manager = useShadowingManager();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [mode, setMode] = useState<AppView>(AppView.Idle);

  const isLibraryRequested = mode === AppView.Library;

  const view =
    mode === AppView.Idle && manager.segments.length > 0
      ? AppView.Practice
      : mode;

  return (
    <div className="bg-background text-on-background min-h-screen flex w-full antialiased overflow-x-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onFileSelect={(file) => {
          manager.upload(file);
          setIsSidebarOpen(false);
          setMode(AppView.Idle); // Return to auto-follow mode
        }}
        onOpenLibrary={() => {
          manager.reset();
          setMode(AppView.Library);
          setIsSidebarOpen(false);
        }}
        isLibraryActive={isLibraryRequested}
        onLogoClick={() => {
          manager.reset();
          setMode(AppView.Idle);
          setIsSidebarOpen(false);
        }}
        speed={manager.settings.playbackSpeed}
        onSpeedChange={manager.settings.setPlaybackSpeed}
        autoStopEnabled={manager.settings.autoStopEnabled}
        autoCruiseEnabled={manager.settings.autoCruiseEnabled}
        scoringEnabled={manager.settings.scoringEnabled}
        scoringUnavailable={manager.settings.scoringUnavailable}
        maskModeEnabled={manager.settings.maskMode}
        bufferTime={manager.settings.bufferTime}
        loopCount={manager.settings.loopCount}
        onToggleAutoStop={manager.settings.toggleAutoStop}
        onToggleAutoCruise={manager.settings.toggleAutoCruise}
        onToggleScoring={manager.settings.toggleScoring}
        onToggleMaskMode={manager.settings.toggleMaskMode}
        onBufferTimeChange={manager.settings.setBufferTime}
        onLoopCountChange={manager.settings.setLoopCount}
        filename={manager.filename}
        currentTime={manager.currentTime}
        duration={manager.duration}
        isPlaying={manager.isPlayingOriginal}
        onTogglePlay={manager.playFullAudio}
        onSeekTo={manager.seekTo}
      />

      <main className="flex-1 lg:ml-64 relative min-h-screen min-w-0">
        <TopBar
          filename={manager.filename}
          activeIndex={manager.activeIndex}
          total={manager.segments.length}
          onMenuClick={() => setIsSidebarOpen(true)}
        />

        <LoadingOverlay
          state={manager.status}
          errorMessage={manager.error}
          onRetry={manager.reset}
          activeLoads={manager.activeLoads}
        />

        {view === AppView.Library && (
          <div className="pt-32 pb-24 px-4 lg:px-8 w-full max-w-4xl mx-auto min-h-screen">
            <AudioLibrary
              onFileSelect={(item) => {
                manager.loadUrl(item);
                setMode(AppView.Idle); // Return to auto-follow mode
              }}
              onBack={() => setMode(AppView.Idle)}
            />
          </div>
        )}

        {view === AppView.Practice && manager.segments.length > 0 && (
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

        {view === AppView.Idle && (
          <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
            <span className="material-symbols-outlined text-outline text-[64px]">
              mic_external_on
            </span>
            <p className="font-headline-md text-headline-md text-on-surface">
              Ready to practice
            </p>
            <div className="flex flex-col gap-4 items-center">
              <p className="text-on-surface-variant text-body-md max-w-sm">
                Upload an audio file to get started with shadowing.
              </p>
              <UploadZone
                onFileSelect={manager.upload}
                className="w-full max-w-xs"
              />
              <div className="flex w-full max-w-xs items-center gap-3 text-outline">
                <div className="h-px flex-1 bg-outline-variant" />
                <span className="font-label-sm text-[10px] uppercase tracking-wider">
                  or
                </span>
                <div className="h-px flex-1 bg-outline-variant" />
              </div>
              <button
                type="button"
                onClick={() => {
                  manager.reset();
                  setMode(AppView.Library);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-outline-variant px-4 py-2 font-label-sm text-label-sm text-primary transition-colors hover:bg-primary-container/20 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
              >
                <span className="material-symbols-outlined text-[18px]">
                  library_music
                </span>
                <span>Browse in library</span>
              </button>
            </div>
          </div>
        )}

        {manager.micError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-error-container text-on-error-container px-4 py-3 rounded-lg font-label-sm text-label-sm shadow-lg z-[300]">
            {manager.micError}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
