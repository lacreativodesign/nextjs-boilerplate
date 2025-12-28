import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  DEFAULT_SECURITY_SETTINGS,
  canEditSection,
  parseBoolean,
  parseNumber,
  parseString,
  requireAdmin,
  serverTimestamp,
  toISO,
  logSettingsChange,
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("settings").doc("security").get();
    const data = snap.exists ? snap.data() : {};

    const settings = {
      sessionTimeoutMinutes: parseNumber(data?.sessionTimeoutMinutes, DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes),
      passwordPolicy: parseString(data?.passwordPolicy, DEFAULT_SECURITY_SETTINGS.passwordPolicy),
      activityRetentionDays: parseNumber(data?.activityRetentionDays, DEFAULT_SECURITY_SETTINGS.activityRetentionDays),
      forceLogoutAll: parseBoolean(data?.forceLogoutAll, DEFAULT_SECURITY_SETTINGS.forceLogoutAll),
      updatedAt: toISO(data?.updatedAt),
      updatedBy: data?.updatedBy || null,
    };

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: canEditSection(auth.user.role, "security"),
      role: auth.user.role,
    });
  } catch (err) {
    console.error("settings/security get error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!canEditSection(auth.user.role, "security")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const payload = {
      sessionTimeoutMinutes: parseNumber(body?.sessionTimeoutMinutes, DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes),
      activityRetentionDays: parseNumber(body?.activityRetentionDays, DEFAULT_SECURITY_SETTINGS.activityRetentionDays),
      forceLogoutAll: parseBoolean(body?.forceLogoutAll, DEFAULT_SECURITY_SETTINGS.forceLogoutAll),
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await adminDb.collection("settings").doc("security").set(payload, { merge: true });

    await logSettingsChange({
      user: auth.user,
      section: "security",
      summary: "Security settings updated.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/security update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
