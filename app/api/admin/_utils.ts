import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

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
    const role = (data.role as string | undefined)?.toLowerCase() || "sales";

    return {
      uid,
      role,
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
  return (role || "").toLowerCase();
}

export function isAdminOrSuper(role: string) {
  const r = normalizeRole(role);
  return r === "admin" || r === "super_admin";
}

export function isSalesManager(role: string) {
  return normalizeRole(role) === "sales_manager";
}

export function isAccountManager(role: string) {
  return normalizeRole(role) === "account_manager";
}

export function isProduction(role: string) {
  return normalizeRole(role) === "production";
}
