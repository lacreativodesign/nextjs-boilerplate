import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isSuperAdmin } from "../../admin/_utils";
import { isPlanAccessError, requireModule } from "@/app/lib/plan-enforcement";
import { normalizeInvoiceStatus } from "@/lib/finance/status";
import { toISO } from "../../finance/_utils";

export const dynamic = "force-dynamic";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isSuperAdmin(user.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    try {
      await requireModule(String(user.tenantId || "default"), "finance");
    } catch (err) {
      if (isPlanAccessError(err)) {
        return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
      }
      return NextResponse.json({ ok: false, error: "Unable to validate plan access." }, { status: 500 });
    }

    const [invoiceSnap, paymentSnap, tenantSnap] = await Promise.all([
      adminDb.collection("invoices").where("isDeleted", "==", false).limit(2000).get(),
      adminDb.collection("payments").where("isDeleted", "==", false).limit(2000).get(),
      adminDb.collection("tenants").limit(1000).get(),
    ]);

    const invoices = invoiceSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const payments = paymentSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const tenants = tenantSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

    const revenueByTenant = new Map<string, number>();
    const statusCounts = { draft: 0, issued: 0, paid: 0, void: 0, partially_paid: 0 };
    let outstandingReceivables = 0;

    const now = new Date();
    const currentMonthKey = monthKey(now);
    let mrr = 0;

    invoices.forEach((invoice) => {
      const tenantId = String(invoice.tenantId || "default");
      const status = normalizeInvoiceStatus(invoice.status);
      const totalAmount = Number(invoice.totalAmount ?? invoice.amountTotalUsd ?? 0);
      if (status in statusCounts) {
        statusCounts[status as keyof typeof statusCounts] += 1;
      }
      if (status === "paid") {
        revenueByTenant.set(tenantId, (revenueByTenant.get(tenantId) || 0) + totalAmount);
        const paidAtIso = toISO(invoice.paidAt || invoice.updatedAt || invoice.createdAt);
        if (paidAtIso && monthKey(new Date(paidAtIso)) === currentMonthKey) {
          mrr += totalAmount;
        }
      } else if (status === "issued" || status === "partially_paid") {
        outstandingReceivables += totalAmount;
      }
    });

    const tenantRevenue = Array.from(revenueByTenant.entries()).map(([tenantId, revenueUsd]) => {
      const tenant = tenants.find((row) => row.id === tenantId);
      return {
        tenantId,
        tenantName: String(tenant?.name || tenant?.slug || tenantId),
        revenueUsd,
      };
    });

    tenantRevenue.sort((a, b) => b.revenueUsd - a.revenueUsd);
    const topTenants = tenantRevenue.slice(0, 10);

    const paymentStatusByTenant = new Map<string, { total: number; recorded: number }>();
    payments.forEach((payment) => {
      const tenantId = String(payment.tenantId || "default");
      const entry = paymentStatusByTenant.get(tenantId) || { total: 0, recorded: 0 };
      entry.total += 1;
      if (String(payment.status || "succeeded") === "succeeded") {
        entry.recorded += 1;
      }
      paymentStatusByTenant.set(tenantId, entry);
    });

    const paymentStatusAcrossTenants = Array.from(paymentStatusByTenant.entries()).map(([tenantId, stats]) => {
      const tenant = tenants.find((row) => row.id === tenantId);
      return {
        tenantId,
        tenantName: String(tenant?.name || tenant?.slug || tenantId),
        totalPayments: stats.total,
        recordedPayments: stats.recorded,
      };
    });

    return NextResponse.json({
      ok: true,
      report: {
        mrrUsd: mrr,
        arrUsd: mrr * 12,
        revenueByTenant: tenantRevenue,
        topTenants,
        paymentStatusAcrossTenants,
        invoiceStatusSummary: statusCounts,
        outstandingReceivablesUsd: outstandingReceivables,
      },
    });
  } catch (err: any) {
    console.error("finance/reports platform error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load platform report.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
