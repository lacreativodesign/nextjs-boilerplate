'use client';

import React, { useCallback, useEffect, useRef } from 'react';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button red. Use it for anything destructive. */
  tone?: 'danger' | 'default';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * DS-3 — the replacement for `window.confirm()`.
 *
 * There were 16 native `confirm()` calls, all of them gating a delete. The native
 * dialog cannot be themed, renders chrome that looks nothing like the product, is
 * suppressible by the browser, and blocks the main thread — so a "Delete this invoice?"
 * prompt was the least trustworthy-looking moment in the app.
 *
 * Focus moves to Cancel rather than Confirm on open: for a destructive prompt the safe
 * action should be the one a stray Enter key hits.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const trapFocus = useCallback((event: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    restoreRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === 'Tab') trapFocus(event);
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Returning focus is what makes this usable by keyboard: without it, focus
      // lands back on <body> and the next Tab starts from the top of the page.
      restoreRef.current?.focus?.();
    };
  }, [open, onCancel, trapFocus]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="drawer-overlay" aria-hidden="true" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-card-lg"
      >
        <h2 id="confirm-dialog-title" className="text-base font-bold text-ink">
          {title}
        </h2>
        {description ? (
          <p id="confirm-dialog-description" className="mt-2 text-sm text-ink-muted">
            {description}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn danger' : 'btn'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
