import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID, docTenantId, normalizeTenantId } from "@/lib/tenant";
import { canWriteSales, isSales, requireSalesRead, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

type LeadDoc = {
  tenantId?: string;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  company?: string;
  name?: string;
  email?: string;
  phone?: string;
  disposition?: string;
  expectedValueUsd?: number;
  packageName?: string;
  interestedServices?: string[];
  probability?: number;
  lastContactedAt?: any;
  nextFollowUpAt?: any;
  source?: string;
  notes?: string;
  status?: string;
  stage?: string;
  ownerUid?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  lastActivityAt?: any;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

async function queryWithTenant(query: FirebaseFirestore.Query, tenantId: string) {
  const queries = [query.where("tenantId", "==", tenantId)];
  if (tenantId === DEFAULT_TENANT_ID) {
    queries.push(query.where("tenantId", "==", null));
  }
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
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || "";
    const salesRep = isSales(role);
    const tenantId = normalizeTenantId(auth.user.tenantId || DEFAULT_TENANT_ID);

    const [ownerDocs, createdDocs, unassignedDocs] = salesRep
      ? await Promise.all([
          queryWithTenant(
            adminDb.collection("leads").where("isDeleted", "==", false).where("ownerUid", "==", auth.user.uid).limit(500),
            tenantId
          ),
          queryWithTenant(
            adminDb.collection("leads").where("isDeleted", "==", false).where("createdById", "==", auth.user.uid).limit(500),
            tenantId
          ),
          queryWithTenant(
            adminDb.collection("leads").where("isDeleted", "==", false).where("ownerUid", "==", null).limit(200),
            tenantId
          ),
        ])
      : await Promise.all([
          queryWithTenant(adminDb.collection("leads").where("isDeleted", "==", false).limit(500), tenantId),
          Promise.resolve([]),
          Promise.resolve([]),
        ]);

    const map = new Map<string, LeadDoc>();
    ownerDocs.forEach((doc) => map.set(doc.id, doc.data() as LeadDoc));
    createdDocs.forEach((doc) => map.set(doc.id, doc.data() as LeadDoc));
    unassignedDocs.forEach((doc) => map.set(doc.id, doc.data() as LeadDoc));

    const leads = Array.from(map.entries()).map(([id, data]) => ({
      id,
      companyName: String(data.companyName || data.company || ""),
      contactName: String(data.contactName || data.name || ""),
      contactEmail: String(data.contactEmail || data.email || ""),
      contactPhone: String(data.contactPhone || data.phone || ""),
      disposition: String(data.disposition || ""),
      expectedValueUsd: Number(data.expectedValueUsd || 0),
      packageName: String(data.packageName || ""),
      interestedServices: Array.isArray(data.interestedServices) ? data.interestedServices.map(String) : [],
      probability: Number(data.probability || 0),
      lastContactedAt: toISO(data.lastContactedAt),
      nextFollowUpAt: toISO(data.nextFollowUpAt),
      source: String(data.source || ""),
      notes: String(data.notes || ""),
      status: String(data.status || "new"),
      stage: String(data.stage || ""),
      ownerId: data.ownerUid || data.ownerId || null,
      ownerName: data.ownerName || null,
      createdBy: data.createdBy || null,
      updatedBy: data.updatedBy || null,
      lastActivityAt: toISO(data.lastActivityAt),
      createdAt: toISO(data.createdAt),
      updatedAt: toISO(data.updatedAt),
      isDeleted: Boolean(data.isDeleted),
    }));

    return NextResponse.json({ ok: true, leads, canCreate: canWriteSales(role) });
  } catch (err: any) {
    console.error("sales leads list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load leads." }, { status: 500 });
  }
}
