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
    const reviewId = String(body?.id || "").trim();
    if (!reviewId) {
      return NextResponse.json({ ok: false, error: "Missing review id" }, { status: 400 });
    }

    const snap = await adminDb.collection("performanceReviews").doc(reviewId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "Review not found" }, { status: 404 });
    }

    const existing = snap.data() || {};
    const period = String(body?.period || existing?.period || "").trim();
    const rating = body?.rating === null || body?.rating === undefined || body?.rating === "" ? null : Number(body.rating);
    const tags = Array.isArray(body?.tags) ? body.tags.map((tag: any) => String(tag || "").trim()).filter(Boolean) : existing?.tags || [];
    const notes = String(body?.notes || existing?.notes || "").trim();

    if (!period) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    await adminDb.collection("performanceReviews").doc(reviewId).update({
      period,
      rating: Number.isFinite(rating as number) ? rating : null,
      tags,
      notes,
      updatedAt: serverTimestamp(),
    });

    await createHrEvent({
      type: "hr.performance_review_updated",
      title: "Performance review updated",
      description: `Performance review updated for period ${period}.`,
      entityType: "performanceReview",
      entityId: reviewId,
      createdByUid: access.user.uid,
      createdByName: access.user.name || access.user.email || "Admin",
      metadata: { userId: existing?.userId || null, period },
    });

    const [employeeSnap, hrIds] = await Promise.all([
      existing?.userId ? adminDb.collection("users").doc(existing.userId).get() : Promise.resolve(null),
      getUserIdsByRoles(["hr"]),
    ]);

    const employeeData = employeeSnap?.data() || {};
    const employeeRoute = getRouteForRole(employeeData?.role || "");

    await Promise.all([
      ...(existing?.userId
        ? [
            createHrNotification({
              userId: existing.userId,
              title: "Performance review updated",
              message: `Your performance review for ${period} has been updated.`,
              type: "hr.performance_review_updated",
              entityId: reviewId,
              deepLink: employeeRoute,
              createdBy: {
                uid: access.user.uid,
                name: access.user.name || access.user.email || "Admin",
              },
            }),
          ]
        : []),
      ...hrIds.map((uid) =>
        createHrNotification({
          userId: uid,
          title: "Performance review updated",
          message: `Performance review updated for ${employeeData?.name || "employee"}.`,
          type: "hr.performance_review_updated",
          entityId: reviewId,
          deepLink: "/hr/performance",
          createdBy: {
            uid: access.user.uid,
            name: access.user.name || access.user.email || "Admin",
          },
        })
      ),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("HR performance update error", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
