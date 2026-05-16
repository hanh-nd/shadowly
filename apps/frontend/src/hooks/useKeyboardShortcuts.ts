import { useEffect } from 'react';

export interface KeyBinding {
  code?: string;
  key?: string;
  handler: (event: KeyboardEvent) => void;
  preventDefault?: boolean;
  allowRepeat?: boolean;
}

export interface KeyboardShortcutsOptions {
  enabled?: boolean;
  ignoreWhenTyping?: boolean;
  requireNoModifiers?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = (target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return (target as HTMLElement).isContentEditable;
}

export function useKeyboardShortcuts(
  bindings: KeyBinding[],
  options?: KeyboardShortcutsOptions,
): void {
  const enabled = options?.enabled !== false;
  const ignoreWhenTyping = options?.ignoreWhenTyping !== false;
  const requireNoModifiers = options?.requireNoModifiers !== false;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      if (
        requireNoModifiers &&
        (event.metaKey || event.ctrlKey || event.altKey)
      ) {
        return;
      }

      if (ignoreWhenTyping && isTypingTarget(event.target)) return;

      const binding = bindings.find(
        (b) =>
          (b.code !== undefined && b.code === event.code) ||
          (b.code === undefined && b.key !== undefined && b.key === event.key),
      );

      if (!binding) return;

      if (event.repeat && !binding.allowRepeat) return;

      if (binding.preventDefault) {
        event.preventDefault();
      }

      try {
        binding.handler(event);
      } catch (err) {
        console.error('useKeyboardShortcuts: handler error', err);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [bindings, enabled, ignoreWhenTyping, requireNoModifiers]);
}
