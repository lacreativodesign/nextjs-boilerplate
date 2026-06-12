import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser, isAdminRole } from "../../_utils";

export const dynamic = "force-dynamic";

type LeadDoc = {
  tenantId?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  ownerUid?: string | null;
  ownerName?: string | null;
  source?: string;
  createdAt?: any;
  updatedAt?: any;
};

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

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me || !isAdminRole(me.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = normalizeTenantId(me.tenantId);
    const docs = await queryWithTenant(
      adminDb.collection("leads").where("isDeleted", "==", false).limit(500),
      tenantId
    );

    const leads = docs.map((doc) => {
      const data = doc.data() as LeadDoc;
      return {
        id: doc.id,
        name: String(data.name || ""),
        email: String(data.email || ""),
        phone: String(data.phone || ""),
        company: String(data.company || ""),
        status: String(data.status || "new"),
        ownerUid: data.ownerUid || null,
        ownerName: data.ownerName || null,
        source: String(data.source || ""),
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
      };
    });

    return NextResponse.json({ ok: true, leads });
  } catch (err: any) {
    console.error("admin leads list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load leads." }, { status: 500 });
  }
}
