import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { applyTemplate, getDashboardState, saveLayout } from "@/lib/dashboard/dashboard-service";
import { DASHBOARD_TEMPLATES, listWidgetDefinitions } from "@/lib/dashboard/widget-registry";
import type { DashboardWidgetLayoutItem, DashboardWidgetTemplateId } from "@/lib/dashboard/types";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const state = await getDashboardState(user.tenantId as string, user.uid);
    return NextResponse.json({ ...state, widgetTypes: listWidgetDefinitions(), templates: DASHBOARD_TEMPLATES });
  } catch (error) {
    return NextResponse.json({ error: (error instanceof Error ? error.message : undefined) || "Failed to fetch dashboard layout" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as { items?: DashboardWidgetLayoutItem[]; templateId?: DashboardWidgetTemplateId };
    if (body.templateId) {
      const applied = await applyTemplate(user.tenantId as string, user.uid, body.templateId);
      return NextResponse.json({ ok: true, applied });
    }

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: "items is required" }, { status: 400 });
    }

    const items = await saveLayout(user.tenantId as string, user.uid, body.items);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ error: (error instanceof Error ? error.message : undefined) || "Failed to save layout" }, { status: 500 });
  }
}
