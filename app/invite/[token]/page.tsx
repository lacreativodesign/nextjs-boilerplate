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
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Accept Invitation</h1>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.target.value })}
              className="w-full border rounded px-3 py-2"
              required
              minLength={8}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Confirm Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(event) =>
                setFormData({ ...formData, confirmPassword: event.target.value })
              }
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-blue-600 text-white rounded"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating Account..." : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
