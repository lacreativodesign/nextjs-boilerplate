// app/api/session-login/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { AppError, resolveErrorResponse } from "@/lib/errors";
import { checkRateLimit, getClientIp } from "@/lib/security";
import { createSession } from "@/lib/auth/session";
import { SESSION_CONFIG } from "@/lib/auth/sessionConfig";
import { AuditLogger } from "@/lib/audit/audit-logger";
import { hashSessionToken } from "@/lib/auth/session";

// 🔐 Cookie settings
const COOKIE_NAME = "lac_session";
const COOKIE_DOMAIN = ".lacreativo.com"; // works on subdomains
const DEFAULT_SESSION_DAYS = SESSION_CONFIG.maxAge / (24 * 60 * 60 * 1000);
const REMEMBER_SESSION_DAYS = SESSION_CONFIG.rememberMeMaxAge / (24 * 60 * 60 * 1000);

let adminApp: App | null = null;
let adminDb: FirebaseFirestore.Firestore | null = null;

// ✅ Initialize Firebase Admin ONLY once
function getAdmin() {
  if (!adminApp) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error("Missing Firebase Admin credentials.");
    }
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
    await checkRateLimit(req, "strict");
    const { idToken, rememberMe } = await req.json();
    if (!idToken) {
      throw new AppError({ message: "Missing idToken", code: "VALIDATION_ERROR", status: 400 });
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
    let tenantId = "";
    try {
      const userSnap = await adminDb.collection("users").doc(uid).get();
      if (userSnap.exists) {
        const data = userSnap.data() || {};
        if (data.role) {
          role = String(data.role).toLowerCase();
        }
        tenantId = String(data.tenantId || "");
      }
    } catch (err) {
      console.error("Error reading user role for attendance:", err);
    }

    // 3) Create session cookie
    const expiresIn =
      (rememberMe ? REMEMBER_SESSION_DAYS : DEFAULT_SESSION_DAYS) * 24 * 60 * 60 * 1000; // ms
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const c = cookies();
    const cookieOptions: Parameters<typeof c.set>[0] = {
      name: COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      domain: COOKIE_DOMAIN,
    };

    cookieOptions.maxAge = expiresIn / 1000;

    c.set(cookieOptions);

    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || "unknown";

    await createSession(uid, {
      rememberMe: Boolean(rememberMe),
      sessionCookie,
      ip: ipAddress,
      userAgent,
      db: adminDb,
    });

    try {
      await AuditLogger.logSuccess({
        tenantId: tenantId || "unknown",
        userId: uid,
        userEmail: email,
        userName: name,
        action: "login",
        resource: "user",
        resourceId: uid,
        metadata: {
          ip: ipAddress,
          userAgent,
          sessionId: hashSessionToken(sessionCookie),
        },
      });
    } catch (auditError) {
      console.error("audit login error:", auditError);
    }

    // 4) Auto attendance logging (non-blocking)
    try {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

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
    try {
      await AuditLogger.log({
        tenantId: "unknown",
        userId: "unknown",
        userEmail: "",
        userName: "",
        action: "login_failed",
        resource: "user",
        status: "failure",
        errorMessage: e?.message || "Login failed",
        metadata: {
          ip: getClientIp(req),
          userAgent: req.headers.get("user-agent") || "unknown",
        },
      });
    } catch (auditError) {
      console.error("audit login failure error:", auditError);
    }
    console.error("SESSION LOGIN ERROR:", e);
    const { status, body } = resolveErrorResponse(e, {
      fallbackMessage: "Session error",
      fallbackCode: "INTERNAL_SERVER_ERROR",
      fallbackStatus: 400,
      requestId: req.headers.get("x-request-id") || undefined,
    });
    return NextResponse.json(body, { status });
  }
}
