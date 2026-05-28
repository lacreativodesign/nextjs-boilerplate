import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
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

type WebhookInput = {
  name?: string;
  url?: string;
  enabled?: boolean;
};

function normalizeWebhooks(value: any) {
  if (!Array.isArray(value)) return [] as Array<{ name: string; url: string; enabled: boolean }>;
  return value
    .map((entry: WebhookInput) => ({
      name: parseString(entry?.name, ""),
      url: parseString(entry?.url, ""),
      enabled: parseBoolean(entry?.enabled, false),
    }))
    .filter((entry) => entry.name || entry.url);
}

function getStatusLabel(isConfigured: boolean) {
  return isConfigured ? "Connected" : "Not configured";
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("settings").doc(`${auth.user.tenantId}_integrations`).get();
    const data = snap.exists ? snap.data() : {};

    const settings = {
      firebaseStatus: getStatusLabel(Boolean(adminDb.app?.options?.projectId)),
      storageStatus: getStatusLabel(Boolean(adminDb.app?.options?.storageBucket)),
      webhooks: normalizeWebhooks(data?.webhooks),
      updatedAt: toISO(data?.updatedAt),
      updatedBy: data?.updatedBy || null,
    };

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: canEditSection(auth.user.role, "integrations"),
      role: auth.user.role,
    });
  } catch (err) {
    console.error("settings/integrations get error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!canEditSection(auth.user.role, "integrations")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const webhooks = normalizeWebhooks(body?.webhooks);

    await adminDb
      .collection("settings")
      .doc(`${auth.user.tenantId}_integrations`)
      .set(
        {
          webhooks,
          updatedAt: serverTimestamp(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      );

    await logSettingsChange({
      user: auth.user,
      section: "integrations",
      summary: "Integration settings updated.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/integrations update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
