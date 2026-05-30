import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { addWidgetAndPlace } from "@/lib/dashboard/dashboard-service";
import type { DashboardWidgetType } from "@/lib/dashboard/types";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      type?: DashboardWidgetType;
      title?: string;
      config?: Record<string, unknown>;
      x?: number;
      y?: number;
    };

    if (!body.type) return NextResponse.json({ error: "type is required" }, { status: 400 });

    const created = await addWidgetAndPlace(user.tenantId as string, user.uid, {
      type: body.type,
      title: body.title,
      config: body.config,
      x: body.x,
      y: body.y,
    });

    return NextResponse.json({ ok: true, ...created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error instanceof Error ? error.message : undefined) || "Failed to create widget" }, { status: 500 });
  }
}
