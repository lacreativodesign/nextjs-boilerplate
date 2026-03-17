'use client';

import { formatDistanceToNow } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

type ActivityActor = { uid: string; name: string };

export type ActivityFeedItem = {
  id: string;
  type: 'user_action' | 'system_event';
  category: 'invoice' | 'project' | 'client' | 'user';
  actor: ActivityActor;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  timestamp: Timestamp | Date | string | null;
};

function toDateValue(value: ActivityFeedItem['timestamp']): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    const converted = (value as { toDate: () => Date }).toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }
  return null;
}

export function ActivityItem({ activity }: { activity: ActivityFeedItem }) {
  const actorName = activity.actor?.name?.trim() || 'System';
  const avatarLabel = actorName.charAt(0).toUpperCase() || 'S';
  const entityName = activity.entityName?.trim() || activity.entityType;
  const timestamp = toDateValue(activity.timestamp);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
        {avatarLabel}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text-primary)]">
          <strong>{actorName}</strong> {activity.action} {activity.entityType}{' '}
          <strong>{entityName}</strong>
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {timestamp ? `${formatDistanceToNow(timestamp)} ago` : 'Unknown time'}
        </p>
      </div>
    </div>
  );
}
