import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_MODULES, DEFAULT_TENANT_BRAND, DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { PLAN_MODULES } from "@/app/config/plans";

export type TenantModules = typeof DEFAULT_MODULES;

export type TenantRecord = {
  name: string;
  slug: string;
  status: "active" | "suspended";
  brand: { name: string; logoUrl: string | null; locked: true };
  modulesEnabled: TenantModules;
  plan?: "starter" | "pro" | "enterprise";
  modules?: Record<string, boolean>;
  planSetBy?: { uid: string; role: "super_admin" };
  planUpdatedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  updatedBy?: string | null;
};

export type CurrentUser = {
  uid: string;
  role: string;
  tenantId?: string;
  status?: string;
  displayName?: string;
  email?: string;
  [key: string]: any;
};

function readCookie(req: NextRequest | undefined, name: string) {
  if (req) return req.cookies.get(name)?.value || null;
  return cookies().get(name)?.value || null;
}

export function isSuperAdmin(user: Pick<CurrentUser, "role">) {
  return (user.role || "").toLowerCase() === "super_admin";
}

export function isAdmin(user: Pick<CurrentUser, "role">) {
  const role = (user.role || "").toLowerCase();
  return role === "admin" || role === "super_admin";
}

export function isSales(user: Pick<CurrentUser, "role">) {
  const role = (user.role || "").toLowerCase();
  return role === "sales";
}

export async function getCurrentUserOrThrow(req?: NextRequest): Promise<CurrentUser> {
  const sessionCookie = readCookie(req, "lac_session");
  if (!sessionCookie) {
    throw new Error("Unauthorized");
  }

  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  const uid = decoded.uid;

  const userDoc = await adminDb.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new Error("User not found");
  }

  const data = userDoc.data() || {};
  const role = (data.role as string | undefined)?.toLowerCase() || "sales";
  const tenantId = (data.tenantId as string | undefined) || DEFAULT_TENANT_ID;

  return {
    uid,
    role,
    tenantId,
    ...data,
  };
}

export async function ensureDefaultTenant() {
  const ref = adminDb.collection("tenants").doc(DEFAULT_TENANT_ID);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as TenantRecord;

  const now = new Date().toISOString();
  const payload: TenantRecord = {
    name: "LA CREATIVO",
    slug: "la-creativo",
    status: "active",
    brand: DEFAULT_TENANT_BRAND,
    modulesEnabled: DEFAULT_MODULES,
    plan: "pro",
    modules: PLAN_MODULES.pro,
    planSetBy: { uid: "system", role: "super_admin" },
    planUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    updatedBy: "system",
  };

  await ref.set(payload, { merge: true });
  return payload;
}

export async function getTenantIdForRequestOrThrow(req?: NextRequest): Promise<string> {
  const user = await getCurrentUserOrThrow(req);
  let tenantId = user.tenantId || DEFAULT_TENANT_ID;

  if (isSuperAdmin(user)) {
    const cookieTenant = readCookie(req, "bizosto_tenant");
    const queryTenant = req?.nextUrl?.searchParams?.get("tenantId") || null;
    tenantId = queryTenant || cookieTenant || tenantId;
  }

  if (!tenantId) {
    tenantId = DEFAULT_TENANT_ID;
  }

  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  let tenantSnap = await tenantRef.get();

  if (!tenantSnap.exists && tenantId === DEFAULT_TENANT_ID) {
    await ensureDefaultTenant();
    tenantSnap = await tenantRef.get();
  }

  if (!tenantSnap.exists) {
    throw new Error("Tenant not found");
  }

  const tenant = tenantSnap.data() as TenantRecord;
  if (tenant.status === "suspended" && !isSuperAdmin(user)) {
    throw new Error("Tenant suspended");
  }

  return tenantId;
}

export async function getTenantRecordOrThrow(tenantId: string): Promise<TenantRecord> {
  const snap = await adminDb.collection("tenants").doc(tenantId).get();
  if (!snap.exists) {
    throw new Error("Tenant not found");
  }
  return snap.data() as TenantRecord;
}

export async function requireModuleOrThrow(tenantId: string, moduleKey: keyof TenantModules) {
  const tenant = await getTenantRecordOrThrow(tenantId);
  const enabled = tenant.modulesEnabled?.[moduleKey];
  if (!enabled) {
    throw new Error(`Module disabled: ${moduleKey}`);
  }
  return true;
}
