'use client';

import { useEffect, useState } from 'react';
import { Mail, Plug, Trash2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { SettingsAlert } from '../_components/SettingsAlert';

/**
 * Email Delivery settings (MAIL-7).
 *
 * MAIL-6 built the tenant provider layer — encrypted credential storage, resolution at
 * send time, routing through the tenant's own account — and shipped it with no way for a
 * tenant to reach it. The API existed and nothing could call it. That is the same shape as
 * the attendance module, which sat broken in the sidebar for months because it had a
 * reader and no writer, and it is why this page exists as its own session rather than
 * being deferred.
 *
 * The credential is write-only by design. It is encrypted before storage and never
 * returned by any endpoint, so this screen can show that a key is configured and the last
 * four characters of it, and nothing more. Replacing a key means pasting a new one — there
 * is deliberately no way to read the old one back, including for a Super Admin.
 */

type ProviderName = 'resend' | 'sendgrid' | 'ses';

type ProviderStatus = {
  configured: boolean;
  provider: ProviderName | null;
  maskedKey: string;
  region: string;
  updatedAt: string | null;
};

const PROVIDER_LABELS: Record<ProviderName, string> = {
  resend: 'Resend',
  sendgrid: 'SendGrid',
  ses: 'Amazon SES',
};

export default function EmailDeliverySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [provider, setProvider] = useState<ProviderName>('resend');
  const [apiKey, setApiKey] = useState('');
  const [region, setRegion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch('/api/admin/settings/email-provider');
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to load.');
      setStatus(data as ProviderStatus);
      if (data.provider) setProvider(data.provider);
      if (data.region) setRegion(data.region);
    } catch (err: any) {
      setError(err?.message || 'Unable to load email delivery settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const connect = async () => {
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/api/admin/settings/email-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, region }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to save.');
      // Cleared immediately: the key has been sent and is never coming back, so leaving it
      // sitting in a form field only creates somewhere for it to be read over a shoulder.
      setApiKey('');
      setStatus(data as ProviderStatus);
      setSuccess('Connected. Mail to your customers now sends through your own account.');
    } catch (err: any) {
      setError(err?.message || 'Unable to save the provider.');
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/api/admin/settings/email-provider', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to disconnect.');
      await load();
      setSuccess('Disconnected. Mail falls back to Bizosto’s sending account.');
    } catch (err: any) {
      setError(err?.message || 'Unable to disconnect.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <p className="section-subtitle">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      {error ? <SettingsAlert tone="error">{error}</SettingsAlert> : null}
      {success ? <SettingsAlert tone="success">{success}</SettingsAlert> : null}

      <section className="card p-5 rounded-xl settings-section space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-[var(--erp-blue)]" />
          <div className="section-title">Email Delivery</div>
        </div>
        <p className="section-subtitle">
          Connect your own email provider so invoices, reminders and lead replies leave through your
          account instead of Bizosto’s. Your sending reputation, bounce data and quota become yours.
        </p>

        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Status:</span>
          {status?.configured ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Plug className="h-4 w-4" />
              {PROVIDER_LABELS[status.provider || 'resend']} connected ({status.maskedKey})
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">
              Using Bizosto’s sending account
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Provider
            </label>
            <select
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderName)}
              disabled={working}
            >
              <option value="resend">Resend</option>
              <option value="sendgrid">SendGrid</option>
              <option value="ses">Amazon SES</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              API key
            </label>
            <input
              type="password"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
              placeholder={status?.configured ? 'Paste a new key to replace' : 'Paste your API key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              disabled={working}
            />
          </div>

          {provider === 'ses' ? (
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                AWS region
              </label>
              <input
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
                placeholder="us-east-1"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={working}
              />
            </div>
          ) : null}
        </div>

        {provider === 'ses' ? (
          <div className="flex items-start gap-2 text-sm text-amber-600">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {/* Honest about the gap rather than letting a tenant believe SES is live. */}
            <span>
              SES needs an access key pair rather than a single token, so it is stored but not yet
              used for sending. Mail continues through Bizosto’s account until that lands.
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            className="btn subtle rounded-full inline-flex items-center gap-1.5"
            onClick={connect}
            disabled={working || apiKey.trim().length < 16}
          >
            <Plug className="h-4 w-4" />
            {working ? 'Working…' : status?.configured ? 'Replace Key' : 'Connect Provider'}
          </button>
          {status?.configured ? (
            <button
              className="btn subtle rounded-full inline-flex items-center gap-1.5"
              onClick={disconnect}
              disabled={working}
            >
              <Trash2 className="h-4 w-4" />
              Disconnect
            </button>
          ) : null}
        </div>

        <p className="section-subtitle">
          Your key is encrypted before it is stored and is never shown again — not on this screen,
          not in an export, not to Bizosto support. To change it, paste a new one. Disconnecting
          takes effect immediately and mail reverts to Bizosto’s account rather than stopping.
        </p>
      </section>
    </div>
  );
}
