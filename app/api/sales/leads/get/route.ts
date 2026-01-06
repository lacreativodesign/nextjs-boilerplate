import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeStage, parseString, requireSalesRead, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const leadId = parseString(searchParams.get("leadId"), "");
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "Lead id is required." }, { status: 400 });
    }

    const doc = await adminDb.collection("leads").doc(leadId).get();
    if (!doc.exists) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    const data = doc.data() || {};
    if (data.tenantId && data.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (auth.user.role === "sales" && data.ownerId !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const lead = {
      id: doc.id,
      companyName: String(data.companyName || ""),
      contactName: String(data.contactName || data.name || ""),
      contactEmail: String(data.contactEmail || data.email || ""),
      contactPhone: String(data.contactPhone || data.phone || ""),
      disposition: String(data.disposition || ""),
      expectedValueUsd: Number(data.expectedValueUsd || 0),
      packageName: String(data.packageName || ""),
      interestedServices: Array.isArray(data.interestedServices) ? data.interestedServices.map(String) : [],
      probability: Number(data.probability || 0),
      lastContactedAt: toISO(data.lastContactedAt),
      nextFollowUpAt: toISO(data.nextFollowUpAt),
      source: String(data.source || ""),
      notes: String(data.notes || ""),
      stage: normalizeStage(data.stage || "New Lead"),
      ownerId: data.ownerId || null,
      ownerName: data.ownerName || null,
      createdById: data.createdById || null,
      createdAt: toISO(data.createdAt),
      updatedAt: toISO(data.updatedAt),
    };

    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    console.error("sales lead get error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load lead." }, { status: 500 });
  }
}
