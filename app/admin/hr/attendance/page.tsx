'use client';

import EmptyState from '@/components/ui/EmptyState';

export default function HRAttendancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Attendance</h1>
        <p className="page-subtitle mt-2">Monthly attendance by employee.</p>
      </div>

      <EmptyState
        title="Attendance is not available here yet"
        description="Use HR &rsaquo; Attendance for the live monthly record."
      />
    </div>
  );
}
