'use client';

import ActivityPage from '@/components/activity/ActivityPage';

export default function AdminActivityPage() {
  return <ActivityPage apiPath="/api/admin/events/list" />;
}
