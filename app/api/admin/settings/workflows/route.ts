import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  DEFAULT_WORKFLOW_SETTINGS,
  WORKFLOW_STAGES,
  canEditSection,
  parseNumber,
  requireAdmin,
  serverTimestamp,
  toISO,
  logSettingsChange,
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSlaDays(input: any) {
  const base = { ...DEFAULT_WORKFLOW_SETTINGS.slaDaysPerStage };
  if (typeof input !== "object" || !input) return base;
  Object.entries(input).forEach(([key, value]) => {
    if (WORKFLOW_STAGES.includes(key as (typeof WORKFLOW_STAGES)[number])) {
      (base as Record<string, number>)[key] = parseNumber(value, base[key as keyof typeof base]);
    }
  });
  return base;
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb.collection("settings").doc(`${auth.user.tenantId}_workflows`).get();
    const data = snap.exists ? snap.data() : {};

    const settings = {
      projectStages: [...WORKFLOW_STAGES],
      slaDaysPerStage: normalizeSlaDays(data?.slaDaysPerStage),
      atRiskAfterDays: parseNumber(data?.atRiskAfterDays, DEFAULT_WORKFLOW_SETTINGS.atRiskAfterDays),
      overdueAfterDays: parseNumber(data?.overdueAfterDays, DEFAULT_WORKFLOW_SETTINGS.overdueAfterDays),
      updatedAt: toISO(data?.updatedAt),
      updatedBy: data?.updatedBy || null,
    };

    return NextResponse.json({
      ok: true,
      settings,
      canEdit: canEditSection(auth.user.role, "workflows"),
      role: auth.user.role,
    });
  } catch (err) {
    console.error("settings/workflows get error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!canEditSection(auth.user.role, "workflows")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const payload = {
      projectStages: [...WORKFLOW_STAGES],
      slaDaysPerStage: normalizeSlaDays(body?.slaDaysPerStage),
      atRiskAfterDays: parseNumber(body?.atRiskAfterDays, DEFAULT_WORKFLOW_SETTINGS.atRiskAfterDays),
      overdueAfterDays: parseNumber(body?.overdueAfterDays, DEFAULT_WORKFLOW_SETTINGS.overdueAfterDays),
      updatedAt: serverTimestamp(),
      updatedBy: auth.user.uid,
    };

    await adminDb.collection("settings").doc(`${auth.user.tenantId}_workflows`).set(payload, { merge: true });

    await logSettingsChange({
      user: auth.user,
      section: "workflows",
      summary: "Workflow settings updated.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/workflows update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
