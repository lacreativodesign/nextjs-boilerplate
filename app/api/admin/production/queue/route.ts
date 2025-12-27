import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAdminOrSuper } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STAGES = ["Kickoff", "Draft", "Review", "Revisions", "Final", "Delivered"] as const;

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  projectType?: string;
  stage?: string;
  priority?: string;
  ownerAmUid?: string | null;
  ownerAmName?: string | null;
  productionUid?: string | null;
  productionName?: string | null;
  productionOwnerId?: string | null;
  productionOwnerName?: string | null;
  dueDate?: any;
  updatedAt?: any;
  createdAt?: any;
  stageHistory?: Array<{ from?: string; to?: string; byUid?: string; byName?: string; at?: any; reason?: string }>;
  isDeleted?: boolean;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
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

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminOrSuper(me.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const snap = await adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get();

    const projects = snap.docs.map((doc) => {
      const data = doc.data() as ProjectDoc;
      const stage = normalizeStage(data.stage);
      const dueDate = toISO(data.dueDate);
      const health = computeHealth(dueDate);
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
      };
    });

    projects.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    return NextResponse.json({ ok: true, projects });
  } catch (err: any) {
    console.error("production/queue error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load production queue.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
