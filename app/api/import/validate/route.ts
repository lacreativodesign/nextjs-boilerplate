import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { BulkImportService } from "@/lib/import/bulk-import";

const schema = z.object({
  jobId: z.string().min(1),
  mappings: z
    .array(
      z.object({
        sourceColumn: z.string().min(1),
        destinationField: z.string().min(1),
        required: z.boolean().optional(),
        transform: z.enum(["string", "number", "boolean", "date"]).optional(),
      })
    )
    .optional(),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = schema.parse(await request.json());
    const result = await BulkImportService.validateJob({
      jobId: payload.jobId,
      tenantId: me.tenantId,
      mappings: payload.mappings,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Import validate error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Validation failed" }, { status: 400 });
  }
}
