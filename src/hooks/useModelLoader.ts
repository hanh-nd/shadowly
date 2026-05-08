import { useCallback, useEffect, useState } from 'react';

import { scoringClient } from '../lib/ScoringClient';
import type { ModelLoadTask } from '../types';
import { ModelId } from '../types';

export function useModelLoader(options: { scoringEnabled: boolean }) {
  const [tasks, setTasks] = useState<Record<string, ModelLoadTask>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const removeTask = (id: string) =>
    setTasks((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const clearLoadError = useCallback(() => setLoadError(null), []);

  useEffect(() => {
    if (!options.scoringEnabled) return;

    let isMounted = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks((prev) => ({
      ...prev,
      [ModelId.Scoring]: {
        id: ModelId.Scoring,
        label: 'Loading scoring model…',
        progress: 0,
      },
    }));

    scoringClient
      .ensureModels((progress, label) => {
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
      })
      .then(() => {
        if (isMounted) removeTask(ModelId.Scoring);
      })
      .catch((err) => {
        console.error('Scoring model failed to load:', err);
        if (isMounted) setLoadError('Failed to load scoring model.');
        if (isMounted) removeTask(ModelId.Scoring);
      });

    return () => {
      isMounted = false;
      removeTask(ModelId.Scoring);
    };
  }, [options.scoringEnabled]);

  const activeLoads = Object.values(tasks);

  return { activeLoads, loadError, clearLoadError };
}

export type ModelLoaderHook = ReturnType<typeof useModelLoader>;
