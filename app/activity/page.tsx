'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { ActivityItem, type ActivityFeedItem } from '@/components/activity/ActivityItem';
import { getFirebaseDb } from '@/lib/firebaseClient';
import { useTenantContext } from '@/lib/tenant/useTenantContext';

const PAGE_STEP = 25;

type CategoryFilter = 'all' | 'invoice' | 'project' | 'client' | 'user';

function normalizeActivity(raw: DocumentData, id: string): ActivityFeedItem {
  return {
    id,
    type: raw.type === 'system_event' ? 'system_event' : 'user_action',
    category:
      raw.category === 'project' || raw.category === 'client' || raw.category === 'user'
        ? raw.category
        : 'invoice',
    actor: {
      uid: String(raw.actor?.uid || ''),
      name: String(raw.actor?.name || 'System'),
    },
    action: String(raw.action || 'updated'),
    entityType: String(raw.entityType || 'entity'),
    entityId: String(raw.entityId || id),
    entityName: String(raw.entityName || raw.entityType || 'Record'),
    timestamp: raw.timestamp ?? null,
  };
}

export default function ActivityPage() {
  const { data, loading: tenantLoading } = useTenantContext();
  const tenantId = data?.user?.tenantId || '';
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [actorUid, setActorUid] = useState<string>('all');
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [itemLimit, setItemLimit] = useState(PAGE_STEP);

  useEffect(() => {
    if (!tenantId) {
      setActivities([]);
      setListLoading(false);
      return undefined;
    }

    setListLoading(true);
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    getFirebaseDb().then((db) => {
      if (cancelled) return;
      const constraints: QueryConstraint[] = [orderBy('timestamp', 'desc'), limit(itemLimit)];
      if (category !== 'all') constraints.unshift(where('category', '==', category));
      if (actorUid !== 'all') constraints.unshift(where('actor.uid', '==', actorUid));

      const activityQuery = query(
        collection(db, 'tenants', tenantId, 'activity_feed'),
        ...constraints,
      );

      unsubscribe = onSnapshot(
        activityQuery,
        (snapshot) => {
          setActivities(snapshot.docs.map((doc) => normalizeActivity(doc.data(), doc.id)));
          setListLoading(false);
        },
        () => {
          setActivities([]);
          setListLoading(false);
        },
      );
    }).catch(() => {
      setActivities([]);
      setListLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [actorUid, category, itemLimit, tenantId]);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    activities.forEach((entry) => {
      if (entry.actor.uid) map.set(entry.actor.uid, entry.actor.name || entry.actor.uid);
    });
    return Array.from(map.entries());
  }, [activities]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Activity Timeline</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="input"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value as CategoryFilter);
            setItemLimit(PAGE_STEP);
          }}
        >
          <option value="all">All Categories</option>
          <option value="invoice">Invoices</option>
          <option value="project">Projects</option>
          <option value="client">Clients</option>
          <option value="user">Users</option>
        </select>

        <select
          className="input"
          value={actorUid}
          onChange={(event) => {
            setActorUid(event.target.value);
            setItemLimit(PAGE_STEP);
          }}
        >
          <option value="all">All Users</option>
          {users.map(([uid, name]) => (
            <option key={uid} value={uid}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {tenantLoading || listLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading activity…</p>
      ) : null}

      {!tenantLoading && !listLoading && !tenantId ? (
        <p className="text-sm text-red-500">Unable to resolve tenant context.</p>
      ) : null}

      {!tenantLoading && !listLoading && tenantId ? (
        <div className="space-y-3">
          {activities.length ? (
            activities.map((activity) => <ActivityItem key={activity.id} activity={activity} />)
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No activity found for current filters.</p>
          )}
        </div>
      ) : null}

      {activities.length >= itemLimit ? (
        <button
          className="btn ghost mt-2"
          onClick={() => setItemLimit((prev) => prev + PAGE_STEP)}
          type="button"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
