"use client";

import LeaveManagementDashboard from "@/components/hr/LeaveManagementDashboard";

export default function HrLeavePage() {
  return (
    <div className="space-y-6">
      <LeaveManagementDashboard canApprove />
    </div>
  );
}
