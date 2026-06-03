import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../_utils";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";

export const dynamic = "force-dynamic";

type LeadDoc = {
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  stage?: string;
  ownerId?: string | null;
  ownerName?: string | null;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
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
      .collection("leads")
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await adminDb.collection("leads").doc(cursor).get();
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

    const leads = pageDocs.map((doc) => {
      const data = (doc.data() || {}) as LeadDoc;
      return {
        id: doc.id,
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        source: data.source || "",
        stage: data.stage || "New",
        ownerId: data.ownerId || null,
        ownerName: data.ownerName || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({
      ok: true,
      leads,
      pagination: {
        hasMore,
        nextCursor: hasMore ? pageDocs[pageDocs.length - 1].id : null,
      },
    });
  } catch (err: any) {
    console.error("sales leads list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load leads." }, { status: 500 });
  }
}
