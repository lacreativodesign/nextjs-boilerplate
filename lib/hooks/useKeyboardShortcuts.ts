'use client';

import { useEffect } from 'react';

type ShortcutHandlers = {
  onToggleSidebar?: () => void;
  onOpenSearch?: () => void;
  onEscape?: () => void;
  onShowHelp?: () => void;
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const isMeta = event.metaKey || event.ctrlKey;

      if (isMeta && key === 'k') {
        event.preventDefault();
        handlers.onOpenSearch?.();
        return;
      }

      if (isMeta && key === 'b') {
        event.preventDefault();
        handlers.onToggleSidebar?.();
        return;
      }

      if (key === 'escape') {
        handlers.onEscape?.();
        return;
      }

      if (key === '?' || (key === '/' && event.shiftKey)) {
        event.preventDefault();
        handlers.onShowHelp?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
