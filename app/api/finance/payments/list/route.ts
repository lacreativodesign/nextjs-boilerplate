import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, toISO } from "../../_utils";
import { toPaymentStatusLabel } from "@/lib/finance/status";

export const dynamic = "force-dynamic";

type PaymentDoc = {
  tenantId?: string;
  clientId?: string;
  clientName?: string;
  invoiceId?: string | null;
  orderId?: string | null;
  currency?: string;
  amount?: number;
  amountUsd?: number;
  method?: string;
  status?: string;
  notes?: string | null;
  reference?: string | null;
  paidAt?: any;
  receivedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection("payments")
      .where("tenantId", "==", auth.tenantId)
      .where("isDeleted", "==", false)
      .limit(500)
      .get();

    const payments = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as PaymentDoc;
      const amountUsd = Number(data.amountUsd ?? data.amount ?? 0);
      const rawMethod = String(data.method || "manual").toLowerCase();
      const methodLabel =
        rawMethod === "manual"
          ? "Manual"
          : rawMethod === "bank"
            ? "Bank"
            : rawMethod === "stripe_future"
              ? "Stripe (Future)"
              : data.method || "Other";
      return {
        id: doc.id,
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        invoiceId: data.invoiceId || null,
        orderId: data.orderId || null,
        currency: data.currency || "USD",
        amountUsd,
        amount: Number(data.amount ?? amountUsd),
        method: methodLabel,
        status: toPaymentStatusLabel(data.status),
        notes: data.notes || data.reference || null,
        reference: data.reference || null,
        paidAt: toISO(data.receivedAt || data.paidAt),
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
        tenantId: data.tenantId || auth.tenantId,
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
