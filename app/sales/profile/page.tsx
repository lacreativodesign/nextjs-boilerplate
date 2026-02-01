"use client";

import { useState, ChangeEvent, FormEvent } from "react";

export default function SalesProfilePage() {
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const displayName = "Demo Sales User";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    setMessage("Profile picture updated (local preview only).");
    setError(null);
  };

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Please fill in all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    // NOTE: This is UI-only for now. No real password change happens here.
    setMessage("Password updated (demo only, no real change yet).");
  };

  return (
    <div className="p-6 space-y-8">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Profile</h1>
          <p className="page-subtitle">Review your account details and keep contact information current.</p>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            error
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {error || message}
        </div>
      )}

      {/* Basic Info */}
      <section className="card p-6 space-y-4 settings-section">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--surface-muted)] flex items-center justify-center text-lg font-semibold">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div>
            <div className="text-base font-semibold">{displayName}</div>
            <div className="text-sm text-[var(--text-muted)]">Sales Executive</div>
          </div>
        </div>
        <div className="settings-divider" />
        <h2 className="text-lg font-semibold">Basic Information</h2>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          These details come from your account profile. In the enterprise
          version, Admin/HR will control these fields.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-sm font-medium">Full Name</label>
            <input
              type="text"
              value="Demo Sales User"
              disabled
              className="mt-2 input"
            />
            <p className="helper-text mt-2">Managed by HR policies.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value="sales.user@lacreativo.com"
              disabled
              className="mt-2 input"
            />
            <p className="helper-text mt-2">Used for login and alerts.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <input
              type="text"
              value="Sales Executive"
              disabled
              className="mt-2 input"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Department</label>
            <input
              type="text"
              value="Sales"
              disabled
              className="mt-2 input"
            />
          </div>
        </div>
      </section>

      {/* Avatar / Profile Picture */}
      <section className="card p-6 space-y-4 settings-section">
        <h2 className="text-lg font-semibold">Profile Picture</h2>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Upload a square image (e.g. 400×400). In the full version this will be
          saved to cloud storage.
        </p>

        <div className="flex items-center gap-6 mt-4">
          <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-neutral-800 flex items-center justify-center overflow-hidden text-xl font-semibold text-indigo-700 dark:text-indigo-300">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarPreview}
                alt="Avatar preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="space-y-2">
            <label className="inline-block">
              <span className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium cursor-pointer hover:bg-black transition">
                Choose Image
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
            <p className="text-xs text-gray-500 dark:text-neutral-400">
              JPG or PNG, max 2 MB recommended.
            </p>
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="card p-6 space-y-4 settings-section">
        <h2 className="text-lg font-semibold">Change Password</h2>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          This is a front-end placeholder. Later we will wire it into the real
          Firebase secure password update endpoint.
        </p>

        <form onSubmit={handlePasswordSubmit} className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-2 input"
              placeholder="Enter current password"
            />
            <p className="helper-text mt-2">Required to confirm your identity.</p>
          </div>

          <div>
            <label className="text-sm font-medium">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-2 input"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-2 input"
              placeholder="Re-type new password"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="helper-text">Password updates take effect immediately.</span>
            <button type="submit" className="btn subtle">
              Update Password
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
