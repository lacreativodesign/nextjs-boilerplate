import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  computeHealth,
  getMonthKey,
  getReportSettings,
  getStartOfMonth,
  requireAdmin,
  toISO,
  toMillis,
} from "../reports/_utils";

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

    const settings = await getReportSettings();
    const now = new Date();
    const startMs = getStartOfMonth(now).getTime();
    const currentMonthKey = getMonthKey(now);

    const [
      projectSnap,
      changeRequestSnap,
      changeRequestAltSnap,
      invoiceSnap,
      paymentSnap,
      payrollSnap,
      expenseSnap,
      usersSnap,
      onboardingSnap,
      clientsSnap,
      eventsSnap,
    ] = await Promise.all([
      adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("changeRequests").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("change_requests").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("invoices").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("payments").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("payroll").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("expenses").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("users").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("onboardingTasks").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("clients").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("events").where("isDeleted", "==", false).limit(500).get(),
    ]);

    const projects = projectSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const changeRequests = [
      ...changeRequestSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ...changeRequestAltSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    ];
    const invoices = invoiceSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const payments = paymentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const payroll = payrollSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const expenses = expenseSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const onboardingTasks = onboardingSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const clients = clientsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const events = eventsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const safeEvents =
      events.length > 0
        ? events
        : (await adminDb.collection("events").limit(500).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const paidInvoiceIds = new Set(
      payments
        .filter((payment) => String(payment.status || "") === "Paid")
        .map((payment) => String(payment.invoiceId || ""))
        .filter(Boolean)
    );

    const paymentsThisMonth = payments.reduce((sum, payment) => {
      if (String(payment.status || "") !== "Paid") return sum;
      const paidMs = toMillis(payment.paidAt || payment.updatedAt || payment.createdAt);
      if (!paidMs || paidMs < startMs) return sum;
      return sum + Number(payment.amountUsd || 0);
    }, 0);

    const invoiceFallbackRevenue = invoices.reduce((sum, invoice) => {
      if (String(invoice.status || "") !== "Paid") return sum;
      const paidMs = toMillis(invoice.paidAt || invoice.updatedAt || invoice.createdAt);
      if (!paidMs || paidMs < startMs) return sum;
      if (paidInvoiceIds.has(String(invoice.id || ""))) return sum;
      return sum + Number(invoice.amountTotalUsd || 0);
    }, 0);

    const revenueThisMonthUsd = paymentsThisMonth + invoiceFallbackRevenue;

    const outstandingArUsd = invoices.reduce((sum, invoice) => {
      const status = String(invoice.status || "");
      if (["Paid", "Void"].includes(status)) return sum;
      return sum + Number(invoice.amountTotalUsd || 0);
    }, 0);

    const activeProjects = projects.filter((project) => String(project.stage || "").toLowerCase() !== "delivered").length;
    const overdueProjects = projects.filter((project) => {
      const stage = String(project.stage || "").toLowerCase();
      if (stage === "delivered") return false;
      const dueMs = toMillis(project.dueDate);
      return Boolean(dueMs && dueMs < now.getTime());
    }).length;
    const qaQueue = projects.filter((project) => String(project.stage || "").toLowerCase() === "final").length;

    const openChangeRequests = changeRequests.filter((req) => {
      const status = String(req.status || "");
      if (!status) return true;
      return !isClosedStatus(status);
    }).length;

    const workflowStages = Array.isArray(settings.projectStages) && settings.projectStages.length
      ? settings.projectStages
      : ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"];

    const projectsByStage = workflowStages.map((stage) => ({
      stage,
      count: projects.filter((project) => String(project.stage || "") === stage).length,
    }));

    const openChangeRequestByProject = new Map<string, number>();
    changeRequests.forEach((req) => {
      const status = String(req.status || "");
      if (status && isClosedStatus(status)) return;
      const projectId = String(req.projectId || "");
      if (!projectId) return;
      openChangeRequestByProject.set(projectId, (openChangeRequestByProject.get(projectId) || 0) + 1);
    });

    const atRiskBlocked = projects.reduce((count, project) => {
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

    const arAgingBuckets = invoices.reduce(
      (acc, invoice) => {
        const status = String(invoice.status || "");
        if (["Paid", "Void"].includes(status)) return acc;
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

    const payrollDuePkr = payroll.reduce((sum, row) => {
      const status = String(row.status || "Draft");
      if (!["Draft", "Approved"].includes(status)) return sum;
      if (String(row.month || "") !== currentMonthKey) return sum;
      return sum + Number(row.baseSalaryPkr || 0) + Number(row.commissionPkr || 0);
    }, 0);

    const expensesThisMonthPkr = expenses.reduce((sum, row) => {
      const expenseMs = toMillis(row.expenseDate || row.createdAt);
      if (!expenseMs || expenseMs < startMs) return sum;
      return sum + Number(row.amountPkr || 0);
    }, 0);

    const activeEmployees = users.filter((user) => isActiveUser(user)).length;
    const onboardingOpen = onboardingTasks.filter((task) => String(task.status || "").toLowerCase() !== "completed").length;
    const newHires30 = users.filter((user) => {
      const createdMs = toMillis(user.createdAt || user.joiningDate || user.updatedAt);
      if (!createdMs) return false;
      return createdMs >= now.getTime() - 30 * 24 * 60 * 60 * 1000;
    }).length;

    const totalClients = clients.length;
    const keyAccounts = clients.filter((client) => isKeyAccount(client)).length;
    const segmentCoverageCount = clients.filter((client) => hasSegmentCoverage(client)).length;
    const segmentCoveragePct = totalClients ? Math.round((segmentCoverageCount / totalClients) * 100) : 0;

    const recentActivity = safeEvents
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

    return NextResponse.json({
      ok: true,
      kpis: {
        revenueThisMonthUsd,
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
    });
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
