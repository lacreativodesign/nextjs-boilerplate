import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser, isAccountManager, isAdminOrSuper, isProduction, isSalesManager } from "../../_utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FILE_CATEGORIES = ["Draft", "Revision", "Final", "Asset", "Other"] as const;

type FileDoc = {
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  category?: string;
  fileName?: string;
  storagePath?: string;
  downloadUrl?: string;
  size?: number;
  mimeType?: string;
  uploadedByUid?: string;
  uploadedByName?: string;
  uploadedByRole?: string;
  version?: string | number | null;
  notes?: string | null;
  isLatest?: boolean;
  uploadedAt?: any;
  updatedAt?: any;
  isDeleted?: boolean;
};

function toISO(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function canViewFiles(role: string) {
  const r = (role || "").toLowerCase();
  return isAdminOrSuper(r) || isSalesManager(r) || isAccountManager(r) || isProduction(r);
}

async function getVisibleProjectIds(uid: string, role: string): Promise<Set<string>> {
  const ids = new Set<string>();

  if (isAdminOrSuper(role) || isSalesManager(role)) {
    return ids;
  }

  const baseQuery = adminDb.collection("projects").where("tenantId", "==", me.tenantId).where("isDeleted", "==", false);

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

function matchesDateRange(iso: string | null, start?: string, end?: string) {
  if (!iso) return false;
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return false;
  const startValue = start ? new Date(start).getTime() : null;
  const endValue = end ? new Date(end).getTime() : null;
  if (startValue && !Number.isNaN(startValue) && value < startValue) return false;
  if (endValue && !Number.isNaN(endValue) && value > endValue) return false;
  return true;
}

export async function GET(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const role = (me.role || "").toLowerCase();
    if (!canViewFiles(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "").trim();
    const category = String(searchParams.get("category") || "").trim();
    const q = String(searchParams.get("q") || "").trim().toLowerCase();
    const uploadedBy = String(searchParams.get("uploadedBy") || "").trim();
    const startDate = String(searchParams.get("start") || "").trim();
    const endDate = String(searchParams.get("end") || "").trim();

    const visibleProjectIds = await getVisibleProjectIds(me.uid, role);
    if ((isAccountManager(role) || isProduction(role)) && projectId && !visibleProjectIds.has(projectId)) {
      return NextResponse.json({
        ok: true,
        files: [],
        totals: { total: 0, Draft: 0, Revision: 0, Final: 0, Asset: 0, Other: 0, storage: 0 },
        currentUser: { uid: me.uid, role: me.role, name: me.name || me.fullName || me.displayName || "" },
      });
    }

    let query: FirebaseFirestore.Query = adminDb
      .collection("files")
      .where("tenantId", "==", me.tenantId)
      .where("isDeleted", "==", false)
      .orderBy("uploadedAt", "desc");

    if (projectId) {
      query = query.where("projectId", "==", projectId);
    }

    const snap = await query.limit(500).get();

    let files = snap.docs.map((doc) => {
      const data = doc.data() as FileDoc;
      return {
        id: doc.id,
        projectId: data.projectId || "",
        projectName: data.projectName || "",
        clientId: data.clientId || "",
        clientName: data.clientName || "",
        category: data.category || "Other",
        fileName: data.fileName || "",
        storagePath: data.storagePath || "",
        downloadUrl: data.downloadUrl || "",
        size: Number(data.size || 0),
        mimeType: data.mimeType || "",
        uploadedByUid: data.uploadedByUid || "",
        uploadedByName: data.uploadedByName || "",
        uploadedByRole: data.uploadedByRole || "",
        version: data.version ?? null,
        notes: data.notes ?? null,
        isLatest: data.isLatest ?? true,
        uploadedAt: toISO(data.uploadedAt),
        updatedAt: toISO(data.updatedAt),
      };
    });

    if (isAccountManager(role) || isProduction(role)) {
      if (visibleProjectIds.size === 0) {
        files = [];
      } else if (!projectId) {
        files = files.filter((file) => visibleProjectIds.has(file.projectId));
      }
    }

    if (category && FILE_CATEGORIES.includes(category as (typeof FILE_CATEGORIES)[number])) {
      files = files.filter((file) => file.category === category);
    }

    if (uploadedBy) {
      files = files.filter((file) => file.uploadedByUid === uploadedBy);
    }

    if (q) {
      files = files.filter((file) => file.fileName.toLowerCase().includes(q));
    }

    if (startDate || endDate) {
      files = files.filter((file) => matchesDateRange(file.uploadedAt, startDate || undefined, endDate || undefined));
    }

    const totals = files.reduce(
      (acc, file) => {
        acc.total += 1;
        acc.storage += file.size || 0;
        if (FILE_CATEGORIES.includes(file.category as (typeof FILE_CATEGORIES)[number])) {
          acc[file.category as (typeof FILE_CATEGORIES)[number]] += 1;
        }
        return acc;
      },
      { total: 0, Draft: 0, Revision: 0, Final: 0, Asset: 0, Other: 0, storage: 0 }
    );

    return NextResponse.json({
      ok: true,
      files,
      totals,
      currentUser: {
        uid: me.uid,
        role: me.role,
        name: me.name || me.fullName || me.displayName || "",
      },
    });
  } catch (err: any) {
    console.error("files/list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load files right now.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
