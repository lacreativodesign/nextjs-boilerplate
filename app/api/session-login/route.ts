// app/api/session-login/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const COOKIE_NAME = "lac_session";
const COOKIE_DOMAIN = ".lacreativo.com"; // works on both subdomains
const SESSION_DAYS = 5; // keep users signed in for 5 days

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
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    const adminApp = getAdmin();
    const auth = getAuth(adminApp);

    const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000; // ms
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const c = cookies();
    c.set({
      name: COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      domain: COOKIE_DOMAIN,
      maxAge: expiresIn / 1000, // seconds
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Session error" }, { status: 400 });
  }
}
