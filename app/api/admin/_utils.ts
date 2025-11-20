import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

// Current Logged-in User
export async function getCurrentUser() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get("session")?.value;
    if (!session) return null;

    const decoded = await adminAuth.verifySessionCookie(session, true);

    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) return null;

    return { uid: decoded.uid, ...userDoc.data() };
  } catch (err) {
    return null;
  }
}

// Role Check
export function isAdminRole(role: string) {
  return role === "admin" || role === "super_admin";
}
