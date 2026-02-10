import type { Timestamp } from "firebase-admin/firestore";

export type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "action_required"
  | "reminder";

export type NotificationCategory =
  | "system"
  | "financial"
  | "sales"
  | "operations"
  | "security"
  | "team"
  | "custom";

export type NotificationChannel = "in_app" | "email" | "sms" | "webhook";

export type NotificationDeliveryStatus = {
  inApp: "pending" | "delivered" | "failed";
  email?: "pending" | "sent" | "delivered" | "failed";
  sms?: "pending" | "sent" | "delivered" | "failed";
  webhook?: "pending" | "sent" | "delivered" | "failed";
};

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  priority: "low" | "medium" | "high" | "urgent";
  category: NotificationCategory;
  relatedResourceType?: string;
  relatedResourceId?: string;
  isRead: boolean;
  readAt?: Timestamp;
  isArchived: boolean;
  archivedAt?: Timestamp;
  channels: NotificationChannel[];
  deliveryStatus: NotificationDeliveryStatus;
  metadata?: Record<string, any>;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

export interface NotificationPreferences {
  id: string;
  tenantId: string;
  userId: string;
  channels: {
    inApp: boolean;
    email: boolean;
    sms: boolean;
  };
  categorySettings: {
    [category in NotificationCategory]: {
      enabled: boolean;
      channels: NotificationChannel[];
      minPriority?: "low" | "medium" | "high" | "urgent";
    };
  };
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  emailDigest?: {
    enabled: boolean;
    frequency: "daily" | "weekly";
    time: string;
  };
  updatedAt: Timestamp;
}

export interface NotificationTemplate {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description?: string;
  category: NotificationCategory;
  templates: {
    inApp: {
      title: string;
      message: string;
      actionLabel?: string;
    };
    email?: {
      subject: string;
      htmlBody: string;
      textBody: string;
    };
    sms?: {
      message: string;
    };
  };
  defaultPriority: "low" | "medium" | "high" | "urgent";
  defaultChannels: NotificationChannel[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type NotificationWebhook = {
  id: string;
  tenantId: string;
  url: string;
  secret?: string;
  enabled: boolean;
  eventTypes?: NotificationType[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
