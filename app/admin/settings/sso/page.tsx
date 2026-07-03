'use client';

import { useEffect, useState } from 'react';
import { SettingsAlert } from '../_components/SettingsAlert';
import SsoAuditLogViewer from '@/components/admin/SsoAuditLogViewer';
import UserSsoStatusIndicator from '@/components/users/UserSsoStatusIndicator';
import { apiFetch } from '@/lib/api/client';

type ProviderKey = 'google' | 'microsoft';

type ConfigState = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  tenantHint: string;
  allowedDomains: string;
  autoProvision: boolean;
};

const INITIAL: ConfigState = {
  enabled: false,
  clientId: '',
  clientSecret: '',
  tenantHint: '',
  allowedDomains: '',
  autoProvision: true,
};

export default function SsoSettingsPage() {
  const [tenantId, setTenantId] = useState('default');
  const [configs, setConfigs] = useState<Record<ProviderKey, ConfigState>>({
    google: { ...INITIAL },
    microsoft: { ...INITIAL },
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState<ProviderKey | null>(null);

  useEffect(() => {
    const envTenant = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || 'bizosto';
    setTenantId(envTenant);
  }, []);

  const saveProvider = async (provider: ProviderKey) => {
    setSaving(provider);
    setError(null);
    setSuccess(null);

    try {
      const config = configs[provider];
      const response = await apiFetch('/api/admin/sso/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          provider,
          enabled: config.enabled,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          tenantHint: config.tenantHint,
          allowedDomains: config.allowedDomains
            .split(',')
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean),
          autoProvision: config.autoProvision,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Unable to save SSO configuration.');
      }

      setSuccess(`${provider} SSO configuration saved.`);
    } catch (err: any) {
      setError(err?.message || 'Unable to save SSO configuration.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <SettingsAlert tone="error">{error}</SettingsAlert> : null}
      {success ? <SettingsAlert tone="success">{success}</SettingsAlert> : null}

      <section className="card" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Single Sign-On</div>
            <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
              Configure OAuth 2.0 SSO per tenant with domain restrictions and user
              auto-provisioning.
            </p>
          </div>
          <UserSsoStatusIndicator />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {(['google', 'microsoft'] as ProviderKey[]).map((provider) => (
            <div key={provider} className="card" style={{ padding: 16, borderRadius: 14 }}>
              <div className="mb-3 text-sm font-semibold uppercase">{provider}</div>
              <div className="space-y-3">
                <label className="flex items-center justify-between text-sm">
                  <span>Enabled</span>
                  <input
                    type="checkbox"
                    checked={configs[provider].enabled}
                    onChange={(e) =>
                      setConfigs((prev) => ({
                        ...prev,
                        [provider]: { ...prev[provider], enabled: e.target.checked },
                      }))
                    }
                  />
                </label>

                <input
                  className="input"
                  placeholder="OAuth Client ID"
                  value={configs[provider].clientId}
                  onChange={(e) =>
                    setConfigs((prev) => ({
                      ...prev,
                      [provider]: { ...prev[provider], clientId: e.target.value },
                    }))
                  }
                />

                <input
                  className="input"
                  placeholder="OAuth Client Secret"
                  value={configs[provider].clientSecret}
                  onChange={(e) =>
                    setConfigs((prev) => ({
                      ...prev,
                      [provider]: { ...prev[provider], clientSecret: e.target.value },
                    }))
                  }
                />

                {provider === 'microsoft' ? (
                  <input
                    className="input"
                    placeholder="Microsoft tenant ID (optional)"
                    value={configs[provider].tenantHint}
                    onChange={(e) =>
                      setConfigs((prev) => ({
                        ...prev,
                        [provider]: { ...prev[provider], tenantHint: e.target.value },
                      }))
                    }
                  />
                ) : null}

                <input
                  className="input"
                  placeholder="Allowed email domains (comma separated)"
                  value={configs[provider].allowedDomains}
                  onChange={(e) =>
                    setConfigs((prev) => ({
                      ...prev,
                      [provider]: { ...prev[provider], allowedDomains: e.target.value },
                    }))
                  }
                />

                <label className="flex items-center justify-between text-sm">
                  <span>Auto-provision users on first login</span>
                  <input
                    type="checkbox"
                    checked={configs[provider].autoProvision}
                    onChange={(e) =>
                      setConfigs((prev) => ({
                        ...prev,
                        [provider]: { ...prev[provider], autoProvision: e.target.checked },
                      }))
                    }
                  />
                </label>

                <button
                  className="btn"
                  onClick={() => saveProvider(provider)}
                  disabled={saving === provider}
                >
                  {saving === provider ? 'Saving...' : `Save ${provider}`}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SsoAuditLogViewer tenantId={tenantId} />
    </div>
  );
}
