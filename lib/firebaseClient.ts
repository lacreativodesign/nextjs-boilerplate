import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export type UserRole =
  | "admin"
  | "sales"
  | "am"
  | "client"
  | "production"
  | "hr"
  | "finance";

export async function fetchUserRole(uid: string): Promise<UserRole | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const role = (snap.data().role || "").toString().toLowerCase();
  const VALID = ["admin", "sales", "am", "client", "production", "hr", "finance"];

  if (!VALID.includes(role)) {
    throw new Error(`Invalid role "${role}". Contact LA CREATIVO Admin.`);
  }

  return role as UserRole;
}
