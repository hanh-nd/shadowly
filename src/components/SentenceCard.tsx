import { useState } from 'react';

import { SECONDS_PER_MINUTE } from '../constants';
import type { Segment } from '../types';
import { SentenceCardMode, WordScore } from '../types';

interface Props {
  segment?: Segment;
  mode: SentenceCardMode;
  isPlayingOriginal: boolean;
  isPlayingMine: boolean;
  isRecording: boolean;
  maskModeEnabled: boolean;
  isFirst: boolean;
  isLast: boolean;
  totalDuration: number;
  onPlayOriginal: () => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onPlayMine: () => void;
  onClick: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / SECONDS_PER_MINUTE);
  const s = Math.floor(seconds % SECONDS_PER_MINUTE);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getScoreColor(score: WordScore | null): string {
  switch (score) {
    case WordScore.Good:
      return 'text-green-600';
    case WordScore.Neutral:
      return 'text-yellow-600';
    default:
      return 'text-red-500';
  }
}

export function SentenceCard({
  segment,
  mode,
  isPlayingOriginal,
  isPlayingMine,
  isRecording,
  maskModeEnabled,
  isFirst,
  isLast,
  totalDuration,
  onPlayOriginal,
  onStartRecord,
  onStopRecord,
  onPlayMine,
  onClick,
  onPrev,
  onNext,
}: Props) {
  const [isUnmasked, setIsUnmasked] = useState(false);

  if (mode !== SentenceCardMode.Active) {
    const text = segment?.text;
    const displayText = maskModeEnabled && text ? '(masked)' : text || '\u00A0';

    return (
      <div
        className={`py-4 px-6 opacity-40 transition-opacity ${segment ? 'cursor-pointer hover:opacity-60' : 'cursor-default'}`}
        onClick={segment ? onClick : undefined}
      >
        <p className="font-display-inactive text-display-inactive text-on-surface-variant truncate">
          {displayText}
        </p>
      </div>
    );
  }

  if (!segment) return null;

  return (
    <div className="bg-surface-container-lowest p-4 sm:p-8 border border-outline-variant border-l-2 border-l-primary rounded-lg relative overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute -left-20 top-1/2 -translate-y-1/2 w-40 h-40 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

      {/* Header row */}
      <div className="flex items-center gap-2 mb-4">
        <span className="px-2 py-0.5 bg-surface-container text-secondary font-label-sm text-[10px] rounded uppercase tracking-wider">
          Current Segment
        </span>
        <span className="font-label-sm text-label-sm text-outline">
          {formatTime(segment.start)} / {formatTime(totalDuration)}
        </span>
      </div>

      {/* Sentence text */}
      <p
        className={`font-display-active text-display-active text-on-background mb-8 relative z-10 transition-all break-words ${maskModeEnabled ? 'cursor-pointer hover:opacity-80' : ''} ${maskModeEnabled && !isUnmasked ? 'blur-md' : ''}`}
        onClick={() => maskModeEnabled && setIsUnmasked(!isUnmasked)}
      >
        {Array.isArray(segment.wordScores)
          ? segment.text.split(' ').map((word, i) => (
              <span key={i} className={getScoreColor(segment.wordScores![i])}>
                {word}{' '}
              </span>
            ))
          : segment.text}
      </p>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 sm:gap-8 pt-6 border-t border-surface-variant">
        {/* Play Original */}
        <button
          className="flex flex-col items-center gap-2 group"
          onClick={onPlayOriginal}
          title="Play original"
        >
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface group-hover:bg-surface-container-high transition-colors border border-outline-variant">
            <span
              className={`material-symbols-outlined text-[24px] sm:text-[32px] ${isPlayingOriginal ? 'fill-icon text-primary' : ''}`}
            >
              {isPlayingOriginal ? 'pause' : 'play_arrow'}
            </span>
          </div>
          <span className="font-label-sm text-[10px] sm:text-[12px] text-secondary font-medium">
            Original
          </span>
        </button>

        {/* Record */}
        <button
          className="flex flex-col items-center gap-2 group relative"
          onClick={isRecording ? onStopRecord : onStartRecord}
          title={isRecording ? 'Stop recording' : 'Record'}
        >
          {isRecording && (
            <div className="absolute inset-0 bg-error/20 rounded-full animate-ping opacity-50 scale-110 pointer-events-none" />
          )}
          {!isRecording && !!segment.isScoring && (
            <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse pointer-events-none z-0" />
          )}
          <div
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-transform hover:scale-105 relative z-10 ${
              isRecording
                ? 'bg-error text-on-error shadow-[0_0_24px_rgba(186,26,26,0.3)]'
                : 'bg-surface-container text-on-surface border border-outline-variant'
            }`}
          >
            <span className="material-symbols-outlined fill-icon text-[28px] sm:text-[36px]">
              mic
            </span>
          </div>
          <span
            className={`font-label-sm text-[10px] sm:text-[12px] font-bold ${isRecording ? 'text-error' : 'text-secondary'}`}
          >
            {isRecording
              ? 'Recording…'
              : segment.isScoring
                ? 'Scoring…'
                : 'Record'}
          </span>
        </button>

        {/* Play Mine */}
        <button
          className={`flex flex-col items-center gap-2 group ${!segment.recordingUrl ? 'opacity-40 cursor-not-allowed' : ''}`}
          onClick={segment.recordingUrl ? onPlayMine : undefined}
          title="Play my recording"
          disabled={!segment.recordingUrl}
        >
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface border border-outline-variant group-hover:bg-surface-container-high transition-colors">
            <span
              className={`material-symbols-outlined text-[20px] sm:text-[28px] ${isPlayingMine ? 'fill-icon text-primary' : ''}`}
            >
              {isPlayingMine ? 'pause' : 'headphones'}
            </span>
          </div>
          <span className="font-label-sm text-[10px] sm:text-[12px] text-secondary font-medium">
            Play Mine
          </span>
        </button>
      </div>

      {/* Decorative waveform */}
      <div className="w-full h-8 mt-6 flex items-center justify-center gap-1 opacity-40">
        {[2, 4, 6, 3, 8, 5, 2, 4, 2, 6, 3, 8, 5, 2, 4].map((h, i) => (
          <div
            key={i}
            className="w-1 bg-primary rounded-full"
            style={{ height: `${h * 4}px` }}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-surface-variant">
        <button
          className={`flex items-center gap-1 font-label-sm text-label-sm transition-opacity ${isFirst ? 'opacity-30 cursor-not-allowed' : 'text-primary hover:opacity-80'}`}
          onClick={isFirst ? undefined : onPrev}
          disabled={isFirst}
        >
          <span className="material-symbols-outlined text-[18px]">
            arrow_back
          </span>
          Prev
        </button>
        <button
          className={`flex items-center gap-1 font-label-sm text-label-sm transition-opacity ${isLast ? 'opacity-30 cursor-not-allowed' : 'text-primary hover:opacity-80'}`}
          onClick={isLast ? undefined : onNext}
          disabled={isLast}
        >
          Next
          <span className="material-symbols-outlined text-[18px]">
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  );
}
