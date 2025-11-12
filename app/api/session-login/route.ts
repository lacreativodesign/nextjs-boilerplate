// app/api/session-login/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const COOKIE_DOMAIN = ".lacreativo.com";
const SESSION_COOKIE = "lac_session";
const ROLE_COOKIE = "lac_role";
const SESSION_DAYS = 5;

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

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 });

    const app = getAdmin();
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Verify ID token and extract UID
    const decoded = await auth.verifyIdToken(idToken, true);
    const uid = decoded.uid;

    // Fetch user role from Firestore
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "User not found in Firestore" }, { status: 404 });
    }

    const role = (snap.data()?.role || "").toLowerCase();

    // Create Firebase session cookie
    const expiresIn = SESSION_DAYS * 86400000;
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const c = cookies();

    // HTTP-only JWT cookie
    c.set({
      name: SESSION_COOKIE,
      value: sessionCookie,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      domain: COOKIE_DOMAIN,
      path: "/",
      maxAge: expiresIn / 1000,
    });

    // ✅ Role cookie (critical)
    c.set({
      name: ROLE_COOKIE,
      value: role,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      domain: COOKIE_DOMAIN,
      path: "/",
      maxAge: expiresIn / 1000,
    });

    return NextResponse.json({ ok: true, role });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}