import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createHrEvent,
  createHrNotification,
  getRouteForRole,
  requireHrAccess,
  serverTimestamp,
} from "../../_utils";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const templateId = String(body?.templateId || "").trim();
    const dueDate = body?.dueDate || null;

    if (!userId || !templateId) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const [templateSnap, userSnap] = await Promise.all([
      adminDb.collection("onboardingTemplates").doc(templateId).get(),
      adminDb.collection("users").doc(userId).get(),
    ]);

    if (!templateSnap.exists) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }

    const template = templateSnap.data() || {};
    const steps = Array.isArray(template?.steps) ? template.steps : [];

    const payload = {
      userId,
      templateId,
      status: "Not Started",
      steps: steps.map((step: any) => ({
        title: String(step?.title || "").trim(),
        description: String(step?.description || "").trim(),
        required: Boolean(step?.required),
        isDone: false,
        doneAt: null,
      })),
      dueDate: dueDate || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const ref = await adminDb.collection("onboardingTasks").add(payload);

    const userData = userSnap.data() || {};
    const employeeName = userData?.name || "Employee";

    await createHrEvent({
      type: "hr.onboarding_assigned",
      title: "Onboarding assigned",
      description: `${employeeName} assigned onboarding template ${template?.name || ""}.`,
      entityType: "onboardingTask",
      entityId: ref.id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || "Admin",
      metadata: { userId, templateId },
    });

    const assigneeRole = String(userData?.role || "").toLowerCase();
    const deepLink =
      assigneeRole === "hr"
        ? "/hr/onboarding"
        : assigneeRole === "admin" || assigneeRole === "super_admin"
        ? "/admin/hr/onboarding"
        : getRouteForRole(assigneeRole);

    await createHrNotification({
      userId,
      title: "New onboarding plan",
      message: "A new onboarding checklist has been assigned to you.",
      type: "hr.onboarding_assigned",
      entityId: ref.id,
      deepLink,
      createdBy: {
        uid: access.user.uid,
        name: access.user.name || access.user.email || "Admin",
      },
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("HR onboarding assign error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
