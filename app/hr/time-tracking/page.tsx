"use client";

import ERPLayout from "@/components/layouts/ERPLayout";
import TimeTrackingDashboard from "@/components/hr/TimeTrackingDashboard";

export default function HrTimeTrackingPage() {
  return (
    <ERPLayout role="hr" title="Time Tracking">
      <TimeTrackingDashboard canApprove />
    </ERPLayout>
  );
}
