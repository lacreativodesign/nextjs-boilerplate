import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { enqueueJob, processDueJobs } from "@/lib/jobs/job-queue";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantDocs = await adminDb.collection("tenants").limit(500).get();
    const enqueueResults = await Promise.all(
      tenantDocs.docs.map(async (doc) => {
        const jobId = await enqueueJob({
          type: "report_generation",
          payload: {
            tenantId: doc.id,
            reportName: "weekly-operational-summary",
            triggeredBy: "system:cron:generate-reports",
          },
        });
        return { tenantId: doc.id, jobId };
      }),
    );

    const run = await processDueJobs(50);

    return NextResponse.json({ ok: true, enqueued: enqueueResults.length, enqueueResults, run });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Generate reports cron failed." }, { status: 500 });
  }
}
