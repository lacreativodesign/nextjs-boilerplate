import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUserOrThrow, getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { requireModule } from "@/app/lib/plan-enforcement";
import type { NextRequest } from "next/server";
import type { Report } from "@/types/reports";

export async function requireReportsUser(request: NextRequest) {
  const user = await getCurrentUserOrThrow(request);
  const tenantId = await getTenantIdForRequestOrThrow(request);
  await requireModule(tenantId, "reports", { role: user.role });
  return { user, tenantId };
}

export function canAccessReport(report: Report, userId: string) {
  return report.createdBy === userId || report.isPublic || report.sharedWith?.includes(userId);
}

export async function getCustomReportOrThrow(tenantId: string, reportId: string) {
  const snap = await adminDb.collection("reports").doc(reportId).get();
  if (!snap.exists) {
    throw new Error("Report not found");
  }

  const report = { id: snap.id, ...snap.data() } as Report;
  if (report.tenantId !== tenantId || report.type !== "custom") {
    throw new Error("Report not found");
  }

  return report;
}
