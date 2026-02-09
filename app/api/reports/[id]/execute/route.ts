import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUserOrThrow, getTenantIdForRequestOrThrow } from "@/lib/tenant/server";
import { requireModule, isPlanAccessError } from "@/app/lib/plan-enforcement";
import { adminDb } from "@/lib/firebaseAdmin";
import { ReportEngine } from "@/lib/reports/report-engine";
import { getPresetReportById } from "@/lib/reports/preset-reports";
import type { Report, ReportCategory } from "@/types/reports";
import { z } from "zod";

export const runtime = "nodejs";

const executeSchema = z.object({
  filters: z.array(z.any()).optional(),
  dateRange: z
    .object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
    .optional(),
  export: z.enum(["csv", "json"]).optional(),
  pageSize: z.number().min(1).max(1000).optional(),
  pageToken: z.string().optional().nullable(),
});

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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUserOrThrow(request);
    const tenantId = await getTenantIdForRequestOrThrow(request);
    await requireModule(tenantId, "reports", { role: user.role });

    const body = await request.json();
    const data = executeSchema.parse(body);

    const preset = getPresetReportById(params.id);
    if (preset) {
      if (!roleCanAccessCategory(user.role, preset.category)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
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
    }

    const result = await ReportEngine.executeReport({
      tenantId,
      reportId: params.id,
      userId: user.uid,
      filters: data.filters,
      dateRange: data.dateRange
        ? {
            start: new Date(data.dateRange.start),
            end: new Date(data.dateRange.end),
          }
        : undefined,
      pageSize: data.pageSize,
      pageToken: data.pageToken || null,
    });

    if (data.export === "csv") {
      const csv = await ReportEngine.exportToCSV(result.data);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=\"report-${params.id}.csv\"`,
        },
      });
    }

    if (data.export === "json") {
      const json = JSON.stringify(result.data, null, 2);
      return new NextResponse(json, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename=\"report-${params.id}.json\"`,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    if (isPlanAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error executing report:", error);
    return NextResponse.json({ error: "Failed to execute report" }, { status: 500 });
  }
}
