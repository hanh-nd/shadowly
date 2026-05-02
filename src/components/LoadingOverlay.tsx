import { ProcessingState } from '../types';
import type { TranscribingProgress } from '../types';

interface Props {
  state: ProcessingState;
  downloadProgress: number;
  progress?: TranscribingProgress;
  errorMessage: string | null;
  onRetry: () => void;
}

export function LoadingOverlay({ state, downloadProgress, progress, errorMessage, onRetry }: Props) {
  if (state === ProcessingState.Idle || state === ProcessingState.Ready || state === ProcessingState.Transcribing) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center gap-6 px-8">
      {state === ProcessingState.Error ? (
        <>
          <span className="material-symbols-outlined text-error text-[48px]">error_outline</span>
          <p className="text-on-surface font-headline-md text-headline-md text-center">{errorMessage}</p>
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-primary text-on-primary rounded-DEFAULT font-label-sm text-label-sm hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </>
      ) : state === ProcessingState.LoadingModel ? (
        <>
          <span className="material-symbols-outlined text-primary text-[48px] animate-pulse">model_training</span>
          <div className="text-center">
            <p className="text-on-surface font-headline-md text-headline-md">Downloading model…</p>
            <p className="text-on-surface-variant text-body-md mt-1">This only happens once — cached forever after.</p>
          </div>
          <div className="w-64 h-2 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <p className="text-primary font-bold text-label-sm">{downloadProgress}%</p>
        </>
      ) : state === ProcessingState.VADRunning ? (
        <>
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
          <div className="text-center">
            <p className="text-on-surface font-headline-md text-headline-md">Detecting speech boundaries…</p>
            <p className="text-on-surface-variant text-body-md mt-1">Finding silence between sentences.</p>
          </div>
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
          <div className="text-center">
            <p className="text-on-surface font-headline-md text-headline-md">Transcribing audio…</p>
            <p className="text-on-surface-variant text-body-md mt-1">
              Transcribing segment {progress?.current ?? '…'}…
            </p>
          </div>
        </>
      )}
    </div>
  );
}
