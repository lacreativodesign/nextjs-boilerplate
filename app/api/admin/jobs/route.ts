import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { enqueueJob, getJobMetrics, listJobs, processDueJobs } from "@/lib/jobs/job-queue";

export const runtime = "nodejs";

const enqueueSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("email"),
    payload: z.object({
      tenantId: z.string().min(1),
      subject: z.string().min(1),
      body: z.string().min(1),
      recipients: z.array(z.string().email()).min(1),
      triggeredBy: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal("report_generation"),
    payload: z.object({
      tenantId: z.string().min(1),
      reportName: z.string().min(1),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      triggeredBy: z.string().optional(),
      filters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    }),
  }),
  z.object({
    type: z.literal("data_sync"),
    payload: z.object({
      tenantId: z.string().min(1),
      provider: z.enum(["quickbooks", "xero"]),
      triggeredBy: z.string().optional(),
      forceInitial: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("file_processing"),
    payload: z.object({
      tenantId: z.string().min(1),
      filePath: z.string().min(1),
      operation: z.enum(["extract_text", "generate_preview", "virus_scan"]),
      triggeredBy: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal("cleanup"),
    payload: z.object({
      tenantId: z.string().optional(),
      scope: z.enum(["tenant", "global"]),
      triggeredBy: z.string().optional(),
    }),
  }),
]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const status = request.nextUrl.searchParams.get("status") as "pending" | "processing" | "completed" | "failed" | null;
  const limit = Number(request.nextUrl.searchParams.get("limit") || "100");

  const [jobs, metrics] = await Promise.all([
    listJobs({ status: status || undefined, limit: Number.isFinite(limit) ? limit : 100 }),
    getJobMetrics(),
  ]);

  return NextResponse.json({ ok: true, jobs, metrics });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const parsed = enqueueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const triggeredBy = `${auth.user.uid}:admin-job-console`;
  const payload = {
    ...parsed.data.payload,
    triggeredBy,
  };

  const jobId = await enqueueJob({
    type: parsed.data.type,
    payload: payload as never,
  });

  const run = await processDueJobs(10);

  return NextResponse.json({ ok: true, jobId, run });
}
