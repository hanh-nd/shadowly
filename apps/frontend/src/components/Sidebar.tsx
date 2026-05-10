import { AudioPlayerSection } from './AudioPlayerSection';
import { SettingToggle } from './SettingToggle';
import { UploadZone } from './UploadZone';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onOpenLibrary?: () => void;
  isLibraryActive?: boolean;
  onLogoClick?: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  autoStopEnabled: boolean;
  autoCruiseEnabled: boolean;
  scoringEnabled: boolean;
  maskModeEnabled: boolean;
  bufferTime: number;
  loopCount: number;
  onToggleAutoStop: () => void;
  onToggleAutoCruise: () => void;
  onToggleScoring: () => void;
  onToggleMaskMode: () => void;
  onBufferTimeChange: (t: number) => void;
  onLoopCountChange: (n: number) => void;
  // Playback section props
  filename?: string | null;
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSeekTo?: (time: number) => void;
}

export function Sidebar({
  isOpen,
  onClose,
  onFileSelect,
  onOpenLibrary,
  isLibraryActive,
  onLogoClick,
  speed,
  onSpeedChange,
  autoStopEnabled,
  autoCruiseEnabled,
  scoringEnabled,
  maskModeEnabled,
  bufferTime,
  loopCount,
  onToggleAutoStop,
  onToggleAutoCruise,
  onToggleScoring,
  onToggleMaskMode,
  onBufferTimeChange,
  onLoopCountChange,
  filename,
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  onTogglePlay,
  onSeekTo,
}: Props) {
  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={`fixed inset-0 bg-black/50 z-[90] transition-opacity lg:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed left-0 top-0 h-full w-64 py-8 px-6 bg-slate-50 border-r border-slate-200 z-[100] transition-transform lg:translate-x-0 flex flex-col gap-8 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={onLogoClick}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
          >
            <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-primary-container">
                graphic_eq
              </span>
            </div>
            <div>
              <h2 className="font-label-sm text-label-sm text-on-surface">
                Shadowly
              </h2>
              <p className="text-[11px] text-on-surface-variant font-medium">
                Session Control
              </p>
            </div>
          </button>
          <button
            onClick={onClose}
            className="lg:hidden p-2 -mr-2 text-on-surface-variant hover:bg-surface-container-low rounded-full"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex flex-col space-y-2">
          <button
            onClick={onOpenLibrary}
            className={`flex items-center space-x-3 pr-4 py-3 -mx-6 pl-6 transition-colors text-left ${
              isLibraryActive
                ? 'text-primary bg-primary-container/10 border-r-4 border-primary'
                : 'text-secondary hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined">library_music</span>
            <span className="font-label-sm text-label-sm">Library</span>
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <SettingToggle
              label="Auto-Stop"
              checked={autoStopEnabled}
              onChange={onToggleAutoStop}
            >
              {autoStopEnabled && (
                <div className="mt-1">
                  <div className="flex justify-between font-label-sm text-[10px] text-on-surface-variant mb-1">
                    <span>Buffer Time</span>
                    <span className="text-primary font-bold">
                      {bufferTime}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={bufferTime}
                    onChange={(e) => onBufferTimeChange(Number(e.target.value))}
                    className="w-full h-1 bg-surface-variant rounded-full appearance-none cursor-pointer accent-primary"
                  />
                </div>
              )}
            </SettingToggle>

            <SettingToggle
              label="Auto-Cruise"
              checked={autoCruiseEnabled}
              onChange={onToggleAutoCruise}
              disabled={!autoStopEnabled}
            >
              {autoCruiseEnabled && (
                <div className="mt-1">
                  <div className="flex justify-between font-label-sm text-[10px] text-on-surface-variant mb-1">
                    <span>Loop Count</span>
                    <span className="text-primary font-bold">{loopCount}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={loopCount}
                    onChange={(e) => onLoopCountChange(Number(e.target.value))}
                    className="w-full h-1 bg-surface-variant rounded-full appearance-none cursor-pointer accent-primary"
                  />
                </div>
              )}
            </SettingToggle>

            <SettingToggle
              label="Scoring"
              checked={scoringEnabled}
              onChange={onToggleScoring}
            />

            <SettingToggle
              label="Mask"
              checked={maskModeEnabled}
              onChange={onToggleMaskMode}
            />

            <div className="flex flex-col gap-2 mt-2">
              <label className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                <span>Speed</span>
                <span className="text-primary font-bold">
                  {speed.toFixed(1)}x
                </span>
              </label>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={speed}
                onChange={(e) => onSpeedChange(Number(e.target.value))}
                className="w-full h-1 bg-surface-variant rounded-full appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-outline font-medium mt-1">
                <span>0.5x</span>
                <span>1.5x</span>
              </div>
            </div>
          </div>

          {duration > 0 && (
            <div className="border-t border-surface-variant pt-6">
              <AudioPlayerSection
                filename={filename}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                onTogglePlay={onTogglePlay!}
                onSeekTo={onSeekTo!}
              />
            </div>
          )}

          <UploadZone onFileSelect={onFileSelect} />
        </div>
      </aside>
    </>
  );
}
