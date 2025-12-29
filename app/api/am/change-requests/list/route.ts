import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getAmUser, isOwnedByAm, toISO } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHANGE_REQUEST_TYPES = ["Scope Change", "Revision", "New Feature", "Bug Fix", "Other"] as const;
const CHANGE_REQUEST_STATUSES = [
  "Submitted",
  "In Review",
  "Approved",
  "In Progress",
  "Completed",
  "Rejected",
] as const;
const CHANGE_REQUEST_PRIORITIES = ["Low", "Medium", "High"] as const;

type ProjectDoc = {
  ownerAmUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  isDeleted?: boolean;
};

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
  approvedAt?: any;
  approvedByUid?: string | null;
  attachedFileIds?: string[];
  createdAt?: any;
  updatedAt?: any;
  completedAt?: any;
  isDeleted?: boolean;
  statusHistory?: any[];
};

export async function GET(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const type = String(searchParams.get("type") || "").trim();
    const priority = String(searchParams.get("priority") || "").trim();
    const q = String(searchParams.get("q") || "").trim().toLowerCase();

    const projectSnap = await adminDb.collection("projects").where("isDeleted", "==", false).limit(500).get();
    const projectIds = new Set(
      projectSnap.docs
        .map((doc) => ({ id: doc.id, data: doc.data() as ProjectDoc }))
        .filter(({ data }) => isOwnedByAm(data, me.uid))
        .map(({ id }) => id)
    );

    if (projectId && !projectIds.has(projectId)) {
      return NextResponse.json({ ok: true, changeRequests: [] });
    }

    const snap = await adminDb.collection("changeRequests").where("isDeleted", "==", false).limit(500).get();

    let changeRequests = snap.docs.map((doc) => {
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
        approvedAt: toISO(data.approvedAt),
        approvedByUid: data.approvedByUid || null,
        attachedFileIds: Array.isArray(data.attachedFileIds) ? data.attachedFileIds : [],
        createdAt: toISO(data.createdAt),
        updatedAt: toISO(data.updatedAt),
        completedAt: toISO(data.completedAt),
      };
    });

    changeRequests = changeRequests.filter((item) => projectIds.has(item.projectId));

    if (projectId) {
      changeRequests = changeRequests.filter((item) => item.projectId === projectId);
    }

    if (status && CHANGE_REQUEST_STATUSES.includes(status as (typeof CHANGE_REQUEST_STATUSES)[number])) {
      changeRequests = changeRequests.filter((item) => item.status === status);
    }

    if (type && CHANGE_REQUEST_TYPES.includes(type as (typeof CHANGE_REQUEST_TYPES)[number])) {
      changeRequests = changeRequests.filter((item) => item.type === type);
    }

    if (priority && CHANGE_REQUEST_PRIORITIES.includes(priority as (typeof CHANGE_REQUEST_PRIORITIES)[number])) {
      changeRequests = changeRequests.filter((item) => item.priority === priority);
    }

    if (q) {
      changeRequests = changeRequests.filter((item) => {
        const hay = [item.projectName, item.clientName, item.title].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    return NextResponse.json({ ok: true, changeRequests });
  } catch (err: any) {
    console.error("am/change-requests list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load change requests.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
