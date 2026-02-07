import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../_utils";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";

export const dynamic = "force-dynamic";

type DealDoc = {
  dealName?: string;
  clientName?: string;
  stage?: string;
  valueUsd?: number;
  probability?: number;
  ownerName?: string | null;
  leadName?: string | null;
  leadEmail?: string | null;
  leadPhone?: string | null;
  expectedCloseDate?: any;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const docs = await queryWithTenant(
      adminDb.collection("deals").where("isDeleted", "==", false).limit(500),
      tenantId
    );

    const deals = docs.map((doc) => {
      const data = (doc.data() || {}) as DealDoc;
      return {
        id: doc.id,
        dealName: data.dealName || "",
        clientName: data.clientName || "",
        stage: data.stage || "New",
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
    console.error("sales pipeline list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load pipeline." }, { status: 500 });
  }
}
