"use client";

import ActivityPage from "@/components/activity/ActivityPage";

export default function SuperAdminActivityPage() {
  return <ActivityPage apiPath="/api/super_admin/events/list" />;
}
