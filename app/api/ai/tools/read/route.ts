/**
 * AI Tool Read Endpoint
 * Handles all read-only tool calls from the agent runner.
 * Secured with INTERNAL_REQUEST_SIGNING_SECRET.
 * Only callable server-side by the agent runner — never from the browser.
 */

import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

function verifySecret(req: NextRequest): boolean {
  const secret = req.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_REQUEST_SIGNING_SECRET;
  return Boolean(expected && secret && secret === expected);
}

function toISO(val: unknown): string | null {
  if (!val) return null;
  try {
    if (typeof (val as Record<string, unknown>)?.toDate === "function") return (val as { toDate: () => Date }).toDate().toISOString();
    const d = new Date(val as string | number | Date);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { tool, tenantId, input = {} } = body;

  if (!tool || !tenantId) {
    return NextResponse.json({ ok: false, error: "tool and tenantId required" }, { status: 400 });
  }

  try {
    const result = await executeTool(tool, tenantId, input);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err instanceof Error ? err.message : undefined) || "Tool execution failed" }, { status: 500 });
  }
}

async function executeTool(tool: string, tenantId: string, input: Record<string, unknown>): Promise<unknown> {
  const now = new Date();

  switch (tool) {

    case "get_business_summary": {
      const [invoicesSnap, leadsSnap, projectsSnap, usersSnap] = await Promise.all([
        adminDb.collection("invoices").where("tenantId", "==", tenantId).where("isPaid", "==", false).get(),
        adminDb.collection("leads").where("tenantId", "==", tenantId).get(),
        adminDb.collection("projects").where("tenantId", "==", tenantId).get(),
        adminDb.collection("users").where("tenantId", "==", tenantId).get(),
      ]);

      const overdueInvoices = invoicesSnap.docs.filter((doc) => {
        const dd = doc.data()?.dueDate;
        if (!dd) return false;
        const due = dd?.toDate ? dd.toDate() : new Date(dd);
        return due < now;
      });

      const totalOverdue = overdueInvoices.reduce((sum, doc) => sum + Number(doc.data()?.amountTotalUsd || 0), 0);
      const openLeads = leadsSnap.docs.filter((d) => !["Won", "Lost"].includes(d.data()?.stage || "")).length;
      const activeProjects = projectsSnap.docs.filter((d) => !["Completed", "Cancelled"].includes(d.data()?.stage || "")).length;

      return {
        totalUsers: usersSnap.size,
        openLeads,
        activeProjects,
        overdueInvoicesCount: overdueInvoices.length,
        overdueInvoicesTotalUsd: Math.round(totalOverdue * 100) / 100,
        generatedAt: now.toISOString(),
      };
    }

    case "get_overdue_invoices": {
      const limit = Number(input.limit || 10);
      const snap = await adminDb
        .collection("invoices")
        .where("tenantId", "==", tenantId)
        .where("isPaid", "==", false)
        .orderBy("dueDate", "asc")
        .limit(50)
        .get();

      const overdue = snap.docs
        .filter((doc) => {
          const dd = doc.data()?.dueDate;
          if (!dd) return false;
          const due = dd?.toDate ? dd.toDate() : new Date(dd);
          return due < now;
        })
        .slice(0, limit)
        .map((doc) => {
          const d = doc.data();
          const due = d.dueDate?.toDate ? d.dueDate.toDate() : new Date(d.dueDate);
          const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: doc.id,
            orderId: d.orderId || "",
            clientName: d.clientName || "Unknown",
            amountUsd: Number(d.amountTotalUsd || 0),
            dueDate: toISO(d.dueDate),
            daysOverdue,
          };
        });

      return { overdue, count: overdue.length };
    }

    case "get_open_leads": {
      const limit = Number(input.limit || 20);
      const stage = input.stage || null;

      const query = adminDb.collection("leads").where("tenantId", "==", tenantId);
      const snap = await query.limit(200).get();

      const openStages = ["New", "Contacted", "Qualified", "Proposal", "Negotiation"];
      const leads = snap.docs
        .filter((doc) => {
          const s = doc.data()?.stage || "New";
          if (stage) return s === stage;
          return openStages.includes(s);
        })
        .slice(0, limit)
        .map((doc) => {
          const d = doc.data();
          const created = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || 0);
          const daysOpen = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
          return {
            id: doc.id,
            name: d.name || "",
            stage: d.stage || "New",
            source: d.source || "",
            ownerName: d.ownerName || "Unassigned",
            daysOpen,
          };
        });

      const byStage = leads.reduce<Record<string, number>>((acc, l) => {
        acc[l.stage] = (acc[l.stage] || 0) + 1;
        return acc;
      }, {});

      return { leads, byStage, totalOpen: leads.length };
    }

    case "get_active_projects": {
      const limit = Number(input.limit || 20);
      const statusFilter = input.status || null;

      const snap = await adminDb
        .collection("projects")
        .where("tenantId", "==", tenantId)
        .limit(200)
        .get();

      const activeStages = ["Inquiry", "Proposal", "Active", "In Review", "On Hold"];
      const projects = snap.docs
        .filter((doc) => {
          const s = doc.data()?.stage || "";
          if (statusFilter === "overdue") {
            const dd = doc.data()?.dueDate;
            if (!dd) return false;
            const due = dd?.toDate ? dd.toDate() : new Date(dd);
            return due < now && activeStages.includes(s);
          }
          return activeStages.includes(s);
        })
        .slice(0, limit)
        .map((doc) => {
          const d = doc.data();
          const due = d.dueDate?.toDate ? d.dueDate.toDate() : (d.dueDate ? new Date(d.dueDate) : null);
          const isOverdue = due ? due < now : false;
          return {
            id: doc.id,
            projectName: d.projectName || "",
            clientName: d.clientName || "",
            stage: d.stage || "",
            health: d.health || "unknown",
            ownerAmName: d.ownerAmName || "Unassigned",
            dueDate: toISO(d.dueDate),
            isOverdue,
          };
        });

      return { projects, totalActive: projects.length, overdueCount: projects.filter((p) => p.isOverdue).length };
    }

    case "get_team_overview": {
      const snap = await adminDb.collection("users").where("tenantId", "==", tenantId).get();

      const byRole: Record<string, number> = {};
      let activeCount = 0;

      snap.docs.forEach((doc) => {
        const d = doc.data();
        const role = d.role || "unknown";
        byRole[role] = (byRole[role] || 0) + 1;
        if ((d.status || "active") === "active") activeCount++;
      });

      return {
        totalUsers: snap.size,
        activeUsers: activeCount,
        inactiveUsers: snap.size - activeCount,
        byRole,
      };
    }

    case "get_recent_activity": {
      const limit = Number(input.limit || 15);
      const snap = await adminDb
        .collection("auditLogs")
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const activity = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          actionType: d.actionType || "",
          entityType: d.entityType || "",
          entityId: d.entityId || "",
          actorName: d.actorName || "System",
          createdAt: toISO(d.createdAt),
        };
      });

      return { activity, count: activity.length };
    }

    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}
