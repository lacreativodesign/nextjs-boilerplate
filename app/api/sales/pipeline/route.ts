import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { isSales, normalizeStage, requireSalesRead, toISO } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || "";
    const salesRep = isSales(role);

    const tenantId = auth.user.tenantId || "";
    const leadSnaps = salesRep
      ? await Promise.all([
          adminDb
            .collection("leads")
            .where("tenantId", "==", tenantId)
            .where("isDeleted", "==", false)
            .where("ownerId", "==", auth.user.uid)
            .limit(500)
            .get(),
          adminDb
            .collection("leads")
            .where("tenantId", "==", tenantId)
            .where("isDeleted", "==", false)
            .where("createdById", "==", auth.user.uid)
            .limit(500)
            .get(),
        ])
      : await Promise.all([
          adminDb.collection("leads").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(500).get(),
          Promise.resolve(null),
        ]);

    const leadMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    leadSnaps.forEach((snap) => {
      if (snap) snap.docs.forEach((doc) => leadMap.set(doc.id, doc));
    });

    const deals = Array.from(leadMap.values()).map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        dealName: String(data.companyName || data.contactName || "Lead"),
        clientName: String(data.companyName || data.contactName || ""),
        leadId: doc.id,
        stage: normalizeStage(data.stage || "New Lead"),
        valueUsd: Number(data.expectedValueUsd || 0),
        probability: Number(data.probability || 0),
        ownerId: data.ownerId || null,
        ownerName: data.ownerName || null,
        leadName: data.contactName || null,
        leadEmail: data.contactEmail || null,
        leadPhone: data.contactPhone || null,
        expectedCloseDate: toISO(data.nextFollowUpAt),
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
      };
    });

    return NextResponse.json({ ok: true, deals });
  } catch (err: any) {
    console.error("sales pipeline list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load pipeline." }, { status: 500 });
  }
}
