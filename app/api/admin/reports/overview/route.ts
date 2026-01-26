import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { computeHealth, getMonthKey, getReportSettings, getStartOfMonth, requireAdmin, toISO, toMillis } from "../_utils";
import { normalizeInvoiceStatus, normalizePaymentStatus } from "@/lib/finance/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIVITY_PREFIXES = ["finance.", "project.", "production.", "hr."];

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const settings = await getReportSettings();
    const now = new Date();
    const startMs = getStartOfMonth(now).getTime();

    const [
      invoiceSnap,
      paymentSnap,
      projectSnap,
      changeRequestSnap,
      changeRequestAltSnap,
      usersSnap,
      onboardingSnap,
      eventsSnap,
    ] = await Promise.all([
      adminDb.collection("invoices").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("payments").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("changeRequests").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("change_requests").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("users").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("onboardingTasks").where("isDeleted", "==", false).limit(500).get(),
      adminDb.collection("events").where("isDeleted", "==", false).limit(500).get(),
    ]);

    const invoices = invoiceSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const payments = paymentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const projects = projectSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const changeRequests = [
      ...changeRequestSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      ...changeRequestAltSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    ];
    const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const onboardingTasks = onboardingSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const events = eventsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const safeEvents =
      events.length > 0
        ? events
        : (await adminDb.collection("events").limit(500).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const revenueThisMonth = invoices.reduce((sum, inv) => {
      if (normalizeInvoiceStatus(inv.status) !== "paid") return sum;
      const paidMs = toMillis(inv.paidAt || inv.updatedAt || inv.createdAt);
      if (!paidMs || paidMs < startMs) return sum;
      return sum + Number(inv.amountTotalUsd || 0);
    }, 0);

    const paymentsThisMonth = payments.reduce((sum, payment) => {
      if (normalizePaymentStatus(payment.status) !== "succeeded") return sum;
      const paidMs = toMillis(payment.paidAt || payment.updatedAt || payment.createdAt);
      if (!paidMs || paidMs < startMs) return sum;
      return sum + Number(payment.amountUsd || 0);
    }, 0);

    const outstandingArTotal = invoices.reduce((sum, inv) => {
      const status = normalizeInvoiceStatus(inv.status);
      if (["paid", "void"].includes(status)) return sum;
      return sum + Number(inv.amountTotalUsd || 0);
    }, 0);

    const overdueInvoicesCount = invoices.reduce((count, inv) => {
      const status = normalizeInvoiceStatus(inv.status);
      if (["paid", "void"].includes(status)) return count;
      const dueMs = toMillis(inv.dueDate);
      if (!dueMs) return count;
      return dueMs < now.getTime() ? count + 1 : count;
    }, 0);

    const activeProjectsCount = projects.filter((project) => {
      const stage = String(project.stage || "");
      return stage.toLowerCase() !== "delivered";
    }).length;

    const overdueProjectsCount = projects.filter((project) => {
      const stage = String(project.stage || "");
      if (stage.toLowerCase() === "delivered") return false;
      const due = toISO(project.dueDate);
      const health = computeHealth(due, settings.atRiskAfterDays, settings.overdueAfterDays);
      return health === "Overdue";
    }).length;

    const qaQueueCount = projects.filter((project) => String(project.stage || "").toLowerCase() === "final").length;

    const openChangeRequestsCount = changeRequests.filter((req) => {
      const status = String(req.status || "").toLowerCase();
      if (!status) return true;
      return !["approved", "closed", "completed", "done", "resolved"].some((token) => status.includes(token));
    }).length;

    const activeEmployeesCount = users.filter((user) => {
      const status = String(user.status || "active").toLowerCase();
      return !["inactive", "terminated", "disabled"].includes(status);
    }).length;

    const onboardingOpenCount = onboardingTasks.filter((task) => {
      const status = String(task.status || "").toLowerCase();
      return status !== "completed";
    }).length;

    const seriesMonths = Array.from({ length: 6 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      return getMonthKey(d);
    });

    const revenueSeries = seriesMonths.map((key) => ({ label: key, revenue: 0, payments: 0 }));

    invoices.forEach((inv) => {
      if (normalizeInvoiceStatus(inv.status) !== "paid") return;
      const paidMs = toMillis(inv.paidAt || inv.updatedAt || inv.createdAt);
      if (!paidMs) return;
      const key = getMonthKey(new Date(paidMs));
      const bucket = revenueSeries.find((row) => row.label === key);
      if (!bucket) return;
      bucket.revenue += Number(inv.amountTotalUsd || 0);
    });

    payments.forEach((pay) => {
      if (normalizePaymentStatus(pay.status) !== "succeeded") return;
      const paidMs = toMillis(pay.paidAt || pay.createdAt);
      if (!paidMs) return;
      const key = getMonthKey(new Date(paidMs));
      const bucket = revenueSeries.find((row) => row.label === key);
      if (!bucket) return;
      bucket.payments += Number(pay.amountUsd || 0);
    });

    const activity = safeEvents
      .map((event) => ({
        id: event.id,
        type: String(event.type || ""),
        title: String(event.title || ""),
        description: String(event.description || ""),
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
      overview: {
        kpis: {
          revenueThisMonth,
          paymentsThisMonth,
          outstandingArTotal,
          overdueInvoicesCount,
        },
        ops: {
          activeProjectsCount,
          overdueProjectsCount,
          qaQueueCount,
          openChangeRequestsCount,
        },
        people: {
          activeEmployeesCount,
          onboardingOpenCount,
        },
        revenueSeries,
        recentActivity: activity,
      },
    });
  } catch (err: any) {
    console.error("reports/overview error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load reports overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
