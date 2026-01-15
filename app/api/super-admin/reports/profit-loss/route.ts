import { NextResponse, type NextRequest } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../../_utils";
import { getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { DEFAULT_FINANCE_SETTINGS, getFinanceSettings } from "../../../admin/settings/_utils";
import {
  computeProfitLoss,
  isFullMonthRange,
  loadFinancialDocuments,
  resolveDateRange,
} from "@/lib/reports/financials";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const tenantId = await getTenantIdForRequestOrThrow(req);

    const { searchParams } = new URL(req.url);
    const range = resolveDateRange({
      range: searchParams.get("range"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    });

    const financeSettings = await getFinanceSettings();
    const fxPkrPerUsdRaw = Number(financeSettings.fxPkrPerUsd || DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd);
    const fxPkrPerUsd = fxPkrPerUsdRaw > 0 ? fxPkrPerUsdRaw : DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd;

    let summary = null as null | {
      revenueUsd: number;
      expenseUsd: number;
      profitUsd: number;
      marginPct: number;
      source: "snapshot" | "live";
    };

    if (isFullMonthRange(range)) {
      const month = range.start.getMonth() + 1;
      const year = range.start.getFullYear();
      const snapshotSnap = await adminDb
        .collection("financialSnapshots")
        .where("tenantId", "==", tenantId)
        .where("month", "==", month)
        .where("year", "==", year)
        .limit(1)
        .get();

      if (!snapshotSnap.empty) {
        const snapshot = snapshotSnap.docs[0].data() || {};
        summary = {
          revenueUsd: Number(snapshot.revenueUsd || 0),
          expenseUsd: Number(snapshot.expenseUsd || 0),
          profitUsd: Number(snapshot.profitUsd || 0),
          marginPct: Number(snapshot.marginPct || 0),
          source: "snapshot",
        };
      } else {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const shouldSnapshot = range.end.getTime() < currentMonthStart.getTime();
        const docs = await loadFinancialDocuments(tenantId);
        const computed = computeProfitLoss({
          payments: docs.payments,
          expenses: docs.expenses,
          payroll: docs.payroll,
          range,
          fxPkrPerUsd,
        });

        if (shouldSnapshot) {
          await adminDb.collection("financialSnapshots").add({
            tenantId,
            month,
            year,
            revenueUsd: computed.revenueUsd,
            expenseUsd: computed.expenseUsd,
            profitUsd: computed.profitUsd,
            marginPct: computed.marginPct,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        summary = { ...computed, source: "live" };
      }
    } else {
      const docs = await loadFinancialDocuments(tenantId);
      const computed = computeProfitLoss({
        payments: docs.payments,
        expenses: docs.expenses,
        payroll: docs.payroll,
        range,
        fxPkrPerUsd,
      });
      summary = { ...computed, source: "live" };
    }

    return NextResponse.json({
      ok: true,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      summary,
    });
  } catch (err: any) {
    console.error("super-admin reports profit-loss error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load profit & loss report.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
