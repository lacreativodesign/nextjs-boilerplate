import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUser } from "../../admin/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "success" | "system";
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string | null;
  createdBy: Record<string, unknown> | null;
  priority: string;
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
  const allowedTypes = ["info", "warning", "success", "system"];
  const type = (allowedTypes.includes(rawType) ? rawType : "system") as NotificationRecord["type"];
  const createdAtDate = toDate(data.createdAt);

  return {
    id: doc.id,
    title: String(data.title || ""),
    body: String(data.body || data.message || ""),
    type,
    entityType: data.entityType ? String(data.entityType) : null,
    entityId: data.entityId ? String(data.entityId) : null,
    deepLink: data.deepLink ? String(data.deepLink) : null,
    isRead: Boolean(data.isRead ?? data.read ?? false),
    createdAt: createdAtDate ? createdAtDate.toISOString() : null,
    createdBy: (data.createdBy as Record<string, unknown>) || null,
    priority: String(data.priority || "normal"),
    createdAtMs: createdAtDate ? createdAtDate.getTime() : 0,
  };
}

async function getNotifications(uid: string, unreadOnly: boolean) {
  const queries: FirebaseFirestore.Query[] = [];

  let newQuery: FirebaseFirestore.Query = adminDb.collection("notifications").where("toUserId", "==", uid);
  let legacyQuery: FirebaseFirestore.Query = adminDb.collection("notifications").where("userId", "==", uid);

  if (unreadOnly) {
    newQuery = newQuery.where("isRead", "==", false);
    legacyQuery = legacyQuery.where("read", "==", false);
  }

  queries.push(newQuery.orderBy("createdAt", "desc").limit(50));
  queries.push(legacyQuery.orderBy("createdAt", "desc").limit(50));

  const snapshots = await Promise.all(queries.map((query) => query.get()));
  const map = new Map<string, NotificationRecord>();

  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      if (!map.has(doc.id)) {
        map.set(doc.id, normalizeNotification(doc));
      }
    });
  });

  const merged = Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  return merged.slice(0, 50).map(({ createdAtMs, ...rest }) => rest);
}

async function getUnreadCount(uid: string) {
  const [newSnap, legacySnap] = await Promise.all([
    adminDb.collection("notifications").where("toUserId", "==", uid).where("isRead", "==", false).get(),
    adminDb.collection("notifications").where("userId", "==", uid).where("read", "==", false).get(),
  ]);

  const ids = new Set<string>();
  newSnap.docs.forEach((doc) => ids.add(doc.id));
  legacySnap.docs.forEach((doc) => ids.add(doc.id));
  return ids.size;
}

export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
    const [notifications, unreadCount] = await Promise.all([
      getNotifications(me.uid, unreadOnly),
      getUnreadCount(me.uid),
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
