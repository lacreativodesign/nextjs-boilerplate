import { NextResponse } from "next/server";
import { adminDb as db } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";

export const dynamic = "force-dynamic";

type ClientDoc = {
  companyName?: string;
  website?: string;
  industry?: string;
  businessType?: string;
  country?: string;
  city?: string;
  timezone?: string;
  employeeCountRange?: string | null;
  yearsInBusinessRange?: string | null;

  segmentServices?: string[];
  segmentBusinessType?: string | null;
  segmentIndustry?: string | null;
  segmentGeo?: string | null;

  primaryContactName?: string;
  primaryContactTitle?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;

  salesStage?: string;
  paymentStatus?: string;
  retainerStatus?: string;

  salesOwner?: string;
  accountManager?: string;
  productionOwner?: string;

  totalPaidUsd?: number;
  orderId?: string;

  createdAt?: any;
  updatedAt?: any;
  lastActivity?: any;
  deletedAt?: any;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;

  // Firestore Timestamp support (admin sdk)
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  // Date
  if (value instanceof Date) return value.toISOString();

  return null;
}

function canViewClients(role: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "sales_manager";
}

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = (me.role || "").toLowerCase();
    if (!canViewClients(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const snap = await db.collection("clients").orderBy("createdAt", "desc").limit(500).get();

    const clients = snap.docs
      .map((doc) => {
        const d = (doc.data() || {}) as ClientDoc;

        if (d.deletedAt) return null;

        return {
          id: doc.id,
          companyName: d.companyName || "",
          website: d.website || "",
          industry: d.industry || "",
          businessType: d.businessType || "",
          country: d.country || "",
          city: d.city || "",
          timezone: d.timezone || "",
          employeeCountRange: d.employeeCountRange || null,
          yearsInBusinessRange: d.yearsInBusinessRange || null,

          segmentServices: Array.isArray(d.segmentServices) ? d.segmentServices : [],
          segmentBusinessType: d.segmentBusinessType || null,
          segmentIndustry: d.segmentIndustry || null,
          segmentGeo: d.segmentGeo || null,

          primaryContactName: d.primaryContactName || "",
          primaryContactTitle: d.primaryContactTitle || "",
          primaryContactEmail: d.primaryContactEmail || "",
          primaryContactPhone: d.primaryContactPhone || "",

          salesStage: d.salesStage || "",
          paymentStatus: d.paymentStatus || "",
          retainerStatus: d.retainerStatus || "",

          salesOwner: d.salesOwner || "",
          accountManager: d.accountManager || "",
          productionOwner: d.productionOwner || "",

          totalPaidUsd: Number(d.totalPaidUsd || 0),
          orderId: d.orderId || "",

          createdAt: toISO(d.createdAt),
          updatedAt: toISO(d.updatedAt),
          lastActivity: toISO(d.lastActivity),
        };
      })
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    return NextResponse.json({ ok: true, clients });
  } catch (err: any) {
    console.error("clients/list error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
