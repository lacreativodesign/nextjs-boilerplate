import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";

export type CurrentUser = {
  uid: string;
  role: string;
  // we also spread all user doc fields into this object
  [key: string]: any;
};

// Central helper: get the currently logged in admin user
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const cookieStore = cookies();

    // Use the SAME cookie as middleware + app/page.tsx + session-login
    const sessionCookie = cookieStore.get("lac_session")?.value;
    if (!sessionCookie) return null;

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decoded.uid;

    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return null;

    const data = userDoc.data() || {};
    const role = normalizeRole((data.role as string | undefined) || "sales");

    const tenantId = (data.tenantId as string | undefined) || DEFAULT_TENANT_ID;

    return {
      uid,
      role,
      tenantId,
      ...data,
    };
  } catch (err) {
    console.error("getCurrentUser error:", err);
    return null;
  }
}

// Role checks
export function isAdminRole(role: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin";
}

export function isSuperAdmin(role: string) {
  const r = (role || "").toLowerCase();
  return r === "super_admin";
}

export function normalizeRole(role?: string) {
  return (role || "")
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/^account_manager$/, "am");
}

export function isAdminOrSuper(role: string) {
  const r = normalizeRole(role);
  return r === "admin" || r === "super_admin";
}

export function isSalesManager(role: string) {
  return normalizeRole(role) === "sales_manager";
}

export function isAccountManager(role: string) {
  return normalizeRole(role) === "am";
}

export function isProduction(role: string) {
  return normalizeRole(role) === "production";
}

export function isProductionManager(role: string) {
  return normalizeRole(role) === "production_manager";
}

export function isAmManager(role: string) {
  return normalizeRole(role) === "am_manager";
}

export async function requireAdminOrSuperAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}

export async function requireSalesManagerOrAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!isSalesManager(me.role) && !isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}

export async function requireProductionManagerOrAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!isProductionManager(me.role) && !isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}

export async function requireAmManagerOrAdmin() {
  const me = await getCurrentUser();
  if (!me) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!isAmManager(me.role) && !isAdminOrSuper(me.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user: me };
}
