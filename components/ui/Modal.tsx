'use client';

import React, { useCallback, useEffect, useRef } from 'react';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Panel width. `sm` for confirmations, `md` for forms, `lg`/`xl` for builders. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** `top` sits above another modal — used by ConfirmDialog so it can open over a form. */
  layer?: 'base' | 'top';
  /** `alertdialog` for anything that must be answered before continuing. */
  role?: 'dialog' | 'alertdialog';
  /** An alertdialog forces a choice, so it hides the X and ignores overlay clicks. */
  showClose?: boolean;
  closeOnOverlayClick?: boolean;
  /** Where focus lands on open. Defaults to the first focusable node in the panel. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  footer?: React.ReactNode;
  children?: React.ReactNode;
};

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * DS-4 — the one modal shell.
 *
 * Eighteen files hand-rolled `fixed inset-0`, and each got something different wrong:
 * `CreateProjectDialog` used `bg-white` and plain `border`, so it stayed white in dark
 * mode; three different overlay treatments were in use (`bg-black/30`, `bg-black/50`,
 * `.drawer-overlay`); z-index ranged over z-40, z-50 and z-[70]; and not one of them
 * trapped focus, closed on Escape, locked body scroll, or carried a dialog role. A
 * keyboard user could tab straight out of an open dialog into the page behind it.
 *
 * The overlay and the enter animation reuse the classes already in globals.css, so this
 * introduces no new CSS.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  layer = 'base',
  role = 'dialog',
  showClose = true,
  closeOnOverlayClick = true,
  initialFocusRef,
  footer,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descriptionId = `${titleId}-description`;

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

    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
      // Without this, focus falls back to <body> and the next Tab restarts from the
      // top of the page instead of from the control that opened the dialog.
      restoreRef.current?.focus?.();
    };
  }, [open, onClose, trapFocus, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${
        layer === 'top' ? 'z-[80]' : 'z-[70]'
      }`}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="drawer-overlay" aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`modal-scale-enter relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card-lg ${SIZE_CLASS[size]}`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h2 id={titleId} className="text-base font-bold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          {showClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors duration-fast hover:bg-surface-muted hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        {children ? <div className="overflow-y-auto px-5 py-4">{children}</div> : null}

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        ) : (
          <div className="pb-5" />
        )}
      </div>
    </div>
  );
}
