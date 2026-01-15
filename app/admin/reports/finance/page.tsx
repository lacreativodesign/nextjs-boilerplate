"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import FinancialReports from "@/components/reports/FinancialReports";

export default function AdminFinancialReportsPage() {
  return <FinancialReports apiPrefix="/api/admin/reports" />;
}
