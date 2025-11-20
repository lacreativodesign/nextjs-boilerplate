import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

// Fetch current authenticated user from session token
export async function getCurrentUser() {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get("session")?.value;

    if (!token) return null;

    const decoded = await adminAuth.verifySessionCookie(token, true);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) return null;

    return {
      uid: decoded.uid,
      ...userDoc.data(),
    };
  } catch {
    return null;
  }
}

// Check if user is Admin or Super Admin
export function isAdminRole(role: string) {
  return role === "admin" || role === "super_admin";
}
