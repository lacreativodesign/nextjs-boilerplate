import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { isSales, normalizeStage, requireSalesRead, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || "";
    const salesRep = isSales(role);
    const tenantId = auth.user.tenantId || DEFAULT_TENANT_ID;

    const leadSnaps = salesRep
      ? await Promise.all([
          adminDb.collection("leads").where("isDeleted", "==", false).where("ownerId", "==", auth.user.uid).limit(500).get(),
          adminDb.collection("leads").where("isDeleted", "==", false).where("createdBy", "==", auth.user.uid).limit(500).get(),
        ])
      : await Promise.all([
          adminDb.collection("leads").where("isDeleted", "==", false).limit(500).get(),
          Promise.resolve(null),
        ]);

    const leadIds = new Set<string>();
    leadSnaps.forEach((snap) => {
      if (!snap) return;
      snap.docs.forEach((doc) => {
        const data = doc.data() || {};
        const leadTenant = String(data.tenantId || DEFAULT_TENANT_ID);
        if (leadTenant === tenantId) {
          leadIds.add(doc.id);
        }
      });
    });

    const dealSnaps = salesRep
      ? await Promise.all([
          adminDb.collection("deals").where("isDeleted", "==", false).where("ownerId", "==", auth.user.uid).limit(500).get(),
          adminDb.collection("deals").where("isDeleted", "==", false).where("createdBy", "==", auth.user.uid).limit(500).get(),
        ])
      : await Promise.all([
          adminDb.collection("deals").where("isDeleted", "==", false).limit(500).get(),
          Promise.resolve(null),
        ]);

    const dealsMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    dealSnaps.forEach((snap) => {
      if (snap) snap.docs.forEach((doc) => dealsMap.set(doc.id, doc));
    });

    const matchesTenant = (doc: Record<string, any>) =>
      String(doc.tenantId || DEFAULT_TENANT_ID) === String(tenantId || DEFAULT_TENANT_ID);

    const deals = Array.from(dealsMap.values())
      .map((doc) => {
        const data = doc.data() || {};
        const listPriceUsd = Number(data.listPriceUsd || data.valueUsd || data.amountUsd || 0);
        const discountPct = Number(data.discountPct || 0);
        const discountUsd = Number(data.discountUsd || (listPriceUsd * discountPct) / 100 || 0);
        const finalPriceUsd = Number(data.finalPriceUsd || listPriceUsd - discountUsd || 0);
        const discountApproved = Boolean(data.discountApproved);
        const discountStatus = String(
          data.discountStatus || (discountPct > 0 ? (discountApproved ? "approved" : "pending") : "none")
        );
        return {
          id: doc.id,
          tenantId: data.tenantId || DEFAULT_TENANT_ID,
          dealName: String(data.dealName || ""),
          clientName: String(data.clientName || ""),
          leadName: String(data.leadName || ""),
          leadId: data.leadId || null,
          stage: normalizeStage(data.stage || "New Lead"),
          status: String(data.status || "Open"),
          valueUsd: Number(data.finalPriceUsd || data.valueUsd || data.amountUsd || 0),
          listPriceUsd,
          discountPct,
          discountUsd,
          finalPriceUsd,
          discountReason: data.discountReason || null,
          discountApproved,
          discountStatus,
          probability: Number(data.probability || 0),
          ownerId: data.ownerId || null,
          ownerName: data.ownerName || null,
          expectedCloseDate: toISO(data.expectedCloseDate),
          closedAt: toISO(data.closedAt || data.closedWonAt),
          createdAt: toISO(data.createdAt),
          updatedAt: toISO(data.updatedAt),
        };
      })
      .filter((deal) => matchesTenant(deal as Record<string, any>))
      .filter((deal) => {
        if (!salesRep) return true;
        if (deal.ownerId === auth.user.uid) return true;
        if (deal.leadId && leadIds.has(deal.leadId)) return true;
        return false;
      });

    return NextResponse.json({ ok: true, deals });
  } catch (err: any) {
    console.error("sales deals list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load deals." }, { status: 500 });
  }
}
