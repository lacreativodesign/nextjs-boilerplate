import {
  getNavigationForTenant,
  groupNavigationItems,
} from "@/lib/navigation/sidebarConfig";

describe("workspace navigation entitlements", () => {
  it("keeps disabled admin modules discoverable as locked destinations", () => {
    const navigation = getNavigationForTenant("admin", {
      sales: true,
      finance: false,
      hr: false,
      production: true,
      projects: true,
    });

    expect(navigation.find((item) => item.module === "sales")?.locked).toBe(
      false,
    );
    expect(navigation.find((item) => item.module === "finance")).toMatchObject({
      locked: true,
      lockReason: "Upgrade required",
    });
    expect(navigation.find((item) => item.module === "hr")?.locked).toBe(true);
  });

  it("does not apply tenant module gates to dedicated role workspaces", () => {
    const navigation = getNavigationForTenant("finance", { finance: false });
    expect(navigation.length).toBeGreaterThan(0);
    expect(navigation.every((item) => !item.locked)).toBe(true);
  });

  it("groups every role-visible route exactly once", () => {
    const navigation = getNavigationForTenant("sales", {});
    const grouped = groupNavigationItems(navigation).flatMap(
      (group) => group.items,
    );
    expect(grouped).toHaveLength(navigation.length);
    expect(new Set(grouped.map((item) => item.id))).toEqual(
      new Set(navigation.map((item) => item.id)),
    );
  });
});
