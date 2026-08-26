'use client';
import { useEffect, useRef, useState } from 'react';
import { useTenantContext } from '@/lib/tenant/useTenantContext';
import { apiFetch } from '@/lib/api/client';

type Profile = {
  name: string;
  email: string;
  role: string;
  phone: string;
  jobTitle: string;
  department: string;
  bio: string;
  avatarUrl: string;
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--erp-blue-soft)] px-3 py-1 text-xs font-semibold capitalize text-[var(--erp-blue)]">
      {role.replace(/_/g, ' ')}
    </span>
  );
}

export default function SettingsProfilePage() {
  const { data: tenantData, loading: tenantLoading } = useTenantContext();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile>({
    name: '',
    email: '',
    role: '',
    phone: '',
    jobTitle: '',
    department: '',
    bio: '',
    avatarUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [manager, setManager] = useState<{ name: string; role: string } | null>(null);
  const [managerLoaded, setManagerLoaded] = useState(false);

  useEffect(() => {
    if (tenantLoading) return;
    if (tenantData?.user) {
      setProfile({
        name: tenantData.user.displayName || '',
        email: tenantData.user.email || '',
        role: tenantData.user.role || '',
        phone: (tenantData.user as any).phone || '',
        jobTitle: (tenantData.user as any).jobTitle || '',
        department: (tenantData.user as any).department || '',
        bio: (tenantData.user as any).bio || '',
        avatarUrl: (tenantData.user as any).avatarUrl || '',
      });
    }
    setLoading(false);
  }, [tenantData, tenantLoading]);

  useEffect(() => {
    if (tenantLoading || !tenantData?.user) return;
    let active = true;
    (async () => {
      try {
        const res = await apiFetch('/api/me/manager');
        const json = await res.json();
        if (active) setManager(json?.manager ?? null);
      } catch {
        if (active) setManager(null);
      } finally {
        if (active) setManagerLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [tenantData, tenantLoading]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await apiFetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: profile.name,
          phone: profile.phone,
          jobTitle: profile.jobTitle,
          department: profile.department,
          bio: profile.bio,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = avatarPreview || profile.avatarUrl || null;
  const initials = profile.name
    ? profile.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  if (loading) {
    return <div className="card p-6 text-sm text-[var(--text-muted)]">Loading profile...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle mt-2">Your name, contact details, and role.</p>
      </div>

      {/* Avatar + identity */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Your Profile</h2>
        <div className="flex items-center gap-5 mb-6">
          <div className="relative flex-shrink-0">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={profile.name}
                className="h-20 w-20 rounded-full object-cover border-2 border-[var(--border-subtle)]"
              />
            ) : (
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-blue-light) 100%)',
                }}
              >
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-[var(--erp-blue)] text-white flex items-center justify-center text-xs shadow-md hover:opacity-90 transition"
              title="Change photo"
            >
              ✎
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-bold text-[var(--text-primary)]">{profile.name || '—'}</p>
            <p className="text-sm text-[var(--text-muted)]">{profile.email}</p>
            <RoleBadge role={profile.role} />
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Full Name
              </label>
              <input
                className="input w-full"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Phone Number
              </label>
              <input
                className="input w-full"
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+1 (555) 000-0000"
                type="tel"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Job Title
              </label>
              <input
                className="input w-full"
                value={profile.jobTitle}
                onChange={(e) => setProfile((p) => ({ ...p, jobTitle: e.target.value }))}
                placeholder="e.g. Account Manager"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Department
              </label>
              <input
                className="input w-full"
                value={profile.department}
                onChange={(e) => setProfile((p) => ({ ...p, department: e.target.value }))}
                placeholder="e.g. Sales"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Bio</label>
            <textarea
              className="input w-full"
              rows={3}
              value={profile.bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              placeholder="A short note about yourself..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Email Address
              </label>
              <input
                className="input w-full"
                value={profile.email}
                readOnly
                style={{ opacity: 0.55 }}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Contact your admin to change your email.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Role
              </label>
              <input
                className="input w-full capitalize"
                value={profile.role.replace(/_/g, ' ')}
                readOnly
                style={{ opacity: 0.55 }}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Role is assigned by your admin.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Reports to
            </label>
            <input
              className="input w-full capitalize"
              value={
                managerLoaded
                  ? manager
                    ? `${manager.name} · ${manager.role.replace(/_/g, ' ')}`
                    : 'CEO / Admin'
                  : ''
              }
              readOnly
              style={{ opacity: 0.55 }}
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Your line manager is assigned by your admin.
            </p>
          </div>

          <button type="submit" className="btn w-full" disabled={saving}>
            {saving ? 'Saving...' : saved ? '✓ Profile Saved!' : 'Save Profile'}
          </button>
        </form>
      </div>

      {/* Appearance */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Appearance</h2>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          Theme follows your system preference automatically.
        </p>
        <div className="rounded-lg bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-muted)]">
          System theme sync: Active
        </div>
      </div>
    </div>
  );
}
