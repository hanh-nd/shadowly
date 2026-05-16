import { useMemo } from 'react';

import { SHORTCUT_KEYS } from '../constants/shortcuts';
import type { Segment } from '../types';
import { NavigationDirection } from '../types';
import type { KeyBinding } from './useKeyboardShortcuts';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

export interface PracticeShortcutHandlers {
  activeSegment: Segment | undefined;
  isRecording: boolean;
  onPlayOriginal: (segment: Segment) => void;
  onStartRecord: () => void;
  onStopRecord: () => void;
  onPlayMine: (url: string) => void;
  onNavigate: (dir: NavigationDirection) => void;
}

export function usePracticeShortcuts(args: PracticeShortcutHandlers): void {
  const {
    activeSegment,
    isRecording,
    onPlayOriginal,
    onStartRecord,
    onStopRecord,
    onPlayMine,
    onNavigate,
  } = args;

  const bindings = useMemo<KeyBinding[]>(
    () => [
      {
        code: SHORTCUT_KEYS.PlayOriginal,
        preventDefault: true,
        handler: () => {
          if (activeSegment !== undefined) {
            onPlayOriginal(activeSegment);
          }
        },
      },
      {
        code: SHORTCUT_KEYS.Record,
        preventDefault: false,
        handler: () => {
          if (isRecording) {
            onStopRecord();
          } else {
            onStartRecord();
          }
        },
      },
      {
        code: SHORTCUT_KEYS.PlayMine,
        preventDefault: false,
        handler: () => {
          if (activeSegment?.recordingUrl) {
            onPlayMine(activeSegment.recordingUrl);
          }
        },
      },
      {
        key: SHORTCUT_KEYS.Prev,
        preventDefault: true,
        handler: () => {
          onNavigate(NavigationDirection.Prev);
        },
      },
      {
        key: SHORTCUT_KEYS.Next,
        preventDefault: true,
        handler: () => {
          onNavigate(NavigationDirection.Next);
        },
      },
    ],
    [
      activeSegment,
      isRecording,
      onPlayOriginal,
      onStartRecord,
      onStopRecord,
      onPlayMine,
      onNavigate,
    ],
  );

  useKeyboardShortcuts(bindings);
}
