import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ReportBuilderService } from "@/lib/reports/report-builder";
import type { ReportFormat } from "@/types/reports";
import { canAccessReport, getCustomReportOrThrow, requireReportsUser } from "../../_utils";

export const runtime = "nodejs";

const exportSchema = z.object({
  format: z.enum(["pdf", "csv", "xlsx"]),
  filters: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum([
          "equals",
          "notEquals",
          "greaterThan",
          "greaterThanOrEqual",
          "lessThan",
          "lessThanOrEqual",
          "between",
          "in",
          "notIn",
          "contains",
          "notContains",
          "startsWith",
          "endsWith",
          "isNull",
          "isNotNull",
        ]),
        value: z.any(),
      })
    )
    .optional(),
});

const contentTypes: Record<ReportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, tenantId } = await requireReportsUser(request);
    const report = await getCustomReportOrThrow(tenantId, params.id);
    if (!canAccessReport(report, user.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = exportSchema.parse(await request.json().catch(() => ({ format: "csv" })));

    const result = await ReportBuilderService.runCustomReport({
      tenantId,
      report,
      runtimeFilters: payload.filters,
      page: 1,
      pageSize: 1000,
    });

    const fileData = await ReportBuilderService.exportRows(result.rows, payload.format);

    return new NextResponse(fileData, {
      headers: {
        "Content-Type": contentTypes[payload.format],
        "Content-Disposition": `attachment; filename=report-${params.id}.${payload.format}`,
      },
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : undefined) || "Failed to export report";
    const status = message === "Report not found" ? 404 : message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
