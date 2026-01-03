import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
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
      if (snap) snap.docs.forEach((doc) => leadIds.add(doc.id));
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

    const deals = Array.from(dealsMap.values())
      .map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          dealName: String(data.dealName || ""),
          clientName: String(data.clientName || ""),
          leadName: String(data.leadName || ""),
          leadId: data.leadId || null,
          stage: normalizeStage(data.stage || "New Lead"),
          status: String(data.status || "Open"),
          valueUsd: Number(data.valueUsd || data.amountUsd || 0),
          probability: Number(data.probability || 0),
          ownerId: data.ownerId || null,
          ownerName: data.ownerName || null,
          expectedCloseDate: toISO(data.expectedCloseDate),
          closedAt: toISO(data.closedAt || data.closedWonAt),
          createdAt: toISO(data.createdAt),
          updatedAt: toISO(data.updatedAt),
        };
      })
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
