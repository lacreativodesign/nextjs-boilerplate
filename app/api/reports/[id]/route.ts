import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { getCurrentUserOrThrow, getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { requireModule, isPlanAccessError } from "@/app/lib/plan-enforcement";
import { getPresetReportById } from "@/lib/reports/preset-reports";
import type { Report, ReportCategory } from "@/types/reports";

export const runtime = "nodejs";

const roleCanAccessCategory = (role: string, category: ReportCategory) => {
  const normalized = (role || "").toLowerCase();
  if (category === "financial") {
    return ["finance", "admin", "super_admin"].includes(normalized);
  }
  if (category === "hr") {
    return ["hr", "admin", "super_admin"].includes(normalized);
  }
  return true;
};

const canAccessReport = (report: Report, userId: string) => {
  if (report.isPublic) return true;
  if (report.createdBy === userId) return true;
  if (report.sharedWith?.includes(userId)) return true;
  return false;
};

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUserOrThrow(request);
    const tenantId = await getTenantIdForRequestOrThrow(request);
    await requireModule(tenantId, "reports", { role: user.role });

    const preset = getPresetReportById(params.id);
    if (preset) {
      if (!roleCanAccessCategory(user.role, preset.category)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json(preset);
    }

    const snap = await adminDb.collection("reports").doc(params.id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const report = { id: snap.id, ...snap.data() } as Report;
    if (report.tenantId !== tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!roleCanAccessCategory(user.role, report.category)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!canAccessReport(report, user.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(report);
  } catch (error: any) {
    if (isPlanAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error?.message || "Failed to fetch report";
    const status = message === "Unauthorized" ? 401 : message === "Tenant suspended" ? 403 : 500;
    console.error("Error fetching report:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
