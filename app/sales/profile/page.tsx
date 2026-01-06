"use client";

import { useEffect, useState, ChangeEvent, FormEvent } from "react";

export default function SalesProfilePage() {
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [signatureLoading, setSignatureLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSignature() {
      setSignatureLoading(true);
      try {
        const res = await fetch("/api/users/profile", { cache: "no-store", credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Unable to load signature.");
        }
        if (active) {
          setSignatureHtml(String(json?.profile?.emailSignatureHtml || ""));
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Unable to load signature.");
      } finally {
        if (active) setSignatureLoading(false);
      }
    }

    loadSignature();
    return () => {
      active = false;
    };
  }, []);

  const handleSignatureSave = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/users/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emailSignatureHtml: signatureHtml }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Unable to save signature.");
      }
      setMessage("Email signature saved.");
    } catch (err: any) {
      setError(err?.message || "Unable to save signature.");
    }
  };

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
      <h1 className="text-2xl font-bold">Sales Profile</h1>

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
      <section className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 space-y-4">
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
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value="sales.user@lacreativo.com"
              disabled
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <input
              type="text"
              value="Sales Executive"
              disabled
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Department</label>
            <input
              type="text"
              value="Sales"
              disabled
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>
      </section>

      {/* Avatar / Profile Picture */}
      <section className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 space-y-4">
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
              <span>SU</span>
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
      <section className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 space-y-4">
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
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label className="text-sm font-medium">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              placeholder="Re-type new password"
            />
          </div>

          <button
            type="submit"
            className="mt-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
          >
            Update Password
          </button>
        </form>
      </section>

      <section className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Email Signature</h2>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Add a signature that will be appended to outbound emails from Sales.
        </p>

        <form onSubmit={handleSignatureSave} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Signature (HTML or plain text)</label>
            <textarea
              className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              rows={4}
              value={signatureHtml}
              onChange={(e) => setSignatureHtml(e.target.value)}
              placeholder="Thanks,&#10;Jane Doe&#10;Sales Manager"
              disabled={signatureLoading}
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase">Preview</div>
            <div
              className="mt-2 rounded-lg border border-dashed border-gray-300 dark:border-neutral-700 p-3 text-sm"
              dangerouslySetInnerHTML={{
                __html: signatureHtml ? signatureHtml.replace(/\n/g, "<br/>") : "<span>No signature yet.</span>",
              }}
            />
          </div>
          <button
            type="submit"
            className="mt-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
            disabled={signatureLoading}
          >
            {signatureLoading ? "Saving..." : "Save Signature"}
          </button>
        </form>
      </section>
    </div>
  );
    }
