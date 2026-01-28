import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId, normalizeTenantId } from "@/lib/tenant";
import { getCurrentUser } from "../../admin/_utils";
import { requireNotificationsModule } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string | null;
  createdBy: Record<string, unknown> | null;
  priority: string;
  metadata?: Record<string, unknown> | null;
  createdAtMs: number;
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeNotification(doc: FirebaseFirestore.QueryDocumentSnapshot): NotificationRecord {
  const data = doc.data() || {};
  const rawType = String(data.type || "");
  const type = rawType || "system";
  const createdAtDate = toDate(data.createdAt);
  const message = String(data.message || data.body || "");

  return {
    id: doc.id,
    title: String(data.title || ""),
    body: message,
    type,
    entityType: data.entityType ? String(data.entityType) : null,
    entityId: data.entityId ? String(data.entityId) : null,
    deepLink: data.deepLink ? String(data.deepLink) : null,
    isRead: Boolean(data.isRead ?? data.read ?? false),
    createdAt: createdAtDate ? createdAtDate.toISOString() : null,
    createdBy: (data.createdBy as Record<string, unknown>) || null,
    priority: String(data.priority || "normal"),
    metadata: (data.metadata as Record<string, unknown>) || null,
    createdAtMs: createdAtDate ? createdAtDate.getTime() : 0,
  };
}

function isApprovalNotification(item: NotificationRecord) {
  const entityType = String(item.entityType || "").toLowerCase();
  if (["approval", "change_request"].includes(entityType)) return true;
  const hay = `${item.title} ${item.body}`.toLowerCase();
  return hay.includes("approval");
}

async function getNotifications(uid: string, tenantId: string, filter: string, limit: number) {
  const queries: FirebaseFirestore.Query[] = [];
  const unreadOnly = filter === "unread";

  const baseQueries = [
    adminDb.collection("notifications").where("recipientUid", "==", uid),
    adminDb.collection("notifications").where("toUserId", "==", uid),
    adminDb.collection("notifications").where("toUid", "==", uid),
    adminDb.collection("notifications").where("userId", "==", uid),
  ];

  baseQueries.forEach((base) => {
    let scoped = base.where("tenantId", "==", tenantId);
    if (unreadOnly) {
      scoped = scoped.where("isRead", "==", false);
    }
    queries.push(scoped.orderBy("createdAt", "desc").limit(limit));
  });

  const snapshots = await Promise.all(queries.map((query) => query.get()));
  const map = new Map<string, NotificationRecord>();

  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (!map.has(doc.id) && docTenantId(doc.data()) === tenantId) {
        map.set(doc.id, normalizeNotification(doc));
      }
    });
  });

  let merged = Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  if (filter === "approvals") {
    merged = merged.filter((item) => isApprovalNotification(item));
  }
  return merged.slice(0, limit).map(({ createdAtMs, ...rest }) => rest);
}

async function getUnreadCount(uid: string, tenantId: string) {
  const queries: FirebaseFirestore.Query[] = [];
  const baseQueries = [
    adminDb.collection("notifications").where("recipientUid", "==", uid).where("isRead", "==", false),
    adminDb.collection("notifications").where("toUserId", "==", uid).where("isRead", "==", false),
    adminDb.collection("notifications").where("toUid", "==", uid).where("isRead", "==", false),
    adminDb.collection("notifications").where("userId", "==", uid).where("read", "==", false),
  ];

  baseQueries.forEach((base) => {
    queries.push(base.where("tenantId", "==", tenantId));
  });

  const snapshots = await Promise.all(queries.map((query) => query.get()));
  const ids = new Set<string>();
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (docTenantId(doc.data()) === tenantId) {
        ids.add(doc.id);
      }
    });
  });
  return ids.size;
}

export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
    const filter = String(req.nextUrl.searchParams.get("filter") || (unreadOnly ? "unread" : "all"));
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const tenantId = normalizeTenantId(me.tenantId);
    const moduleAccess = await requireNotificationsModule(tenantId, me.role);
    if (!moduleAccess.ok) {
      return NextResponse.json({ ok: false, error: moduleAccess.error }, { status: moduleAccess.status });
    }
    const [notifications, unreadCount] = await Promise.all([
      getNotifications(me.uid, tenantId, filter, limit),
      getUnreadCount(me.uid, tenantId),
    ]);

    return NextResponse.json({ ok: true, notifications, unreadCount });
  } catch (err: any) {
    console.error("notifications list error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to load notifications.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
