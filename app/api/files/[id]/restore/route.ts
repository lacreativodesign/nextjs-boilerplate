import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { FileManager } from "@/lib/files/file-manager";

export const runtime = "nodejs";

const bodySchema = z.object({
  versionId: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = bodySchema.parse(await request.json());
    await FileManager.restoreVersion({
      tenantId: session.tenantId,
      fileId: params.id,
      versionId: body.versionId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error instanceof Error ? error.message : undefined) || "Failed to restore version" }, { status: 500 });
  }
}
