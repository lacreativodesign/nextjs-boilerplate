import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { requireClient, toISO } from "../../../_utils";
import { toInvoiceStatusLabel } from "@/lib/finance/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvoiceDoc = {
  orderId?: string;
  clientId?: string;
  status?: string;
  amountSubtotalUsd?: number;
  amountTaxUsd?: number;
  amountTotalUsd?: number;
  dueDate?: any;
  issuedAt?: any;
  paidAt?: any;
  lineItems?: any[];
  notes?: string | null;
  createdAt?: any;
  isDeleted?: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const id = String(req.nextUrl.searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "Invoice is required." }, { status: 400 });

    const snap = await adminDb.collection("invoices").doc(id).get();
    if (!snap.exists || snap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
    }

    const data = (snap.data() || {}) as InvoiceDoc;
    const tenantId = auth.tenantId;
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Tenant context missing." }, { status: 403 });
    }
    if (String((data as Record<string, any>).tenantId || DEFAULT_TENANT_ID) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (String(data.clientId || "") !== auth.clientId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      invoice: {
        id: snap.id,
        orderId: data.orderId || "",
        status: toInvoiceStatusLabel(data.status),
        amountSubtotalUsd: Number(data.amountSubtotalUsd || 0),
        amountTaxUsd: Number(data.amountTaxUsd || 0),
        amountTotalUsd: Number(data.amountTotalUsd || 0),
        dueDate: toISO(data.dueDate),
        issuedAt: toISO(data.issuedAt),
        paidAt: toISO(data.paidAt),
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
        notes: data.notes || null,
        createdAt: toISO(data.createdAt),
      },
    });
  } catch (err: any) {
    console.error("client/billing invoice get error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load invoice.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
