import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireCrmUser, toIso } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireCrmUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const assignedSalesId = searchParams.get("assignedSalesId");

  const snap = await adminDb.collection("deals").where("tenantId", "==", auth.tenantId).orderBy("updatedAt", "desc").limit(500).get();

  const deals = snap.docs
    .filter((doc) => {
      const data = doc.data();
      if (auth.user.role === "sales" && data.assignedSalesId !== auth.user.uid) return false;
      if (stage && data.stage !== stage) return false;
      if (assignedSalesId && data.assignedSalesId !== assignedSalesId) return false;
      return true;
    })
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        leadId: String(data.leadId || ""),
        title: String(data.title || ""),
        valueUSD: Number(data.valueUSD || 0),
        stage: String(data.stage || "new"),
        discountPercent: Number(data.discountPercent || 0),
        discountApproved: Boolean(data.discountApproved),
        assignedSalesId: String(data.assignedSalesId || ""),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

  return NextResponse.json({ ok: true, deals });
}
