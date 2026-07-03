import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireClient, toISO } from "../../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PaymentDoc = {
  clientId?: string;
  status?: string;
  amountUsd?: number;
  method?: string;
  paidAt?: any;
  createdAt?: any;
  invoiceId?: string | null;
  orderId?: string | null;
  isDeleted?: boolean;
  tenantId?: string;
};

export async function GET() {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing." }, { status: 403 });
    }
    const snap = await adminDb
      .collection("payments")
      .where("clientId", "==", auth.clientId)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const payments = snap.docs
      .map((doc) => {
        const data = (doc.data() || {}) as PaymentDoc;
        return {
          id: doc.id,
          tenantId: data.tenantId || "",
          amountUsd: Number(data.amountUsd || 0),
          status: String(data.status || "Pending"),
          method: String(data.method || "Other"),
          paidAt: toISO(data.paidAt),
          createdAt: toISO(data.createdAt),
          invoiceId: data.invoiceId || null,
          orderId: data.orderId || null,
        };
      })
      .filter((payment) => String((payment as Record<string, any>).tenantId || "") === tenantId);

    return NextResponse.json({ ok: true, payments });
  } catch (err: any) {
    console.error("client/billing payments list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load payments.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
