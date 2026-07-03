import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/admin/settings/_utils';
import {
  importOutlookCalendarEvents,
  listOutlookCalendars,
  upsertBizostoEventToOutlook,
} from '@/lib/integrations/microsoft-calendar';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      calendarId?: string;
      includeTeamsMeeting?: boolean;
      deltaLink?: string;
      startDateTime?: string;
      endDateTime?: string;
      events?: Array<{
        bizostoEventId?: string;
        subject?: string;
        bodyHtml?: string;
        start?: string;
        end?: string;
        timezone?: string;
        attendees?: Array<{ email?: string; displayName?: string }>;
        locationDisplayName?: string;
      }>;
    };

    const action = String(body.action || 'sync_bizosto_to_outlook');

    if (action === 'sync_bizosto_to_outlook') {
      if (!Array.isArray(body.events))
        return NextResponse.json(
          { ok: false, error: 'events array is required.' },
          { status: 400 },
        );
      const results = [];
      for (const event of body.events) {
        if (!event.bizostoEventId || !event.subject || !event.start || !event.end) {
          return NextResponse.json(
            { ok: false, error: 'Each event requires bizostoEventId, subject, start and end.' },
            { status: 400 },
          );
        }

        const result = await upsertBizostoEventToOutlook({
          tenantId: auth.user.tenantId,
          calendarId: body.calendarId,
          includeTeamsMeeting: Boolean(body.includeTeamsMeeting),
          event: {
            bizostoEventId: String(event.bizostoEventId),
            subject: String(event.subject),
            bodyHtml: event.bodyHtml ? String(event.bodyHtml) : undefined,
            start: String(event.start),
            end: String(event.end),
            timezone: event.timezone ? String(event.timezone) : undefined,
            attendees: Array.isArray(event.attendees)
              ? event.attendees
                  .filter((attendee) => attendee.email)
                  .map((attendee) => ({
                    email: String(attendee.email),
                    displayName: attendee.displayName,
                  }))
              : undefined,
            locationDisplayName: event.locationDisplayName
              ? String(event.locationDisplayName)
              : undefined,
          },
        });
        results.push(result);
      }
      return NextResponse.json({ ok: true, action, results });
    }

    if (action === 'sync_outlook_to_bizosto') {
      const imported = await importOutlookCalendarEvents({
        tenantId: auth.user.tenantId,
        calendarId: body.calendarId,
        startDateTime: body.startDateTime,
        endDateTime: body.endDateTime,
        deltaLink: body.deltaLink,
      });
      return NextResponse.json({ ok: true, action, ...imported });
    }

    if (action === 'list_calendars') {
      const calendars = await listOutlookCalendars(auth.user.tenantId);
      return NextResponse.json({ ok: true, action, calendars: calendars.value || [] });
    }

    return NextResponse.json(
      { ok: false, error: 'Unsupported Outlook calendar action.' },
      { status: 400 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Calendar sync failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
