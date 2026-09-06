'use client';

import { OptimizedImage } from '@/components/OptimizedImage';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage } from '@/lib/firebaseClient';
import {
  MAX_IMAGE_UPLOAD_SIZE_BYTES,
  optimizeImageForUpload,
} from '@/lib/images/client-image-optimizer';
import { apiFetch } from '@/lib/api/client';
import type { CompedType } from '@/lib/billing/billing-mode';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  brand: { name: string; logoUrl: string | null; locked: boolean } | null;
  modulesEnabled: Record<string, boolean>;
  rolesEnabled: Record<string, boolean>;
  plan?: 'starter' | 'pro' | 'enterprise';
  modules?: Record<string, boolean>;
  planSetBy?: { uid: string; role: 'super_admin' } | null;
  planUpdatedAt?: string | null;
  billingMode?: 'stripe' | 'comped';
  comped?: {
    type: 'internal' | 'promotional' | 'partner' | 'support';
    reason: string;
    grantedByUid: string;
    grantedAt: string;
    expiresAt: string | null;
  } | null;
  compExpired?: boolean;
  stripeConnectAccountId?: string | null;
  stripeConnectStatus?: string | null;
  stripeConnectEmail?: string | null;
  stripeConnectChargesEnabled?: boolean;
  stripeConnectPayoutsEnabled?: boolean;
};

const moduleGroups: Record<string, Array<{ key: string; label: string }>> = {
  'Core Modules': [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'clients', label: 'Clients' },
    { key: 'sales', label: 'Sales' },
    { key: 'finance', label: 'Finance' },
    { key: 'hr', label: 'Human Resources' },
    { key: 'production', label: 'Production' },
    { key: 'admin', label: 'Admin' },
    { key: 'notifications', label: 'Notifications' },
  ],
  'Add-on Modules': [
    { key: 'projects', label: 'Projects' },
    { key: 'reports', label: 'Reports' },
    { key: 'crm', label: 'CRM' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'billing', label: 'Billing' },
    { key: 'support', label: 'Support' },
  ],
};

const roleList: Array<{ key: string; label: string }> = [
  { key: 'admin', label: 'Admin' },
  { key: 'sales_manager', label: 'Sales Manager' },
  { key: 'sales', label: 'Sales' },
  { key: 'am_manager', label: 'Account Manager (Head)' },
  { key: 'am', label: 'Account Manager' },
  { key: 'production_manager', label: 'Production Manager' },
  { key: 'production', label: 'Production' },
  { key: 'finance', label: 'Finance' },
  { key: 'hr', label: 'HR' },
  { key: 'client', label: 'Client Portal' },
];

