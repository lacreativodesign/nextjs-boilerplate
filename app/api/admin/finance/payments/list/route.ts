import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../_utils";
import { toPaymentStatusLabel } from "@/lib/finance/status";

export const dynamic = "force-dynamic";

type PaymentDoc = {
  clientId?: string;
  clientName?: string;
  invoiceId?: string | null;
  orderId?: string | null;
  currency?: string;
  amountUsd?: number;
  method?: string;
  status?: string;
  paidAt?: any;
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

    const snap = await adminDb.collection("payments").where("isDeleted", "==", false).limit(500).get();

    const payments = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as PaymentDoc;
      return {
        id: doc.id,
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        invoiceId: data.invoiceId || null,
        orderId: data.orderId || null,
        currency: data.currency || "USD",
        amountUsd: Number(data.amountUsd || 0),
        method: data.method || "Other",
        status: toPaymentStatusLabel(data.status),
        paidAt: toISO(data.paidAt),
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
      };
    });

    return NextResponse.json({
      ok: true,
      payments,
      currentUser: {
        uid: auth.user.uid,
        role: auth.user.role,
        name: auth.user.name || auth.user.fullName || auth.user.displayName || "",
      },
    });
  } catch (err: any) {
    console.error("finance/payments list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load payments.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
