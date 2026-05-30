import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { requireClient } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: unknown = null;
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

    const updateData: Record<string, unknown> = {};

    if ((body as Record<string, unknown>)?.companyName !== undefined) updateData.companyName = cleanString((body as Record<string, unknown>).companyName);
    if ((body as Record<string, unknown>)?.contactName !== undefined) updateData.primaryContactName = cleanString((body as Record<string, unknown>).contactName);
    if ((body as Record<string, unknown>)?.phone !== undefined) updateData.primaryContactPhone = cleanString((body as Record<string, unknown>).phone);
    if ((body as Record<string, unknown>)?.timezone !== undefined) updateData.timezone = cleanString((body as Record<string, unknown>).timezone);
    if ((body as Record<string, unknown>)?.address !== undefined) updateData.address = cleanString((body as Record<string, unknown>).address);
    if ((body as Record<string, unknown>)?.city !== undefined) updateData.city = cleanString((body as Record<string, unknown>).city);
    if ((body as Record<string, unknown>)?.country !== undefined) updateData.country = cleanString((body as Record<string, unknown>).country);

    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.lastActivity = admin.firestore.FieldValue.serverTimestamp();

    await ref.set(updateData, { merge: true });

    return NextResponse.json({ ok: true, id: auth.clientId });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Failed to update profile" }, { status: 500 });
  }
}
