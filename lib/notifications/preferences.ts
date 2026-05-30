import admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { type USER_NOTIFICATION_CHANNELS, USER_NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/preferences-config";
import { normalizeTenantId } from "@/lib/tenant";
import { sendEmail } from "@/lib/email/email-service";
import type {
  NotificationFrequency,
  NotificationDigestItem,
  UserNotificationEventType,
  UserNotificationPreferences,
} from "@/types/notifications";

const COLLECTION = "user_notification_preferences";
const DIGEST_COLLECTION = "notification_digest_queue";

type NotificationChannelKey = (typeof USER_NOTIFICATION_CHANNELS)[number];

export type NotificationDispatchRequest = {
  tenantId: string;
  userId: string;
  userEmail?: string;
  eventType: UserNotificationEventType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  now?: Date;
};

export class NotificationPreferenceService {
  static getDefaultPreferences(userId: string, tenantId: string): UserNotificationPreferences {
    const now = Timestamp.now();
    const eventPreferences = USER_NOTIFICATION_EVENT_TYPES.reduce(
      (acc, eventType) => {
        acc[eventType] = {
          enabled: true,
          channels: ["in_app", "email"],
          frequency: "instant",
        };
        return acc;
      },
      {} as UserNotificationPreferences["eventPreferences"]
    );

    return {
      id: userId,
      tenantId: normalizeTenantId(tenantId),
      userId,
      channels: {
        inApp: true,
        email: true,
        sms: false,
        push: false,
      },
      eventPreferences,
      digest: {
        enabled: true,
        frequencies: ["daily"],
        dailySendTime: "09:00",
        weeklySendDay: 1,
        weeklySendTime: "09:00",
      },
      quietHours: {
        enabled: false,
        start: "22:00",
        end: "08:00",
        timezone: "UTC",
      },
      unsubscribedEventTypes: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  static async getPreferences(userId: string, tenantId: string): Promise<UserNotificationPreferences> {
    const doc = await adminDb.collection(COLLECTION).doc(userId).get();
    if (!doc.exists) {
      return this.getDefaultPreferences(userId, tenantId);
    }

    const current = doc.data() as UserNotificationPreferences;
    if (normalizeTenantId(current.tenantId) !== normalizeTenantId(tenantId)) {
      return this.getDefaultPreferences(userId, tenantId);
    }

    return this.normalizePreferences(current, userId, tenantId);
  }

  static async updatePreferences(params: {
    userId: string;
    tenantId: string;
    updates: Partial<UserNotificationPreferences>;
  }): Promise<UserNotificationPreferences> {
    const existing = await this.getPreferences(params.userId, params.tenantId);

    const merged = this.normalizePreferences(
      {
        ...existing,
        ...params.updates,
        channels: {
          ...existing.channels,
          ...(params.updates.channels || {}),
        },
        digest: {
          ...existing.digest,
          ...(params.updates.digest || {}),
        },
        quietHours: {
          ...existing.quietHours,
          ...(params.updates.quietHours || {}),
        },
        eventPreferences: {
          ...existing.eventPreferences,
          ...(params.updates.eventPreferences || {}),
        },
        unsubscribedEventTypes: Array.from(
          new Set([...(params.updates.unsubscribedEventTypes || existing.unsubscribedEventTypes || [])])
        ),
      },
      params.userId,
      params.tenantId
    );

    await adminDb
      .collection(COLLECTION)
      .doc(params.userId)
      .set(
        {
          ...merged,
          tenantId: normalizeTenantId(params.tenantId),
          userId: params.userId,
          updatedAt: admin.firestore.Timestamp.now(),
          createdAt: existing.createdAt || admin.firestore.Timestamp.now(),
        },
        { merge: true }
      );

    return this.getPreferences(params.userId, params.tenantId);
  }

  static async shouldSendNow(request: NotificationDispatchRequest): Promise<{
    deliverNow: boolean;
    reason: "instant" | "digest" | "disabled" | "unsubscribed" | "quiet_hours";
    channels: NotificationChannelKey[];
    frequency: NotificationFrequency;
  }> {
    const preferences = await this.getPreferences(request.userId, request.tenantId);
    const eventSetting = preferences.eventPreferences[request.eventType];

    if (!eventSetting?.enabled) {
      return { deliverNow: false, reason: "disabled", channels: [], frequency: "instant" };
    }

    if (preferences.unsubscribedEventTypes.includes(request.eventType)) {
      return { deliverNow: false, reason: "unsubscribed", channels: [], frequency: eventSetting.frequency };
    }

    const channels = eventSetting.channels.filter((channel) => this.isChannelEnabled(preferences, channel));
    if (!channels.length) {
      return { deliverNow: false, reason: "disabled", channels: [], frequency: eventSetting.frequency };
    }

    if (eventSetting.frequency !== "instant") {
      return { deliverNow: false, reason: "digest", channels, frequency: eventSetting.frequency };
    }

    if (this.isInQuietHours(preferences, request.now || new Date())) {
      return { deliverNow: false, reason: "quiet_hours", channels, frequency: eventSetting.frequency };
    }

    return { deliverNow: true, reason: "instant", channels, frequency: eventSetting.frequency };
  }

  static async queueDigestItem(request: NotificationDispatchRequest, frequency: "hourly" | "daily" | "weekly") {
    const preferences = await this.getPreferences(request.userId, request.tenantId);
    const channels = preferences.eventPreferences[request.eventType]?.channels || [];

    const scheduledFor = this.getNextDigestTime(preferences, frequency, request.now || new Date());
    await adminDb.collection(DIGEST_COLLECTION).add({
      tenantId: normalizeTenantId(request.tenantId),
      userId: request.userId,
      eventType: request.eventType,
      title: request.title,
      message: request.message,
      actionUrl: request.actionUrl || null,
      actionLabel: request.actionLabel || null,
      channels,
      metadata: request.metadata || {},
      createdAt: admin.firestore.Timestamp.now(),
      scheduledFor: Timestamp.fromDate(scheduledFor),
      frequency,
    } satisfies Omit<NotificationDigestItem, "id">);
  }

  static async processDigestBatch(frequency: "daily" | "weekly", now = new Date()): Promise<number> {
    const snapshot = await adminDb
      .collection(DIGEST_COLLECTION)
      .where("frequency", "==", frequency)
      .where("scheduledFor", "<=", Timestamp.fromDate(now))
      .orderBy("scheduledFor", "asc")
      .limit(200)
      .get();

    if (snapshot.empty) return 0;

    const grouped = new Map<string, Array<NotificationDigestItem & { id: string }>>();
    snapshot.docs.forEach((doc) => {
      const item = { id: doc.id, ...(doc.data() as Omit<NotificationDigestItem, "id">) };
      const key = `${item.tenantId}:${item.userId}`;
      const current = grouped.get(key) || [];
      current.push(item);
      grouped.set(key, current);
    });

    for (const [, items] of grouped.entries()) {
      const [first] = items;
      const userDoc = await adminDb.collection("users").doc(first.userId).get();
      const userEmail = String(userDoc.data()?.email || "").trim();
      if (!userEmail) continue;

      const html = this.buildDigestHtml(items, frequency);
      await sendEmail({
        to: userEmail,
        subject: frequency === "daily" ? "Daily notification digest" : "Weekly notification digest",
        html,
        text: this.buildDigestText(items, frequency),
      });
    }

    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    return snapshot.size;
  }

  static async unsubscribe(params: {
    userId: string;
    tenantId: string;
    eventType: UserNotificationEventType;
  }): Promise<void> {
    const preferences = await this.getPreferences(params.userId, params.tenantId);
    const unsubscribed = Array.from(new Set([...preferences.unsubscribedEventTypes, params.eventType]));

    await this.updatePreferences({
      userId: params.userId,
      tenantId: params.tenantId,
      updates: {
        unsubscribedEventTypes: unsubscribed,
        eventPreferences: {
          ...preferences.eventPreferences,
          [params.eventType]: {
            ...preferences.eventPreferences[params.eventType],
            enabled: false,
          },
        },
      },
    });
  }

  static buildUnsubscribeToken(params: { userId: string; tenantId: string; eventType: UserNotificationEventType }) {
    return Buffer.from(`${normalizeTenantId(params.tenantId)}:${params.userId}:${params.eventType}`).toString("base64url");
  }

  static parseUnsubscribeToken(token: string): { userId: string; tenantId: string; eventType: UserNotificationEventType } | null {
    try {
      const raw = Buffer.from(token, "base64url").toString("utf8");
      const [tenantId, userId, eventType] = raw.split(":");
      if (!tenantId || !userId || !eventType || !USER_NOTIFICATION_EVENT_TYPES.includes(eventType as UserNotificationEventType)) {
        return null;
      }
      return { tenantId, userId, eventType: eventType as UserNotificationEventType };
    } catch {
      return null;
    }
  }

  static isInQuietHours(preferences: UserNotificationPreferences, now: Date): boolean {
    if (!preferences.quietHours?.enabled) return false;
    const [startHour, startMinute] = preferences.quietHours.start.split(":").map(Number);
    const [endHour, endMinute] = preferences.quietHours.end.split(":").map(Number);
    if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return false;

    const current = this.getCurrentTimeInTimezone(now, preferences.quietHours.timezone);
    const currentMinutes = current.hour * 60 + current.minute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (startMinutes === endMinutes) return false;
    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  private static normalizePreferences(
    preferences: Partial<UserNotificationPreferences>,
    userId: string,
    tenantId: string
  ): UserNotificationPreferences {
    const defaults = this.getDefaultPreferences(userId, tenantId);
    const eventPreferences = { ...defaults.eventPreferences, ...(preferences.eventPreferences || {}) };

    USER_NOTIFICATION_EVENT_TYPES.forEach((eventType) => {
      eventPreferences[eventType] = {
        ...defaults.eventPreferences[eventType],
        ...(eventPreferences[eventType] || {}),
      };
    });

    return {
      ...defaults,
      ...preferences,
      id: userId,
      tenantId: normalizeTenantId(tenantId),
      userId,
      channels: {
        ...defaults.channels,
        ...(preferences.channels || {}),
      },
      digest: {
        ...defaults.digest,
        ...(preferences.digest || {}),
      },
      quietHours: {
        ...defaults.quietHours,
        ...(preferences.quietHours || {}),
      },
      eventPreferences,
      unsubscribedEventTypes: Array.from(new Set(preferences.unsubscribedEventTypes || [])),
      createdAt: preferences.createdAt || defaults.createdAt,
      updatedAt: preferences.updatedAt || defaults.updatedAt,
    };
  }

  private static isChannelEnabled(preferences: UserNotificationPreferences, channel: NotificationChannelKey) {
    if (channel === "in_app") return preferences.channels.inApp;
    if (channel === "email") return preferences.channels.email;
    if (channel === "sms") return preferences.channels.sms;
    return preferences.channels.push;
  }

  private static getNextDigestTime(
    preferences: UserNotificationPreferences,
    frequency: "hourly" | "daily" | "weekly",
    now: Date
  ): Date {
    if (frequency === "hourly") {
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      return next;
    }

    if (frequency === "daily") {
      const [hour, minute] = preferences.digest.dailySendTime.split(":").map(Number);
      const next = new Date(now);
      next.setHours(hour || 9, minute || 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }

    const [hour, minute] = preferences.digest.weeklySendTime.split(":").map(Number);
    const targetDay = preferences.digest.weeklySendDay;
    const next = new Date(now);
    next.setHours(hour || 9, minute || 0, 0, 0);
    const currentDay = next.getDay();
    let delta = targetDay - currentDay;
    if (delta < 0 || (delta === 0 && next <= now)) delta += 7;
    next.setDate(next.getDate() + delta);
    return next;
  }

  private static getCurrentTimeInTimezone(now: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    return {
      hour: Number(parts.find((part) => part.type === "hour")?.value || "0"),
      minute: Number(parts.find((part) => part.type === "minute")?.value || "0"),
    };
  }

  private static buildDigestHtml(items: Array<NotificationDigestItem & { id: string }>, frequency: "daily" | "weekly") {
    const grouped = this.groupDigestItems(items);
    const groupsHtml = Object.entries(grouped)
      .map(
        ([eventType, notifications]) =>
          `<h3>${eventType.replace(/_/g, " ")}</h3><ul>${notifications
            .map(
              (item) =>
                `<li><strong>${item.title}</strong><p>${item.message}</p>${
                  item.actionUrl ? `<a href="${item.actionUrl}">${item.actionLabel || "Open"}</a>` : ""
                }</li>`
            )
            .join("")}</ul>`
      )
      .join("");

    return `<html><body><h2>${frequency === "daily" ? "Daily" : "Weekly"} Digest</h2>${groupsHtml}</body></html>`;
  }

  private static buildDigestText(items: Array<NotificationDigestItem & { id: string }>, frequency: "daily" | "weekly") {
    const grouped = this.groupDigestItems(items);
    const lines: string[] = [`${frequency === "daily" ? "Daily" : "Weekly"} notification digest`];

    Object.entries(grouped).forEach(([eventType, notifications]) => {
      lines.push(`\n${eventType.replace(/_/g, " ")}:`);
      notifications.forEach((item) => {
        lines.push(`- ${item.title}: ${item.message}`);
      });
    });

    return lines.join("\n");
  }

  private static groupDigestItems(items: Array<NotificationDigestItem & { id: string }>) {
    return items.reduce<Record<string, Array<NotificationDigestItem & { id: string }>>>((acc, item) => {
      if (!acc[item.eventType]) acc[item.eventType] = [];
      acc[item.eventType].push(item);
      return acc;
    }, {});
  }
}
