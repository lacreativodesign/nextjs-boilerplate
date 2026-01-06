import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { parseString, requireSalesRead, toISO } from "../../_utils";

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

    const leadSnap = await adminDb.collection("leads").doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    const lead = leadSnap.data() || {};
    if (lead.tenantId && lead.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const snap = await adminDb
      .collection("paymentRequests")
      .where("tenantId", "==", auth.user.tenantId || "")
      .where("leadId", "==", leadId)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const requests = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        packageLabel: String(data.packageLabel || ""),
        services: Array.isArray(data.services) ? data.services.map(String) : [],
        amountUsd: Number(data.amountUsd || 0),
        currency: String(data.currency || "USD"),
        status: String(data.status || "draft"),
        provider: String(data.provider || "stripe"),
        stripeCheckoutUrl: data.stripeCheckoutUrl || null,
        stripeSessionId: data.stripeSessionId || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        paidAt: toISO(data.paidAt),
      };
    });

    return NextResponse.json({ ok: true, requests });
  } catch (err) {
    console.error("sales payment request list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load payments." }, { status: 500 });
  }
}
