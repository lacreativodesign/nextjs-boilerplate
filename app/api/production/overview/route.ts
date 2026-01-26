import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { computeHealth, getWorkflowSettings } from "../../admin/_shared";
import { getProductionUser, isAssignedToProduction, toISO } from "../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  projectType?: string;
  stage?: string;
  priority?: string;
  health?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  productionOwnerId?: string | null;
  productionOwnerName?: string | null;
  assignedProductionIds?: string[];
  dueDate?: any;
  updatedAt?: any;
  createdAt?: any;
  stageHistory?: Array<{ from?: string; to?: string; byUid?: string; byName?: string; at?: any; reason?: string }>;
  qaStatus?: string | null;
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

function isDueSoon(iso?: string | null) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = date.getTime() - startOfToday.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 7;
}

export async function GET() {
  try {
    const me = await getProductionUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const [snap, workflowSettings] = await Promise.all([
      adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get(),
      getWorkflowSettings(),
    ]);

    const projects = snap.docs
      .map((doc) => {
        const data = doc.data() as ProjectDoc;
        const assigned = isAssignedToProduction(
          {
            productionUid: data.productionUid ?? null,
            productionOwnerId: data.productionOwnerId ?? null,
            assignedProductionIds: data.assignedProductionIds ?? null,
          },
          me.uid
        );
        if (!assigned) return null;
        const stage = normalizeStage(data.stage);
        const dueDate = toISO(data.dueDate);
        const health = computeHealth(dueDate, workflowSettings.atRiskAfterDays, workflowSettings.overdueAfterDays);
        return {
          id: doc.id,
          projectName: data.projectName || "",
          clientName: data.clientName || "",
          projectType: data.projectType || "",
          stage,
          priority: data.priority || "Normal",
          health,
          ownerAmUid: data.ownerAmUid ?? null,
          ownerAmName: data.ownerAmName ?? null,
          productionUid: data.productionUid ?? data.productionOwnerId ?? null,
          productionName: data.productionName ?? data.productionOwnerName ?? null,
          dueDate,
          updatedAt: toISO(data.updatedAt),
          createdAt: toISO(data.createdAt),
          stageHistory: normalizeStageHistory(data.stageHistory),
          qaStatus: data.qaStatus ?? null,
        };
      })
      .filter((project): project is NonNullable<typeof project> => Boolean(project));

    const kpis = projects.reduce(
      (acc, project) => {
        acc.assigned += 1;
        if (["Draft", "Review", "Revisions"].includes(project.stage)) acc.active += 1;
        if (isDueSoon(project.dueDate)) acc.dueSoon += 1;
        if (project.stage === "Final" && project.qaStatus !== "approved") acc.qaQueue += 1;
        return acc;
      },
      { assigned: 0, active: 0, dueSoon: 0, qaQueue: 0 }
    );

    const myQueueTop10 = [...projects]
      .filter((project) => ["Draft", "Review", "Revisions", "Final"].includes(project.stage))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 10);

    const activityEntries = projects.flatMap((project) =>
      (project.stageHistory || []).map((entry, idx) => ({
        id: `${project.id}-${entry.at || ""}-${idx}`,
        projectId: project.id,
        projectName: project.projectName,
        clientName: project.clientName,
        fromStage: entry.from,
        toStage: entry.to,
        byName: entry.byName,
        at: entry.at || null,
      }))
    );

    const recentActivityTop10 = activityEntries
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .slice(0, 10);

    return NextResponse.json({ ok: true, kpis, myQueueTop10, recentActivityTop10 });
  } catch (err: any) {
    console.error("production/overview error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load production overview.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