const planModules = [
  { key: 'crm', label: 'CRM' },
  { key: 'projects', label: 'Projects' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'finance', label: 'Finance' },
  { key: 'hr', label: 'HR' },
  { key: 'reports', label: 'Reports' },
  { key: 'client_stripe_connect', label: 'Client Stripe Connect' },
];

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = String(params?.tenantId || '');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [brandName, setBrandName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoMetadata, setLogoMetadata] = useState<{
    width: number;
    height: number;
    format: string;
  } | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [impersonating, setImpersonating] = useState(false);

  const handleImpersonate = async () => {
    if (!tenantId) return;
    setImpersonating(true);
    try {
      const res = await apiFetch(`/api/super_admin/tenants/${tenantId}/impersonate`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok || !json?.customToken) {
        alert(json?.error || 'Failed to start impersonation');
        return;
      }
      const qs = new URLSearchParams({
        impersonateToken: json.customToken,
        tenantId,
        tenantName: json.tenantName || tenantId,
      });
      window.open(`/impersonate?${qs.toString()}`, '_blank');
    } catch {
      alert('Failed to start impersonation session');
    } finally {
      setImpersonating(false);
    }
  };
  const [savingModules, setSavingModules] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingPlanModules, setSavingPlanModules] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'enterprise'>('pro');
  const [rolesEnabled, setRolesEnabled] = useState<Record<string, boolean>>({});
  const [savingBillingMode, setSavingBillingMode] = useState(false);
  const [billingModeError, setBillingModeError] = useState<string | null>(null);
  const [compType, setCompType] = useState<CompedType>('internal');
  const [compReason, setCompReason] = useState('');
  const [compExpiresAt, setCompExpiresAt] = useState('');

  const loadTenant = async () => {
    const res = await apiFetch(`/api/super_admin/tenants/${tenantId}`, {
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setTenant({ ...json.tenant, rolesEnabled: json.tenant?.rolesEnabled || {} });
      setBrandName(json.tenant?.brand?.name || json.tenant?.name || '');
      if (json.tenant?.plan) {
        setSelectedPlan(json.tenant.plan);
      }
      // Hydrate the comp form from what is stored, so re-saving an existing comp does not
      // silently blank its reason or expiry.
      if (json.tenant?.comped) {
        setCompType(json.tenant.comped.type || 'internal');
        setCompReason(json.tenant.comped.reason || '');
        setCompExpiresAt((json.tenant.comped.expiresAt || '').slice(0, 10));
      }
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadTenant();
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenant?.rolesEnabled) {
      setRolesEnabled(tenant.rolesEnabled);
    }
  }, [tenant]);

  const moduleState = useMemo(() => tenant?.modulesEnabled || {}, [tenant]);
  const planModuleState = useMemo(() => tenant?.modules || {}, [tenant]);

  const updateBranding = async () => {
    if (!tenant) return;
    setSavingBrand(true);
    let logoUrl = tenant.brand?.logoUrl || null;

    try {
      if (logoFile) {
        const optimized = await optimizeImageForUpload(logoFile);
        setLogoMetadata({
          width: optimized.metadata.width,
          height: optimized.metadata.height,
          format: optimized.metadata.format,
        });
        const storage = await getFirebaseStorage();
        const storageRef = ref(storage, `tenants/${tenant.id}/brand/logo.webp`);
        await uploadBytes(storageRef, optimized.file, { contentType: optimized.file.type });
        logoUrl = await getDownloadURL(storageRef);
      }

      await apiFetch(`/api/super_admin/tenants/${tenant.id}/branding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: brandName.trim() || tenant.name,
          logoUrl,
        }),
      });
      setLogoFile(null);
      await loadTenant();
    } finally {
      setSavingBrand(false);
    }
  };

  const updateModules = async (nextModules: Record<string, boolean>) => {
    if (!tenant) return;
    setSavingModules(true);
    try {
      await apiFetch(`/api/super_admin/tenants/${tenant.id}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modulesEnabled: nextModules }),
      });
      await loadTenant();
    } finally {
      setSavingModules(false);
    }
  };

  const updateRoles = async (roles: Record<string, boolean>) => {
    if (!tenant) return;
    setSavingRoles(true);

    try {
      const res = await apiFetch(`/api/super_admin/tenants/${tenant.id}/roles`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolesEnabled: roles }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setTenant((prev) => (prev ? { ...prev, rolesEnabled: json.rolesEnabled || roles } : prev));
        alert('Role settings updated.');
      }
    } finally {
      setSavingRoles(false);
    }
  };

  const updateStatus = async (status: 'active' | 'suspended') => {
    if (!tenant) return;
    setSavingStatus(true);
    try {
      await apiFetch(`/api/super_admin/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await loadTenant();
    } finally {
      setSavingStatus(false);
    }
  };

  const updatePlan = async (nextPlan: 'starter' | 'pro' | 'enterprise') => {
    if (!tenant) return;
    setSavingPlan(true);
    try {
      await apiFetch(`/api/super_admin/tenants/${tenant.id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: nextPlan }),
      });
      await loadTenant();
    } finally {
      setSavingPlan(false);
    }
  };

  /**
   * COMP-1 UI: converting a workspace between paying and comped.
   *
   * The server validates the grant and is the only thing that can write it; this form
   * exists so the decision is made with the reason in front of the operator rather than
   * through a console edit. A rejection is surfaced verbatim — a comp that fails
   * validation must not look like it saved.
   */
  const updateBillingMode = async (nextMode: 'stripe' | 'comped') => {
    if (!tenant) return;
    setSavingBillingMode(true);
    setBillingModeError(null);
    try {
      const payload: Record<string, unknown> = { billingMode: nextMode };
      if (nextMode === 'comped') {
        payload.comped = {
          type: compType,
          reason: compReason,
          expiresAt: compExpiresAt ? new Date(compExpiresAt).toISOString() : null,
        };
      }
      const res = await apiFetch(`/api/super_admin/tenants/${tenant.id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setBillingModeError(json?.error || 'Unable to update billing mode.');
        return;
      }
      await loadTenant();
    } finally {
      setSavingBillingMode(false);
    }
  };

  const updatePlanModules = async (nextModules: Record<string, boolean>) => {
    if (!tenant) return;
    setSavingPlanModules(true);
    try {
      await apiFetch(`/api/super_admin/tenants/${tenant.id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: nextModules }),
      });
      await loadTenant();
    } finally {
      setSavingPlanModules(false);
    }
  };

  if (!tenant) {
    return <div className="text-sm text-[var(--text-muted)]">Loading tenant...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tenant.name}</h1>
          <p className="page-subtitle">Tenant ID: {tenant.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
            value={tenant.status}
            onChange={(e) => updateStatus(e.target.value === 'suspended' ? 'suspended' : 'active')}
            disabled={savingStatus}
          >
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <button
            type="button"
            onClick={handleImpersonate}
            disabled={impersonating}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{
              background: 'linear-gradient(135deg,var(--warning-strong-alt),var(--warning-strong))',
              opacity: impersonating ? 0.7 : 1,
              cursor: impersonating ? 'not-allowed' : 'pointer',
              border: 'none',
              boxShadow: '0 2px 6px rgba(180,83,9,0.3)',
            }}
          >
            👁️ {impersonating ? 'Opening...' : 'Login as Tenant'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="card p-6 space-y-4">
          <div>
            <h3 className="section-title">Branding</h3>
            <p className="section-subtitle">
              Super Admin only. Logo updates propagate to all dashboards.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="w-full md:w-[240px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
              {tenant.brand?.logoUrl ? (
                <OptimizedImage
                  src={tenant.brand.logoUrl}
                  alt={tenant.brand.name}
                  width={208}
                  height={96}
                  className="h-24 w-full object-contain"
                  sizes="(max-width: 768px) 100vw, 240px"
                  blurDataURL={tenant.brand.logoUrl}
                />
              ) : (
                <div className="flex h-24 items-center justify-center text-xs text-[var(--text-muted)]">
                  Logo preview
                </div>
              )}
              <div className="mt-3 text-sm font-semibold">{tenant.brand?.name || tenant.name}</div>
            </div>
            <div className="flex-1 space-y-3">
              <input
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
                placeholder="Brand display name"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
              <input
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-sm"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const next = e.target.files?.[0] || null;
                  if (!next) {
                    setLogoFile(null);
                    setLogoMetadata(null);
                    return;
                  }

                  if (next.size > MAX_IMAGE_UPLOAD_SIZE_BYTES) {
                    alert('Logo file exceeds 5MB limit.');
                    e.currentTarget.value = '';
                    setLogoFile(null);
                    setLogoMetadata(null);
                    return;
                  }

                  try {
                    const optimized = await optimizeImageForUpload(next);
                    setLogoFile(optimized.file);
                    setLogoMetadata({
                      width: optimized.metadata.width,
                      height: optimized.metadata.height,
                      format: optimized.metadata.format,
                    });
                  } catch (error: any) {
                    alert(error?.message || 'Unable to process logo image.');
                    e.currentTarget.value = '';
                    setLogoFile(null);
                    setLogoMetadata(null);
                  }
                }}
              />
              {logoMetadata ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Optimized logo: {logoMetadata.width}×{logoMetadata.height} ({logoMetadata.format})
                </p>
              ) : null}
              <button
                className="rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
                onClick={updateBranding}
                disabled={savingBrand}
              >
                {savingBrand ? 'Saving...' : 'Save Branding'}
              </button>
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <h3 className="section-title">Tenant Metadata</h3>
            <p className="section-subtitle">Identifiers used across the SaaS foundation.</p>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3">
              <span className="text-[var(--text-muted)]">Slug</span>
              <span>{tenant.slug}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3">
              <span className="text-[var(--text-muted)]">Status</span>
              <span>{tenant.status}</span>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-3 text-xs text-[var(--text-muted)]">
              Brand settings are locked for tenant admins and updated centrally by Super Admin.
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <h3 className="section-title">Stripe Connect</h3>
            <p className="section-subtitle">Read-only tenant payment connection status.</p>
          </div>
          {tenant.stripeConnectAccountId ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3">
                <span className="text-[var(--text-muted)]">Status</span>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  {tenant.stripeConnectStatus || 'active'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3">
                <span className="text-[var(--text-muted)]">Account ID</span>
                <span>
                  {tenant.stripeConnectAccountId.slice(0, 8)}...
                  {tenant.stripeConnectAccountId.slice(-4)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3">
                <span className="text-[var(--text-muted)]">Email</span>
                <span>{tenant.stripeConnectEmail || '-'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3">
                <span className="text-[var(--text-muted)]">Charges Enabled</span>
                <span>{tenant.stripeConnectChargesEnabled ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] p-3">
                <span className="text-[var(--text-muted)]">Payouts Enabled</span>
                <span>{tenant.stripeConnectPayoutsEnabled ? 'Yes' : 'No'}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] p-3 text-sm text-[var(--text-muted)]">
              Not connected
            </div>
          )}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h3 className="section-title">Legacy Modules Enabled</h3>
          <p className="section-subtitle">Toggle navigation modules for legacy dashboards.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {Object.entries(moduleGroups).map(([group, modules]) => (
            <div key={group} className="rounded-2xl border border-[var(--border-subtle)] p-4">
              <div className="text-sm font-semibold mb-3">{group}</div>
              <div className="space-y-3">
                {modules.map((module) => (
                  <label key={module.key} className="flex items-center justify-between text-sm">
                    <span>{module.label}</span>
                    <input
                      type="checkbox"
                      checked={moduleState[module.key] !== false}
                      onChange={(e) => {
                        const nextModules = { ...moduleState, [module.key]: e.target.checked };
                        setTenant((prev) =>
                          prev ? { ...prev, modulesEnabled: nextModules } : prev,
                        );
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            className="rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => updateModules(moduleState)}
            disabled={savingModules}
          >
            {savingModules ? 'Saving...' : 'Save Modules'}
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h3 className="section-title">Role Access</h3>
          <p className="section-subtitle">
            Enable or disable roles for this tenant. Disabled roles cannot be assigned to users.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] p-4">
          <div className="space-y-3">
            {roleList.map((role) => (
              <label key={role.key} className="flex items-center justify-between text-sm">
                <span>{role.label}</span>
                <input
                  type="checkbox"
                  checked={rolesEnabled[role.key] === true}
                  onChange={(e) => {
                    setRolesEnabled((prev) => ({
                      ...prev,
                      [role.key]: e.target.checked,
                    }));
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            className="rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => updateRoles(rolesEnabled)}
            disabled={savingRoles}
          >
            {savingRoles ? 'Saving...' : 'Save Role Settings'}
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h3 className="section-title">Plan & SaaS Modules</h3>
          <p className="section-subtitle">
            Control subscription tier defaults and override per-module access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Plan
            </label>
            <select
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as 'starter' | 'pro' | 'enterprise')}
              disabled={savingPlan}
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <button
            className="mt-6 rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => updatePlan(selectedPlan)}
            disabled={savingPlan}
          >
            {savingPlan ? 'Saving...' : 'Update Plan'}
          </button>
        </div>

        {/*
          COMP-1: who pays, set next to what they get, because "Enterprise, internally
          managed" is one decision. Plan stays the answer to what the workspace can do.
        */}
        <div className="rounded-2xl border border-[var(--border-subtle)] p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">Billing Mode</div>
            <p className="text-xs text-[var(--text-muted)]">
              A comped workspace is never charged, never dunned, never emailed about billing, and
              contributes nothing to MRR.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background:
                  tenant.billingMode === 'comped'
                    ? 'rgba(168,85,247,0.12)'
                    : 'rgba(34,197,94,0.12)',
                color:
                  tenant.billingMode === 'comped' ? 'var(--color-purple)' : 'var(--color-green)',
              }}
            >
              {tenant.billingMode === 'comped' ? 'Comped — $0' : 'Stripe billing'}
            </span>
            {tenant.compExpired ? (
              <span className="text-xs font-semibold" style={{ color: 'var(--warning-strong)' }}>
                Comp expired — still free until converted
              </span>
            ) : null}
          </div>

          {tenant.comped ? (
            <div className="rounded-xl border border-[var(--border-subtle)] p-3 text-xs space-y-1">
              <div>
                <span className="text-[var(--text-muted)]">Reason: </span>
                {tenant.comped.reason}
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Type: </span>
                {tenant.comped.type}
                <span className="text-[var(--text-muted)]"> • Expires: </span>
                {tenant.comped.expiresAt
                  ? new Date(tenant.comped.expiresAt).toLocaleDateString()
                  : 'never'}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Comp type
              </label>
              <select
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
                value={compType}
                onChange={(e) => setCompType(e.target.value as CompedType)}
                disabled={savingBillingMode}
              >
                <option value="internal">Internal</option>
                <option value="promotional">Promotional</option>
                <option value="partner">Partner</option>
                <option value="support">Support</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Reason (required)
              </label>
              <input
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
                value={compReason}
                onChange={(e) => setCompReason(e.target.value)}
                placeholder="Bizosto's own workspace"
                maxLength={500}
                disabled={savingBillingMode}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Expires (blank = never)
              </label>
              <input
                type="date"
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm"
                value={compExpiresAt}
                onChange={(e) => setCompExpiresAt(e.target.value)}
                disabled={savingBillingMode}
              />
            </div>
          </div>

          {billingModeError ? (
            <p className="text-xs font-semibold" style={{ color: 'var(--danger-strong)' }}>
              {billingModeError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-[var(--color-purple)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => updateBillingMode('comped')}
              disabled={savingBillingMode || !compReason.trim()}
            >
              {savingBillingMode ? 'Saving...' : 'Mark as comped'}
            </button>
            <button
              className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold disabled:opacity-50"
              onClick={() => updateBillingMode('stripe')}
              disabled={savingBillingMode || tenant.billingMode !== 'comped'}
            >
              Convert to Stripe billing
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] p-4">
          <div className="text-sm font-semibold mb-3">Module Overrides</div>
          <div className="grid gap-3 md:grid-cols-2">
            {planModules.map((module) => (
              <label key={module.key} className="flex items-center justify-between text-sm">
                <span>{module.label}</span>
                <input
                  type="checkbox"
                  checked={planModuleState[module.key] !== false}
                  onChange={(e) => {
                    const nextModules = { ...planModuleState, [module.key]: e.target.checked };
                    setTenant((prev) => (prev ? { ...prev, modules: nextModules } : prev));
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            className="rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => updatePlanModules(planModuleState)}
            disabled={savingPlanModules}
          >
            {savingPlanModules ? 'Saving...' : 'Save Plan Modules'}
          </button>
        </div>
      </div>
    </div>
  );
}
