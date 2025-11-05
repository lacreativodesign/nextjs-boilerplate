// lib/firebaseClient.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Fetch role from Firestore (/users/{uid}.role)
export async function fetchUserRole(uid: string): Promise<string | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return data?.role ?? null;
}

// Ensure a /users doc exists on first login
export async function ensureUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      displayName: user.displayName || "",
      role: "client", // default for first-time Google/email signups (adjust later in Admin)
      createdAt: Date.now(),
      status: "active",
    });
  }
}

// Helpers to sign in
export async function signInWithGoogle() {
  const res = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile({
    uid: res.user.uid,
    email: res.user.email,
    displayName: res.user.displayName,
  });
  return res.user;
}

export async function signInWithEmail(email: string, password: string) {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserProfile({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
  });
  return user;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name?: string
) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(user, { displayName: name });
  await ensureUserProfile({
    uid: user.uid,
    email: user.email,
    displayName: name || user.displayName,
  });
  return user;
}

export { onAuthStateChanged, signOut };
