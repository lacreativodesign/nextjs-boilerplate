// lib/serverAuth.ts
import { cookies } from "next/headers";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { redirect } from "next/navigation";

function getAdmin(): App {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return getApps()[0]!;
}

export async function getSessionDecoded() {
  const c = cookies();
  const token = c.get("lac_session")?.value;
  if (!token) return null;

  const app = getAdmin();
  const auth = getAuth(app);

  try {
    const decoded = await auth.verifySessionCookie(token, true);
    return decoded;
  } catch {
    return null;
  }
}

export async function getUserProfile() {
  const decoded = await getSessionDecoded();
  if (!decoded) return null;

  const app = getAdmin();
  const db = getFirestore(app);

  const snap = await db.collection("users").doc(decoded.uid).get();
  if (!snap.exists) return null;

  const data = snap.data() || {};
  const role = (data.role || "").toString().toLowerCase();

  return {
    uid: decoded.uid,
    email: decoded.email || "",
    name: data.name || "",
    role,
  };
}

export async function ensureRole(roles: string | string[]) {
  const required = Array.isArray(roles) ? roles : [roles];
  const me = await getUserProfile();
  if (!me) redirect("/login");
  if (!required.includes(me.role)) redirect(`/${me.role || "client"}`);
  return me;
}
