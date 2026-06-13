import { getNavigationForRole } from "@/lib/navigation/sidebarConfig";

// Expected, verified-correct ordered hrefs per role. These lists are the
// source of truth — if a test fails, the navigation config drifted, not these.
const EXPECTED_HREFS: Record<string, string[]> = {
  super_admin: [
    "/admin",
    "/admin/users",
    "/admin/clients",
    "/admin/projects",
    "/admin/finance",
    "/admin/hr",
    "/admin/production",
    "/admin/leads",
    "/admin/sales",
    "/admin/reports",
    "/admin/settings",
    "/help",
    "/super_admin",
  ],
  finance: [
    "/finance",
    "/finance/invoices",
    "/finance/payments",
    "/finance/payroll",
    "/finance/reports",
    "/finance/tax",
    "/finance/settings",
  ],
  hr: ["/hr", "/hr/employees", "/hr/attendance", "/hr/leave", "/hr/payroll", "/hr/performance"],
  sales: [
    "/sales",
    "/sales/leads",
    "/sales/deals",
    "/sales/pipeline",
    "/sales/follow-ups",
    "/sales/targets",
    "/clients",
  ],
  sales_manager: [
    "/sales_manager",
    "/sales_manager/team",
    "/sales",
    "/sales/leads",
    "/sales/deals",
    "/sales/pipeline",
    "/sales/targets",
    "/reports",
  ],
  am: ["/am", "/am/clients", "/am/projects", "/am/pipeline", "/am/change-requests", "/am/files"],
  am_manager: ["/am_manager", "/am_manager/team", "/reports"],
  production: ["/production", "/production/jobs", "/production/workload", "/production/qa", "/production/files"],
  production_manager: ["/production_manager", "/production_manager/team", "/reports"],
  client: [
    "/client",
    "/client/projects",
    "/client/files",
    "/client/change-requests",
    "/client/billing",
    "/client/profile",
  ],
};

const EXACT_ROLES = Object.keys(EXPECTED_HREFS);
const ALL_ROLES = [...EXACT_ROLES, "admin"];

describe("sidebar navigation per role", () => {
  // Lock the exact ordered href list (contents AND order) for each role.
  for (const role of EXACT_ROLES) {
    it(`returns the exact ordered hrefs for ${role}`, () => {
      const hrefs = getNavigationForRole(role).map((item) => item.href);
      expect(hrefs).toEqual(EXPECTED_HREFS[role]);
    });
  }

  // admin has module-gated items, so assert a looser invariant.
  it("returns a non-empty admin nav that includes the core links", () => {
    const items = getNavigationForRole("admin");
    expect(items.length).toBeGreaterThan(0);
    const hrefs = items.map((item) => item.href);
    for (const href of ["/dashboard", "/users", "/clients", "/reports"]) {
      expect(hrefs).toContain(href);
    }
    for (const item of items) {
      expect(item.roles).toContain("admin");
    }
  });

  it("gives every nav item a non-empty, unique id within each role", () => {
    for (const role of ALL_ROLES) {
      const ids = getNavigationForRole(role).map((item) => item.id);
      for (const id of ids) {
        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
      }
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("never returns an item that isn't scoped to the requested role", () => {
    for (const role of ALL_ROLES) {
      for (const item of getNavigationForRole(role)) {
        expect(item.roles).toContain(role);
      }
    }
  });
});
