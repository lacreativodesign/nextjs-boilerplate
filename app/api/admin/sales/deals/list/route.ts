import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../_utils";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";

export const dynamic = "force-dynamic";

type DealDoc = {
  dealName?: string;
  clientName?: string;
  leadName?: string;
  stage?: string;
  valueUsd?: number;
  probability?: number;
  ownerId?: string | null;
  ownerName?: string | null;
  expectedCloseDate?: any;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
  paymentStatus?: string | null;
  projectId?: string | null;
  projectCreated?: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 500);
    const cursor = req.nextUrl.searchParams.get("cursor");

    let baseQuery: FirebaseFirestore.Query = adminDb
      .collection("deals")
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await adminDb.collection("deals").doc(cursor).get();
      if (cursorDoc.exists && normalizeTenantId(cursorDoc.data()?.tenantId) === tenantId) {
        baseQuery = baseQuery.startAfter(cursorDoc);
      }
    }

    const rawDocs = await queryWithTenant(baseQuery, tenantId);

    rawDocs.sort((a, b) => {
      const aMs = a.data().createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bMs = b.data().createdAt?.toDate?.()?.getTime?.() ?? 0;
      return bMs - aMs;
    });

    const hasMore = rawDocs.length > limit;
    const pageDocs = rawDocs.slice(0, limit);

    const deals = pageDocs.map((doc) => {
      const data = (doc.data() || {}) as DealDoc;
      return {
        id: doc.id,
        dealName: data.dealName || "",
        clientName: data.clientName || "",
        leadName: data.leadName || "",
        stage: data.stage || "New",
        valueUsd: Number(data.valueUsd || 0),
        probability: Number(data.probability || 0),
        ownerId: data.ownerId || null,
        ownerName: data.ownerName || null,
        expectedCloseDate: toISO(data.expectedCloseDate),
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        paymentStatus: data.paymentStatus || null,
        projectId: data.projectId || null,
        projectCreated: Boolean(data.projectCreated),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({
      ok: true,
      deals,
      pagination: {
        hasMore,
        nextCursor: hasMore ? pageDocs[pageDocs.length - 1].id : null,
      },
    });
  } catch (err: any) {
    console.error("sales deals list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load deals." }, { status: 500 });
  }
}
