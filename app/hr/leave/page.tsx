"use client";

import ERPLayout from "@/components/layouts/ERPLayout";
import LeaveManagementDashboard from "@/components/hr/LeaveManagementDashboard";

export default function HrLeavePage() {
  return (
    <ERPLayout role="hr" title="Leave Management">
      <LeaveManagementDashboard canApprove />
    </ERPLayout>
  );
}
