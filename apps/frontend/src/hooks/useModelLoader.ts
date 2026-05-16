import { useCallback, useEffect, useState } from 'react';

import { scoringClient } from '../lib/scoring/ScoringClient';
import { transcriptionClient } from '../lib/transcription/TranscriptionClient';
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
    let isMounted = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks((prev) => ({
      ...prev,
      [ModelId.Transcription]: {
        id: ModelId.Transcription,
        label: 'Initializing Transcription…',
        progress: 0,
      },
    }));

    transcriptionClient
      .ensureModels((progress) => {
        if (isMounted) {
          setTasks((prev) =>
            prev[ModelId.Transcription]
              ? {
                  ...prev,
                  [ModelId.Transcription]: {
                    ...prev[ModelId.Transcription],
                    progress,
                  },
                }
              : prev,
          );
        }
      })
      .then(() => {
        if (isMounted) removeTask(ModelId.Transcription);
      })
      .catch((err) => {
        console.error('Transcription model failed to load:', err);
        if (isMounted) setLoadError('Failed to initialize Transcription.');
        if (isMounted) removeTask(ModelId.Transcription);
      });

    if (options.scoringEnabled) {
      setTasks((prev) => ({
        ...prev,
        [ModelId.Scoring]: {
          id: ModelId.Scoring,
          label: 'Initializing Scoring (G2P)…',
          progress: 0,
        },
      }));

      scoringClient
        .ensureModels((progress, label, loaded, total) => {
          if (isMounted) {
            setTasks((prev) =>
              prev[ModelId.Scoring]
                ? {
                    ...prev,
                    [ModelId.Scoring]: {
                      ...prev[ModelId.Scoring],
                      progress,
                      label: label ?? prev[ModelId.Scoring].label,
                      loaded,
                      total,
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
          if (isMounted) setLoadError('Failed to initialize Scoring.');
          if (isMounted) removeTask(ModelId.Scoring);
        });
    }

    return () => {
      isMounted = false;
      removeTask(ModelId.Transcription);
      removeTask(ModelId.Scoring);
    };
  }, [options.scoringEnabled]);

  const activeLoads = Object.values(tasks);

  return { activeLoads, loadError, clearLoadError };
}

export type ModelLoaderHook = ReturnType<typeof useModelLoader>;
