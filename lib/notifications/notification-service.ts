import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email/email-service";
import { sendSMS } from "@/lib/sms/sms-service";
import type {
  Notification,
  NotificationCategory,
  NotificationChannel,
  NotificationPreferences,
  NotificationTemplate,
  NotificationType,
} from "@/types/notifications";

const PRIORITY_LEVELS = ["low", "medium", "high", "urgent"] as const;
const DEFAULT_CATEGORIES: NotificationCategory[] = [
  "system",
  "financial",
  "sales",
  "operations",
  "security",
  "team",
  "custom",
];

export class NotificationService {
  static async send(params: {
    tenantId: string;
    userId: string;
    userEmail: string;
    type: NotificationType;
    title: string;
    message: string;
    category: NotificationCategory;
    priority?: "low" | "medium" | "high" | "urgent";
    actionUrl?: string;
    actionLabel?: string;
    channels?: NotificationChannel[];
    relatedResourceType?: string;
    relatedResourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const preferences = await this.getUserPreferences(params.userId, params.tenantId);
    const priority = params.priority || "medium";
    const channels = params.channels || this.getDefaultChannels(preferences, params.category, priority);

    const isQuiet = this.isQuietHours(preferences);
    const shouldDelay = isQuiet && priority !== "urgent";

    const baseNotification: Omit<Notification, "id"> = {
      tenantId: params.tenantId,
      userId: params.userId,
      userEmail: params.userEmail,
      type: params.type,
      title: params.title,
      message: params.message,
      category: params.category,
      priority,
      actionUrl: params.actionUrl,
      actionLabel: params.actionLabel,
      relatedResourceType: params.relatedResourceType,
      relatedResourceId: params.relatedResourceId,
      channels,
      deliveryStatus: {
        inApp: "pending",
      },
      isRead: false,
      isArchived: channels.includes("in_app") ? false : true,
      metadata: params.metadata,
      createdAt: Timestamp.now(),
    };

    const docRef = await adminDb.collection("notifications").add(baseNotification);

    if (shouldDelay) {
      await this.queueForLater(docRef.id, baseNotification, channels, preferences);
      return docRef.id;
    }

    await this.deliverToChannels(docRef.id, baseNotification, channels);
    return docRef.id;
  }

  static async sendFromTemplate(params: {
    tenantId: string;
    userId: string;
    userEmail: string;
    templateKey: string;
    variables: Record<string, unknown>;
    actionUrl?: string;
  }): Promise<string> {
    const templateDoc = await adminDb
      .collection("notification_templates")
      .where("tenantId", "==", params.tenantId)
      .where("key", "==", params.templateKey)
      .limit(1)
      .get();

    if (templateDoc.empty) {
      throw new Error(`Template not found: ${params.templateKey}`);
    }

    const template = templateDoc.docs[0].data() as NotificationTemplate;
    const title = this.interpolate(template.templates.inApp.title, params.variables);
    const message = this.interpolate(template.templates.inApp.message, params.variables);

    return this.send({
      tenantId: params.tenantId,
      userId: params.userId,
      userEmail: params.userEmail,
      type: "info",
      title,
      message,
      category: template.category,
      priority: template.defaultPriority,
      channels: template.defaultChannels,
      actionUrl: params.actionUrl,
      actionLabel: template.templates.inApp.actionLabel,
    });
  }

  static async markAsRead(notificationId: string): Promise<void> {
    await adminDb.collection("notifications").doc(notificationId).update({
      isRead: true,
      readAt: Timestamp.now(),
    });
  }

  static async markAllAsRead(userId: string, tenantId: string): Promise<number> {
    const snapshot = await adminDb
      .collection("notifications")
      .where("tenantId", "==", tenantId)
      .where("userId", "==", userId)
      .where("isRead", "==", false)
      .get();

    if (snapshot.empty) return 0;

    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isRead: true,
        readAt: Timestamp.now(),
      });
    });

    await batch.commit();
    return snapshot.size;
  }

  static async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    const snapshot = await adminDb
      .collection("notifications")
      .where("tenantId", "==", tenantId)
      .where("userId", "==", userId)
      .where("isRead", "==", false)
      .where("isArchived", "==", false)
      .count()
      .get();

    return snapshot.data().count;
  }

  static async processPendingDeliveriesForUser(userId: string, tenantId: string) {
    const preferences = await this.getUserPreferences(userId, tenantId);
    if (this.isQuietHours(preferences)) return;

    const base = adminDb
      .collection("notifications")
      .where("tenantId", "==", tenantId)
      .where("userId", "==", userId)
      .where("isArchived", "==", false);

    const snapshots = await Promise.all([
      base.where("deliveryStatus.email", "==", "pending").get(),
      base.where("deliveryStatus.sms", "==", "pending").get(),
      base.where("deliveryStatus.webhook", "==", "pending").get(),
    ]);

    const map = new Map<string, Notification>();
    snapshots.forEach((snap) => {
      snap.docs.forEach((doc) => {
        map.set(doc.id, doc.data() as Notification);
      });
    });

    for (const [id, notification] of map.entries()) {
      await this.deliverToChannels(id, notification, notification.channels);
    }
  }

  static getDefaultPreferences(userId: string, tenantId: string): NotificationPreferences {
    const categorySettings = DEFAULT_CATEGORIES.reduce((acc, category) => {
      acc[category] = {
        enabled: true,
        channels: ["in_app", "email"],
        minPriority: "low",
      };
      return acc;
    }, {} as NotificationPreferences["categorySettings"]);

    return {
      id: userId,
      tenantId,
      userId,
      channels: {
        inApp: true,
        email: true,
        sms: false,
      },
      categorySettings,
      quietHours: {
        enabled: false,
        start: "22:00",
        end: "08:00",
        timezone: "UTC",
      },
      emailDigest: {
        enabled: false,
        frequency: "daily",
        time: "09:00",
      },
      updatedAt: Timestamp.now(),
    };
  }

  private static async deliverToChannels(
    notificationId: string,
    notification: Omit<Notification, "id">,
    channels: NotificationChannel[]
  ) {
    const deliveryStatus = { ...notification.deliveryStatus };
    deliveryStatus.inApp = "delivered";

    if (channels.includes("email")) {
      try {
        await sendEmail({
          to: notification.userEmail,
          subject: notification.title,
          html: this.buildEmailHtml(notification),
          text: notification.message,
        });
        deliveryStatus.email = "sent";
      } catch (error) {
        console.error("Email delivery failed:", error);
        deliveryStatus.email = "failed";
      }
    }

    if (channels.includes("sms")) {
      try {
        const userDoc = await adminDb.collection("users").doc(notification.userId).get();
        const phone = userDoc.data()?.phone;

        if (phone) {
          await sendSMS({
            to: phone,
            message: `${notification.title}\n${notification.message}`,
          });
          deliveryStatus.sms = "sent";
        }
      } catch (error) {
        console.error("SMS delivery failed:", error);
        deliveryStatus.sms = "failed";
      }
    }

    if (channels.includes("webhook")) {
      try {
        await this.sendWebhooks(notificationId, notification);
        deliveryStatus.webhook = "sent";
      } catch (error) {
        console.error("Webhook delivery failed:", error);
        deliveryStatus.webhook = "failed";
      }
    }

    await adminDb.collection("notifications").doc(notificationId).update({
      deliveryStatus,
    });
  }

  private static async sendWebhooks(notificationId: string, notification: Omit<Notification, "id">) {
    const snapshot = await adminDb
      .collection("notification_webhooks")
      .where("tenantId", "==", notification.tenantId)
      .where("enabled", "==", true)
      .get();

    if (snapshot.empty) return;

    const payload = {
      id: notificationId,
      tenantId: notification.tenantId,
      userId: notification.userId,
      type: notification.type,
      category: notification.category,
      priority: notification.priority,
      title: notification.title,
      message: notification.message,
      actionUrl: notification.actionUrl || null,
      createdAt: toIsoTimestamp(notification.createdAt),
    };

    await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data() || {};
        const url = String(data.url || "");
        const enabled = Boolean(data.enabled);
        const eventTypes = Array.isArray(data.eventTypes) ? data.eventTypes : null;
        if (!url || !enabled) return;
        if (eventTypes && !eventTypes.includes(notification.type)) return;

        const secret = String(data.secret || "");
        const signature = secret ? cryptoSign(payload, secret) : "";

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Notification-Id": notificationId,
            ...(signature ? { "X-Notification-Signature": signature } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const responseBody = await response.text();
          throw new Error(`Webhook failed: ${response.status} ${responseBody}`);
        }
      })
    );
  }

  private static async getUserPreferences(
    userId: string,
    tenantId: string
  ): Promise<NotificationPreferences> {
    const doc = await adminDb.collection("notification_preferences").doc(userId).get();

    if (!doc.exists) {
      return this.getDefaultPreferences(userId, tenantId);
    }

    const data = doc.data() as NotificationPreferences;
    if (data.tenantId !== tenantId) {
      return this.getDefaultPreferences(userId, tenantId);
    }

    return data;
  }

  private static getDefaultChannels(
    preferences: NotificationPreferences,
    category: NotificationCategory,
    priority: string
  ): NotificationChannel[] {
    const categorySettings = preferences.categorySettings[category];
    if (!categorySettings || !categorySettings.enabled) {
      return preferences.channels.inApp ? ["in_app"] : [];
    }

    if (categorySettings.minPriority) {
      const minIndex = PRIORITY_LEVELS.indexOf(categorySettings.minPriority);
      const currentIndex = PRIORITY_LEVELS.indexOf(priority as (typeof PRIORITY_LEVELS)[number]);
      if (currentIndex < minIndex) {
        return preferences.channels.inApp ? ["in_app"] : [];
      }
    }

    const channels = new Set<NotificationChannel>(categorySettings.channels || []);
    if (preferences.channels.inApp) channels.add("in_app");
    if (!preferences.channels.email) channels.delete("email");
    if (!preferences.channels.sms) channels.delete("sms");

    return Array.from(channels);
  }

  private static isQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours?.enabled) {
      return false;
    }

    const { start, end, timezone } = preferences.quietHours;
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);

    if ([startHour, startMinute, endHour, endMinute].some((val) => Number.isNaN(val))) {
      return false;
    }

    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(now);

    const currentHour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const currentMinute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    const currentMinutes = currentHour * 60 + currentMinute;

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (startMinutes === endMinutes) return false;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  private static getNextQuietHoursEnd(preferences: NotificationPreferences): Timestamp | null {
    if (!preferences.quietHours?.enabled) return null;

    const { start, end, timezone } = preferences.quietHours;
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);

    if ([startHour, startMinute, endHour, endMinute].some((val) => Number.isNaN(val))) {
      return null;
    }

    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(now);

    const currentHour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const currentMinute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    const currentMinutes = currentHour * 60 + currentMinute;

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const isQuiet = startMinutes < endMinutes
      ? currentMinutes >= startMinutes && currentMinutes < endMinutes
      : currentMinutes >= startMinutes || currentMinutes < endMinutes;

    if (!isQuiet) return null;

    const minutesUntilEnd = (endMinutes - currentMinutes + 24 * 60) % (24 * 60);
    const nextAttempt = new Date(now.getTime() + minutesUntilEnd * 60 * 1000);
    return Timestamp.fromDate(nextAttempt);
  }

  private static interpolate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      return String(variables[key] ?? match);
    });
  }

  private static buildEmailHtml(notification: Omit<Notification, "id">): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .action { margin: 20px 0; text-align: center; }
            .button {
              background: #2563eb;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${notification.title}</h2>
            </div>
            <div class="content">
              <p>${notification.message}</p>
              ${
                notification.actionUrl
                  ? `
                <div class="action">
                  <a href="${notification.actionUrl}" class="button">
                    ${notification.actionLabel || "View Details"}
                  </a>
                </div>
              `
                  : ""
              }
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private static async queueForLater(
    notificationId: string,
    notification: Omit<Notification, "id">,
    channels: NotificationChannel[],
    preferences: NotificationPreferences
  ) {
    const deliveryStatus = { ...notification.deliveryStatus };
    deliveryStatus.inApp = "delivered";

    if (channels.includes("email")) {
      deliveryStatus.email = "pending";
    }

    if (channels.includes("sms")) {
      deliveryStatus.sms = "pending";
    }

    if (channels.includes("webhook")) {
      deliveryStatus.webhook = "pending";
    }

    const nextAttemptAt = this.getNextQuietHoursEnd(preferences);

    await adminDb.collection("notifications").doc(notificationId).update({
      deliveryStatus,
      metadata: {
        ...notification.metadata,
        queuedForDelivery: true,
        nextAttemptAt: nextAttemptAt || null,
      },
    });
  }
}

function cryptoSign(payload: Record<string, unknown>, secret: string) {
  const serialized = JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(serialized).digest("hex");
}

function toIsoTimestamp(value: unknown) {
  if (!value) return null;
  if (typeof (value as Record<string, unknown>).toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
