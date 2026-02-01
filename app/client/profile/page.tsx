"use client";

import { useEffect, useState } from "react";
import { SkeletonForm } from "@/components/ui/skeleton";

type ClientProfile = {
  companyName?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  timezone?: string;
  address?: string;
  city?: string;
  country?: string;
};

export default function ClientProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profile, setProfile] = useState<ClientProfile>({});

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch("/api/client/profile/get", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const payload = await res.json();
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to load profile.");
        if (!alive) return;
        setProfile(payload.client || {});
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to load profile.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/client/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName: profile.companyName || "",
          contactName: profile.primaryContactName || "",
          phone: profile.primaryContactPhone || "",
          timezone: profile.timezone || "",
          address: profile.address || "",
          city: profile.city || "",
          country: profile.country || "",
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to update profile.");
      setSuccess("Profile updated successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonForm fields={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Update your account details and contact information.</p>
      </div>

      <div className="card p-5">
        {error ? <div className="text-sm text-red-400 mb-3">{error}</div> : null}
        {success ? <div className="text-sm text-emerald-500 mb-3">{success}</div> : null}

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="card p-4">
            <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Company</div>
            <div className="grid grid-cols-2 gap-3 mt-3 max-[900px]:grid-cols-1">
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Company Name</div>
                <input
                  className="input mt-2"
                  value={profile.companyName || ""}
                  onChange={(e) => setProfile((prev) => ({ ...prev, companyName: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Contact Name</div>
                <input
                  className="input mt-2"
                  value={profile.primaryContactName || ""}
                  onChange={(e) => setProfile((prev) => ({ ...prev, primaryContactName: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Contact</div>
            <div className="grid grid-cols-2 gap-3 mt-3 max-[900px]:grid-cols-1">
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Email (Read-only)</div>
                <input className="input mt-2" value={profile.primaryContactEmail || ""} disabled />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Phone</div>
                <input
                  className="input mt-2"
                  value={profile.primaryContactPhone || ""}
                  onChange={(e) => setProfile((prev) => ({ ...prev, primaryContactPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Location</div>
            <div className="grid grid-cols-2 gap-3 mt-3 max-[900px]:grid-cols-1">
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Timezone</div>
                <input
                  className="input mt-2"
                  value={profile.timezone || ""}
                  onChange={(e) => setProfile((prev) => ({ ...prev, timezone: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Address</div>
                <input
                  className="input mt-2"
                  value={profile.address || ""}
                  onChange={(e) => setProfile((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 max-[900px]:grid-cols-1">
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">City</div>
                <input
                  className="input mt-2"
                  value={profile.city || ""}
                  onChange={(e) => setProfile((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">Country</div>
                <input
                  className="input mt-2"
                  value={profile.country || ""}
                  onChange={(e) => setProfile((prev) => ({ ...prev, country: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
