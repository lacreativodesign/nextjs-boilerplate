import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { z } from "zod";
import { adminDb } from "@/lib/firebaseAdmin";
import { ReportBuilderService } from "@/lib/reports/report-builder";
import type { ReportScheduleRecord } from "@/types/reports";
import { canAccessReport, getCustomReportOrThrow, requireReportsUser } from "../../_utils";

export const runtime = "nodejs";

const scheduleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
  enabled: z.boolean().default(true),
  recipients: z.array(z.string().email()).min(1),
  format: z.enum(["pdf", "csv", "xlsx"]).default("csv"),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, tenantId } = await requireReportsUser(request);
    const report = await getCustomReportOrThrow(tenantId, params.id);
    if (!canAccessReport(report, user.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = scheduleSchema.parse(await request.json());
    const now = admin.firestore.Timestamp.now();
    const nextRunAt = ReportBuilderService.computeNextRunAt({
      frequency: payload.frequency,
      dayOfWeek: payload.dayOfWeek,
      dayOfMonth: payload.dayOfMonth,
      time: payload.time,
      timezone: payload.timezone,
      enabled: payload.enabled,
    });

    const scheduleRecord: Omit<ReportScheduleRecord, "id"> = {
      tenantId,
      reportId: report.id,
      schedule: {
        frequency: payload.frequency,
        dayOfWeek: payload.dayOfWeek,
        dayOfMonth: payload.dayOfMonth,
        time: payload.time,
        timezone: payload.timezone,
        enabled: payload.enabled,
      },
      recipients: payload.recipients,
      format: payload.format,
      nextRunAt,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    await adminDb.collection("report_schedules").doc(report.id).set(scheduleRecord);
    await adminDb.collection("reports").doc(report.id).set(
      {
        isScheduled: payload.enabled,
        schedule: scheduleRecord.schedule,
        recipients: payload.recipients,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ...scheduleRecord });
  } catch (error: any) {
    const message = error?.message || "Failed to schedule report";
    const status = message === "Report not found" ? 404 : message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
