'use client';

import React, { useRef } from 'react';
import Modal from '@/components/ui/Modal';

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

/**
 * DS-3 — the replacement for `window.confirm()`.
 *
 * There were 16 native `confirm()` calls, all of them gating a delete. The native
 * dialog cannot be themed, renders chrome that looks nothing like the product, is
 * suppressible by the browser, and blocks the main thread — so a "Delete this invoice?"
 * prompt was the least trustworthy-looking moment in the app.
 *
 * DS-4: the focus trap, scroll lock and Escape handling moved into `Modal`, which this
 * now composes. It keeps two behaviours of its own:
 *
 *   - focus opens on Cancel, not Confirm, so a stray Enter cannot delete anything
 *   - no X and no overlay-click dismissal, because an alertdialog must be answered
 *
 * It renders on the `top` layer so a confirmation can open over a form modal.
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
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      layer="top"
      role="alertdialog"
      showClose={false}
      closeOnOverlayClick={false}
      initialFocusRef={cancelRef}
      footer={
        <>
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
        </>
      }
    />
  );
}
