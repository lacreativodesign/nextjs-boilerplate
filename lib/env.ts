// DO NOT hardcode domains — use lib/env.ts

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function requireEnv(key: string): string {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}.`);
  }
  return value;
}

function requireUrl(key: string): string {
  const value = requireEnv(key);
  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch (error) {
    throw new Error(`Invalid URL for ${key}: ${value}.`);
  }
  return value.replace(/\/+$/, "");
}

export const APP_BASE_URL = requireUrl("NEXT_PUBLIC_APP_BASE_URL");
export const DASHBOARD_BASE_URL = requireUrl("NEXT_PUBLIC_DASHBOARD_URL");
export const AUTH_REDIRECT_URL = requireUrl("NEXT_PUBLIC_AUTH_REDIRECT_URL");
export const COOKIE_DOMAIN = requireEnv("NEXT_PUBLIC_COOKIE_DOMAIN");
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const DEFAULT_TENANT_ID = readEnv("DEFAULT_TENANT_ID") || "la-creativo";

export const RESEND_API_KEY = readEnv("RESEND_API_KEY");
export const EMAIL_FROM = readEnv("EMAIL_FROM");

export const FIREBASE_ADMIN_KEY = readEnv("FIREBASE_ADMIN_KEY");
export const FIREBASE_PROJECT_ID = readEnv("FIREBASE_PROJECT_ID");
export const FIREBASE_CLIENT_EMAIL = readEnv("FIREBASE_CLIENT_EMAIL");
export const FIREBASE_PRIVATE_KEY = readEnv("FIREBASE_PRIVATE_KEY");

export const STRIPE_SECRET_KEY = readEnv("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET = readEnv("STRIPE_WEBHOOK_SECRET");
export const STRIPE_CONNECT_SECRET_KEY = readEnv("STRIPE_CONNECT_SECRET_KEY");
export const STRIPE_CONNECT_WEBHOOK_SECRET = readEnv("STRIPE_CONNECT_WEBHOOK_SECRET");
export const STRIPE_CONNECT_CLIENT_ID = readEnv("STRIPE_CONNECT_CLIENT_ID");
export const STRIPE_CONNECT_REDIRECT_URI = readEnv("STRIPE_CONNECT_REDIRECT_URI");

export const NEXT_PUBLIC_ERP_INGEST_KEY = readEnv("NEXT_PUBLIC_ERP_INGEST_KEY");

export const NEXT_PUBLIC_FB_API_KEY = readEnv("NEXT_PUBLIC_FB_API_KEY");
export const NEXT_PUBLIC_FB_AUTH_DOMAIN = readEnv("NEXT_PUBLIC_FB_AUTH_DOMAIN");
export const NEXT_PUBLIC_FB_PROJECT_ID = readEnv("NEXT_PUBLIC_FB_PROJECT_ID");
export const NEXT_PUBLIC_FB_STORAGE = readEnv("NEXT_PUBLIC_FB_STORAGE");
export const NEXT_PUBLIC_FB_SENDER_ID = readEnv("NEXT_PUBLIC_FB_SENDER_ID");
export const NEXT_PUBLIC_FB_APP_ID = readEnv("NEXT_PUBLIC_FB_APP_ID");

export const NEXT_PUBLIC_FIREBASE_API_KEY = readEnv("NEXT_PUBLIC_FIREBASE_API_KEY");
export const NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = readEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
export const NEXT_PUBLIC_FIREBASE_PROJECT_ID = readEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
export const NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = readEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
export const NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = readEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID");
export const NEXT_PUBLIC_FIREBASE_APP_ID = readEnv("NEXT_PUBLIC_FIREBASE_APP_ID");

export function assertRequiredEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}.`);
  }
  return value;
}
