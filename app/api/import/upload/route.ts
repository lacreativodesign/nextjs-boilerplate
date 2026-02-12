import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { BulkImportService } from "@/lib/import/bulk-import";

const bodySchema = z.object({
  entity: z.enum(["clients", "invoices", "products", "employees", "projects", "tasks", "time_entries"]),
  mappings: z
    .array(
      z.object({
        sourceColumn: z.string().min(1),
        destinationField: z.string().min(1),
        required: z.boolean().optional(),
        transform: z.enum(["string", "number", "boolean", "date"]).optional(),
      })
    )
    .default([]),
  templateId: z.string().optional().nullable(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    const payload = bodySchema.parse({
      entity: formData.get("entity"),
      mappings: JSON.parse(String(formData.get("mappings") || "[]")),
      templateId: formData.get("templateId") ? String(formData.get("templateId")) : null,
    });

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const jobId = await BulkImportService.upload({
      tenantId: me.tenantId,
      userId: me.uid,
      entity: payload.entity,
      fileName: file.name,
      mimeType: file.type,
      buffer: Buffer.from(bytes),
      mappings: payload.mappings,
      templateId: payload.templateId,
    });

    return NextResponse.json({ ok: true, jobId });
  } catch (error) {
    console.error("Import upload error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
