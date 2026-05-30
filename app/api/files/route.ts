import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { FileManager } from "@/lib/files/file-manager";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const files = await FileManager.listFiles({
      tenantId: session.tenantId,
      folderId: searchParams.get("folderId") || undefined,
      tag: searchParams.get("tag") || undefined,
      q: searchParams.get("q") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });

    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json({ error: (error instanceof Error ? error.message : undefined) || "Failed to list files" }, { status: 500 });
  }
}
