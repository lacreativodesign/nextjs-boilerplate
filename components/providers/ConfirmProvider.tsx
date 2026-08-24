'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * DS-3 — promise-based confirmation.
 *
 * Deliberately shaped so replacing a native call is a one-line change at the call site:
 *
 *   before:  if (!confirm('Delete this invoice?')) return;
 *   after:   if (!(await confirm({ title: 'Delete this invoice?' }))) return;
 *
 * A controlled `<ConfirmDialog open={…}>` would have needed two pieces of state and a
 * stashed callback in each of the 16 call sites, which is how "we'll migrate it later"
 * becomes "we never migrated it".
 *
 * Outside the provider `useConfirm` falls back to `window.confirm`, so a component
 * rendered in isolation (or in a test) still gates its destructive action rather than
 * throwing or silently proceeding.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A second request while one is open resolves the first as cancelled, so no
    // caller is left awaiting a promise that can never settle.
    resolverRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={options !== null}
        title={options?.title ?? ''}
        description={options?.description}
        confirmLabel={options?.confirmLabel}
        cancelLabel={options?.cancelLabel}
        tone={options?.tone}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  return (
    ctx ??
    (async (options: ConfirmOptions) =>
      typeof window !== 'undefined' ? window.confirm(options.title) : false)
  );
}
