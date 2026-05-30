import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { removeIndexedDocument } from "@/lib/search/global-search";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  try {
    const session = await getCurrentUser();
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const removed = await removeIndexedDocument({ tenantId: session.tenantId, id: context.params.id }) as string;
    return NextResponse.json({ ok: removed });
  } catch (error) {
    console.error("Delete index document error", error);
    return NextResponse.json({ error: "Failed to delete index document" }, { status: 500 });
  }
}
