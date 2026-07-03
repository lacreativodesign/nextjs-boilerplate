'use client';

import ERPLayout from '@/components/layouts/ERPLayout';
import TimeTrackingDashboard from '@/components/hr/TimeTrackingDashboard';

export default function AdminHrTimeTrackingPage() {
  return (
    <ERPLayout role="admin" title="HR Time Tracking">
      <TimeTrackingDashboard canApprove />
    </ERPLayout>
  );
}
