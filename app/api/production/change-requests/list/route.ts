import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getProductionUser, isAssignedToProduction, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ChangeRequestDoc = {
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  type?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  requestedByUid?: string;
  requestedByRole?: string;
  assignedToUid?: string | null;
  assignedToRole?: string | null;
  estimatedCost?: number | null;
  estimatedTimelineDays?: number | null;
  approvalStatus?: string | null;
  approvalId?: string | null;
  approvedAt?: unknown;
  approvedByUid?: string | null;
  attachedFileIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  isDeleted?: boolean;
  statusHistory?: unknown[];
};

type ProjectDoc = {
  productionUid?: string | null;
  productionOwnerId?: string | null;
  assignedProductionIds?: string[];
  isDeleted?: boolean;
};

function normalizeStatusHistory(history?: unknown[]) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => ({
    from: (entry as Record<string, unknown>)?.from || "",
    to: (entry as Record<string, unknown>)?.to || "",
    byUid: (entry as Record<string, unknown>)?.byUid || "",
    byRole: (entry as Record<string, unknown>)?.byRole || "",
    at: toISO((entry as Record<string, unknown>)?.at),
    note: (entry as Record<string, unknown>)?.note || "",
  }));
}

function requiresApproval(data: ChangeRequestDoc) {
  const type = String(data.type || "");
  const impactsScope = type === "Scope Change";
  const impactsTimeline = typeof data.estimatedTimelineDays === "number" && data.estimatedTimelineDays > 0;
  const impactsCost = typeof data.estimatedCost === "number" && data.estimatedCost > 0;
  return impactsScope || impactsTimeline || impactsCost;
}

export async function GET(req: Request) {
  try {
    const me = await getProductionUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project id is required." }, { status: 400 });
    }

    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const project = projectSnap.data() as ProjectDoc;
    if (project?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    if (String((project as unknown).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const assigned = isAssignedToProduction(
      {
        productionUid: project.productionUid ?? null,
        productionOwnerId: project.productionOwnerId ?? null,
        assignedProductionIds: project.assignedProductionIds ?? null,
      },
      me.uid
    );
    if (!assigned) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const snap = await adminDb.collection("changeRequests").where("tenantId", "==", me.tenantId).where("isDeleted", "==", false).limit(500).get();

    const changeRequests = snap.docs
      .map((doc) => {
        const data = doc.data() as ChangeRequestDoc;
        return {
          id: doc.id,
          projectId: data.projectId || "",
          projectName: data.projectName || "",
          clientId: data.clientId || "",
          clientName: data.clientName || "",
          type: data.type || "Other",
          title: data.title || "",
          description: data.description || "",
          status: data.status || "Submitted",
          priority: data.priority || "Medium",
          requestedByUid: data.requestedByUid || "",
          requestedByRole: data.requestedByRole || "",
          assignedToUid: data.assignedToUid ?? null,
          assignedToRole: data.assignedToRole ?? null,
          estimatedCost: typeof data.estimatedCost === "number" ? data.estimatedCost : null,
          estimatedTimelineDays: typeof data.estimatedTimelineDays === "number" ? data.estimatedTimelineDays : null,
          approvalStatus: data.approvalStatus || null,
          approvalId: data.approvalId || null,
          requiresApproval: requiresApproval(data),
          approvedAt: toISO(data.approvedAt),
          approvedByUid: data.approvedByUid || null,
          attachedFileIds: Array.isArray(data.attachedFileIds) ? data.attachedFileIds : [],
          createdAt: toISO(data.createdAt),
          updatedAt: toISO(data.updatedAt),
          completedAt: toISO(data.completedAt),
          statusHistory: normalizeStatusHistory(data.statusHistory),
        };
      })
      .filter((item) => item.projectId === projectId);

    return NextResponse.json({ ok: true, changeRequests });
  } catch (err) {
    console.error("production/change-requests list error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load change requests.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
