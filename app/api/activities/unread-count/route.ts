import { NextResponse } from "next/server";
import { getCurrentUser } from "../../admin/_utils";
import { getUnreadCount } from "@/lib/activity/activity-service";

export const runtime = "nodejs";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const count = await getUnreadCount(me.tenantId as string, me.uid);
  return NextResponse.json({ ok: true, count });
}
