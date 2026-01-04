import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireHrAccess, toIso } from "../../../_utils";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(req.url);
    const userId = String(searchParams.get("userId") || "").trim();

    const query = userId
      ? adminDb.collection("onboardingTasks").where("userId", "==", userId).limit(500)
      : adminDb.collection("onboardingTasks").limit(500);

    const snap = await query.get();
    const tasks = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: toIso(data?.createdAt),
        updatedAt: toIso(data?.updatedAt),
      };
    });

    return NextResponse.json({ ok: true, tasks });
  } catch (err) {
    console.error("HR onboarding tasks list error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
