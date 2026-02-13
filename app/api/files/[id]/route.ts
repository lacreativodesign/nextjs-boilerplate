import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { FileManager } from "@/lib/files/file-manager";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const file = await FileManager.getFileById(params.id, session.tenantId);
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    return NextResponse.json({ file });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to load file" }, { status: 500 });
  }
}
