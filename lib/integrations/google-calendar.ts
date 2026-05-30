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

  const created = await googleCalendarRequest<unknown>(params.tenantId, path, {
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
        googleEventId: (created as Record<string, unknown>).id,
        calendarId: params.calendarId || "primary",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return {
    bizostoEventId: params.event.bizostoEventId,
    googleEventId: (created as Record<string, unknown>).id,
    htmlLink: (created as Record<string, unknown>).htmlLink || null,
    meetLink: (created as Record<string, unknown>).hangoutLink || (((created as Record<string, unknown>).conferenceData as Record<string, unknown>)?.entryPoints as Record<string, unknown>[])?.find((entry) => entry.entryPointType === "video")?.uri || null,
    status: (created as Record<string, unknown>).status || "confirmed",
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
  const data = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new Error(((data as Record<string, unknown>)?.error as Record<string, unknown>)?.message as string || "Failed to import Google Calendar events.");
  }

  return {
    events: Array.isArray((data as Record<string, unknown>).items)
      ? ((data as Record<string, unknown>).items as unknown[]).map((item: unknown) => {
          const i = item as Record<string, unknown>;
          const startObj = i.start as Record<string, unknown> | undefined;
          const endObj = i.end as Record<string, unknown> | undefined;
          const extProps = i.extendedProperties as Record<string, unknown> | undefined;
          return {
            googleEventId: i.id,
            summary: i.summary || "",
            description: i.description || "",
            status: i.status || "confirmed",
            start: startObj?.dateTime || startObj?.date || null,
            end: endObj?.dateTime || endObj?.date || null,
            updated: i.updated || null,
            externalBizostoEventId: (extProps?.private as Record<string, unknown>)?.bizostoEventId || null,
          };
        })
      : [],
    nextSyncToken: (data as Record<string, unknown>).nextSyncToken || null,
  };
}

export async function importExternalCalendars(tenantId: string) {
  return googleCalendarRequest<{ items?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }> }>(
    tenantId,
    "/users/me/calendarList"
  );
}
