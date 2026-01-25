import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSalesManager, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("deals").where("isDeleted", "==", false).limit(500).get();

    const deals = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        dealName: String(data.dealName || ""),
        clientName: String(data.clientName || ""),
        stage: String(data.stage || "New Lead"),
        valueUsd: Number(data.valueUsd || 0),
        probability: Number(data.probability || 0),
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
    console.error("sales manager pipeline list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load pipeline." }, { status: 500 });
  }
}
