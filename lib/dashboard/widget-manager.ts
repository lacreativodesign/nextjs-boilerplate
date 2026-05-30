import { adminDb } from "@/lib/firebaseAdmin";
import type { DashboardWidget, WidgetDataEnvelope } from "@/lib/dashboard/types";

function toIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof (value as Record<string, unknown>).toDate === "function") return (value as Record<string, unknown>).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

async function getRevenueChartData(tenantId: string, config: Record<string, unknown>) {
  const monthsCount = Number(config.months ?? 6);
  const now = new Date();
  const monthStarts: Date[] = [];
  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    monthStarts.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
  }

  try {
    const since = monthStarts[0];
    const snap = await adminDb
      .collection("invoices")
      .where("tenantId", "==", tenantId)
      .where("issuedAt", ">=", since)
      .get();

    const buckets = monthStarts.map((date) => ({
      month: date.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      revenue: 0,
    }));

    for (const doc of snap.docs) {
      const invoice = doc.data();
      const issuedAt = invoice.issuedAt?.toDate ? invoice.issuedAt.toDate() : new Date(invoice.issuedAt || 0);
      const idx = monthStarts.findIndex(
        (start, position) => issuedAt >= start && (position === monthStarts.length - 1 || issuedAt < monthStarts[position + 1])
      );
      if (idx >= 0) {
        buckets[idx].revenue += Number(invoice.totalAmount ?? invoice.amount ?? 0);
      }
    }

    return { series: buckets, total: buckets.reduce((sum, x) => sum + x.revenue, 0) };
  } catch {
    return { series: [], total: 0 };
  }
}

async function getInvoiceStatusData(tenantId: string) {
  try {
    const snap = await adminDb.collection("invoices").where("tenantId", "==", tenantId).limit(500).get();
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    for (const doc of snap.docs) {
      const status = String(doc.data().status || "pending").toLowerCase();
      if (status === "paid") paid += 1;
      else if (status === "overdue") overdue += 1;
      else pending += 1;
    }
    return { segments: [{ name: "Paid", value: paid }, { name: "Pending", value: pending }, { name: "Overdue", value: overdue }] };
  } catch {
    return { segments: [] };
  }
}

async function getTaskSummaryData(tenantId: string, config: Record<string, unknown>) {
  const lookAhead = Number(config.lookAheadDays ?? 14);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + lookAhead);
  try {
    const snap = await adminDb.collection("tasks").where("tenantId", "==", tenantId).limit(1000).get();
    let upcoming = 0;
    let completed = 0;
    for (const doc of snap.docs) {
      const task = doc.data();
      const done = Boolean(task.completed) || String(task.status || "").toLowerCase() === "completed";
      if (done) {
        completed += 1;
        continue;
      }
      const dueDate = task.dueDate?.toDate ? task.dueDate.toDate() : task.dueDate ? new Date(task.dueDate) : null;
      if (dueDate && dueDate <= cutoff) upcoming += 1;
    }
    return { bars: [{ name: "Upcoming", value: upcoming }, { name: "Completed", value: completed }] };
  } catch {
    return { bars: [] };
  }
}

async function getTopClientsData(tenantId: string, config: Record<string, unknown>) {
  const limit = Number(config.limit ?? 5);
  try {
    const snap = await adminDb.collection("invoices").where("tenantId", "==", tenantId).limit(1000).get();
    const byClient = new Map<string, number>();
    for (const doc of snap.docs) {
      const inv = doc.data();
      const name = String(inv.clientName || inv.clientId || "Unknown");
      byClient.set(name, (byClient.get(name) || 0) + Number(inv.totalAmount ?? inv.amount ?? 0));
    }
    return {
      rows: Array.from(byClient.entries())
        .map(([client, revenue]) => ({ client, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit),
    };
  } catch {
    return { rows: [] };
  }
}

async function getRecentActivityData(tenantId: string, config: Record<string, unknown>) {
  const limit = Number(config.limit ?? 10);
  try {
    const snap = await adminDb.collection("activities").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(limit).get();
    return {
      entries: snap.docs.map((doc) => {
        const row = doc.data();
        return {
          id: doc.id,
          label: String(row.action || row.type || "Activity"),
          actor: String(row.userName || row.actorName || row.userId || "System"),
          createdAt: toIso(row.createdAt),
        };
      }),
    };
  } catch {
    return { entries: [] };
  }
}

async function getTimeTrackingData(tenantId: string) {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  try {
    const snap = await adminDb
      .collection("time_entries")
      .where("tenantId", "==", tenantId)
      .where("startedAt", ">=", weekStart)
      .limit(2000)
      .get();
    const totalHours = snap.docs.reduce((sum, doc) => sum + Number(doc.data().hours || 0), 0);
    return { hours: Number(totalHours.toFixed(2)), entries: snap.size };
  } catch {
    return { hours: 0, entries: 0 };
  }
}

async function getLeaveCalendarData(tenantId: string, config: Record<string, unknown>) {
  const limit = Number(config.limit ?? 8);
  try {
    const snap = await adminDb.collection("leave_requests").where("tenantId", "==", tenantId).orderBy("startDate", "asc").limit(limit).get();
    return {
      leaves: snap.docs.map((doc) => {
        const row = doc.data();
        return {
          id: doc.id,
          employee: String(row.employeeName || row.employeeId || "Employee"),
          startDate: toIso(row.startDate),
          endDate: toIso(row.endDate),
          status: String(row.status || "pending"),
        };
      }),
    };
  } catch {
    return { leaves: [] };
  }
}

async function getProjectStatusData(tenantId: string) {
  try {
    const snap = await adminDb.collection("projects").where("tenantId", "==", tenantId).limit(1000).get();
    const buckets = new Map<string, number>();
    for (const doc of snap.docs) {
      const status = String(doc.data().status || "unknown");
      buckets.set(status, (buckets.get(status) || 0) + 1);
    }
    return { bars: Array.from(buckets.entries()).map(([status, value]) => ({ status, value })) };
  } catch {
    return { bars: [] };
  }
}

export async function getWidgetData(widget: DashboardWidget): Promise<WidgetDataEnvelope> {
  let data: Record<string, unknown>;
  switch (widget.type) {
    case "revenue_chart":
      data = await getRevenueChartData(widget.tenantId, widget.config);
      break;
    case "invoice_status":
      data = await getInvoiceStatusData(widget.tenantId);
      break;
    case "task_summary":
      data = await getTaskSummaryData(widget.tenantId, widget.config);
      break;
    case "top_clients":
      data = await getTopClientsData(widget.tenantId, widget.config);
      break;
    case "recent_activity":
      data = await getRecentActivityData(widget.tenantId, widget.config);
      break;
    case "time_tracking":
      data = await getTimeTrackingData(widget.tenantId);
      break;
    case "leave_calendar":
      data = await getLeaveCalendarData(widget.tenantId, widget.config);
      break;
    case "project_status":
      data = await getProjectStatusData(widget.tenantId);
      break;
    default:
      data = {};
  }

  return {
    widgetId: widget.id,
    type: widget.type,
    generatedAt: new Date().toISOString(),
    refreshIntervalMs: 60_000,
    data,
  };
}
