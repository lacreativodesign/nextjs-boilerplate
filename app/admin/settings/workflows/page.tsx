'use client';

import { useEffect, useMemo, useState } from 'react';
import { SettingsAlert } from '../_components/SettingsAlert';
import { apiFetch } from '@/lib/api/client';

type WorkflowSettings = {
  projectStages: string[];
  slaDaysPerStage: Record<string, number>;
  atRiskAfterDays: number;
  overdueAfterDays: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_SETTINGS: WorkflowSettings = {
  projectStages: ['Kickoff', 'Draft', 'Review', 'Revisions', 'Final', 'Delivered'],
  slaDaysPerStage: {
    Kickoff: 3,
    Draft: 5,
    Review: 5,
    Revisions: 7,
    Final: 3,
    Delivered: 0,
  },
  atRiskAfterDays: 7,
  overdueAfterDays: 0,
};

export default function WorkflowSettingsPage() {
  const [settings, setSettings] = useState<WorkflowSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const disabled = useMemo(() => !canEdit || loading || saving, [canEdit, loading, saving]);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await apiFetch('/api/admin/settings/workflows', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error('You do not have access to workflow settings.');
        if (res.status === 401) throw new Error('Please sign in again to continue.');
        throw new Error(data?.error || 'Unable to load settings.');
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setCanEdit(Boolean(data.canEdit));
    } catch (err: any) {
      console.error('workflow settings load error', err);
      setError(err.message || 'Unable to load workflow settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateStageSla = (stage: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      slaDaysPerStage: { ...prev.slaDaysPerStage, [stage]: Number(value) },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await apiFetch('/api/admin/settings/workflows', {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403)
          throw new Error('You do not have permission to edit workflow settings.');
        throw new Error(data?.error || 'Unable to save settings.');
      }
      setSuccess('Workflow settings updated.');
    } catch (err: any) {
      console.error('workflow settings save error', err);
      setError(err.message || 'Unable to save workflow settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Workflows</h1>
        <p className="page-subtitle mt-2">
          Automated actions triggered by events across the platform.
        </p>
      </div>

      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      {!canEdit && !loading && (
        <SettingsAlert tone="info">
          Only Super Admins can edit workflows. You have view-only access.
        </SettingsAlert>
      )}

      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Delivery Workflows</div>
            <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
              SLA rules drive production health, overview KPIs, and delivery reporting.
            </p>
          </div>
          <button
            className="btn"
            onClick={handleSave}
            disabled={disabled}
            style={{ borderRadius: 999 }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div style={{ fontWeight: 700 }}>Project Stages (locked order)</div>
            <div className="space-y-2">
              {settings.projectStages.map((stage, index) => (
                <div key={stage} className="card" style={{ padding: 12, borderRadius: 12 }}>
                  <div style={{ fontWeight: 600 }}>
                    {index + 1}. {stage}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div style={{ fontWeight: 700 }}>SLA Days Per Stage</div>
            <div className="grid gap-3 md:grid-cols-2">
              {settings.projectStages.map((stage) => (
                <label key={stage} className="space-y-1">
                  <div style={{ fontSize: 12, color: 'var(--sidebar-text)' }}>{stage}</div>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={settings.slaDaysPerStage?.[stage] ?? 0}
                    onChange={(e) => updateStageSla(stage, e.target.value)}
                    disabled={disabled}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>At-Risk Warning Days</span>
            <input
              className="input"
              type="number"
              min={0}
              value={settings.atRiskAfterDays}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, atRiskAfterDays: Number(e.target.value) }))
              }
              disabled={disabled}
            />
          </label>
          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Overdue After (Days)</span>
            <input
              className="input"
              type="number"
              min={0}
              value={settings.overdueAfterDays}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, overdueAfterDays: Number(e.target.value) }))
              }
              disabled={disabled}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
