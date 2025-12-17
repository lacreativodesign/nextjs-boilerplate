import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";

export const dynamic = "force-dynamic";

type ClientDoc = {
  companyName?: string;
  website?: string;
  industry?: string;
  country?: string;
  timezone?: string;

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

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (me.role !== "SUPER_ADMIN" && me.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const snap = await db.collection("clients").orderBy("createdAt", "desc").limit(500).get();

    const clients = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as ClientDoc;

      return {
        id: doc.id,
        companyName: data.companyName ?? "",
        website: data.website ?? "",
        industry: data.industry ?? "",
        country: data.country ?? "",
        timezone: data.timezone ?? "",

        primaryContactName: data.primaryContactName ?? "",
        primaryContactTitle: data.primaryContactTitle ?? "",
        primaryContactEmail: data.primaryContactEmail ?? "",
        primaryContactPhone: data.primaryContactPhone ?? "",

        salesStage: (data.salesStage ?? "New Lead") as string,
        paymentStatus: (data.paymentStatus ?? "Unpaid") as string,
        retainerStatus: (data.retainerStatus ?? "None") as string,

        salesOwner: data.salesOwner ?? "",
        accountManager: data.accountManager ?? "",
        productionOwner: data.productionOwner ?? "",

        totalPaidUsd: Number(data.totalPaidUsd ?? 0),
        orderId: data.orderId ?? "",

        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        lastActivity: toISO(data.lastActivity),
      };
    });

    return NextResponse.json({ ok: true, clients });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to load clients" },
      { status: 500 }
    );
  }
}
