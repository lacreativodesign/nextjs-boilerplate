import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../_utils";

export const dynamic = "force-dynamic";

const PIPELINE_STAGES = [
  "Inquiry",
  "Deposit",
  "Kickoff",
  "Draft",
  "Review",
  "Revisions",
  "Final",
  "Delivered",
];

type ProjectDoc = {
  projectCode?: string | null;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  projectType?: string;
  stage?: string;
  priority?: string;
  health?: string;
  createdByUid?: string;
  createdByName?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  createdAt?: any;
  updatedAt?: any;
  startDate?: any;
  dueDate?: any;
  lastActivityAt?: any;
  totalPaidUsd?: number;
  outstandingUsd?: number;
  isDeleted?: boolean;
  internalNotes?: string;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function canViewProjects(role: string) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "super_admin" || r === "sales_manager" || r === "am";
}

function computeHealth(dueDate: string | null): "Overdue" | "At Risk" | "On Track" {
  if (!dueDate) return "On Track";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "On Track";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = due.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Overdue";
  if (diffDays <= 7) return "At Risk";
  return "On Track";
}

export async function GET(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = (me.role || "").toLowerCase();
    if (!canViewProjects(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim().toLowerCase();
    const stage = String(searchParams.get("stage") || "").trim();
    const type = String(searchParams.get("type") || "").trim();
    const priority = String(searchParams.get("priority") || "").trim();
    const healthFilter = String(searchParams.get("health") || "").trim();
    const cursor = String(searchParams.get("cursor") || "").trim();
    const rawLimit = Number(searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, Math.floor(rawLimit))) : 50;

    let baseQuery: FirebaseFirestore.Query = adminDb
      .collection("projects")
      .where("tenantId", "==", me.tenantId)
      .where("isDeleted", "==", false);

    let queries: FirebaseFirestore.Query[] = [baseQuery];

    if (role === "am") {
      queries = [
        baseQuery.where("ownerAmUid", "==", me.uid),
        baseQuery.where("ownerAmUid", "==", null).where("createdByUid", "==", me.uid),
      ];
    }

    // Fetch enough docs for in-memory filtering; limit*20 gives headroom for filter selectivity
    const fetchLimit = Math.min(limit * 20, 2000);
    const snaps = await Promise.all(queries.map((query) => query.limit(fetchLimit).get()));

    const merged = new Map<string, ProjectDoc>();
    snaps.forEach((snap) => {
      snap.docs.forEach((doc) => {
        merged.set(doc.id, doc.data() as ProjectDoc);
      });
    });

    let projects = Array.from(merged.entries()).map(([id, data]) => {
      const stageValue = PIPELINE_STAGES.includes(data.stage || "") ? data.stage : "Inquiry";
      const dueDate = toISO(data.dueDate);
      const health = computeHealth(dueDate);

      return {
        id,
        projectCode: data.projectCode || null,
        projectName: data.projectName || "",
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        projectType: data.projectType || "",
        stage: stageValue,
        priority: data.priority || "Normal",
        health,
        createdByUid: data.createdByUid || "",
        createdByName: data.createdByName || "",
        ownerAmUid: data.ownerAmUid ?? null,
        ownerAmName: data.ownerAmName ?? null,
        productionUid: data.productionUid ?? null,
        productionName: data.productionName ?? null,
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        startDate: toISO(data.startDate),
        dueDate,
        lastActivityAt: toISO(data.lastActivityAt),
        totalPaidUsd: Number(data.totalPaidUsd || 0),
        outstandingUsd: Number(data.outstandingUsd || 0),
        internalNotes: data.internalNotes || "",
      };
    });

    if (stage) {
      projects = projects.filter((project) => project.stage === stage);
    }

    if (type) {
      projects = projects.filter((project) => project.projectType === type);
    }

    if (priority) {
      projects = projects.filter((project) => project.priority === priority);
    }

    if (q) {
      projects = projects.filter((project) => {
        const hay = [project.projectName, project.clientName, project.projectType, project.stage]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (healthFilter) {
      projects = projects.filter((project) => project.health === healthFilter);
    }

    projects.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = projects.findIndex((project) => project.id === cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    const pagedProjects = projects.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < projects.length;
    const lastDoc = pagedProjects.length > 0 ? pagedProjects[pagedProjects.length - 1] : null;

    const totals = projects.reduce(
      (acc, project) => {
        acc.total += 1;
        if (project.health === "Overdue") acc.overdue += 1;
        if (project.health === "At Risk") acc.atRisk += 1;
        if (project.health === "On Track") acc.onTrack += 1;
        return acc;
      },
      { total: 0, overdue: 0, atRisk: 0, onTrack: 0 }
    );

    return NextResponse.json({
      ok: true,
      projects: pagedProjects,
      totals,
      pagination: {
        limit,
        hasMore,
        nextCursor: lastDoc?.id || null,
        cursor: lastDoc?.id || null,
      },
      currentUser: {
        uid: me.uid,
        role: me.role,
        name: me.name || me.fullName || me.displayName || "",
      },
    });
  } catch (err: any) {
    console.error("projects/list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load projects right now.";
    return NextResponse.json(
      { ok: false, error: safeMessage, code: isIndexError ? "missing_index" : "unknown_error" },
      { status: 500 }
    );
  }
}
