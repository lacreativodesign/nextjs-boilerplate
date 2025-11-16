// lib/serverAuth.ts

import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

const SESSION_COOKIE_NAME = "lac_session";

// IMPORTANT: disable Vercel prerendering on server functions
export const dynamic = "force-dynamic";

/**
 * Returns user profile (server-side)
 */
export async function getUserProfile() {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) return null;

    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);

    const snap = await adminDb()
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (!snap.exists) return null;

    return { uid: decoded.uid, ...(snap.data() as any) };
  } catch (err) {
    console.error("getUserProfile ERROR:", err);
    return null;
  }
}
