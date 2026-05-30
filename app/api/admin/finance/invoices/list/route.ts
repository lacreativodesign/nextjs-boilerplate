import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../_utils";
import { toInvoiceStatusLabel } from "@/lib/finance/status";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";

export const dynamic = "force-dynamic";

type InvoiceDoc = {
  orderId?: string;
  clientId?: string;
  clientName?: string;
  currency?: string;
  amountSubtotal?: number;
  amountTax?: number;
  amountTotal?: number;
  amountSubtotalUsd?: number;
  amountTaxUsd?: number;
  amountTotalUsd?: number;
  exchangeRateDate?: string;
  totalUSD?: number;
  status?: string;
  dueDate?: unknown;
  issuedAt?: unknown;
  paidAt?: unknown;
  lineItems?: unknown[];
  notes?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  isDeleted?: boolean;
};

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId as string | null | undefined);
    const docs = await queryWithTenant(
      adminDb.collection("invoices").where("isDeleted", "==", false).limit(500),
      tenantId
    );

    const invoices = docs.map((doc) => {
      const data = (doc.data() || {}) as InvoiceDoc;
      return {
        id: doc.id,
        orderId: data.orderId || "",
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        currency: data.currency || "USD",
        amountSubtotal: Number((data.amountSubtotal ?? data.amountSubtotalUsd) || 0),
        amountTax: Number((data.amountTax ?? data.amountTaxUsd) || 0),
        amountTotal: Number((data.amountTotal ?? data.amountTotalUsd) || 0),
        amountSubtotalUsd: Number(data.amountSubtotalUsd || 0),
        amountTaxUsd: Number(data.amountTaxUsd || 0),
        amountTotalUsd: Number(data.amountTotalUsd || 0),
        exchangeRateDate: data.exchangeRateDate || null,
        totalUSD: Number((data.totalUSD ?? data.amountTotalUsd) || 0),
        status: toInvoiceStatusLabel(data.status),
        dueDate: toISO(data.dueDate),
        issuedAt: toISO(data.issuedAt),
        paidAt: toISO(data.paidAt),
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
        notes: data.notes || null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        isDeleted: Boolean(data.isDeleted),
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
  } catch (err) {
    console.error("finance/invoices list error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load invoices.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
