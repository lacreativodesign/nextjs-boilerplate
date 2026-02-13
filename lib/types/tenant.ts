export interface TenantLateFeesSettings {
  enabled: boolean;
  type: "percentage" | "fixed";
  value: number;
  gracePeriodDays: number;
}

export type SsoProviderType = "google" | "microsoft" | "okta" | "auth0";

export interface TenantSsoConnection {
  provider: SsoProviderType;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  tenantHint?: string | null;
  allowedDomains: string[];
  autoProvision: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Tenant {
  id: string;
  name: string;
  lateFeesSettings?: TenantLateFeesSettings;
}
