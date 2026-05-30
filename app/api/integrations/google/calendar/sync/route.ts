import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import {
  importExternalCalendars,
  importGoogleCalendarEvents,
  upsertBizostoEventToGoogleCalendar,
} from "@/lib/integrations/google-calendar";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "sync_bizosto_to_google");

    if (action === "sync_bizosto_to_google") {
      if (!Array.isArray(body?.events)) {
        return NextResponse.json({ ok: false, error: "events array is required." }, { status: 400 });
      }
      const results = [];
      for (const event of body.events) {
        const result = await upsertBizostoEventToGoogleCalendar({
          tenantId: auth.user.tenantId,
          calendarId: body.calendarId,
          includeMeetLink: Boolean(body.includeMeetLinks),
          event: {
            bizostoEventId: String(event.bizostoEventId),
            summary: String(event.summary || ""),
            description: event.description ? String(event.description) : undefined,
            start: String(event.start),
            end: String(event.end),
            timezone: event.timezone ? String(event.timezone) : undefined,
            attendees: Array.isArray(event.attendees)
              ? event.attendees.map((attendee: unknown) => ({ email: String((attendee as Record<string, unknown>).email), displayName: (attendee as Record<string, unknown>).displayName }))
              : undefined,
            location: event.location ? String(event.location) : undefined,
          },
        });
        results.push(result);
      }
      return NextResponse.json({ ok: true, action, results });
    }

    if (action === "sync_google_to_bizosto") {
      const imported = await importGoogleCalendarEvents({
        tenantId: auth.user.tenantId,
        calendarId: body.calendarId,
        timeMin: body.timeMin,
        timeMax: body.timeMax,
        syncToken: body.syncToken,
      });
      return NextResponse.json({ ok: true, action, ...imported });
    }

    if (action === "import_external_calendars") {
      const calendars = await importExternalCalendars(auth.user.tenantId as string);
      return NextResponse.json({ ok: true, action, calendars: calendars.items || [] });
    }

    return NextResponse.json({ ok: false, error: "Unsupported calendar sync action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : undefined) || "Calendar sync failed." }, { status: 500 });
  }
}
