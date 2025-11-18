// app/api/session-login/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// 🔐 Cookie settings
const COOKIE_NAME = "lac_session";
const COOKIE_DOMAIN = ".lacreativo.com"; // works on subdomains
const SESSION_DAYS = 5; // keep users signed in for 5 days

let adminApp: App | null = null;
let adminDb: FirebaseFirestore.Firestore | null = null;

// ✅ Initialize Firebase Admin ONLY once
function getAdmin() {
  if (!adminApp) {
    if (!getApps().length) {
      adminApp = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
        }),
      });
    } else {
      adminApp = getApps()[0]!;
    }
    adminDb = getFirestore(adminApp);
  }
  return { adminApp: adminApp!, adminDb: adminDb! };
}

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json();
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    const { adminApp, adminDb } = getAdmin();
    const auth = getAuth(adminApp);

    // 1) Verify Firebase ID token (get user info)
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email || "";
    const name =
      (decoded as any).name ||
      (decoded as any).displayName ||
      email.split("@")[0] ||
      "Unknown User";

    // 2) Get role from Firestore `users` collection
    let role = "client";
    try {
      const userSnap = await adminDb.collection("users").doc(uid).get();
      if (userSnap.exists) {
        const data = userSnap.data() || {};
        if (data.role) {
          role = String(data.role).toLowerCase();
        }
      }
    } catch (err) {
      console.error("Error reading user role for attendance:", err);
    }

    // 3) Create session cookie
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

    // 4) Auto attendance logging (non-blocking)
    try {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

      const ipHeader =
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "";
      const ipAddress = ipHeader.split(",")[0].trim() || "unknown";

      const userAgent = req.headers.get("user-agent") || "unknown";

      // 4A) Per-user daily attendance
      await adminDb
        .collection("attendance")
        .doc(uid)
        .collection("days")
        .doc(dateStr)
        .set(
          {
            userId: uid,
            name,
            email,
            role,
            date: dateStr,
            loginTime: now,
            status: "Present (Auto)",
            ipAddress,
            userAgent,
          },
          { merge: true }
        );

      // 4B) Global attendance logs
      await adminDb.collection("attendance_logs").add({
        timestamp: now,
        date: dateStr,
        userId: uid,
        name,
        email,
        role,
        action: "login",
        status: "Present (Auto)",
        ipAddress,
        userAgent,
      });
    } catch (attendanceErr) {
      // Do NOT block login if attendance write fails
      console.error("Attendance logging failed:", attendanceErr);
    }

    // 5) Done
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("SESSION LOGIN ERROR:", e);
    return NextResponse.json({ error: e?.message || "Session error" }, { status: 400 });
  }
      }
