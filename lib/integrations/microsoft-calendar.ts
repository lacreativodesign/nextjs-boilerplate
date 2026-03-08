import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { getValidMicrosoftAccessToken } from "@/lib/integrations/microsoft-auth";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

type BizostoCalendarEvent = {
  bizostoEventId: string;
  subject: string;
  bodyHtml?: string;
  start: string;
  end: string;
  timezone?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  locationDisplayName?: string;
};

async function graphCalendarRequest<T>(tenantId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getValidMicrosoftAccessToken(tenantId);
  const response = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="UTC"',
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Microsoft Calendar request failed.");
  return data;
}

async function getCalendarMapping(tenantId: string, bizostoEventId: string) {
  return adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("integrations")
    .doc("microsoft365")
    .collection("calendarSyncMap")
    .doc(bizostoEventId)
    .get();
}

export async function upsertBizostoEventToOutlook(params: { tenantId: string; calendarId?: string; event: BizostoCalendarEvent; includeTeamsMeeting?: boolean }) {
  const mapping = await getCalendarMapping(params.tenantId, params.event.bizostoEventId);
  const outlookEventId = mapping.exists ? String(mapping.data()?.outlookEventId || "") : "";

  const payload: Record<string, unknown> = {
    subject: params.event.subject,
    body: {
      contentType: "HTML",
      content: params.event.bodyHtml || "",
    },
    start: {
      dateTime: params.event.start,
      timeZone: params.event.timezone || "UTC",
    },
    end: {
      dateTime: params.event.end,
      timeZone: params.event.timezone || "UTC",
    },
    attendees: (params.event.attendees || []).map((attendee) => ({
      emailAddress: { address: attendee.email, name: attendee.displayName || attendee.email },
      type: "required",
    })),
    location: params.event.locationDisplayName ? { displayName: params.event.locationDisplayName } : undefined,
    singleValueExtendedProperties: [
      {
        id: "String {00020329-0000-0000-C000-000000000046} Name bizostoEventId",
        value: params.event.bizostoEventId,
      },
    ],
  };

  if (params.includeTeamsMeeting) {
    payload.isOnlineMeeting = true;
    payload.onlineMeetingProvider = "teamsForBusiness";
  }

  const apiPathPrefix = params.calendarId ? `/me/calendars/${encodeURIComponent(params.calendarId)}` : "/me";
  const method = outlookEventId ? "PATCH" : "POST";
  const path = outlookEventId ? `${apiPathPrefix}/events/${encodeURIComponent(outlookEventId)}` : `${apiPathPrefix}/events`;

  const result = await graphCalendarRequest<{ id: string; webLink?: string; onlineMeeting?: { joinUrl?: string }; iCalUId?: string }>(
    params.tenantId,
    path,
    {
      method,
      body: JSON.stringify(payload),
    }
  );

  await adminDb
    .collection("tenants")
    .doc(params.tenantId)
    .collection("integrations")
    .doc("microsoft365")
    .collection("calendarSyncMap")
    .doc(params.event.bizostoEventId)
    .set(
      {
        bizostoEventId: params.event.bizostoEventId,
        outlookEventId: result.id,
        calendarId: params.calendarId || "primary",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return {
    bizostoEventId: params.event.bizostoEventId,
    outlookEventId: result.id,
    webLink: result.webLink || null,
    teamsMeetingLink: result.onlineMeeting?.joinUrl || null,
    iCalUId: result.iCalUId || null,
  };
}

export async function importOutlookCalendarEvents(params: {
  tenantId: string;
  calendarId?: string;
  startDateTime?: string;
  endDateTime?: string;
  deltaLink?: string;
}) {
  const token = await getValidMicrosoftAccessToken(params.tenantId);
  const basePath = params.calendarId ? `/me/calendars/${encodeURIComponent(params.calendarId)}/events` : "/me/events";
  const url = params.deltaLink
    ? new URL(params.deltaLink)
    : new URL(`${GRAPH_API}${basePath}/delta`);

  if (!params.deltaLink) {
    if (params.startDateTime) url.searchParams.set("startDateTime", params.startDateTime);
    if (params.endDateTime) url.searchParams.set("endDateTime", params.endDateTime);
    url.searchParams.set("$top", "200");
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.timezone="UTC"',
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    value?: Array<{
      id?: string;
      subject?: string;
      bodyPreview?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
      webLink?: string;
      onlineMeeting?: { joinUrl?: string };
      iCalUId?: string;
      lastModifiedDateTime?: string;
      "@removed"?: { reason?: string };
      singleValueExtendedProperties?: Array<{ id?: string; value?: string }>;
    }>;
    "@odata.deltaLink"?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to import Outlook events.");
  }

  return {
    events:
      data.value?.map((item) => {
        const externalBizostoEventId =
          item.singleValueExtendedProperties?.find((entry) => entry.id?.includes("bizostoEventId"))?.value || null;
        return {
          outlookEventId: item.id || "",
          subject: item.subject || "",
          bodyPreview: item.bodyPreview || "",
          start: item.start?.dateTime || null,
          end: item.end?.dateTime || null,
          webLink: item.webLink || null,
          teamsMeetingLink: item.onlineMeeting?.joinUrl || null,
          iCalUId: item.iCalUId || null,
          updated: item.lastModifiedDateTime || null,
          deleted: Boolean(item["@removed"]),
          externalBizostoEventId,
        };
      }) || [],
    nextDeltaLink: data["@odata.deltaLink"] || null,
  };
}

export async function listOutlookCalendars(tenantId: string) {
  return graphCalendarRequest<{ value?: Array<{ id: string; name: string; canEdit?: boolean; isDefaultCalendar?: boolean }> }>(
    tenantId,
    "/me/calendars?$top=100"
  );
}
