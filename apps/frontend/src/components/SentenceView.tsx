import type { Segment } from '../types';
import { NavigationDirection, SentenceCardMode } from '../types';
import { SentenceCard } from './SentenceCard';

interface Props {
  segments: Segment[];
  activeIndex: number;
  isPlayingOriginal: boolean;
  isPlayingMine: boolean;
  isRecording: boolean;
  maskModeEnabled: boolean;
  totalDuration: number;
  onNavigate: (dir: NavigationDirection) => void;
  onPlayOriginal: (segment: Segment) => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onPlayMine: (url: string) => void;
  onJump: (index: number) => void;
}

export function SentenceView({
  segments,
  activeIndex,
  isPlayingOriginal,
  isPlayingMine,
  isRecording,
  maskModeEnabled,
  totalDuration,
  onNavigate,
  onPlayOriginal,
  onStartRecord,
  onStopRecord,
  onPlayMine,
  onJump,
}: Props) {
  const prev = segments[activeIndex - 1];
  const active = segments[activeIndex];
  const next = segments[activeIndex + 1];

  return (
    <div className="pt-24 sm:pt-32 px-4 sm:px-gutter max-w-container-max-width mx-auto flex flex-col gap-stack-lg pb-16">
      <SentenceCard
        key={prev?.id ?? 'prev-empty'}
        segment={prev}
        mode={SentenceCardMode.InactivePrev}
        isPlayingOriginal={false}
        isPlayingMine={false}
        isRecording={false}
        maskModeEnabled={maskModeEnabled}
        isFirst={false}
        isLast={false}
        totalDuration={totalDuration}
        onPlayOriginal={() => {}}
        onStartRecord={() => {}}
        onStopRecord={() => {}}
        onPlayMine={() => {}}
        onClick={() => onJump(activeIndex - 1)}
        onPrev={() => {}}
        onNext={() => {}}
      />

      {active && (
        <SentenceCard
          key={active.id}
          segment={active}
          mode={SentenceCardMode.Active}
          isPlayingOriginal={isPlayingOriginal}
          isPlayingMine={isPlayingMine}
          isRecording={isRecording}
          maskModeEnabled={maskModeEnabled}
          isFirst={activeIndex === 0}
          isLast={activeIndex === segments.length - 1}
          totalDuration={totalDuration}
          onPlayOriginal={() => onPlayOriginal(active)}
          onStartRecord={onStartRecord}
          onStopRecord={onStopRecord}
          onPlayMine={() =>
            active.recordingUrl && onPlayMine(active.recordingUrl)
          }
          onClick={() => {}}
          onPrev={() => onNavigate(NavigationDirection.Prev)}
          onNext={() => onNavigate(NavigationDirection.Next)}
        />
      )}

      <SentenceCard
        key={next?.id ?? 'next-empty'}
        segment={next}
        mode={SentenceCardMode.InactiveNext}
        isPlayingOriginal={false}
        isPlayingMine={false}
        isRecording={false}
        maskModeEnabled={maskModeEnabled}
        isFirst={false}
        isLast={false}
        totalDuration={totalDuration}
        onPlayOriginal={() => {}}
        onStartRecord={() => {}}
        onStopRecord={() => {}}
        onPlayMine={() => {}}
        onClick={() => onJump(activeIndex + 1)}
        onPrev={() => {}}
        onNext={() => {}}
      />
    </div>
  );
}
