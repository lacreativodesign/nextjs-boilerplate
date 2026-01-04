import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { createHrEvent, createHrNotification, getRouteForRole, requireHrAccess, serverTimestamp } from "../../_utils";
import { getUserIdsByRoles } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requireHrAccess();
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    const period = String(body?.period || "").trim();
    const rating = body?.rating === null || body?.rating === undefined || body?.rating === "" ? null : Number(body.rating);
    const tags = Array.isArray(body?.tags) ? body.tags.map((tag: any) => String(tag || "").trim()).filter(Boolean) : [];
    const notes = String(body?.notes || "").trim();

    if (!userId || !period) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const payload = {
      userId,
      period,
      rating: Number.isFinite(rating as number) ? rating : null,
      tags,
      notes,
      createdBy: access.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false,
    };

    const ref = await adminDb.collection("performanceReviews").add(payload);

    await createHrEvent({
      type: "hr.performance_review_added",
      title: "Performance review added",
      description: `Performance review recorded for period ${period}.`,
      entityType: "performanceReview",
      entityId: ref.id,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || "Admin",
      metadata: { userId, period },
    });

    const [employeeSnap, hrIds] = await Promise.all([
      adminDb.collection("users").doc(userId).get(),
      getUserIdsByRoles(["hr"]),
    ]);

    const employeeData = employeeSnap.data() || {};
    const employeeRoute = getRouteForRole(employeeData?.role || "");

    await Promise.all([
      createHrNotification({
        userId,
        title: "Performance review updated",
        message: `A performance review for ${period} has been added.`,
        type: "hr.performance_review_added",
        entityId: ref.id,
        deepLink: employeeRoute,
        createdBy: {
          uid: access.user.uid,
          name: access.user.name || access.user.email || "Admin",
        },
      }),
      ...hrIds.map((uid) =>
        createHrNotification({
          userId: uid,
          title: "Performance review logged",
          message: `Performance review added for ${employeeData?.name || "employee"}.`,
          type: "hr.performance_review_added",
          entityId: ref.id,
          deepLink: "/hr/performance",
          createdBy: {
            uid: access.user.uid,
            name: access.user.name || access.user.email || "Admin",
          },
        })
      ),
    ]);

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("HR performance create error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
