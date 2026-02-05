import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireCrmUser, toIso } from "@/lib/crm";

export async function GET(req: Request) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId");

  const snap = await adminDb
    .collection("discountRequests")
    .where("tenantId", "==", auth.tenantId)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const rows = snap.docs
    .filter((doc) => {
      const data = doc.data();
      if (dealId && data.dealId !== dealId) return false;
      return true;
    })
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        dealId: String(data.dealId || ""),
        requestedBy: String(data.requestedBy || ""),
        discountPercent: Number(data.discountPercent || 0),
        reason: String(data.reason || ""),
        status: String(data.status || "pending"),
        reviewedBy: String(data.reviewedBy || ""),
        reviewedAt: toIso(data.reviewedAt),
        createdAt: toIso(data.createdAt),
      };
    });

  return NextResponse.json({ ok: true, requests: rows });
}
