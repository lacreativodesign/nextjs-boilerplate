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

    const invoices = await listInvoices(auth.user.tenantId as string);
    return NextResponse.json({ ok: true, invoices });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Unable to list invoices" }, { status: 500 });
  }
}
