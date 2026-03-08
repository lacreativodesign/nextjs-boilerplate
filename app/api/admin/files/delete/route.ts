import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "../../_utils";

export const runtime = "nodejs";

function cleanString(value: any) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const fileId = cleanString(body?.id);

    if (!fileId) {
      return NextResponse.json({ ok: false, error: "File id is required." }, { status: 400 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await adminDb.collection("files").doc(fileId).set(
      {
        isDeleted: true,
        isLatest: false,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("files/delete error:", err);
    return NextResponse.json({ ok: false, error: "Unable to delete file right now." }, { status: 500 });
  }
}
