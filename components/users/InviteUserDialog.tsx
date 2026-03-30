"use client";

import { useState } from "react";

type InviteUserDialogProps = {
  onSuccess: () => void;
};

export function InviteUserDialog({ onSuccess }: InviteUserDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    role: "staff",
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "Failed to send invitation");
      }

      setIsOpen(false);
      setFormData({ email: "", role: "staff" });
      onSuccess();
    } catch (err: any) {
      setError(err?.message || "Unable to send invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn"
      >
        + Invite User
      </button>

      {isOpen && (
        <div className="drawer-overlay fixed inset-0 flex items-center justify-center z-50">
          <div className="modal-scale-enter card w-full max-w-md p-6 shadow-xl">
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">
              Invite Team Member
            </h2>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/40 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="field-label block text-sm mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(event) =>
                    setFormData({ ...formData, email: event.target.value })
                  }
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="field-label block text-sm mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(event) =>
                    setFormData({ ...formData, role: event.target.value })
                  }
                  className="input"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn ghost flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
