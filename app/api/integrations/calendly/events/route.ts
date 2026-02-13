import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/api/admin/_utils";
import { listCalendlyEvents, syncCalendlyEventsFromApi } from "@/lib/integrations/calendly";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sync: z.coerce.boolean().optional(),
});

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.tenantId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid query parameters." }, { status: 400 });

    if (parsed.data.sync) {
      await syncCalendlyEventsFromApi(me.tenantId, parsed.data.limit || 20);
    }

    const events = await listCalendlyEvents(me.tenantId, parsed.data.limit || 50);
    return NextResponse.json({ ok: true, events });
  } catch (error: any) {
    console.error("GET /api/integrations/calendly/events", error);
    return NextResponse.json({ ok: false, error: error?.message || "Unable to load Calendly events." }, { status: 400 });
  }
}
