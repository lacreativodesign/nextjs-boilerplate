import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireClient, toISO } from "../../../_utils";
import { toInvoiceStatusLabel } from "@/lib/finance/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvoiceDoc = {
  orderId?: string;
  clientId?: string;
  tenantId?: string;
  status?: string;
  amountTotalUsd?: number;
  dueDate?: any;
  createdAt?: any;
  issuedAt?: any;
  paidAt?: any;
  lineItems?: any[];
  notes?: string | null;
  isDeleted?: boolean;
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
      .collection("invoices")
      .where("clientId", "==", auth.clientId)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    const invoices = snap.docs
      .map((doc) => {
        const data = (doc.data() || {}) as InvoiceDoc;
        return {
          id: doc.id,
          tenantId: data.tenantId || "",
          orderId: data.orderId || "",
          status: toInvoiceStatusLabel(data.status),
          amountUsd: Number(data.amountTotalUsd || 0),
          dueDate: toISO(data.dueDate),
          createdAt: toISO(data.createdAt || data.issuedAt),
          issuedAt: toISO(data.issuedAt),
          paidAt: toISO(data.paidAt),
        };
      })
      .filter((invoice) => String((invoice as Record<string, any>).tenantId || "") === tenantId);

    return NextResponse.json({ ok: true, invoices });
  } catch (err: any) {
    console.error("client/billing invoices list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load invoices.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
