import React from "react";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, toISO } from "../../../_utils";
import { normalizeTenantId } from "@/lib/tenant";
import { renderToStream } from "@react-pdf/renderer";
import { InvoicePDF } from "@/lib/pdf/InvoiceTemplate";

type InvoiceDoc = {
  tenantId?: string | null;
  orderId?: string;
  clientId?: string;
  clientName?: string;
  amountSubtotalUsd?: number;
  amountTaxUsd?: number;
  amountTotalUsd?: number;
  taxRateName?: string;
  totalPaid?: number;
  status?: string;
  dueDate?: unknown;
  issuedAt?: unknown;
  lineItems?: Array<{
    name?: string;
    qty?: number;
    unitPriceUsd?: number;
    details?: string | null;
  }>;
  notes?: string | null;
};

type ClientDoc = {
  tenantId?: string | null;
  companyName?: string;
  primaryContactEmail?: string;
  phone?: string;
  address?: string;
};

type TenantDoc = {
  name?: string;
  companyName?: string;
  logoUrl?: string;
  brand?: { logoUrl?: string | null };
  whiteLabel?: {
    logoUrl?: string | null;
    primaryColor?: string;
    secondaryColor?: string;
  };
  address?: string;
  email?: string;
  supportEmail?: string;
  phone?: string;
  contactPhone?: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId as string | null | undefined);
    const invoiceSnap = await adminDb.collection("invoices").doc(params.id).get();
    if (!invoiceSnap.exists) {
      return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
    }

    const invoice = (invoiceSnap.data() || {}) as InvoiceDoc;
    const isSuperAdminReq = String(auth.user.role || "").toLowerCase() === "super_admin";
    if (!isSuperAdminReq && normalizeTenantId(invoice.tenantId) !== tenantId) {
      return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
    }

    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    const tenant = (tenantSnap.data() || {}) as TenantDoc;

    const clientId = String(invoice.clientId || "").trim();
    let client: ClientDoc = {
      companyName: invoice.clientName || "Client",
    };

    if (clientId) {
      const clientSnap = await adminDb.collection("clients").doc(clientId).get();
      if (clientSnap.exists) {
        const clientDoc = (clientSnap.data() || {}) as ClientDoc;
        const clientTenantId = normalizeTenantId(clientDoc.tenantId);
        if (!clientDoc.tenantId || clientTenantId === tenantId) {
          client = clientDoc;
        }
      }
    }

    const lineItems = Array.isArray(invoice.lineItems)
      ? invoice.lineItems.map((item) => {
          const quantity = Number(item?.qty || 0);
          const rate = Number(item?.unitPriceUsd || 0);
          return {
            description: String(item?.name || "Line item").trim(),
            details: item?.details || null,
            quantity,
            rate,
            amount: quantity * rate,
          };
        })
      : [];

    const subtotal = Number(invoice.amountSubtotalUsd || 0);
    const tax = Number(invoice.amountTaxUsd || 0);
    const total = Number(invoice.amountTotalUsd || 0);
    const taxRate = subtotal > 0 ? Number(((tax / subtotal) * 100).toFixed(2)) : 0;
    const amountPaid = Number(invoice.totalPaid || 0);

    const pdfStream = await renderToStream(
      React.createElement(InvoicePDF, {
        invoice: {
          invoiceNumber: String(invoice.orderId || params.id),
          issueDate: toISO(invoice.issuedAt),
          dueDate: toISO(invoice.dueDate),
          status: String(invoice.status || "Draft"),
          lineItems,
          subtotal,
          discount: 0,
          tax,
          taxRate,
          taxLabel: invoice.taxRateName ? `${String(invoice.taxRateName)} (${taxRate}%)` : undefined,
          total,
          amountPaid,
          notes: invoice.notes || null,
          paymentTerms: 30,
        },
        tenant: {
          name: String(tenant.name || tenant.companyName || "Bizosto"),
          logoUrl: tenant.whiteLabel?.logoUrl || tenant.brand?.logoUrl || tenant.logoUrl || null,
          primaryColor: tenant.whiteLabel?.primaryColor || "#2563eb",
          secondaryColor: tenant.whiteLabel?.secondaryColor || "#1d4ed8",
          address: tenant.address || null,
          email: tenant.email || tenant.supportEmail || null,
          phone: tenant.phone || tenant.contactPhone || null,
        },
        client: {
          name: String(client.companyName || invoice.clientName || "Client"),
          email: client.primaryContactEmail || null,
          phone: client.phone || null,
          address: client.address || null,
        },
      })
    );

    const chunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const filename = `${String(invoice.orderId || params.id).replace(/[^a-zA-Z0-9-_]/g, "-")}.pdf`;

    return new NextResponse(Buffer.concat(chunks), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("invoice pdf generation error:", error);
    return NextResponse.json({ ok: false, error: "PDF generation failed." }, { status: 500 });
  }
}
