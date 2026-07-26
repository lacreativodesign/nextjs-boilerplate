'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { apiFetch } from '@/lib/api/client';

type ConnectStatusResponse = {
  ok: boolean;
  connected: boolean;
  accountId: string | null;
  email: string | null;
  businessName: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  connectedAt: string | null;
  error?: string;
};

export default function SettingsPaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/stripe/connect/status', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as ConnectStatusResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.error || 'Unable to load Stripe connection status.');
        return;
      }
      setStatus(payload);
      setError(null);
    } catch {
      setError('Unable to load Stripe connection status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    const connectResult = searchParams.get('connect');
    if (!connectResult) {
      return;
    }

    if (connectResult === 'success') {
      toast.success('Stripe account connected successfully!');
    }

    if (connectResult === 'error') {
      toast.error('Failed to connect Stripe account. Please try again.');
    }

    router.replace('/settings/payments');
  }, [router, searchParams]);

  const connectedDate = useMemo(() => {
    if (!status?.connectedAt) {
      return '-';
    }
    const date = new Date(status.connectedAt);
    if (Number.isNaN(date.getTime())) {
      return status.connectedAt;
    }
    return date.toLocaleString();
  }, [status?.connectedAt]);

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch('/api/stripe/connect/start', {
        method: 'GET',
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.url) {
        setError(payload.error || 'Unable to start Stripe Connect.');
        return;
      }
      window.location.href = payload.url;
    } catch {
      setError('Unable to start Stripe Connect.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to disconnect your Stripe account? Your clients will no longer be able to make payments until you reconnect.',
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch('/api/stripe/connect/disconnect', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setError(payload.error || 'Unable to disconnect Stripe account.');
        return;
      }

      toast.success('Stripe account disconnected');
      await loadStatus();
    } catch {
      setError('Unable to disconnect Stripe account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Payment Settings</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Connect your Stripe account to accept payments from your clients
        </p>
      </div>

      <section className="card space-y-4 p-6">
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading Stripe Connect status...</p>
        ) : status?.connected ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Connected
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Stripe account connected
                </h3>
                <p className="text-sm text-[var(--text-muted)]">
                  Business: {status.businessName || '-'}
                </p>
                <p className="text-sm text-[var(--text-muted)]">Email: {status.email || '-'}</p>
                <p className="text-sm text-[var(--text-muted)]">Connected: {connectedDate}</p>
              </div>

              <button className="btn" onClick={handleDisconnect} disabled={busy}>
                {busy ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-subtle)] p-3 text-sm">
                Charges Enabled: {status.chargesEnabled ? '✅ Yes' : '❌ No'}
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] p-3 text-sm">
                Payouts Enabled: {status.payoutsEnabled ? '✅ Yes' : '❌ No'}
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Platform Handling Fee: 0.5% is automatically deducted from each transaction processed
              through Bizosto.
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--stripe-brand)] text-sm font-bold text-white">
                S
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Accept Payments from Clients
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                Connect your Stripe account to start accepting invoice payments. A 0.5% platform
                handling fee applies to all transactions.
              </p>
            </div>

            <div className="space-y-3">
              <button className="btn" onClick={handleConnect} disabled={busy}>
                {busy ? 'Redirecting...' : 'Connect Stripe Account'}
              </button>
              <p className="text-xs text-[var(--text-muted)]">
                You&apos;ll be redirected to Stripe to authorize the connection. You&apos;ll return
                here when complete.
              </p>
            </div>
          </>
        )}

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      </section>

      <section className="card p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">How it works</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">1. Connect</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Link your Stripe account securely via OAuth
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">2. Invoice</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Send invoices to your clients through Bizosto
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">3. Get Paid</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Clients pay online, funds go directly to your Stripe account
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
