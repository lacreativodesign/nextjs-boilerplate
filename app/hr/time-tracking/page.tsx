'use client';

import TimeTrackingDashboard from '@/components/hr/TimeTrackingDashboard';

export default function HrTimeTrackingPage() {
  return (
    <div className="space-y-6">
      <TimeTrackingDashboard canApprove />
    </div>
  );
}
