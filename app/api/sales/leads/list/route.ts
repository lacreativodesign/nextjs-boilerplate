import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { canWriteSales, isSales, normalizeStage, requireSalesRead, toISO } from "../../_utils";

export const dynamic = "force-dynamic";

type LeadDoc = {
  tenantId?: string;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  disposition?: string;
  valueUsd?: number;
  packageLabel?: string;
  services?: string[];
  notesCount?: number;
  emailsCount?: number;
  paymentRequestsCount?: number;
  expectedValueUsd?: number;
  packageName?: string;
  interestedServices?: string[];
  lastContactedAt?: any;
  nextFollowUpAt?: any;
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  notes?: string;
  stage?: string;
  ownerId?: string | null;
  ownerName?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  lastActivityAt?: any;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireSalesRead();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const role = auth.user.role || "";
    const salesRep = isSales(role);
    const tenantId = auth.user.tenantId || "";

    const [ownerSnap, createdSnap] = salesRep
      ? await Promise.all([
          adminDb
            .collection("leads")
            .where("tenantId", "==", tenantId)
            .where("isDeleted", "==", false)
            .where("ownerId", "==", auth.user.uid)
            .limit(500)
            .get(),
          adminDb
            .collection("leads")
            .where("tenantId", "==", tenantId)
            .where("isDeleted", "==", false)
            .where("createdById", "==", auth.user.uid)
            .limit(500)
            .get(),
        ])
      : await Promise.all([
          adminDb.collection("leads").where("tenantId", "==", tenantId).where("isDeleted", "==", false).limit(500).get(),
          Promise.resolve(null),
        ]);

    const map = new Map<string, LeadDoc>();
    ownerSnap.docs.forEach((doc) => map.set(doc.id, doc.data() as LeadDoc));
    if (createdSnap) {
      createdSnap.docs.forEach((doc) => map.set(doc.id, doc.data() as LeadDoc));
    }

    const leads = Array.from(map.entries()).map(([id, data]) => ({
      id,
      companyName: String(data.companyName || ""),
      contactName: String(data.contactName || data.name || ""),
      contactEmail: String(data.contactEmail || data.email || ""),
      contactPhone: String(data.contactPhone || data.phone || ""),
      disposition: String(data.disposition || ""),
      valueUsd: Number(data.valueUsd ?? data.expectedValueUsd ?? 0),
      packageLabel: String(data.packageLabel || data.packageName || ""),
      services: Array.isArray(data.services)
        ? data.services.map(String)
        : Array.isArray(data.interestedServices)
        ? data.interestedServices.map(String)
        : [],
      lastContactedAt: toISO(data.lastContactedAt),
      nextFollowUpAt: toISO(data.nextFollowUpAt),
      source: String(data.source || ""),
      stage: normalizeStage(data.stage || "New Lead"),
      ownerId: data.ownerId || null,
      ownerName: data.ownerName || null,
      createdBy: data.createdBy || null,
      updatedBy: data.updatedBy || null,
      lastActivityAt: toISO(data.lastActivityAt),
      createdAt: toISO(data.createdAt),
      updatedAt: toISO(data.updatedAt),
      notesCount: Number(data.notesCount || 0),
      emailsCount: Number(data.emailsCount || 0),
      paymentRequestsCount: Number(data.paymentRequestsCount || 0),
      isDeleted: Boolean(data.isDeleted),
    }));

    return NextResponse.json({ ok: true, leads, canCreate: canWriteSales(role) });
  } catch (err: any) {
    console.error("sales leads list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load leads." }, { status: 500 });
  }
}
