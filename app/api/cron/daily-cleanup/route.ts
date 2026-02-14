import { NextRequest, NextResponse } from "next/server";
import { enqueueJob, processDueJobs } from "@/lib/jobs/job-queue";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const jobId = await enqueueJob({
      type: "cleanup",
      payload: {
        scope: "global",
        triggeredBy: "system:cron:daily-cleanup",
      },
    });

    const run = await processDueJobs(20);

    return NextResponse.json({ ok: true, enqueuedJobId: jobId, run });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Daily cleanup cron failed." }, { status: 500 });
  }
}
