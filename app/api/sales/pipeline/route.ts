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

    const dealSnaps = salesRep
      ? await Promise.all([
          adminDb
            .collection("deals")
            .where("isDeleted", "==", false)
            .where("tenantId", "==", auth.user.tenantId)
            .where("ownerId", "==", auth.user.uid)
            .limit(500)
            .get(),
          adminDb
            .collection("deals")
            .where("isDeleted", "==", false)
            .where("tenantId", "==", auth.user.tenantId)
            .where("createdBy", "==", auth.user.uid)
            .limit(500)
            .get(),
        ])
      : await Promise.all([
          adminDb
            .collection("deals")
            .where("isDeleted", "==", false)
            .where("tenantId", "==", auth.user.tenantId)
            .limit(500)
            .get(),
          Promise.resolve(null),
        ]);

    const dealsMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    dealSnaps.forEach((snap) => {
      if (snap) snap.docs.forEach((doc) => dealsMap.set(doc.id, doc));
    });

    const deals = Array.from(dealsMap.values()).map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        dealName: String(data.dealName || ""),
        clientName: String(data.clientName || ""),
        leadId: data.leadId || null,
        stage: normalizeStage(data.stage || "New Lead"),
        valueUsd: Number(data.valueUsd || data.amountUsd || 0),
        probability: Number(data.probability || 0),
        ownerId: data.ownerId || null,
        ownerName: data.ownerName || null,
        leadName: data.leadName || null,
        leadEmail: data.leadEmail || null,
        leadPhone: data.leadPhone || null,
        expectedCloseDate: toISO(data.expectedCloseDate),
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
