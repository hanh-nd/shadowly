interface AudioPlayerSectionProps {
  filename?: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekTo: (time: number) => void;
}

export function AudioPlayerSection({
  filename,
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeekTo,
}: AudioPlayerSectionProps) {
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (duration <= 0) return null;

  return (
    <div className="rounded-xl p-3 border border-outline-variant">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary hover:bg-primary-container transition-colors shrink-0"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <span className="material-symbols-outlined fill-icon text-[20px]">
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1 gap-2">
            <span className="text-xs font-bold text-primary truncate">
              {filename || 'Current Session'}
            </span>
            <span className="text-[10px] text-on-surface-variant font-medium shrink-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.01"
            value={currentTime}
            onChange={(e) => onSeekTo(Number(e.target.value))}
            className="w-full h-1 bg-surface-variant rounded-full appearance-none cursor-pointer accent-primary block"
          />
        </div>
      </div>
    </div>
  );
}
