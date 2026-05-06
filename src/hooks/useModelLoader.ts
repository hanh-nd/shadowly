import { useCallback, useEffect, useState } from 'react';

import { engine } from '../lib/TranscriptionEngine';
import { ModelId, ScoringWorkerMessageType } from '../types';

export interface ModelLoadTask {
  id: string;
  label: string;
  progress: number;
}

export function useModelLoader(options: { scoringEnabled: boolean }) {
  const [tasks, setTasks] = useState<Record<string, ModelLoadTask>>({});
  const [scoringWorker, setScoringWorker] = useState<Worker | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const removeTask = (id: string) =>
    setTasks((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const clearLoadError = useCallback(() => setLoadError(null), []);

  useEffect(() => {
    let isMounted = true;

    engine
      .ensureModels((p) => {
        if (isMounted) {
          setTasks((prev) => ({
            ...prev,
            [ModelId.Transcription]: {
              id: ModelId.Transcription,
              label: 'Downloading transcription model…',
              progress: p,
            },
          }));
        }
      })
      .then(
        () => {
          if (isMounted) removeTask(ModelId.Transcription);
        },
        (err: unknown) => {
          console.error('Failed to load transcription models:', err);
          if (isMounted) {
            setLoadError(
              err instanceof Error
                ? err.message
                : 'Failed to load transcription model.',
            );
            removeTask(ModelId.Transcription);
          }
        },
      );

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!options.scoringEnabled) return;

    let isMounted = true;

    const worker = new Worker(
      new URL('../lib/scoring.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const handleMessage = (e: MessageEvent) => {
      const { type, progress, label } = e.data;
      if (type === ScoringWorkerMessageType.ModelProgress) {
        if (isMounted) {
          setTasks((prev) =>
            prev[ModelId.Scoring]
              ? {
                  ...prev,
                  [ModelId.Scoring]: {
                    ...prev[ModelId.Scoring],
                    progress,
                    label: label || prev[ModelId.Scoring].label,
                  },
                }
              : prev,
          );
        }
      } else if (
        type === ScoringWorkerMessageType.ModelsReady ||
        type === ScoringWorkerMessageType.ModelsLoadError
      ) {
        if (type === ScoringWorkerMessageType.ModelsLoadError) {
          console.error('Scoring model failed to load:', e.data.error);
          if (isMounted) setLoadError('Failed to load scoring model.');
        }
        if (isMounted) removeTask(ModelId.Scoring);
        worker.removeEventListener('message', handleMessage);
      }
    };

    // Attach listener before setScoringWorker to avoid races
    worker.addEventListener('message', handleMessage);
    worker.postMessage({ type: ScoringWorkerMessageType.LoadModels });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks((prev) => ({
      ...prev,
      [ModelId.Scoring]: {
        id: ModelId.Scoring,
        label: 'Loading scoring model…',
        progress: 0,
      },
    }));
    setScoringWorker(worker);

    return () => {
      isMounted = false;
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
      setScoringWorker(null);
      setTasks((prev) => {
        const next = { ...prev };
        delete next[ModelId.Scoring];
        return next;
      });
    };
  }, [options.scoringEnabled]);

  const activeLoads = Object.values(tasks);

  return { activeLoads, scoringWorker, loadError, clearLoadError };
}

export type ModelLoaderHook = ReturnType<typeof useModelLoader>;
