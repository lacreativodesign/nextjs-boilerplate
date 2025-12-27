import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_REPORT_SETTINGS, getReportSettings, parseNumber, requireAdmin, serverTimestamp } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAdmin();
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
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const arAgingBucketsDays = Array.isArray(body?.arAgingBucketsDays)
      ? body.arAgingBucketsDays.map((value: any) => parseNumber(value, 0)).filter((value: number) => value > 0)
      : DEFAULT_REPORT_SETTINGS.arAgingBucketsDays;
    const keyAccountUsdThreshold = parseNumber(body?.keyAccountUsdThreshold, DEFAULT_REPORT_SETTINGS.keyAccountUsdThreshold);
    const overdueWarningDays = parseNumber(body?.overdueWarningDays, DEFAULT_REPORT_SETTINGS.overdueWarningDays);
    const stageSlaDays =
      typeof body?.stageSlaDays === "object" && body?.stageSlaDays
        ? Object.fromEntries(
            Object.entries(body.stageSlaDays).map(([key, value]) => [key, parseNumber(value, 0)])
          )
        : DEFAULT_REPORT_SETTINGS.stageSlaDays;

    await adminDb.collection("reportSettings").doc("global").set(
      {
        arAgingBucketsDays,
        keyAccountUsdThreshold,
        overdueWarningDays,
        stageSlaDays,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reports/settings update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
