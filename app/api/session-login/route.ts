import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const COOKIE_NAME = "lac_session";
const COOKIE_DOMAIN = ".lacreativo.com";
const SESSION_DAYS = 5;

function getAdmin() {
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

    const auth = getAuth(getAdmin());
    const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;

    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    cookies().set({
      name: COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: COOKIE_DOMAIN,
      path: "/",
      maxAge: expiresIn / 1000,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("SESSION ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
