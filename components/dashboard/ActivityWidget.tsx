import Link from 'next/link';
import { ActivityFeed } from '@/components/activity/ActivityFeed';

export function ActivityWidget({ tenantId }: { tenantId: string }) {
  return (
    <div className="col-span-1">
      <ActivityFeed tenantId={tenantId} />
      <Link
        href="/activity"
        className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-700"
      >
        View all activity →
      </Link>
    </div>
  );
}
