// lib/firebaseClient.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
} from "firebase/firestore";

export type UserRole =
  | "admin"
  | "sales"
  | "am"
  | "client"
  | "hr"
  | "finance"
  | "production";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const auth = getAuth(app);
const db = getFirestore(app);

const VALID_ROLES: UserRole[] = [
  "admin",
  "sales",
  "am",
  "client",
  "hr",
  "finance",
  "production",
];

export async function fetchUserRole(uid: string): Promise<UserRole> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("No user profile found in Firestore.");
  }

  const data = snap.data() as any;
  const role = (data?.role || "").toString().toLowerCase();

  if (!VALID_ROLES.includes(role as UserRole)) {
    throw new Error(`Invalid role "${role}". Contact LA CREATIVO Admin.`);
  }

  return role as UserRole;
}
