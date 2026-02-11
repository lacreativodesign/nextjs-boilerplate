export interface TenantLateFeesSettings {
  enabled: boolean;
  type: "percentage" | "fixed";
  value: number;
  gracePeriodDays: number;
}

export interface Tenant {
  id: string;
  name: string;
  lateFeesSettings?: TenantLateFeesSettings;
}
