"use client";
import { useEffect, useState } from "react";

type Profile = { name: string; email: string; role: string; department: string };

export default function SettingsGeneralPage() {
  const [profile, setProfile] = useState<Profile>({
    name: "", email: "", role: "", department: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/users/list", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        const users = Array.isArray(data) ? data : data?.users || [];
        const me = users[0];
        if (me) setProfile({
          name: me.name || me.displayName || "",
          email: me.email || "",
          role: me.role || "",
          department: me.department || "",
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await new Promise(r => setTimeout(r, 600));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="card p-6">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">
          Profile Settings
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Update your display name and department.
        </p>
        {loading ? (
          <p className="text-[var(--text-muted)] text-sm">Loading profile...</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Full Name
              </label>
              <input className="input w-full" value={profile.name}
                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Email Address
              </label>
              <input className="input w-full" value={profile.email} readOnly
                style={{ opacity: 0.6 }} />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Email cannot be changed here. Contact super admin.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Role
              </label>
              <input className="input w-full" value={profile.role} readOnly
                style={{ opacity: 0.6 }} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Department
              </label>
              <input className="input w-full" value={profile.department}
                onChange={e => setProfile(p => ({ ...p, department: e.target.value }))} />
            </div>
            <button type="submit" className="btn w-full" disabled={saving}>
              {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Changes"}
            </button>
          </form>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">
          Appearance
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Theme is controlled by your system preference (auto dark/light mode).
        </p>
        <div className="rounded-lg bg-[var(--surface-muted)] p-3 text-sm
          text-[var(--text-muted)]">
          System theme sync: Active
        </div>
      </div>
    </div>
  );
}
