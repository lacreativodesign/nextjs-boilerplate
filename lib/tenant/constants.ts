import { DEFAULT_TENANT_ID } from "@/lib/env";

export { DEFAULT_TENANT_ID };

export const DEFAULT_TENANT_BRAND = {
  name: "LA CREATIVO",
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
