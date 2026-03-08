import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../admin/_utils";
import { markActivityReadForUser } from "@/lib/activity/activity-service";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function PUT(_: Request, { params }: Params) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await markActivityReadForUser({
    tenantId: me.tenantId,
    uid: me.uid,
    activityId: params.id,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
