"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebaseClient";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  brand: { name: string; logoUrl: string | null; locked: boolean } | null;
  modulesEnabled: Record<string, boolean>;
};

const moduleGroups = {
  Core: [
    "admin",
    "clients",
    "users",
    "sales",
    "accountManager",
    "production",
    "finance",
    "humanResource",
    "dashboard",
    "notifications",
  ],
  "Management Add-ons": ["salesManager", "headOfProjectManagement", "headOfProduction"],
};

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = String(params?.tenantId || "");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [brandName, setBrandName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savingModules, setSavingModules] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const loadTenant = async () => {
    const res = await fetch(`/api/super-admin/tenants/${tenantId}`, {
      cache: "no-store",
      credentials: "include",
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setTenant(json.tenant);
      setBrandName(json.tenant?.brand?.name || json.tenant?.name || "");
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadTenant();
    }
  }, [tenantId]);

  const moduleState = useMemo(() => tenant?.modulesEnabled || {}, [tenant]);

  const updateBranding = async () => {
    if (!tenant) return;
    setSavingBrand(true);
    let logoUrl = tenant.brand?.logoUrl || null;

    try {
      if (logoFile) {
        const storage = await getFirebaseStorage();
        const storageRef = ref(storage, `tenants/${tenant.id}/brand/logo.png`);
        await uploadBytes(storageRef, logoFile);
        logoUrl = await getDownloadURL(storageRef);
      }

      await fetch(`/api/super-admin/tenants/${tenant.id}/branding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
      await fetch(`/api/super-admin/tenants/${tenant.id}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modulesEnabled: nextModules }),
      });
      await loadTenant();
    } finally {
      setSavingModules(false);
    }
  };

  const updateStatus = async (status: "active" | "suspended") => {
    if (!tenant) return;
    setSavingStatus(true);
    try {
      await fetch(`/api/super-admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      await loadTenant();
    } finally {
      setSavingStatus(false);
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
            onChange={(e) => updateStatus(e.target.value === "suspended" ? "suspended" : "active")}
            disabled={savingStatus}
          >
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="card p-6 space-y-4">
          <div>
            <h3 className="section-title">Branding</h3>
            <p className="section-subtitle">Super Admin only. Logo updates propagate to all dashboards.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="w-full md:w-[240px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
              {tenant.brand?.logoUrl ? (
                <img
                  src={tenant.brand.logoUrl}
                  alt={tenant.brand.name}
                  className="h-24 w-full object-contain"
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
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              />
              <button
                className="rounded-xl bg-[var(--erp-blue)] px-4 py-2 text-sm font-semibold text-white"
                onClick={updateBranding}
                disabled={savingBrand}
              >
                {savingBrand ? "Saving..." : "Save Branding"}
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
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h3 className="section-title">Modules Enabled</h3>
          <p className="section-subtitle">Toggle sellable modules instantly across tenant navigation.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {Object.entries(moduleGroups).map(([group, modules]) => (
            <div key={group} className="rounded-2xl border border-[var(--border-subtle)] p-4">
              <div className="text-sm font-semibold mb-3">{group}</div>
              <div className="space-y-3">
                {modules.map((moduleKey) => (
                  <label key={moduleKey} className="flex items-center justify-between text-sm">
                    <span>{moduleKey}</span>
                    <input
                      type="checkbox"
                      checked={moduleState[moduleKey] !== false}
                      onChange={(e) => {
                        const nextModules = { ...moduleState, [moduleKey]: e.target.checked };
                        setTenant((prev) => (prev ? { ...prev, modulesEnabled: nextModules } : prev));
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
            {savingModules ? "Saving..." : "Save Modules"}
          </button>
        </div>
      </div>
    </div>
  );
}
