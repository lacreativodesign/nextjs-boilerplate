import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const snap = await adminDb.collection("users").doc(current.uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    const data = snap.data() || {};

    return NextResponse.json({
      ok: true,
      profile: {
        emailSignatureHtml: String(data.emailSignatureHtml || ""),
      },
    });
  } catch (err) {
    console.error("profile get error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load profile." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const emailSignatureHtml = String(body?.emailSignatureHtml || "").trim();

    await adminDb.collection("users").doc(current.uid).set(
      {
        emailSignatureHtml,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("profile update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update profile." }, { status: 500 });
  }
}
