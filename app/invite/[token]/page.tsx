"use client";

import { useState } from "react";

type InvitePageProps = {
  params: { token: string };
};

export default function InvitePage({ params }: InvitePageProps) {
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/users/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          name: formData.name,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "Unable to accept invitation");
      }

      window.location.href = "/login";
    } catch (err: any) {
      setError(err?.message || "Unable to accept invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="page-title mb-6">Accept Invitation</h1>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label block text-sm mb-2">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="field-label block text-sm mb-2">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.target.value })}
              className="input"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="field-label block text-sm mb-2">Confirm Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(event) =>
                setFormData({ ...formData, confirmPassword: event.target.value })
              }
              className="input"
              required
            />
          </div>
          <button
            type="submit"
            className="btn w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating Account..." : "Create Account"}
          </button>
        </form>
      </div>
    </main>
  );
}
