import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { requireClient } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: any) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  try {
    const ref = db.collection("clients").doc(auth.clientId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Client profile not found" }, { status: 404 });
    if (String((snap.data() || {}).tenantId || "") !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const updateData: Record<string, any> = {};

    if (body?.companyName !== undefined) updateData.companyName = cleanString(body.companyName);
    if (body?.contactName !== undefined) updateData.primaryContactName = cleanString(body.contactName);
    if (body?.phone !== undefined) updateData.primaryContactPhone = cleanString(body.phone);
    if (body?.timezone !== undefined) updateData.timezone = cleanString(body.timezone);
    if (body?.address !== undefined) updateData.address = cleanString(body.address);
    if (body?.city !== undefined) updateData.city = cleanString(body.city);
    if (body?.country !== undefined) updateData.country = cleanString(body.country);

    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.lastActivity = admin.firestore.FieldValue.serverTimestamp();

    await ref.set(updateData, { merge: true });

    return NextResponse.json({ ok: true, id: auth.clientId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Failed to update profile" }, { status: 500 });
  }
}
