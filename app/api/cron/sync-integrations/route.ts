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

    const integrations = await adminDb.collectionGroup("integrations").where("connected", "==", true).get();
    const enqueued: Array<{ tenantId: string; provider: "quickbooks" | "xero"; jobId: string }> = [];

    for (const doc of integrations.docs) {
      if (doc.id !== "quickbooks" && doc.id !== "xero") continue;
      const tenantRef = doc.ref.parent.parent;
      if (!tenantRef) continue;
      const tenantId = tenantRef.id;
      const provider = doc.id as "quickbooks" | "xero";

      const jobId = await enqueueJob({
        type: "data_sync",
        payload: {
          tenantId,
          provider,
          triggeredBy: "system:cron:sync-integrations",
        },
      });

      enqueued.push({ tenantId, provider, jobId });
    }

    const run = await processDueJobs(40);

    return NextResponse.json({ ok: true, enqueued: enqueued.length, integrations: enqueued, run });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Sync integrations cron failed." }, { status: 500 });
  }
}
