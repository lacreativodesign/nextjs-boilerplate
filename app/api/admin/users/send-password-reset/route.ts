import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminRole } from "../../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current || !isAdminRole(current.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || "").trim();
    const emailInput = String(body?.email || "").trim().toLowerCase();

    let email = emailInput;
    let userId = uid;

    if (!email) {
      if (!uid) {
        return NextResponse.json({ ok: false, error: "Email or uid is required." }, { status: 400 });
      }
      const user = await adminAuth.getUser(uid).catch(() => null);
      if (!user?.email) {
        return NextResponse.json({ ok: false, error: "User email not found." }, { status: 404 });
      }
      email = user.email.toLowerCase();
      userId = user.uid;
    } else if (!userId) {
      const user = await adminAuth.getUserByEmail(email).catch(() => null);
      if (user?.uid) {
        userId = user.uid;
      }
    }

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
    }

    const resetLink = await adminAuth.generatePasswordResetLink(email);

    await adminDb.collection("emails").add({
      templateKey: "admin_password_reset",
      payload: {
        email,
        resetLink,
        uid: userId || null,
      },
      requestedBy: current.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      ...(process.env.NODE_ENV !== "production" ? { resetLink } : {}),
    });
  } catch (err: any) {
    console.error("SEND PASSWORD RESET ERROR:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
