import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId);
    const docs = await queryWithTenant(
      adminDb.collection("leads").where("isDeleted", "==", false).limit(500),
      tenantId
    );

    const leads = docs.map((doc) => {
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

    return NextResponse.json({ ok: true, leads });
  } catch (err: any) {
    console.error("sales leads list error:", err);
    return NextResponse.json({ ok: false, error: "Unable to load leads." }, { status: 500 });
  }
}
