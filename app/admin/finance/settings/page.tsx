'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type FinanceSettingsResponse = {
  ok: boolean;
  error?: string;
  settings?: {
    orderPrefix?: string;
    orderStartingNumber?: number;
    canEditOrderStartingNumber?: boolean;
  };
};

const ORDER_PREFIX_PATTERN = /^[A-Z0-9-]{0,10}$/;

export default function FinanceSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orderPrefix, setOrderPrefix] = useState('');
  const [orderStartingNumber, setOrderStartingNumber] = useState(1);
  const [canEditOrderStartingNumber, setCanEditOrderStartingNumber] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch('/api/admin/settings/finance', { cache: 'no-store' });
        const data = (await res.json()) as FinanceSettingsResponse;
        if (!res.ok || !data.ok || !data.settings) {
          throw new Error(data.error || 'Failed to load finance settings.');
        }
        setOrderPrefix(String(data.settings.orderPrefix || '').toUpperCase());
        setOrderStartingNumber(Math.max(1, Number(data.settings.orderStartingNumber || 1)));
        setCanEditOrderStartingNumber(Boolean(data.settings.canEditOrderStartingNumber));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load finance settings.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const prefixPreview = useMemo(() => {
    const normalized = orderPrefix.trim().toUpperCase();
    const base = normalized ? (normalized.endsWith('-') ? normalized : `${normalized}-`) : 'INV-';
    return `${base}${String(orderStartingNumber || 1).padStart(4, '0')}`;
  }, [orderPrefix, orderStartingNumber]);

  async function onSave() {
    setError(null);
    setSuccess(null);

    const normalizedPrefix = orderPrefix.trim().toUpperCase();
    if (!ORDER_PREFIX_PATTERN.test(normalizedPrefix)) {
      setError(
        'Invoice Number Prefix must be 10 characters max using only letters, numbers, and hyphens.',
      );
      return;
    }

    if (!Number.isFinite(orderStartingNumber) || orderStartingNumber < 1) {
      setError('Invoice Starting Number must be at least 1.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/settings/finance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderPrefix: normalizedPrefix,
          orderStartingNumber: Math.floor(orderStartingNumber),
        }),
      });
      const data = (await res.json()) as FinanceSettingsResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to save finance settings.');
      }
      setSuccess('Finance settings saved.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save finance settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 16 }}>
        Loading finance settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Finance Settings</h3>
        <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
          Configure tenant invoice numbering.
        </p>
      </div>

      <div className="card" style={{ padding: 18, borderRadius: 16 }}>
        <div style={{ display: 'grid', gap: 14, maxWidth: 560 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Invoice Number Prefix</span>
            <input
              className="input"
              type="text"
              maxLength={10}
              placeholder="e.g. ACME, INV, 2026"
              value={orderPrefix}
              onChange={(e) => setOrderPrefix(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            />
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Your invoices will be numbered like: [PREFIX]-0001
            </span>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Invoice Starting Number</span>
            <input
              className="input"
              type="number"
              min={1}
              value={orderStartingNumber}
              onChange={(e) => setOrderStartingNumber(Math.max(1, Number(e.target.value || 1)))}
              readOnly={!canEditOrderStartingNumber}
            />
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Your next invoice will be [PREFIX]-[this number padded to 4 digits]
            </span>
            {!canEditOrderStartingNumber ? (
              <span style={{ fontSize: 12, color: 'var(--warning-strong-alt)' }}>
                Cannot change — invoices already issued.
              </span>
            ) : null}
          </label>

          <div style={{ fontSize: 13, opacity: 0.75 }}>Preview: {prefixPreview}</div>

          {error ? <div style={{ color: 'var(--danger-deep)', fontSize: 13 }}>{error}</div> : null}
          {success ? (
            <div style={{ color: 'var(--status-success-text)', fontSize: 13 }}>{success}</div>
          ) : null}

          <div>
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
