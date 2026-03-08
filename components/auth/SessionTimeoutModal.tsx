"use client";

import { Dialog } from "@headlessui/react";

type Props = {
  open: boolean;
  timeRemaining: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
};

function formatTime(seconds: number) {
  const mins = Math.max(0, Math.floor(seconds / 60));
  const secs = Math.max(0, seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function SessionTimeoutModal({ open, timeRemaining, onStayLoggedIn, onLogout }: Props) {
  return (
    <Dialog open={open} onClose={() => {}} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
          <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)]">
            Your session is about to expire
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--text-muted)]">
            For your security, you will be logged out soon due to inactivity.
          </Dialog.Description>

          <div className="mt-4 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/30 px-4 py-3">
            <p className="text-sm text-[var(--text-muted)]">Time remaining</p>
            <p className="text-2xl font-semibold text-[var(--text-primary)]">{formatTime(timeRemaining)}</p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" className="btn ghost" onClick={onLogout}>
              Log Out
            </button>
            <button type="button" className="btn" onClick={onStayLoggedIn}>
              Stay Logged In
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
