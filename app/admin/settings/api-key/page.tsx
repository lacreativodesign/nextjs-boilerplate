'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Copy, Check, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { SettingsAlert } from '../_components/SettingsAlert';
import { apiFetch } from '@/lib/api/client';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bizosto.com';

type ApiKeySummary = {
  keyId: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export default function ApiKeySettingsPage() {
  const [loading, setLoading] = useState(true);
  // KEY-2: a workspace can hold several active keys at once, so rotation is
  // create → deploy → revoke, with no window where neither key works.
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [hasLegacyKey, setHasLegacyKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [working, setWorking] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setError(null);
      const res = await apiFetch('/api/admin/settings/api-key', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error('You do not have access.');
        if (res.status === 401) throw new Error('Please sign in again.');
        throw new Error(data?.error || 'Failed to load API key status.');
      }
      setKeys(Array.isArray(data.keys) ? data.keys : []);
      setHasLegacyKey(Boolean(data.hasLegacyKey));
    } catch (err: any) {
      setError(err?.message || 'Unable to load API key status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const generate = async () => {
    setWorking(true);
    setError(null);
    setSuccess(null);
    setCopied(false);
    try {
      const res = await apiFetch('/api/admin/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.apiKey) {
        throw new Error(data?.error || 'Failed to generate key.');
      }
      setPlaintext(String(data.apiKey));
      setNewKeyName('');
      await loadStatus();
      setSuccess("New ingest key created. Copy it now — it won't be shown again.");
    } catch (err: any) {
      setError(err?.message || 'Unable to generate key.');
    } finally {
      setWorking(false);
    }
  };

  const revoke = async (keyId?: string) => {
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(
        keyId
          ? `/api/admin/settings/api-key?keyId=${encodeURIComponent(keyId)}`
          : '/api/admin/settings/api-key',
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to revoke key.');
      }
      await loadStatus();
      setPlaintext(null);
      setSuccess('Key revoked. Anything still using that key will stop working immediately.');
    } catch (err: any) {
      setError(err?.message || 'Unable to revoke key.');
    } finally {
      setWorking(false);
    }
  };

  const copyKey = async () => {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically — select and copy the key manually.");
    }
  };

  if (loading) return <div className="card p-5">Loading API key settings...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">API Key</h1>
        <p className="page-subtitle mt-2">Keys for posting leads and events into this workspace.</p>
      </div>

      {error ? <SettingsAlert tone="error">{error}</SettingsAlert> : null}
      {success ? <SettingsAlert tone="success">{success}</SettingsAlert> : null}

      <section className="card p-5 rounded-xl settings-section space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[var(--erp-blue)]" />
          <div className="section-title">Ingest API Key</div>
        </div>
        <p className="section-subtitle">
          A secret key your brand website uses to push leads, briefs, and orders into this
          workspace. It is shown only once when generated.
        </p>

        {/*
          KEY-2: several keys can be active at once. To rotate without downtime: create a
          new key, deploy it, then revoke the old one — never the other way round.
        */}
        {keys.length ? (
          <div className="rounded-xl border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {keys.map((key) => (
              <div
                key={key.keyId}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{key.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    <code>{key.prefix}…</code> · created{' '}
                    {new Date(key.createdAt).toLocaleDateString()} ·{' '}
                    {key.lastUsedAt
                      ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : 'never used'}
                  </div>
                </div>
                <button
                  className="btn subtle rounded-full inline-flex items-center gap-1.5"
                  onClick={() => revoke(key.keyId)}
                  disabled={working}
                >
                  <Trash2 className="h-4 w-4" />
                  Revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Status:</span>
            {hasLegacyKey ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check className="h-4 w-4" /> One key configured
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">No keys yet</span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
            placeholder="Key name (e.g. WDD website)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            maxLength={80}
            disabled={working}
          />
          <button
            className="btn subtle rounded-full inline-flex items-center gap-1.5"
            onClick={generate}
            disabled={working}
          >
            <RefreshCw className="h-4 w-4" />
            {working ? 'Working...' : 'Create Key'}
          </button>
          {hasLegacyKey ? (
            <button
              className="btn subtle rounded-full inline-flex items-center gap-1.5"
              onClick={() => revoke()}
              disabled={working}
            >
              <Trash2 className="h-4 w-4" />
              Revoke legacy key
            </button>
          ) : null}
        </div>

        {plaintext ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-600 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Save this key now — it won&apos;t be shown again.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2 text-xs">
                {plaintext}
              </code>
              <button
                className="btn subtle rounded-full inline-flex items-center gap-1.5"
                onClick={copyKey}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card p-5 rounded-xl settings-section space-y-3">
        <div className="section-title">Website Integration</div>
        <p className="section-subtitle">
          Set <code>BIZOSTO_INGEST_KEY</code> to this key in your website&apos;s server environment,
          then POST to these endpoints with the header <code>x-api-key: &lt;key&gt;</code>:
        </p>
        <ul className="space-y-1 text-sm">
          <li>
            <code>POST {APP_URL}/api/ingest/leads</code> — contact / quote submissions
          </li>
          <li>
            <code>POST {APP_URL}/api/ingest/briefs</code> — project briefs
          </li>
          <li>
            <code>POST {APP_URL}/api/ingest/orders</code> — completed purchases
          </li>
        </ul>
        <p className="section-subtitle">
          The key alone identifies this workspace — no tenant id is required.
        </p>
        <p className="section-subtitle">
          Send an <code>Idempotency-Key</code> header with a unique id per submission (a UUID
          generated by your form). Retrying with the same key returns the original lead instead of
          creating a second one, so a dropped response or a double-click never duplicates a contact.
        </p>
      </section>
    </div>
  );
}
