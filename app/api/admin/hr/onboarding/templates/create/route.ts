import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createHrEvent, requireHrAccess, serverTimestamp } from "../../../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const role = String(body?.role || "all").trim();
    const steps = Array.isArray(body?.steps) ? body.steps : [];
    const isActive = body?.isActive !== false;

    if (!name || steps.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const payload = {
      tenantId: access.user.tenantId,
      name,
      role,
      steps: steps.map((step: any) => ({
        title: String(step?.title || "").trim(),
        description: String(step?.description || "").trim(),
        required: Boolean(step?.required),
      })),
      isActive,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: access.user.uid,
    };

    const ref = await adminDb.collection("onboardingTemplates").add(payload);

    await createHrEvent({
      type: "hr.onboarding_template_created",
      title: "Onboarding template created",
      description: `${name} template created.`,
      entityType: "onboardingTemplate",
      entityId: ref.id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || "Admin",
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("HR templates create error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
