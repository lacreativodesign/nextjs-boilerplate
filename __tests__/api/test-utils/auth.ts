export type MockUser = {
  uid: string;
  tenantId: string;
  role: string;
  name?: string;
  email?: string;
};

export function financeUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    uid: "finance_user",
    tenantId: "tenant_a",
    role: "finance",
    name: "Finance User",
    email: "finance@example.com",
    ...overrides,
  };
}

export function adminUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    uid: "admin_user",
    tenantId: "tenant_a",
    role: "admin",
    name: "Admin User",
    email: "admin@example.com",
    ...overrides,
  };
}
