"use client";

import {
  get,
  getDatabase,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  serverTimestamp,
  set,
  type DatabaseReference,
  type Unsubscribe,
} from "firebase/database";
import type { ActivityRecord, PresenceRecord } from "@/types/activity-feed";
import { getFirebaseApp } from "@/lib/firebaseClient";

export type ActivitySubscriptionOptions = {
  tenantId: string;
  limit?: number;
  onActivity: (activity: ActivityRecord) => void;
};

function dbRef(path: string): DatabaseReference {
  const app = getFirebaseApp();
  const db = getDatabase(app);
  return ref(db, path);
}

export async function publishActivityEvent(tenantId: string, activity: ActivityRecord) {
  const feedRef = dbRef(`activity/${tenantId}`);
  await set(ref(feedRef, activity.id), activity);
}

export function subscribeToActivityUpdates(options: ActivitySubscriptionOptions): Unsubscribe {
  const path = `activity/${options.tenantId}`;
  const activityRef = dbRef(path);
  const seenIds = new Set<string>();

  get(activityRef)
    .then((snapshot) => {
      const val = (snapshot.val() || {}) as Record<string, ActivityRecord>;
      const sorted = Object.values(val)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, options.limit ?? 200);
      sorted.forEach((activity) => {
        seenIds.add(activity.id);
      });
    })
    .catch((err) => {
      console.error("Failed to prime activity stream", err);
    });

  const unsubscribe = onChildAdded(activityRef, (snapshot) => {
    const activity = snapshot.val() as ActivityRecord | null;
    if (!activity || seenIds.has(activity.id)) return;
    seenIds.add(activity.id);
    options.onActivity(activity);
  });

  return () => {
    unsubscribe();
  };
}

export async function setUserPresence(input: {
  tenantId: string;
  uid: string;
  name: string;
  email?: string | null;
  role?: string | null;
}) {
  const presenceRef = dbRef(`presence/${input.tenantId}/${input.uid}`);

  await set(presenceRef, {
    uid: input.uid,
    name: input.name,
    email: input.email || null,
    role: input.role || null,
    online: true,
    lastSeenAt: Date.now(),
    updatedAt: serverTimestamp(),
  });

  const app = getFirebaseApp();
  const db = getDatabase(app);
  const connectedRef = ref(db, ".info/connected");

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (!snap.val()) return;
    const onDisconnectRef = ref(db, `presence/${input.tenantId}/${input.uid}`);
    onDisconnect(onDisconnectRef).set({
      uid: input.uid,
      name: input.name,
      email: input.email || null,
      role: input.role || null,
      online: false,
      lastSeenAt: Date.now(),
      updatedAt: serverTimestamp(),
    }).catch((error) => {
      console.error("Unable to update disconnect presence", error);
    });
  });

  return () => {
    unsubscribe();
    set(presenceRef, {
      uid: input.uid,
      name: input.name,
      email: input.email || null,
      role: input.role || null,
      online: false,
      lastSeenAt: Date.now(),
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
  };
}

export function subscribeToPresence(tenantId: string, onPresence: (users: PresenceRecord[]) => void): Unsubscribe {
  const presenceRef = dbRef(`presence/${tenantId}`);

  const unsubscribePresence = onValue(presenceRef, (snapshot) => {
    const raw = (snapshot.val() || {}) as Record<string, PresenceRecord>;
    const users = Object.values(raw)
      .filter((entry) => entry.online)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    onPresence(users);
  });

  return () => {
    unsubscribePresence();
  };
}

export async function pushRealtimeNotification(tenantId: string, payload: Record<string, unknown>) {
  const notificationsRef = dbRef(`activity_notifications/${tenantId}`);
  await push(notificationsRef, {
    ...payload,
    createdAt: new Date().toISOString(),
  });
}
