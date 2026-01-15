"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import FinancialReports from "@/components/reports/FinancialReports";

export default function SuperAdminReportsPage() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Executive Reports</h1>
          <p className="page-subtitle">Tenant-scoped financial intelligence for Bizosto.</p>
        </div>
      </div>
      <FinancialReports apiPrefix="/api/super-admin/reports" />
    </div>
  );
}
