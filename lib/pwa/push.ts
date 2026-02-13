"use client";

import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { getFirebaseApp } from "@/lib/firebaseClient";

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  return Notification.requestPermission();
}

export async function registerFcmToken(serviceWorkerRegistration: ServiceWorkerRegistration): Promise<string | null> {
  const supported = await isSupported().catch(() => false);
  if (!supported || !vapidKey) {
    return null;
  }

  const app = getFirebaseApp();
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  });

  if (!token) {
    return null;
  }

  await fetch("/api/notifications/push-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => null);

  return token;
}

export async function attachForegroundNotifications(onReceive: (title: string, body: string, href?: string) => void): Promise<() => void> {
  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return () => undefined;
  }

  const app = getFirebaseApp();
  const messaging = getMessaging(app);

  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || "Bizosto";
    const body = payload.notification?.body || "You have a new notification.";
    const href = payload.fcmOptions?.link;
    onReceive(title, body, href);
  });
}
