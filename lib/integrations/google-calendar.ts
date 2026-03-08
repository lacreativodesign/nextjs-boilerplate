import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getValidGoogleAccessToken } from "@/lib/integrations/google-auth";

const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

type BizostoCalendarEvent = {
  bizostoEventId: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  timezone?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  location?: string;
};

async function googleCalendarRequest<T>(tenantId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getValidGoogleAccessToken(tenantId);
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data?.error?.message || "Google Calendar request failed.");
  }
  return data;
}

async function getMapping(tenantId: string, bizostoEventId: string) {
  return adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("integrations")
    .doc("googleWorkspace")
    .collection("calendarSyncMap")
    .doc(bizostoEventId)
    .get();
}

export async function upsertBizostoEventToGoogleCalendar(params: {
  tenantId: string;
  calendarId?: string;
  event: BizostoCalendarEvent;
  includeMeetLink?: boolean;
}) {
  const calendarId = encodeURIComponent(params.calendarId || "primary");
  const mapping = await getMapping(params.tenantId, params.event.bizostoEventId);
  const googleEventId = mapping.exists ? String(mapping.data()?.googleEventId || "") : "";

  const payload: Record<string, unknown> = {
    summary: params.event.summary,
    description: params.event.description || "",
    location: params.event.location || "",
    start: { dateTime: params.event.start, timeZone: params.event.timezone || "UTC" },
    end: { dateTime: params.event.end, timeZone: params.event.timezone || "UTC" },
    attendees: (params.event.attendees || []).map((attendee) => ({ email: attendee.email, displayName: attendee.displayName })),
    extendedProperties: {
      private: {
        bizostoEventId: params.event.bizostoEventId,
      },
    },
  };

  if (params.includeMeetLink) {
    payload.conferenceData = {
      createRequest: {
        conferenceSolutionKey: { type: "hangoutsMeet" },
        requestId: `${params.event.bizostoEventId}-${Date.now()}`,
      },
    };
  }

  const method = googleEventId ? "PUT" : "POST";
  const path = googleEventId
    ? `/calendars/${calendarId}/events/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1`
    : `/calendars/${calendarId}/events?conferenceDataVersion=1`;

  const created = await googleCalendarRequest<any>(params.tenantId, path, {
    method,
    body: JSON.stringify(payload),
  });

  await adminDb
    .collection("tenants")
    .doc(params.tenantId)
    .collection("integrations")
    .doc("googleWorkspace")
    .collection("calendarSyncMap")
    .doc(params.event.bizostoEventId)
    .set(
      {
        bizostoEventId: params.event.bizostoEventId,
        googleEventId: created.id,
        calendarId: params.calendarId || "primary",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return {
    bizostoEventId: params.event.bizostoEventId,
    googleEventId: created.id,
    htmlLink: created.htmlLink || null,
    meetLink: created.hangoutLink || created.conferenceData?.entryPoints?.find((entry: any) => entry.entryPointType === "video")?.uri || null,
    status: created.status || "confirmed",
  };
}

export async function importGoogleCalendarEvents(params: {
  tenantId: string;
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  syncToken?: string;
}) {
  const calendarId = encodeURIComponent(params.calendarId || "primary");
  const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/${calendarId}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "true");
  if (params.timeMin) url.searchParams.set("timeMin", params.timeMin);
  if (params.timeMax) url.searchParams.set("timeMax", params.timeMax);
  if (params.syncToken) {
    url.searchParams.set("syncToken", params.syncToken);
  } else {
    url.searchParams.set("maxResults", "2500");
  }

  const token = await getValidGoogleAccessToken(params.tenantId);
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    throw new Error(data?.error?.message || "Failed to import Google Calendar events.");
  }

  return {
    events: Array.isArray(data.items)
      ? data.items.map((item: any) => ({
          googleEventId: item.id,
          summary: item.summary || "",
          description: item.description || "",
          status: item.status || "confirmed",
          start: item.start?.dateTime || item.start?.date || null,
          end: item.end?.dateTime || item.end?.date || null,
          updated: item.updated || null,
          externalBizostoEventId: item.extendedProperties?.private?.bizostoEventId || null,
        }))
      : [],
    nextSyncToken: data.nextSyncToken || null,
  };
}

export async function importExternalCalendars(tenantId: string) {
  return googleCalendarRequest<{ items?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }> }>(
    tenantId,
    "/users/me/calendarList"
  );
}
