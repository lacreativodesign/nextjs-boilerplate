import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/constants";
import { normalizeTenantId } from "@/lib/tenant";
import { queryWithTenant } from "@/lib/tenant/query";
import {
  computeHealth,
  getMonthKey,
  getReportSettings,
  getStartOfMonth,
  requireAdmin,
  toISO,
  toMillis,
} from "../reports/_utils";
import { DEFAULT_FINANCE_SETTINGS, getFinanceSettings } from "../settings/_utils";
import { normalizeInvoiceStatus, normalizePaymentStatus } from "@/lib/finance/status";
import { getRedisClient } from "@/lib/cache/redis-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIVITY_PREFIXES = ["finance.", "project.", "production.", "hr."];

function isClosedStatus(status: string) {
  const normalized = status.toLowerCase();
  return ["completed", "rejected", "closed", "resolved", "done"].some((token) => normalized.includes(token));
}

function isActiveUser(user: Record<string, any>) {
  const status = String(user.status || "active").toLowerCase();
  if (["inactive", "terminated", "disabled"].includes(status)) return false;
  return !user.disabled;
}

function isKeyAccount(client: Record<string, any>) {
  return Number(client.totalPaidUsd || 0) >= 1000;
}

function hasSegmentCoverage(client: Record<string, any>) {
  const segmentServices = Array.isArray(client.segmentServices) ? client.segmentServices : [];
  return Boolean(
    segmentServices.length ||
      client.segmentBusinessType ||
      client.segmentIndustry ||
      client.segmentGeo ||
      client.businessType ||
      client.industry ||
      client.country ||
      client.city
  );
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    const redis = await getRedisClient();
    const cacheKey = `overview:admin:${auth.user.tenantId}`;
    const cached = redis ? await redis.get(cacheKey) : null;
    if (cached) return NextResponse.json(JSON.parse(String(cached)));

    const tenantId = normalizeTenantId(auth.user.tenantId || DEFAULT_TENANT_ID);
    const [settings, financeSettings] = await Promise.all([getReportSettings(), getFinanceSettings()]);
    const now = new Date();
    const startMs = getStartOfMonth(now).getTime();
    const startYearMs = new Date(now.getFullYear(), 0, 1).getTime();
    const currentMonthKey = getMonthKey(now);
    const fxPkrPerUsdRaw = Number(financeSettings.fxPkrPerUsd || DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd);
    const fxPkrPerUsd = fxPkrPerUsdRaw > 0 ? fxPkrPerUsdRaw : DEFAULT_FINANCE_SETTINGS.fxPkrPerUsd;

    const [
      projectDocs,
      changeRequestDocs,
      invoiceDocs,
      paymentDocs,
      payrollDocs,
      expenseDocs,
      userDocs,
      onboardingDocs,
      clientDocs,
      eventDocs,
    ] = await Promise.all([
      queryWithTenant(adminDb.collection("projects").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("changeRequests").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("invoices").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("payments").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("payroll").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("expenses").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("users").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("onboardingTasks").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("clients").where("isDeleted", "==", false).limit(500), tenantId),
      queryWithTenant(adminDb.collection("events").where("isDeleted", "==", false).limit(500), tenantId),
    ]);

    const projects = projectDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const changeRequests = changeRequestDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const invoices = invoiceDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const payments = paymentDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const payroll = payrollDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const expenses = expenseDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const users = userDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const onboardingTasks = onboardingDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const clients = clientDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const events = eventDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const safeEvents =
      events.length > 0
        ? events
        : (await queryWithTenant(adminDb.collection("events").limit(500), tenantId)).map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

    const matchesTenant = (doc: Record<string, any>) =>
      String(doc.tenantId || DEFAULT_TENANT_ID) === String(tenantId || DEFAULT_TENANT_ID);

    const scopedProjects = projects.filter(matchesTenant);
    const scopedChangeRequests = changeRequests.filter(matchesTenant);
    const scopedInvoices = invoices.filter(matchesTenant);
    const scopedPayments = payments.filter(matchesTenant);
    const scopedPayroll = payroll.filter(matchesTenant);
    const scopedExpenses = expenses.filter(matchesTenant);
    const scopedUsers = users.filter(matchesTenant);
    const scopedOnboardingTasks = onboardingTasks.filter(matchesTenant);
    const scopedClients = clients.filter(matchesTenant);
    const scopedEvents = safeEvents.filter(matchesTenant);

    const paidInvoiceIds = new Set(
      scopedPayments
        .filter((payment) => normalizePaymentStatus(payment.status) === "succeeded")
        .map((payment) => String(payment.invoiceId || ""))
        .filter(Boolean)
    );

    const paymentsThisMonth = scopedPayments.reduce((sum, payment) => {
      if (normalizePaymentStatus(payment.status) !== "succeeded") return sum;
      const paidMs = toMillis(payment.paidAt || payment.updatedAt || payment.createdAt);
      if (!paidMs || paidMs < startMs) return sum;
      return sum + Number(payment.amountUsd || 0);
    }, 0);

    const invoiceFallbackRevenue = scopedInvoices.reduce((sum, invoice) => {
      if (normalizeInvoiceStatus(invoice.status) !== "paid") return sum;
      const paidMs = toMillis(invoice.paidAt || invoice.updatedAt || invoice.createdAt);
      if (!paidMs || paidMs < startMs) return sum;
      if (paidInvoiceIds.has(String(invoice.id || ""))) return sum;
      return sum + Number(invoice.amountTotalUsd || 0);
    }, 0);

    const revenueThisMonthUsd = paymentsThisMonth + invoiceFallbackRevenue;

    const revenueYtdUsd =
      scopedPayments.reduce((sum, payment) => {
        if (normalizePaymentStatus(payment.status) !== "succeeded") return sum;
        const paidMs = toMillis(payment.paidAt || payment.updatedAt || payment.createdAt);
        if (!paidMs || paidMs < startYearMs) return sum;
        return sum + Number(payment.amountUsd || 0);
      }, 0) +
      scopedInvoices.reduce((sum, invoice) => {
        if (normalizeInvoiceStatus(invoice.status) !== "paid") return sum;
        const paidMs = toMillis(invoice.paidAt || invoice.updatedAt || invoice.createdAt);
        if (!paidMs || paidMs < startYearMs) return sum;
        if (paidInvoiceIds.has(String(invoice.id || ""))) return sum;
        return sum + Number(invoice.amountTotalUsd || 0);
      }, 0);

    const outstandingArUsd = scopedInvoices.reduce((sum, invoice) => {
      const status = normalizeInvoiceStatus(invoice.status);
      if (["paid", "void"].includes(status)) return sum;
      return sum + Number(invoice.amountTotalUsd || 0);
    }, 0);

    const activeProjects = scopedProjects.filter((project) => String(project.stage || "").toLowerCase() !== "delivered").length;
    const overdueProjects = scopedProjects.filter((project) => {
      const stage = String(project.stage || "").toLowerCase();
      if (stage === "delivered") return false;
      const dueMs = toMillis(project.dueDate);
      return Boolean(dueMs && dueMs < now.getTime());
    }).length;
    const qaQueue = scopedProjects.filter((project) => String(project.stage || "").toLowerCase() === "final").length;

    const openChangeRequests = scopedChangeRequests.filter((req) => {
      const status = String(req.status || "");
      if (!status) return true;
      return !isClosedStatus(status);
    }).length;

    const workflowStages = Array.isArray(settings.projectStages) && settings.projectStages.length
      ? settings.projectStages
      : ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"];

    const projectsByStage = workflowStages.map((stage) => ({
      stage,
      count: scopedProjects.filter((project) => String(project.stage || "") === stage).length,
    }));

    const openChangeRequestByProject = new Map<string, number>();
    scopedChangeRequests.forEach((req) => {
      const status = String(req.status || "");
      if (status && isClosedStatus(status)) return;
      const projectId = String(req.projectId || "");
      if (!projectId) return;
      openChangeRequestByProject.set(projectId, (openChangeRequestByProject.get(projectId) || 0) + 1);
    });

    const atRiskBlocked = scopedProjects.reduce((count, project) => {
      const health = String(project.health || "").toLowerCase();
      if (health) {
        if (health.includes("at risk") || health.includes("blocked") || health.includes("overdue")) return count + 1;
        return count;
      }

      const dueIso = toISO(project.dueDate);
      const computed = computeHealth(dueIso, settings.atRiskAfterDays, settings.overdueAfterDays);
      const changeRequestsOpen = openChangeRequestByProject.get(String(project.id || "")) || 0;
      if (computed === "Overdue" || computed === "At Risk" || changeRequestsOpen >= 2) return count + 1;
      return count;
    }, 0);

    const arAgingBuckets = scopedInvoices.reduce(
      (acc, invoice) => {
        const status = normalizeInvoiceStatus(invoice.status);
        if (["paid", "void"].includes(status)) return acc;
        const dueMs = toMillis(invoice.dueDate);
        const value = Number(invoice.amountTotalUsd || 0);
        if (!dueMs) {
          acc.bucket0to30 += value;
          return acc;
        }
        const diffDays = Math.max(0, Math.floor((now.getTime() - dueMs) / (1000 * 60 * 60 * 24)));
        if (diffDays <= 30) acc.bucket0to30 += value;
        else if (diffDays <= 60) acc.bucket31to60 += value;
        else if (diffDays <= 90) acc.bucket61to90 += value;
        else acc.bucket90plus += value;
        return acc;
      },
      { bucket0to30: 0, bucket31to60: 0, bucket61to90: 0, bucket90plus: 0 }
    );

    const payrollDuePkr = scopedPayroll.reduce((sum, row) => {
      const status = String(row.status || "Draft");
      if (!["Draft", "Approved"].includes(status)) return sum;
      if (String(row.month || "") !== currentMonthKey) return sum;
      return sum + Number(row.baseSalaryPkr || 0) + Number(row.commissionPkr || 0);
    }, 0);

    const payrollYtdPkr = scopedPayroll.reduce((sum, row) => {
      const status = String(row.status || "Draft");
      if (!["Draft", "Approved"].includes(status)) return sum;
      const monthKey = String(row.month || "");
      if (!monthKey.startsWith(`${now.getFullYear()}-`)) return sum;
      return sum + Number(row.baseSalaryPkr || 0) + Number(row.commissionPkr || 0);
    }, 0);

    const expensesThisMonthPkr = scopedExpenses.reduce((sum, row) => {
      const expenseMs = toMillis(row.expenseDate || row.createdAt);
      if (!expenseMs || expenseMs < startMs) return sum;
      return sum + Number(row.amountPkr || 0);
    }, 0);

    const expensesYtdPkr = scopedExpenses.reduce((sum, row) => {
      const expenseMs = toMillis(row.expenseDate || row.createdAt);
      if (!expenseMs || expenseMs < startYearMs) return sum;
      return sum + Number(row.amountPkr || 0);
    }, 0);

    const expensesThisMonthUsdNormalized = (payrollDuePkr + expensesThisMonthPkr) / fxPkrPerUsd;
    const expensesYtdUsdNormalized = (payrollYtdPkr + expensesYtdPkr) / fxPkrPerUsd;
    const netProfitThisMonthUsd = revenueThisMonthUsd - expensesThisMonthUsdNormalized;
    const netProfitYtdUsd = revenueYtdUsd - expensesYtdUsdNormalized;
    const profitMarginPct = revenueThisMonthUsd
      ? Math.max(0, Math.min(100, Math.round((netProfitThisMonthUsd / revenueThisMonthUsd) * 100)))
      : 0;

    const activeEmployees = scopedUsers.filter((user) => isActiveUser(user)).length;
    const onboardingOpen = scopedOnboardingTasks.filter((task) => String(task.status || "").toLowerCase() !== "completed").length;
    const newHires30 = scopedUsers.filter((user) => {
      const createdMs = toMillis(user.createdAt || user.joiningDate || user.updatedAt);
      if (!createdMs) return false;
      return createdMs >= now.getTime() - 30 * 24 * 60 * 60 * 1000;
    }).length;

    const totalClients = scopedClients.length;
    const keyAccounts = scopedClients.filter((client) => isKeyAccount(client)).length;
    const segmentCoverageCount = scopedClients.filter((client) => hasSegmentCoverage(client)).length;
    const segmentCoveragePct = totalClients ? Math.round((segmentCoverageCount / totalClients) * 100) : 0;

    const recentActivity = scopedEvents
      .map((event) => ({
        id: event.id,
        type: String(event.type || ""),
        summary: String(event.title || event.description || ""),
        actor: String(event.createdByName || event.createdByUid || "System"),
        createdAt: toISO(event.createdAt),
      }))
      .filter((event) => ACTIVITY_PREFIXES.some((prefix) => event.type.startsWith(prefix)))
      .sort((a, b) => {
        const left = new Date(a.createdAt || 0).getTime();
        const right = new Date(b.createdAt || 0).getTime();
        return right - left;
      })
      .slice(0, 20);

    const responsePayload = {
      ok: true,
      kpis: {
        revenueThisMonthUsd,
        revenueYtdUsd,
        expensesThisMonthUsdNormalized,
        expensesYtdUsdNormalized,
        netProfitThisMonthUsd,
        netProfitYtdUsd,
        profitMarginPct,
        outstandingArUsd,
        activeProjects,
        overdueProjects,
        qaQueue,
        openChangeRequests,
        payrollDuePkr,
        expensesThisMonthPkr,
        activeEmployees,
        onboardingOpen,
        newHires30,
        totalClients,
        keyAccounts,
        segmentCoveragePct,
        atRiskBlocked,
      },
      charts: {
        projectsByStage,
        arAging: [
          { bucket: "0-30", amountUsd: arAgingBuckets.bucket0to30 },
          { bucket: "31-60", amountUsd: arAgingBuckets.bucket31to60 },
          { bucket: "61-90", amountUsd: arAgingBuckets.bucket61to90 },
          { bucket: "90+", amountUsd: arAgingBuckets.bucket90plus },
        ],
      },
      tables: {
        recentActivity,
      },
    };

    if (redis) {
      await (redis as any).setex(cacheKey, 60, JSON.stringify(responsePayload)).catch(() => undefined);
    }

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("admin/overview error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load admin overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
