import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function verifySession(sessionCookie: string) {
  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  return decoded;
}

export async function getUserProfile(uid: string) {
  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return snap.data();
}