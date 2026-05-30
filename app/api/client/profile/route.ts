import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getSessionUser, isClientRole } from "../_utils";
import { normalizeOptionalSlug, normalizeSlugArray, slugify } from "@/lib/segments";

export const dynamic = "force-dynamic";

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isClientRole(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const clientId = String(me.clientId || "").trim();
  if (!clientId) return NextResponse.json({ ok: false, error: "Client profile not found" }, { status: 404 });

  try {
    const snap = await db.collection("clients").doc(clientId).get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Client profile not found" }, { status: 404 });

    const data = snap.data() || {};
    if ((data as unknown).deletedAt) {
      return NextResponse.json({ ok: false, error: "Client profile not found" }, { status: 404 });
    }
    if (String((data as unknown).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, client: { id: snap.id, ...data } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isClientRole(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const clientId = String(me.clientId || "").trim();
  if (!clientId) return NextResponse.json({ ok: false, error: "Client profile not found" }, { status: 404 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  try {
    const ref = db.collection("clients").doc(clientId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: "Client profile not found" }, { status: 404 });
    if (String((snap.data() || {}).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if ((body as Record<string, unknown>)?.industry !== undefined) updateData.industry = cleanString((body as Record<string, unknown>).industry);
    if ((body as Record<string, unknown>)?.businessType !== undefined) updateData.businessType = cleanString((body as Record<string, unknown>).businessType);
    if ((body as Record<string, unknown>)?.country !== undefined) updateData.country = cleanString((body as Record<string, unknown>).country);
    if ((body as Record<string, unknown>)?.city !== undefined) updateData.city = cleanString((body as Record<string, unknown>).city);
    if ((body as Record<string, unknown>)?.timezone !== undefined) updateData.timezone = cleanString((body as Record<string, unknown>).timezone);

    if ((body as Record<string, unknown>)?.employeeCountRange !== undefined) updateData.employeeCountRange = cleanString((body as Record<string, unknown>).employeeCountRange) || null;
    if ((body as Record<string, unknown>)?.yearsInBusinessRange !== undefined) {
      updateData.yearsInBusinessRange = cleanString((body as Record<string, unknown>).yearsInBusinessRange) || null;
    }

    if ((body as Record<string, unknown>)?.segmentServices !== undefined) updateData.segmentServices = normalizeSlugArray((body as Record<string, unknown>).segmentServices);
    if ((body as Record<string, unknown>)?.segmentIndustry !== undefined) updateData.segmentIndustry = normalizeOptionalSlug((body as Record<string, unknown>).segmentIndustry);
    if ((body as Record<string, unknown>)?.segmentBusinessType !== undefined) updateData.segmentBusinessType = normalizeOptionalSlug((body as Record<string, unknown>).segmentBusinessType);

    if ((body as Record<string, unknown>)?.segmentGeo !== undefined) {
      updateData.segmentGeo = normalizeOptionalSlug((body as Record<string, unknown>).segmentGeo);
    } else if ((body as Record<string, unknown>)?.country !== undefined) {
      const derived = slugify(cleanString((body as Record<string, unknown>).country));
      updateData.segmentGeo = derived || null;
    }

    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updateData.lastActivity = admin.firestore.FieldValue.serverTimestamp();

    await ref.set(updateData, { merge: true });

    return NextResponse.json({ ok: true, id: clientId });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Failed to update profile" }, { status: 500 });
  }
}
