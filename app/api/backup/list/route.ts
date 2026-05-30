import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "@/app/api/super_admin/_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const backupsSnap = await adminDb.collection("backups").orderBy("timestamp", "desc").limit(50).get();

    return NextResponse.json({
      ok: true,
      backups: backupsSnap.docs.map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : undefined) || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
