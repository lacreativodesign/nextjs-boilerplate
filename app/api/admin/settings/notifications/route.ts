import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  DEFAULT_NOTIFICATIONS_SETTINGS,
  canEditSection,
  parseBoolean,
  parseString,
  requireAdmin,
  serverTimestamp,
  toISO,
  logSettingsChange,
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEventToggles(input: any) {
  if (typeof input !== "object" || !input) return {} as Record<string, boolean>;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Boolean(value)]));
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("settings").doc("notifications").get();
    const data = snap.exists ? snap.data() : {};
    const eventToggles = normalizeEventToggles(data?.eventToggles);

    const settings = {
      enableInApp: parseBoolean(data?.enableInApp, DEFAULT_NOTIFICATIONS_SETTINGS.enableInApp),
      enableEmail: parseBoolean(data?.enableEmail, DEFAULT_NOTIFICATIONS_SETTINGS.enableEmail),
      senderName: parseString(data?.senderName, DEFAULT_NOTIFICATIONS_SETTINGS.senderName),
      replyToEmail: parseString(data?.replyToEmail, DEFAULT_NOTIFICATIONS_SETTINGS.replyToEmail),
      eventToggles,
      updatedAt: toISO(data?.updatedAt),
      updatedBy: data?.updatedBy || null,
    };

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: canEditSection(auth.user.role, "notifications"),
      role: auth.user.role,
    });
  } catch (err) {
    console.error("settings/notifications get error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!canEditSection(auth.user.role, "notifications")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const eventToggles = normalizeEventToggles(body?.eventToggles);
    const payload = {
      enableInApp: parseBoolean(body?.enableInApp, DEFAULT_NOTIFICATIONS_SETTINGS.enableInApp),
      enableEmail: parseBoolean(body?.enableEmail, DEFAULT_NOTIFICATIONS_SETTINGS.enableEmail),
      senderName: parseString(body?.senderName, DEFAULT_NOTIFICATIONS_SETTINGS.senderName),
      replyToEmail: parseString(body?.replyToEmail, DEFAULT_NOTIFICATIONS_SETTINGS.replyToEmail),
      eventToggles,
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await adminDb.collection("settings").doc("notifications").set(payload, { merge: true });

    await logSettingsChange({
      user: auth.user,
      section: "notifications",
      summary: "Notification settings updated.",
      notificationsEnabled: payload.enableInApp,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/notifications update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
