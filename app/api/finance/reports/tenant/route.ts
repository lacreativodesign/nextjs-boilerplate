import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireFinance, toISO } from "../../_utils";
import { normalizeInvoiceStatus } from "@/lib/finance/status";

export const dynamic = "force-dynamic";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const auth = await requireFinance();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const invoicesSnap = await adminDb
      .collection("invoices")
      .where("tenantId", "==", auth.tenantId)
      .where("isDeleted", "==", false)
      .limit(1000)
      .get();

    const invoices = invoicesSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

    let totalRevenue = 0;
    let paidTotal = 0;
    let unpaidTotal = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let outstandingReceivables = 0;

    const monthlyMap = new Map<string, number>();

    invoices.forEach((invoice) => {
      const status = normalizeInvoiceStatus(invoice.status);
      const totalAmount = Number(invoice.totalAmount ?? invoice.amountTotalUsd ?? 0);
      if (status === "paid") {
        totalRevenue += totalAmount;
        paidTotal += totalAmount;
        paidCount += 1;
        const paidAtIso = toISO(invoice.paidAt || invoice.updatedAt || invoice.createdAt);
        if (paidAtIso) {
          const key = monthKey(new Date(paidAtIso));
          monthlyMap.set(key, (monthlyMap.get(key) || 0) + totalAmount);
        }
      } else if (status !== "void") {
        unpaidTotal += totalAmount;
        unpaidCount += 1;
        if (status === "issued" || status === "partially_paid") {
          outstandingReceivables += totalAmount;
        }
      }
    });

    const now = new Date();
    const monthlyRevenue = Array.from({ length: 12 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
      const key = monthKey(d);
      return { month: key, revenue: monthlyMap.get(key) || 0 };
    });

    return NextResponse.json({
      ok: true,
      report: {
        totalRevenueUsd: totalRevenue,
        invoices: {
          paidTotal,
          unpaidTotal,
          paidCount,
          unpaidCount,
        },
        monthlyRevenue,
        outstandingReceivables,
      },
    });
  } catch (err: any) {
    console.error("finance/reports tenant error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load tenant report.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
