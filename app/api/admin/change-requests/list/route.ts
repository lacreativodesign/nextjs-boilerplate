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

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeStatusHistory(history?: any[]) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => ({
    from: entry?.from || "",
    to: entry?.to || "",
    byUid: entry?.byUid || "",
    byRole: entry?.byRole || "",
    at: toISO(entry?.at),
    note: entry?.note || "",
  }));
}

function canViewChangeRequests(role: string) {
  return isAdminOrSuper(role) || isSalesManager(role) || isAccountManager(role) || isProduction(role);
}

async function getVisibleProjectIds(uid: string, role: string): Promise<Set<string>> {
  const ids = new Set<string>();

  if (isAdminOrSuper(role) || isSalesManager(role)) {
    return ids;
  }

  const baseQuery = adminDb.collection("projects").where("isDeleted", "==", false);

  if (isAccountManager(role)) {
    const snaps = await Promise.all([
      baseQuery.where("ownerAmUid", "==", uid).limit(500).get(),
      baseQuery.where("ownerAmUid", "==", null).where("createdByUid", "==", uid).limit(500).get(),
    ]);

    snaps.forEach((snap) => {
      snap.docs.forEach((doc) => ids.add(doc.id));
    });

    return ids;
  }

  if (isProduction(role)) {
    const snap = await baseQuery.where("productionUid", "==", uid).limit(500).get();
    snap.docs.forEach((doc) => ids.add(doc.id));
  }

  return ids;
}

export async function GET(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = normalizeRole(me.role);
    if (!canViewChangeRequests(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();
    const status = String(searchParams.get("status") || "").trim();
    const type = String(searchParams.get("type") || "").trim();
    const priority = String(searchParams.get("priority") || "").trim();
    const assignedTo = String(searchParams.get("assignedTo") || "").trim();
    const q = String(searchParams.get("q") || "").trim().toLowerCase();

    const visibleProjectIds = await getVisibleProjectIds(me.uid, role);

    if ((isAccountManager(role) || isProduction(role)) && projectId && !visibleProjectIds.has(projectId)) {
      return NextResponse.json({
        ok: true,
        changeRequests: [],
        currentUser: {
          uid: me.uid,
          role: me.role,
          name: me.name || me.fullName || me.displayName || "",
        },
      });
    }

    const query: FirebaseFirestore.Query = adminDb.collection("changeRequests").where("isDeleted", "==", false);

    const snap = await query.limit(500).get();

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
        statusHistory: normalizeStatusHistory(data.statusHistory),
      };
    });

    if (isAccountManager(role) || isProduction(role)) {
      if (visibleProjectIds.size === 0) {
        changeRequests = [];
      } else if (!projectId) {
        changeRequests = changeRequests.filter((item) => visibleProjectIds.has(item.projectId));
      }
    }

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

    if (assignedTo) {
      changeRequests = changeRequests.filter((item) => item.assignedToUid === assignedTo);
    }

    if (q) {
      changeRequests = changeRequests.filter((item) => {
        const hay = [item.title, item.description, item.projectName, item.clientName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    changeRequests.sort((a, b) => {
      const aStamp = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bStamp = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bStamp - aStamp;
    });

    return NextResponse.json({
      ok: true,
      changeRequests,
      currentUser: {
        uid: me.uid,
        role: me.role,
        name: me.name || me.fullName || me.displayName || "",
      },
    });
  } catch (err: any) {
    console.error("change-requests/list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load change requests right now.";
    return NextResponse.json(
      { ok: false, error: safeMessage, code: isIndexError ? "missing_index" : "unknown_error" },
      { status: 500 }
    );
  }
}
