import { NextResponse } from "next/server";
import { listInvoices } from "@/lib/billing/stripe-subscription";
import { requireBillingAccess } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const invoices = await listInvoices(auth.user.tenantId);
    return NextResponse.json({ ok: true, invoices });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to list invoices" }, { status: 500 });
  }
}
