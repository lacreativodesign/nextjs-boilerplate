import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrSuperAdmin } from "@/app/api/admin/_utils";
import { processDueJobs, retryFailedJob } from "@/lib/jobs/job-queue";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    await retryFailedJob(params.id);
    const run = await processDueJobs(10);
    return NextResponse.json({ ok: true, jobId: params.id, run });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Retry failed." }, { status: 400 });
  }
}
