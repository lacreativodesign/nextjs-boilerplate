import { type NextRequest, NextResponse } from "next/server";
import { restoreBackup } from "@/lib/backup/restore";
import { requireSuperAdmin } from "@/app/api/super_admin/_utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const body = (await req.json()) as { backupId?: string };
    if (!body?.backupId || typeof body.backupId !== "string") {
      return NextResponse.json({ ok: false, error: "backupId is required" }, { status: 400 });
    }

    await restoreBackup(body.backupId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = (error instanceof Error ? error.message : undefined) || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
