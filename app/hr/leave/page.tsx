'use client';

import LeaveManagementDashboard from '@/components/hr/LeaveManagementDashboard';

export default function HrLeavePage() {
  return (
    <div className="space-y-6">
      <h1 className="page-title">Leave Management</h1>
      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)]">
        <LeaveManagementDashboard canApprove />
      </div>
    </div>
  );
}
