"use client";

import LeaveManagementDashboard from "@/components/hr/LeaveManagementDashboard";

export default function HrLeavePage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)]">
        <LeaveManagementDashboard canApprove />
      </div>
    </div>
  );
}
