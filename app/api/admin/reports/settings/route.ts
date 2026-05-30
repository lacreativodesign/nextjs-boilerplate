import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_REPORT_SETTINGS, getReportSettings, parseNumber, requireReportsAccess } from "../_utils";
import { WORKFLOW_STAGES, logSettingsChange, serverTimestamp } from "../../settings/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const settings = await getReportSettings();

    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    console.error("reports/settings get error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireReportsAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const arAgingBucketsDays = Array.isArray(body?.arAgingBucketsDays)
      ? body.arAgingBucketsDays.map((value: unknown) => parseNumber(value, 0)).filter((value: number) => value > 0)
      : DEFAULT_REPORT_SETTINGS.arAgingBucketsDays;
    const atRiskAfterDays = parseNumber(body?.atRiskAfterDays, DEFAULT_REPORT_SETTINGS.atRiskAfterDays);
    const overdueAfterDays = parseNumber(body?.overdueAfterDays, DEFAULT_REPORT_SETTINGS.overdueAfterDays);
    const stageSlaDays =
      typeof body?.stageSlaDays === "object" && body?.stageSlaDays
        ? Object.fromEntries(
            Object.entries(body.stageSlaDays)
              .filter(([key]) => WORKFLOW_STAGES.includes(key as (typeof WORKFLOW_STAGES)[number]))
              .map(([key, value]) => [key, parseNumber(value, 0)])
          )
        : DEFAULT_REPORT_SETTINGS.stageSlaDays;

    await Promise.all([
      adminDb.collection("settings").doc(`${auth.user.tenantId}_reports`).set(
        {
          arBuckets: arAgingBucketsDays,
          updatedAt: serverTimestamp(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      ),
      adminDb.collection("settings").doc(`${auth.user.tenantId}_reports`).set(
        {
          slaDaysPerStage: stageSlaDays,
          atRiskAfterDays,
          overdueAfterDays,
          updatedAt: serverTimestamp(),
          updatedBy: auth.user.uid,
        },
        { merge: true }
      ),
    ]);

    await logSettingsChange({
      user: auth.user,
      section: "reports",
      summary: "Report settings updated via shared workflow/finance controls.",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reports/settings update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
