import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export type CurrentUser = {
  uid: string;
  role: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) return null;

  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  const snap = await adminDb.collection("users").doc(decoded.uid).get();
  const data = snap.data() || {};

  return {
    uid: decoded.uid,
    role: data.role || "sales",
  };
}

export function isAdminRole(role: string) {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: string) {
  return role === "super_admin";
}
