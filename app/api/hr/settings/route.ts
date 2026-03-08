import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireHrAccess, serverTimestamp } from "../_utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const snap = await adminDb.collection("hrSettings").doc("defaults").get();
    const data = snap.exists ? snap.data() : {};

    if (!snap.exists) {
      await adminDb.collection("hrSettings").doc("defaults").set(
        {
          defaultOnboardingTemplateId: null,
          retentionNote: "Documents are retained for 7 years by default.",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ok: true,
      settings: {
        defaultOnboardingTemplateId: data?.defaultOnboardingTemplateId || null,
        retentionNote: data?.retentionNote || "Documents are retained for 7 years by default.",
      },
    });
  } catch (err) {
    console.error("HR settings get error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const defaultOnboardingTemplateId = body?.defaultOnboardingTemplateId || null;
    const retentionNote = body?.retentionNote || "Documents are retained for 7 years by default.";

    await adminDb.collection("hrSettings").doc("defaults").set(
      {
        defaultOnboardingTemplateId,
        retentionNote,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("HR settings update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
