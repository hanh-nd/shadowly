import type { ModelLoadTask } from '../types';
import { ProcessingState } from '../types';

interface Props {
  state: ProcessingState;
  errorMessage: string | null;
  onRetry: () => void;
  activeLoads: ModelLoadTask[];
}

export function LoadingOverlay({
  state,
  errorMessage,
  onRetry,
  activeLoads,
}: Props) {
  if (activeLoads.length > 0) {
    return (
      <div className="fixed inset-0 z-[200] bg-background/95 flex flex-col items-center justify-center gap-6 px-8">
        <span className="material-symbols-outlined text-primary text-[48px] animate-pulse">
          model_training
        </span>
        <div className="text-center">
          <p className="text-on-surface font-headline-md text-headline-md">
            Loading models…
          </p>
        </div>
        <div className="flex flex-col gap-4 w-64 mt-4">
          {activeLoads.map((task) => (
            <div key={task.id} className="flex flex-col gap-2">
              <div className="flex justify-between items-center w-full">
                <span className="text-on-surface-variant text-label-sm">
                  {task.label}
                </span>
                <span className="text-primary font-bold text-label-sm">
                  {Math.round(task.progress)}%
                </span>
              </div>
              <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center gap-6 px-8">
        <span className="material-symbols-outlined text-error text-[48px]">
          error_outline
        </span>
        <p className="text-on-surface font-headline-md text-headline-md text-center">
          {errorMessage}
        </p>
        <button
          onClick={onRetry}
          className="px-6 py-3 bg-primary text-on-primary rounded-DEFAULT font-label-sm text-label-sm hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state === ProcessingState.Idle || state === ProcessingState.Ready)
    return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center gap-6 px-8">
      <span className="material-symbols-outlined text-primary text-[48px] animate-spin">
        refresh
      </span>
      <div className="text-center">
        <p className="text-on-surface font-headline-md text-headline-md">
          Transcribing audio…
        </p>
        <p className="text-on-surface-variant text-body-md mt-1">
          Analyzing speech and detecting sentences.
        </p>
      </div>
    </div>
  );
}
