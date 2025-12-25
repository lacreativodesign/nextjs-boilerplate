import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export type SessionUser = {
  uid: string;
  role: string;
  clientId?: string;
  [key: string]: any;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get("lac_session")?.value;
    if (!sessionCookie) return null;

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const uid = decoded.uid;

    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return null;

    const data = userDoc.data() || {};
    const role = (data.role as string | undefined)?.toLowerCase() || "client";

    return {
      uid,
      role,
      ...data,
    } as SessionUser;
  } catch (err) {
    console.error("getSessionUser error:", err);
    return null;
  }
}

export function isClientRole(role: string) {
  return String(role || "").toLowerCase() === "client";
}
