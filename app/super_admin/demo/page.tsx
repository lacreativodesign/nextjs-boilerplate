'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
// Same roster the server seeds — see lib/demo/users.ts. Never import the seeder
// itself here: it pulls firebaseAdmin into the client bundle.
import { DEMO_USERS } from '@/lib/demo/users';

type Counts = {
  clients: number;
  leads: number;
  deals?: number;
  invoices: number;
  projects: number;
  productionJobs: number;
  employees: number;
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700',
  sales: 'bg-green-100 text-green-700',
  sales_manager: 'bg-emerald-100 text-emerald-700',
  am: 'bg-violet-100 text-violet-700',
  am_manager: 'bg-purple-100 text-purple-700',
  production: 'bg-orange-100 text-orange-700',
  production_manager: 'bg-amber-100 text-amber-700',
  finance: 'bg-cyan-100 text-cyan-700',
  hr: 'bg-pink-100 text-pink-700',
  client: 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
};

export default function DemoEnvironmentPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const [appUrl, setAppUrl] = useState(process.env.NEXT_PUBLIC_APP_URL || '');

  async function loadCounts() {
    const res = await apiFetch('/api/super_admin/demo/status');
    const payload = await res.json();
    if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Failed to load counts');
    setCounts(payload.counts as Counts);
  }

  useEffect(() => {
    loadCounts().catch((err: any) => setErrorMessage(err?.message || 'Failed to load demo status'));
    if (!process.env.NEXT_PUBLIC_APP_URL) setAppUrl(window.location.origin);
  }, []);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  async function handleSeed() {
    setIsSeeding(true);
    setSeedMessage(null);
    setSeedError(null);
    try {
      const res = await apiFetch('/api/super_admin/demo/seed', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Seed failed');
      setSeedMessage(
        `Demo environment seeded successfully at ${new Date(payload.seededAt).toLocaleString()}`,
      );
      await loadCounts();
    } catch (err: any) {
      setSeedError(err?.message || 'Seed failed');
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleReset() {
    setIsResetting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await apiFetch('/api/super_admin/demo/reset', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Reset failed');
      setStatusMessage(
        `Demo environment reset successfully at ${new Date(payload.seededAt).toLocaleString()}`,
      );
      setConfirmOpen(false);
      setConfirmText('');
      await loadCounts();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Reset failed');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Demo Environment</h1>
        <p className="page-subtitle">
          Manage the Bizosto demo tenant used for sales demonstrations.
        </p>
      </div>

      {statusMessage ? (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-green-700">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="card">
        <h2 className="section-title mb-4">Demo Tenant Status</h2>
        <div className="mt-3 grid gap-2 text-sm text-[var(--text-muted)] sm:grid-cols-2">
          <p>
            Tenant ID: <span className="font-medium text-[var(--text-primary)]">bizosto-demo</span>
          </p>
          <p>
            Plan: <span className="font-medium text-[var(--text-primary)]">Pro</span>
          </p>
          <p>
            Status: <span className="font-medium text-[var(--text-primary)]">Active</span>
          </p>
          <p>
            All modules: <span className="font-medium text-[var(--text-primary)]">Enabled</span>
          </p>
          <p>
            All roles: <span className="font-medium text-[var(--text-primary)]">Enabled</span>
          </p>
        </div>
        <Link href="/super_admin/tenants/bizosto-demo" className="btn ghost mt-4">
          View Tenant
        </Link>
      </section>

      <section className="card">
        <h2 className="section-title mb-4">Demo User Accounts</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Login credentials are managed securely outside the application source and are never
          displayed in the browser.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_USERS.map((user) => (
                <tr key={user.email} className="border-t">
                  <td className="py-2">{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${ROLE_BADGE[user.role] || 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}
                    >
                      {user.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title mb-4">Demo Data Counts</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Count label="Clients" value={counts?.clients} />
          <Count label="Leads" value={counts?.leads} />
          <Count label="Deals" value={counts?.deals} />
          <Count label="Invoices" value={counts?.invoices} />
          <Count label="Projects" value={counts?.projects} />
          <Count label="Production Jobs" value={counts?.productionJobs} />
          <Count label="Employees" value={counts?.employees} />
        </div>
      </section>

      <section className="card">
        <h2 className="section-title mb-4">Seed Demo Data</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Creates all 10 demo Firebase Auth accounts and replaces the bizosto-demo tenant data with
          the canonical golden fixture. Credentials are read from secure server configuration.
        </p>
        {seedMessage && (
          <div className="mt-3 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-700">
            {seedMessage}
          </div>
        )}
        {seedError && (
          <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {seedError}
          </div>
        )}
        <button
          className="btn mt-4"
          style={{ borderRadius: 999 }}
          onClick={handleSeed}
          disabled={isSeeding}
        >
          {isSeeding ? 'Seeding...' : 'Seed Demo Data'}
        </button>
      </section>

      <section
        className="card"
        style={{ borderColor: 'var(--warning)', background: 'rgba(254,243,199,0.5)' }}
      >
        <h2 className="section-title mb-4 text-amber-900">Reset Demo Data</h2>
        <p className="mt-2 text-sm text-amber-900">
          This deletes all tenant-scoped golden demo data and re-seeds a fresh canonical fixture.
          Demo Auth accounts remain but their password and claims are rotated to secure server
          configuration. This cannot be undone.
        </p>
        <button className="btn btn-danger mt-4" onClick={() => setConfirmOpen(true)}>
          Reset Demo Environment
        </button>
      </section>

      {confirmOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-5">
            <h3 className="font-semibold">
              Are you sure you want to reset all demo data? Type RESET to confirm.
            </h3>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="input mt-3"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                disabled={confirmText !== 'RESET' || isResetting}
                onClick={handleReset}
              >
                {isResetting ? 'Resetting demo data...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="card">
        <h2 className="section-title mb-4">Demo Login Links</h2>
        <div className="mt-3 space-y-2">
          {DEMO_USERS.map((user) => {
            const loginUrl = `${appUrl}/login?email=${encodeURIComponent(user.email)}`;
            return (
              <div
                key={`link-${user.email}`}
                className="card flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium">{user.role}</p>
                  <p className="text-[var(--text-muted)]">{user.email}</p>
                </div>
                <button
                  onClick={() => copy(loginUrl)}
                  className="btn ghost"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  Copy Login URL
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Count({ label, value }: { label: string; value?: number }) {
  return (
    <div className="card kpi-card">
      <p className="helper-text mb-1">{label}</p>
      <p className="text-3xl font-bold text-[var(--text-primary)]">
        {typeof value === 'number' ? value : '—'}
      </p>
    </div>
  );
}
