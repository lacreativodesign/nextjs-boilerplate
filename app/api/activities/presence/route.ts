import { NextResponse } from "next/server";
import { getCurrentUser } from "../../admin/_utils";
import { listOnlineUsers } from "@/lib/activity/activity-service";

export const runtime = "nodejs";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const users = await listOnlineUsers(me.tenantId);
  return NextResponse.json({ ok: true, users });
}
