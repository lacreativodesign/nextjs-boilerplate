export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "bizosto";

export const DEFAULT_TENANT_BRAND = {
  name: "BIZOSTO",
  logoUrl: null as string | null,
  locked: true,
};

export const DEFAULT_MODULES = {
  admin: true,
  clients: true,
  users: true,
  sales: true,
  accountManager: true,
  production: true,
  finance: true,
  humanResource: true,
  dashboard: true,
  notifications: true,
  salesManager: true,
  headOfProjectManagement: true,
  headOfProduction: true,
};
