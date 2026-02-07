"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
  durationMs?: number;
};

type ToastContextValue = {
  notify: (toast: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}

export function useToast() {
  return useToastContext();
}

function resolveVariantStyles(variant: ToastVariant) {
  if (variant === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  }
  if (variant === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  if (variant === "info") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-100";
  }
  return "border-red-500/30 bg-red-500/10 text-red-100";
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, number>>({});

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (timers.current[id]) {
      window.clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const durationMs = toast.durationMs ?? 4500;
      setToasts((prev) => [...prev, { ...toast, id }]);
      if (durationMs > 0) {
        timers.current[id] = window.setTimeout(() => removeToast(id), durationMs);
      }
    },
    [removeToast]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-6 top-6 z-[9999] flex w-[360px] max-w-[calc(100vw-48px)] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${resolveVariantStyles(toast.variant)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{toast.title}</div>
                {toast.message ? (
                  <div className="mt-1 text-xs text-white/80">{toast.message}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-xs text-white/70 transition hover:text-white"
                aria-label="Dismiss notification"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
