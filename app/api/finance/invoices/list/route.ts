import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, toISO } from "../../_utils";
import { toInvoiceStatusLabel } from "@/lib/finance/status";

export const dynamic = "force-dynamic";

type InvoiceDoc = {
  tenantId?: string;
  orderId?: string;
  clientId?: string;
  clientName?: string;
  currency?: string;
  invoiceNumber?: string;
  amount?: number;
  tax?: number;
  totalAmount?: number;
  amountSubtotalUsd?: number;
  amountTaxUsd?: number;
  amountTotalUsd?: number;
  status?: string;
  dueDate?: any;
  issuedAt?: any;
  paidAt?: any;
  lineItems?: any[];
  notes?: string | null;
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
      .collection("invoices")
      .where("tenantId", "==", auth.tenantId)
      .where("isDeleted", "==", false)
      .limit(500)
      .get();

    const invoices = snap.docs.map((doc) => {
      const data = (doc.data() || {}) as InvoiceDoc;
      const amountSubtotalUsd = Number(data.amountSubtotalUsd ?? data.amount ?? 0);
      const amountTaxUsd = Number(data.amountTaxUsd ?? data.tax ?? 0);
      const amountTotalUsd = Number(data.amountTotalUsd ?? data.totalAmount ?? amountSubtotalUsd + amountTaxUsd);
      return {
        id: doc.id,
        orderId: data.orderId || data.invoiceNumber || "",
        invoiceNumber: data.invoiceNumber || data.orderId || "",
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        currency: data.currency || "USD",
        amountSubtotalUsd,
        amountTaxUsd,
        amountTotalUsd,
        amount: Number(data.amount ?? amountSubtotalUsd),
        tax: Number(data.tax ?? amountTaxUsd),
        totalAmount: Number(data.totalAmount ?? amountTotalUsd),
        status: toInvoiceStatusLabel(data.status),
        dueDate: toISO(data.dueDate),
        issuedAt: toISO(data.issuedAt),
        paidAt: toISO(data.paidAt),
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
        notes: data.notes || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
        tenantId: data.tenantId || auth.tenantId,
      };
    });

    return NextResponse.json({
      ok: true,
      invoices,
      currentUser: {
        uid: auth.user.uid,
        role: auth.user.role,
        name: auth.user.name || auth.user.fullName || auth.user.displayName || "",
      },
    });
  } catch (err: any) {
    console.error("finance/invoices list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load invoices.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
