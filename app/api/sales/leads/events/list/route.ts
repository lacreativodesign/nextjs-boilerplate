import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { isSales, parseString, requireSalesRead } from "../../../_utils";

export const dynamic = "force-dynamic";

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where("tenantId", "==", tenantId)];
  const snapshots = await Promise.all(queries.map((q) => q.get()));
  const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === tenantId) {
        map.set(doc.id, doc);
      }
    });
  });
  return Array.from(map.values());
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const leadId = parseString(req.nextUrl.searchParams.get("leadId"), "");
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "Missing leadId." }, { status: 400 });
    }

    const leadSnap = await adminDb.collection("leads").doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }

    const lead = leadSnap.data() || {};
    if (!auth.user.tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing." }, { status: 403 });
    }
    const tenantId = normalizeTenantId(auth.user.tenantId);
    if (docTenantId(lead) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (isSales(auth.user.role) && lead.ownerUid !== auth.user.uid && lead.ownerId !== auth.user.uid) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const docs = await queryWithTenant(
      adminDb.collection("events").where("entityType", "==", "lead").where("entityId", "==", leadId).orderBy("createdAt", "desc").limit(50),
      tenantId
    );

    const events = docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        type: String(data.type || ""),
        title: String(data.title || ""),
        description: String(data.description || ""),
        createdAt: toISO(data.createdAt),
        createdByName: String(data.createdByName || ""),
      };
    });

    return NextResponse.json({ ok: true, events });
  } catch (err: any) {
    console.error("lead events list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load events." }, { status: 500 });
  }
}
