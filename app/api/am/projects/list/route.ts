import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { computeHealth, getWorkflowSettings } from "../../../admin/_shared";
import { getAmUser, isOwnedByAm, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  clientId?: string;
  projectType?: string;
  stage?: string;
  priority?: string;
  health?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  dueDate?: any;
  updatedAt?: any;
  createdAt?: any;
  stageHistory?: Array<{ from?: string; to?: string; byUid?: string; byName?: string; at?: any; reason?: string }>;
  isDeleted?: boolean;
};

function normalizeStage(stage?: string) {
  return VALID_STAGES.includes((stage || "") as (typeof VALID_STAGES)[number]) ? (stage as string) : "Kickoff";
}

function normalizeStageHistory(history?: ProjectDoc["stageHistory"]) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => ({
    from: entry?.from || "",
    to: entry?.to || "",
    byUid: entry?.byUid || "",
    byName: entry?.byName || "",
    at: toISO(entry?.at),
    reason: entry?.reason || null,
  }));
}

export async function GET(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") || "").trim().toLowerCase();
    const stage = String(searchParams.get("stage") || "").trim();
    const priority = String(searchParams.get("priority") || "").trim();
    const health = String(searchParams.get("health") || "").trim();
    const dueFrom = String(searchParams.get("dueFrom") || "").trim();
    const dueTo = String(searchParams.get("dueTo") || "").trim();

    const [snap, workflowSettings] = await Promise.all([
      adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get(),
      getWorkflowSettings(),
    ]);

    let projects = snap.docs
      .map((doc) => {
        const data = doc.data() as ProjectDoc;
        if (!isOwnedByAm(data, me.uid)) return null;
        const stageValue = normalizeStage(data.stage);
        const dueDate = toISO(data.dueDate);
        const computedHealth = computeHealth(dueDate, workflowSettings.atRiskAfterDays, workflowSettings.overdueAfterDays);
        return {
          id: doc.id,
          projectName: data.projectName || "",
          clientName: data.clientName || "",
          clientId: data.clientId || "",
          projectType: data.projectType || "",
          stage: stageValue,
          priority: data.priority || "Normal",
          health: computedHealth,
          ownerAmUid: data.ownerAmUid ?? null,
          ownerAmName: data.ownerAmName ?? null,
          productionUid: data.productionUid ?? null,
          productionName: data.productionName ?? null,
          dueDate,
          updatedAt: toISO(data.updatedAt),
          createdAt: toISO(data.createdAt),
          stageHistory: normalizeStageHistory(data.stageHistory),
        };
      })
      .filter((project): project is NonNullable<typeof project> => Boolean(project));

    if (stage && VALID_STAGES.includes(stage as (typeof VALID_STAGES)[number])) {
      projects = projects.filter((project) => project.stage === stage);
    }

    if (priority) {
      projects = projects.filter((project) => project.priority === priority);
    }

    if (health) {
      projects = projects.filter((project) => project.health === health);
    }

    if (dueFrom) {
      const fromDate = new Date(dueFrom);
      if (!Number.isNaN(fromDate.getTime())) {
        projects = projects.filter((project) => {
          const due = project.dueDate ? new Date(project.dueDate) : null;
          return due && !Number.isNaN(due.getTime()) && due >= fromDate;
        });
      }
    }

    if (dueTo) {
      const toDate = new Date(dueTo);
      if (!Number.isNaN(toDate.getTime())) {
        projects = projects.filter((project) => {
          const due = project.dueDate ? new Date(project.dueDate) : null;
          return due && !Number.isNaN(due.getTime()) && due <= toDate;
        });
      }
    }

    if (q) {
      projects = projects.filter((project) => {
        const hay = [project.projectName, project.clientName].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    projects.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    return NextResponse.json({ ok: true, projects });
  } catch (err: any) {
    console.error("am/projects list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load AM projects.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
