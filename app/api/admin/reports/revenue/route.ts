import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getMonthKey, getReportSettings, requireReportsAccess, toISO, toMillis } from "../_utils";
import { normalizeInvoiceStatus, normalizePaymentStatus, parseInvoiceStatus } from "@/lib/finance/status";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
}

export async function GET(req: Request) {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantId = normalizeTenantId(auth.user.tenantId as string | null | undefined);
    const settings = await getReportSettings();
    const { searchParams } = new URL(req.url);
    const dateFrom = parseDate(searchParams.get("dateFrom"));
    const dateTo = parseDate(searchParams.get("dateTo"), true);
    const clientId = String(searchParams.get("clientId") || "").trim();
    const statusFilter = String(searchParams.get("status") || "").trim();
    const normalizedStatusFilter = statusFilter ? parseInvoiceStatus(statusFilter) : null;

    const [invoiceDocs, paymentDocs] = await Promise.all([
      queryWithTenant(adminDb.collection("invoices").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("payments").where("isDeleted", "==", false).limit(500), tenantId),
    ]);

    const invoices = invoiceDocs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    const payments = paymentDocs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));

    const filteredInvoices = invoices.filter((inv) => {
      if (clientId && String(inv.clientId as unknown || "") !== clientId) return false;
      if (normalizedStatusFilter && normalizeInvoiceStatus(inv.status) !== normalizedStatusFilter) return false;
      const issuedMs = toMillis(inv.issuedAt as unknown || inv.createdAt);
      if (!issuedMs) return false;
      if (dateFrom && issuedMs < dateFrom.getTime()) return false;
      if (dateTo && issuedMs > dateTo.getTime()) return false;
      return true;
    });

    const filteredPayments = payments.filter((payment) => {
      if (clientId && String(payment.clientId as unknown || "") !== clientId) return false;
      const paidMs = toMillis(payment.paidAt as unknown || payment.createdAt);
      if (!paidMs) return false;
      if (dateFrom && paidMs < dateFrom.getTime()) return false;
      if (dateTo && paidMs > dateTo.getTime()) return false;
      return true;
    });

    const paidInvoices = filteredInvoices.filter((inv) => normalizeInvoiceStatus(inv.status) === "paid");

    const monthKeys = Array.from(
      new Set(
        paidInvoices
          .map((inv) => toMillis(inv.paidAt as unknown || inv.updatedAt as unknown || inv.createdAt))
          .filter(Boolean)
          .map((ms) => getMonthKey(new Date(ms as number)))
          .concat(
            filteredPayments
              .filter((pay) => normalizePaymentStatus(pay.status) === "succeeded")
              .map((pay) => toMillis(pay.paidAt as unknown || pay.createdAt))
              .filter(Boolean)
              .map((ms) => getMonthKey(new Date(ms as number)))
          )
      )
    ).sort();

    const revenueByMonth = monthKeys.map((key) => ({ label: key, revenueUsd: 0 }));
    const paymentsByMonth = monthKeys.map((key) => ({ label: key, paymentsUsd: 0 }));

    paidInvoices.forEach((inv) => {
      const paidMs = toMillis(inv.paidAt as unknown || inv.updatedAt as unknown || inv.createdAt);
      if (!paidMs) return;
      const key = getMonthKey(new Date(paidMs));
      const bucket = revenueByMonth.find((row) => row.label === key);
      if (!bucket) return;
      bucket.revenueUsd += Number(inv.amountTotalUsd as unknown || 0);
    });

    filteredPayments.forEach((payment) => {
      if (normalizePaymentStatus(payment.status) !== "succeeded") return;
      const paidMs = toMillis(payment.paidAt as unknown || payment.createdAt);
      if (!paidMs) return;
      const key = getMonthKey(new Date(paidMs));
      const bucket = paymentsByMonth.find((row) => row.label === key);
      if (!bucket) return;
      bucket.paymentsUsd += Number(payment.amountUsd as unknown || 0);
    });

    const now = new Date();
    const agingBuckets = settings.arAgingBucketsDays.length ? settings.arAgingBucketsDays : [30, 60, 90];
    const bucketTotals = agingBuckets.map(() => 0);
    let bucketOverflow = 0;

    const outstandingInvoices = invoices
      .filter((inv) => {
        if (clientId && String(inv.clientId as unknown || "") !== clientId) return false;
        const status = normalizeInvoiceStatus(inv.status);
        if (["paid", "void"].includes(status)) return false;
        if (normalizedStatusFilter && status !== normalizedStatusFilter) return false;
        return true;
      })
      .map((inv) => {
        const dueMs = toMillis(inv.dueDate);
        let diffDays = 0;
        if (dueMs) {
          diffDays = Math.max(0, Math.floor((now.getTime() - dueMs) / (1000 * 60 * 60 * 24)));
        }
        const amount = Number(inv.amountTotalUsd as unknown || 0);
        const bucketIndex = agingBuckets.findIndex((limit) => diffDays <= limit);
        if (bucketIndex === -1) {
          bucketOverflow += amount;
        } else {
          bucketTotals[bucketIndex] += amount;
        }

        return {
          id: inv.id,
          orderId: inv.orderId as unknown || inv.id,
          clientId: inv.clientId as unknown || "",
          clientName: inv.clientName as unknown || "",
          amountTotalUsd: amount,
          dueDate: toISO(inv.dueDate),
          status: inv.status as unknown || "Sent",
          updatedAt: toISO(inv.updatedAt as unknown || inv.createdAt),
        };
      })
      .sort((a, b) => {
        const left = new Date(a.dueDate || 0).getTime();
        const right = new Date(b.dueDate || 0).getTime();
        return left - right;
      });

    const topClientsMap = new Map<string, { clientId: string; clientName: string; totalUsd: number }>();
    filteredInvoices.forEach((inv) => {
      if (normalizeInvoiceStatus(inv.status) !== "paid") return;
      const paidMs = toMillis(inv.paidAt as unknown || inv.updatedAt as unknown || inv.createdAt);
      if (!paidMs) return;
      if (dateFrom && paidMs < dateFrom.getTime()) return;
      if (dateTo && paidMs > dateTo.getTime()) return;
      const id = String(inv.clientId as unknown || "unknown");
      const name = String(inv.clientName as unknown || "Unknown");
      const current = topClientsMap.get(id) || { clientId: id, clientName: name, totalUsd: 0 };
      current.totalUsd += Number(inv.amountTotalUsd as unknown || 0);
      topClientsMap.set(id, current);
    });

    const topClientsByRevenue = Array.from(topClientsMap.values()).sort((a, b) => b.totalUsd - a.totalUsd).slice(0, 10);

    const arAging = agingBuckets.map((bucket, idx) => ({
      label: idx === 0 ? `0-${bucket}d` : `${agingBuckets[idx - 1] + 1}-${bucket}d`,
      amountUsd: bucketTotals[idx],
    }));
    arAging.push({ label: `${agingBuckets[agingBuckets.length - 1] + 1}d+`, amountUsd: bucketOverflow });

    return NextResponse.json({
      ok: true,
      revenueByMonth,
      paymentsByMonth,
      arAging,
      topClientsByRevenue,
      outstandingInvoices,
    });
  } catch (err) {
    console.error("reports/revenue error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load revenue reports.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
