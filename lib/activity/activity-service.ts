import { adminDb, adminRtdb } from "@/lib/firebaseAdmin";
import type { ActivityActionType, ActivityRecord, PresenceRecord } from "@/types/activity-feed";

const ACTIVITIES_COLLECTION = "activities";
const READ_STATES_COLLECTION = "activity_read_states";

type CreateActivityInput = {
  tenantId: string;
  actor: ActivityRecord["actor"];
  action: ActivityActionType;
  entity: ActivityRecord["entity"];
  metadata: ActivityRecord["metadata"];
};

export type ActivityFeedQuery = {
  tenantId: string;
  limit: number;
  cursor?: string;
  module?: string;
  userId?: string;
  from?: string;
  to?: string;
};

function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(`${createdAt}__${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const [createdAt, id] = raw.split("__");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export async function createActivity(input: CreateActivityInput): Promise<ActivityRecord> {
  const createdAt = new Date().toISOString();
  const ref = adminDb.collection(ACTIVITIES_COLLECTION).doc();

  const payload: ActivityRecord = {
    id: ref.id,
    tenantId: input.tenantId,
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    metadata: input.metadata,
    createdAt,
  };

  await ref.set(payload);

  await adminRtdb.ref(`activity/${input.tenantId}/${payload.id}`).set(payload);
  return payload;
}

export async function getActivityFeed(query: ActivityFeedQuery): Promise<{ items: ActivityRecord[]; nextCursor: string | null }> {
  let fsQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb
    .collection(ACTIVITIES_COLLECTION)
    .where("tenantId", "==", query.tenantId)
    .orderBy("createdAt", "desc")
    .orderBy("id", "desc")
    .limit(query.limit);

  if (query.module) {
    fsQuery = fsQuery.where("metadata.module", "==", query.module);
  }
  if (query.userId) {
    fsQuery = fsQuery.where("actor.uid", "==", query.userId);
  }
  if (query.from) {
    fsQuery = fsQuery.where("createdAt", ">=", query.from);
  }
  if (query.to) {
    fsQuery = fsQuery.where("createdAt", "<=", query.to);
  }

  const decoded = decodeCursor(query.cursor);
  if (decoded) {
    fsQuery = fsQuery.startAfter(decoded.createdAt, decoded.id);
  }

  const snap = await fsQuery.get();
  const items = snap.docs.map((doc) => doc.data() as ActivityRecord);
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: items.length === query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export async function markActivityReadForUser(params: { tenantId: string; uid: string; activityId: string }) {
  const activityDoc = await adminDb.collection(ACTIVITIES_COLLECTION).doc(params.activityId).get();
  if (!activityDoc.exists) {
    return { ok: false as const, status: 404, error: "Activity not found." };
  }

  const activity = activityDoc.data() as ActivityRecord;
  if (activity.tenantId !== params.tenantId) {
    return { ok: false as const, status: 404, error: "Activity not found." };
  }

  const stateDocId = `${params.tenantId}_${params.uid}`;
  const stateRef = adminDb.collection(READ_STATES_COLLECTION).doc(stateDocId);
  const state = await stateRef.get();
  const currentLastReadAt = String(state.data()?.lastReadAt || "");
  const nextLastReadAt = currentLastReadAt > activity.createdAt ? currentLastReadAt : activity.createdAt;

  await stateRef.set(
    {
      tenantId: params.tenantId,
      uid: params.uid,
      lastReadAt: nextLastReadAt,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return { ok: true as const };
}

export async function getUnreadCount(tenantId: string, uid: string): Promise<number> {
  const stateDocId = `${tenantId}_${uid}`;
  const stateSnap = await adminDb.collection(READ_STATES_COLLECTION).doc(stateDocId).get();
  const lastReadAt = String(stateSnap.data()?.lastReadAt || "");

  let q: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb
    .collection(ACTIVITIES_COLLECTION)
    .where("tenantId", "==", tenantId);

  if (lastReadAt) {
    q = q.where("createdAt", ">", lastReadAt);
  }

  const [countSnap] = await Promise.all([q.count().get()]);
  return countSnap.data().count;
}

export async function listOnlineUsers(tenantId: string): Promise<PresenceRecord[]> {
  const snap = await adminRtdb.ref(`presence/${tenantId}`).get();
  const raw = (snap.val() || {}) as Record<string, PresenceRecord>;

  return Object.values(raw)
    .filter((item) => Boolean(item?.online))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}
