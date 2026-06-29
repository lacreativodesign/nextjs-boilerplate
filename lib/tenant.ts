import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";

export { DEFAULT_TENANT_ID };

export function normalizeTenantId(t?: string | null): string {
  return (t || DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
}

export function docTenantId(doc: any): string {
  if (!doc) return DEFAULT_TENANT_ID;
  return normalizeTenantId(doc.tenantId);
}
