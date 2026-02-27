import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, normalizeRole } from "@/app/api/admin/_utils";
import { getPeriodDateRange, PeriodType } from "@/lib/performance/periods";

async function safeCount(queryBuilder: () => Promise<FirebaseFirestore.QuerySnapshot>): Promise<number> {
  try {
    const snap = await queryBuilder();
    return snap.size;
  } catch {
    return 0;
  }
}

async function safeDocs(queryBuilder: () => Promise<FirebaseFirestore.QuerySnapshot>): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  try {
    const snap = await queryBuilder();
    return snap.docs;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const period = req.nextUrl.searchParams.get("period");
  if (!period) return NextResponse.json({ ok: false, error: "period is required" }, { status: 400 });

  const requestedRole = normalizeRole(req.nextUrl.searchParams.get("role") || me.role);
  const userId = req.nextUrl.searchParams.get("userId") || me.uid;
  const periodType = (req.nextUrl.searchParams.get("periodType") || (period.includes("-Q") ? "quarterly" : period.includes("-") ? "monthly" : "annual")) as PeriodType;

  const { start, end } = getPeriodDateRange(period, periodType);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const actuals: Record<string, number> = {};
  const tenantId = me.tenantId;

  if (requestedRole === "sales") {
    const leads = await safeCount(() =>
      adminDb.collection("leads").where("tenantId", "==", tenantId).where("createdBy", "==", userId).where("createdAt", ">=", startIso).where("createdAt", "<=", endIso).get()
    );
    const dealsDocs = await safeDocs(() =>
      adminDb.collection("deals").where("tenantId", "==", tenantId).where("status", "==", "closed_won").where("closedAt", ">=", startIso).where("closedAt", "<=", endIso).get()
    );
    const assignedWins = dealsDocs.filter((doc) => {
      const d = doc.data() || {};
      return d.closedBy === userId || d.assignedTo === userId;
    });

    actuals.leadsCreated = leads;
    actuals.dealsClosed = assignedWins.length;
    actuals.revenueGenerated = assignedWins.reduce((sum, doc) => sum + Number(doc.data()?.valueUsd || doc.data()?.finalPriceUsd || 0), 0);
  } else if (requestedRole === "sales_manager") {
    const users = await safeDocs(() => adminDb.collection("users").where("tenantId", "==", tenantId).where("role", "==", "sales").get());
    const ids = new Set(users.map((doc) => doc.id));
    const leadsDocs = await safeDocs(() =>
      adminDb.collection("leads").where("tenantId", "==", tenantId).where("createdAt", ">=", startIso).where("createdAt", "<=", endIso).get()
    );
    const winsDocs = await safeDocs(() =>
      adminDb.collection("deals").where("tenantId", "==", tenantId).where("status", "==", "closed_won").where("closedAt", ">=", startIso).where("closedAt", "<=", endIso).get()
    );

    actuals.leadsCreated = leadsDocs.filter((doc) => ids.has(String(doc.data()?.createdBy || ""))).length;
    const teamWins = winsDocs.filter((doc) => ids.has(String(doc.data()?.closedBy || doc.data()?.assignedTo || "")));
    actuals.dealsClosed = teamWins.length;
    actuals.revenueGenerated = teamWins.reduce((sum, doc) => sum + Number(doc.data()?.valueUsd || doc.data()?.finalPriceUsd || 0), 0);
  } else if (requestedRole === "am" || requestedRole === "am_manager") {
    actuals.activeClients = await safeCount(() => adminDb.collection("clients").where("tenantId", "==", tenantId).where("managerId", "==", userId).where("status", "==", "active").get());
    actuals.projectsCompleted = await safeCount(() =>
      adminDb.collection("projects").where("tenantId", "==", tenantId).where("completedAt", ">=", startIso).where("completedAt", "<=", endIso).where("completedBy", "==", userId).get()
    );
  } else if (requestedRole === "production" || requestedRole === "production_manager") {
    actuals.jobsCompleted = await safeCount(() =>
      adminDb.collection("production_jobs").where("tenantId", "==", tenantId).where("completedAt", ">=", startIso).where("completedAt", "<=", endIso).where("completedBy", "==", userId).get()
    );
    actuals.jobsInProgress = await safeCount(() =>
      adminDb.collection("production_jobs").where("tenantId", "==", tenantId).where("assignedTo", "==", userId).where("status", "==", "in_progress").get()
    );
  } else if (requestedRole === "hr") {
    actuals.employeesOnboarded = await safeCount(() =>
      adminDb.collection("users").where("tenantId", "==", tenantId).where("createdAt", ">=", startIso).where("createdAt", "<=", endIso).get()
    );
    actuals.tasksCompleted = await safeCount(() =>
      adminDb.collection("hr_tasks").where("tenantId", "==", tenantId).where("completedAt", ">=", startIso).where("completedAt", "<=", endIso).where("completedBy", "==", userId).get()
    );
  } else if (requestedRole === "finance") {
    const invoices = await safeDocs(() =>
      adminDb.collection("invoices").where("tenantId", "==", tenantId).where("createdAt", ">=", startIso).where("createdAt", "<=", endIso).get()
    );
    actuals.invoicesCreated = invoices.length;
    actuals.revenueInvoiced = invoices.reduce((sum, doc) => sum + Number(doc.data()?.amount || doc.data()?.total || 0), 0);
  }

  return NextResponse.json({ ok: true, userId, period, role: requestedRole, actuals });
}
