import { type NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { ReportBuilderService } from "@/lib/reports/report-builder";
import type { ReportSnapshot } from "@/types/reports";
import { canAccessReport, getCustomReportOrThrow, requireReportsUser } from "../../_utils";

export const runtime = "nodejs";

const runSchema = z.object({
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
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
  saveSnapshot: z.boolean().default(true),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, tenantId } = await requireReportsUser(request);
    const report = await getCustomReportOrThrow(tenantId, params.id);
    if (!canAccessReport(report, user.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = runSchema.parse(await request.json().catch(() => ({})));
    const result = await ReportBuilderService.runCustomReport({
      tenantId,
      report,
      runtimeFilters: payload.filters,
      page: payload.page,
      pageSize: payload.pageSize,
    });

    const now = admin.firestore.Timestamp.now();
    const metadata = {
      filters: payload.filters || report.filters || [],
      groupBy: report.groupBy,
      aggregations: report.aggregations,
      chartType: report.chartType,
      chartConfig: report.chartConfig,
    };

    if (payload.saveSnapshot) {
      const snapshot: Omit<ReportSnapshot, "id"> = {
        tenantId,
        reportId: report.id,
        createdBy: user.uid,
        rowCount: result.totalRows,
        data: result.rows,
        metadata,
        createdAt: now,
      };
      await adminDb.collection("report_snapshots").add(snapshot);
    }

    await adminDb.collection("reports").doc(report.id).set(
      {
        lastRunAt: now,
        lastRunDuration: 0,
        runCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({
      reportId: report.id,
      rows: result.rows,
      metadata: {
        totalRows: result.totalRows,
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : undefined) || "Failed to run report";
    const status = message === "Report not found" ? 404 : message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
