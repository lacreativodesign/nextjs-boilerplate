// lib/firebaseClient.ts
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { app } from "./firebase"; // your initialized client app

const VALID_ROLES = ["admin", "sales", "am", "hr", "production", "client", "finance"] as const;
export type UserRole = (typeof VALID_ROLES)[number];

export async function fetchUserRole(uid: string): Promise<UserRole> {
  const db = getFirestore(app);
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("No user profile found. Contact LA CREATIVO Admin.");
  }

  const role = (snap.data().role || "").toString().toLowerCase();

  if (!VALID_ROLES.includes(role as UserRole)) {
    throw new Error(Invalid role "${role}". Contact LA CREATIVO Admin.);
  }

  return role as UserRole;
}