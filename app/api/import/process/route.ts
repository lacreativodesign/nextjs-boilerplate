import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { BulkImportService } from "@/lib/import/bulk-import";

const schema = z.object({
  jobId: z.string().min(1),
  rollbackOnCritical: z.boolean().optional(),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = schema.parse(await request.json());
    const result = await BulkImportService.processJob({
      jobId: payload.jobId,
      tenantId: me.tenantId,
      userId: me.uid,
      rollbackOnCritical: payload.rollbackOnCritical,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Import process error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Process failed" }, { status: 400 });
  }
}
