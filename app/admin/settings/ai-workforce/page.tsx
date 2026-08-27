'use client';

import { useEffect, useState } from 'react';
import { SettingsAlert } from '../_components/SettingsAlert';
import { apiFetch } from '@/lib/api/client';

type AISettings = {
  provider: 'openai' | 'anthropic' | null;
  apiKeyMasked: string | null;
  hasKey: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type PageData =
  { planLocked: true; plan: string } | { planLocked: false; plan: string; settings: AISettings };

export default function AIWorkforceSettingsPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/settings/ai-workforce');
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setData(json);
        if (!json.planLocked && json.settings?.provider) {
          setProvider(json.settings.provider);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your API key.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/admin/settings/ai-workforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json?.error || 'Failed to save API key.');
      } else {
        setSuccess(`${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key saved successfully.`);
        setApiKey('');
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Remove your AI API key? AI agents will stop working until a new key is added.'))
      return;
    setRemoving(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/admin/settings/ai-workforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeKey: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json?.error || 'Failed to remove key.');
      } else {
        setSuccess('API key removed.');
        await load();
      }
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return <div className="mt-6 text-sm text-[var(--text-muted)]">Loading...</div>;
  }

  if (!data) {
    return <div className="mt-6 text-sm text-red-400">Failed to load settings.</div>;
  }

  if (data.planLocked) {
    return (
      <div className="mt-6 space-y-4">
        <div className="card p-6">
          <div className="section-title">AI Workforce — API Keys</div>
          <p className="section-subtitle mt-1">
            Connect your own OpenAI or Anthropic API key to power AI agents.
          </p>
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
            <p className="text-sm font-semibold text-amber-400">🔒 Pro or Enterprise required</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              AI Workforce is available on Pro and Enterprise plans. Upgrade to connect your AI API
              key and activate agents.
            </p>
            <a
              href="/admin/billing"
              className="mt-4 inline-flex items-center rounded-lg bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
            >
              Upgrade Plan →
            </a>
          </div>
        </div>
      </div>
    );
  }

  const settings = data.settings;

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h1 className="page-title">AI Workforce</h1>
        <p className="page-subtitle mt-2">
          Bring your own Anthropic key and choose which agents can run.
        </p>
      </div>

      <div className="card p-6">
        <div className="section-title">AI Workforce — API Keys</div>
        <p className="section-subtitle mt-1">
          Connect your own AI provider API key. Bizosto uses your key to run AI agents — your data
          never passes through our billing.
        </p>

        {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
        {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

        {/* Current key status */}
        {settings.hasKey && (
          <div className="mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {settings.provider === 'openai' ? 'OpenAI' : 'Anthropic'} key connected
                </p>
                <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                  {settings.apiKeyMasked}
                </p>
                {settings.updatedAt && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    Last updated{' '}
                    {new Date(settings.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Active
                </span>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  {removing ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add / Replace key */}
        <div className="mt-5 space-y-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {settings.hasKey ? 'Replace API key' : 'Connect your AI API key'}
          </p>

          {/* Provider selector */}
          <div className="flex gap-3">
            {(['openai', 'anthropic'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors ${
                  provider === p
                    ? 'border-[var(--erp-blue)] bg-[var(--erp-blue-soft)] text-[var(--erp-blue)]'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--erp-blue)]'
                }`}
              >
                {p === 'openai' ? 'OpenAI' : 'Anthropic'}
              </button>
            ))}
          </div>

          {/* Key hints */}
          <p className="text-xs text-[var(--text-muted)]">
            {provider === 'openai'
              ? 'Get your key at platform.openai.com → API Keys. Format: sk-...'
              : 'Get your key at console.anthropic.com → API Keys. Format: sk-ant-...'}
          </p>

          {/* API key input */}
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2.5 pr-16 font-mono text-sm text-[var(--text-primary)] focus:border-[var(--erp-blue)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="rounded-xl bg-[var(--erp-blue)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save API Key'}
            </button>
          </div>
        </div>

        {/* Security note */}
        <div className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
          <p className="text-xs font-semibold text-[var(--text-muted)]">🔒 Security</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Your API key is stored encrypted in your workspace and is never shared with other
            tenants. Only AI agents running inside your workspace will use this key. You can remove
            it at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
