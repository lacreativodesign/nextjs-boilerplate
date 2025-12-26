import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  getCurrentUser,
  isAccountManager,
  isAdminOrSuper,
  isProduction,
  isSalesManager,
  normalizeRole,
} from "../../_utils";

export const dynamic = "force-dynamic";

const LOCKED_STAGES = ["Deposit", "Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;
const LEGACY_STAGE = "Inquiry";

type ProjectDoc = {
  projectCode?: string | null;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  projectType?: string;
  stage?: string;
  priority?: string;
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
  stageHistory?: Array<{ from?: string; to?: string; byUid?: string; byName?: string; at?: any }>;
  stageTimestamps?: Record<string, any> | null;
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

function computeHealth(dueDate: string | null, stage?: string): "Overdue" | "At Risk" | "On Track" {
  if (stage === "Delivered") return "On Track";
  if (!dueDate) return "On Track";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "On Track";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = due.getTime() - startOfToday.getTime();

  if (diffMs < 0) return "Overdue";
  if (diffMs <= 48 * 60 * 60 * 1000) return "At Risk";
  return "On Track";
}

function normalizeStage(stage?: string | null) {
  if (!stage) return LEGACY_STAGE;
  if (LOCKED_STAGES.includes(stage as (typeof LOCKED_STAGES)[number])) return stage;
  if (stage === LEGACY_STAGE) return LEGACY_STAGE;
  return LEGACY_STAGE;
}

function normalizeStageTimestamps(map?: Record<string, any> | null) {
  if (!map) return {} as Record<string, string>;
  return Object.entries(map).reduce<Record<string, string>>((acc, [key, value]) => {
    const iso = toISO(value);
    if (iso) acc[key] = iso;
    return acc;
  }, {});
}

function normalizeStageHistory(history?: ProjectDoc["stageHistory"]) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => ({
      from: entry?.from || "",
      to: entry?.to || "",
      byUid: entry?.byUid || "",
      byName: entry?.byName || "",
      at: toISO(entry?.at),
    }))
    .filter((entry) => entry.to || entry.from);
}

function canViewPipeline(role: string) {
  return isAdminOrSuper(role) || isSalesManager(role) || isAccountManager(role) || isProduction(role);
}

export async function GET(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = normalizeRole(me.role);
    if (!canViewPipeline(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim().toLowerCase();
    const owner = String(searchParams.get("owner") || "").trim();
    const production = String(searchParams.get("production") || "").trim();
    const priority = String(searchParams.get("priority") || "").trim();
    const healthFilter = String(searchParams.get("health") || "").trim();
    const dueStart = String(searchParams.get("dueStart") || "").trim();
    const dueEnd = String(searchParams.get("dueEnd") || "").trim();

    const baseQuery: FirebaseFirestore.Query = adminDb.collection("projects").where("isDeleted", "==", false);
    let queries: FirebaseFirestore.Query[] = [baseQuery];

    if (isAccountManager(role)) {
      queries = [
        baseQuery.where("ownerAmUid", "==", me.uid),
        baseQuery.where("ownerAmUid", "==", null).where("createdByUid", "==", me.uid),
      ];
    } else if (isProduction(role)) {
      queries = [baseQuery.where("productionUid", "==", me.uid)];
    }

    const snaps = await Promise.all(queries.map((query) => query.limit(500).get()));
    const merged = new Map<string, ProjectDoc>();
    snaps.forEach((snap) => {
      snap.docs.forEach((doc) => {
        merged.set(doc.id, doc.data() as ProjectDoc);
      });
    });

    let projects = Array.from(merged.entries()).map(([id, data]) => {
      const stageValue = normalizeStage(data.stage);
      const dueDate = toISO(data.dueDate);
      const health = computeHealth(dueDate, stageValue);

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
        stageHistory: normalizeStageHistory(data.stageHistory),
        stageTimestamps: normalizeStageTimestamps(data.stageTimestamps),
        totalPaidUsd: Number(data.totalPaidUsd || 0),
        outstandingUsd: Number(data.outstandingUsd || 0),
        internalNotes: data.internalNotes || "",
      };
    });

    if (owner) {
      if (owner === "unassigned") {
        projects = projects.filter((project) => !project.ownerAmUid);
      } else {
        projects = projects.filter((project) => project.ownerAmUid === owner);
      }
    }

    if (production) {
      if (production === "unassigned") {
        projects = projects.filter((project) => !project.productionUid);
      } else {
        projects = projects.filter((project) => project.productionUid === production);
      }
    }

    if (priority) {
      projects = projects.filter((project) => project.priority === priority);
    }

    if (q) {
      projects = projects.filter((project) => {
        const hay = [project.projectName, project.clientName, project.projectType, project.stage, project.priority]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (healthFilter) {
      projects = projects.filter((project) => project.health === healthFilter);
    }

    const dueStartDate = dueStart ? new Date(dueStart) : null;
    const dueEndDate = dueEnd ? new Date(dueEnd) : null;
    if (dueStartDate && !Number.isNaN(dueStartDate.getTime())) {
      projects = projects.filter((project) => {
        if (!project.dueDate) return false;
        const due = new Date(project.dueDate);
        return !Number.isNaN(due.getTime()) && due >= dueStartDate;
      });
    }

    if (dueEndDate && !Number.isNaN(dueEndDate.getTime())) {
      projects = projects.filter((project) => {
        if (!project.dueDate) return false;
        const due = new Date(project.dueDate);
        return !Number.isNaN(due.getTime()) && due <= dueEndDate;
      });
    }

    projects.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    const counts = projects.reduce<Record<string, number>>((acc, project) => {
      const stageKey = LOCKED_STAGES.includes(project.stage as (typeof LOCKED_STAGES)[number])
        ? project.stage
        : "Legacy";
      acc[stageKey] = (acc[stageKey] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      ok: true,
      projects,
      stageCounts: counts,
      currentUser: {
        uid: me.uid,
        role: me.role,
        name: me.name || me.fullName || me.displayName || "",
      },
    });
  } catch (err: any) {
    console.error("projects/pipeline error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load pipeline right now.";
    return NextResponse.json(
      { ok: false, error: safeMessage, code: isIndexError ? "missing_index" : "unknown_error" },
      { status: 500 }
    );
  }
}
