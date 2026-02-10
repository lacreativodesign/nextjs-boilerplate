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
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        + Invite User
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <h2 className="text-xl font-bold mb-4">Invite Team Member</h2>

            {error && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(event) =>
                    setFormData({ ...formData, email: event.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(event) =>
                    setFormData({ ...formData, role: event.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 border rounded"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded"
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
