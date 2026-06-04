'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebaseClient';
import { ActivityItem, type ActivityFeedItem } from '@/components/activity/ActivityItem';

type ActivityFeedProps = {
  tenantId: string;
  maxItems?: number;
};

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

export function ActivityFeed({ tenantId, maxItems = 10 }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setActivities([]);
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    getFirebaseDb().then((db) => {
      if (cancelled) return;
      const activityQuery = query(
        collection(db, 'tenants', tenantId, 'activity_feed'),
        orderBy('timestamp', 'desc'),
        limit(maxItems),
      );
      unsubscribe = onSnapshot(
        activityQuery,
        (snapshot) => {
          const items = snapshot.docs.map((doc) => normalizeActivity(doc.data(), doc.id));
          setActivities(items);
          setLoading(false);
        },
        () => {
          setActivities([]);
          setLoading(false);
        },
      );
    }).catch(() => {
      setActivities([]);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [maxItems, tenantId]);

  const content = useMemo(() => {
    if (loading) {
      return <p className="text-sm text-[var(--text-muted)]">Loading activity…</p>;
    }

    if (!activities.length) {
      return <p className="text-sm text-[var(--text-muted)]">No recent activity.</p>;
    }

    return (
      <div className="space-y-3">
        {activities.map((activity) => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </div>
    );
  }, [activities, loading]);

  return (
    <section className="card p-4">
      <h3 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Recent Activity</h3>
      {content}
    </section>
  );
}
