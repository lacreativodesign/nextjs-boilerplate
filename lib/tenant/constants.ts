export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "bizosto";

export const DEFAULT_TENANT_BRAND = {
  name: "BIZOSTO",
  logoUrl: null as string | null,
  locked: true,
};

export const DEFAULT_MODULES = {
  dashboard: true,
  clients: true,
  sales: true,
  finance: true,
  hr: true,
  production: true,
  projects: true,
  reports: true,
  notifications: true,
  admin: true,
  crm: true,
  inventory: true,
  approvals: true,
  billing: true,
  support: true,
  tax: false,
};

export const DEFAULT_ROLES = {
  admin: true,
  sales_manager: true,
  sales: true,
  am_manager: true,
  am: true,
  production_manager: true,
  production: true,
  finance: true,
  hr: true,
  client: true,
};
