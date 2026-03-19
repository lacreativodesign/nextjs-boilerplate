import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireSuperAdmin } from "../_utils";

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value?._seconds === "number") return new Date(value._seconds * 1000).toISOString();
  return null;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const [notificationsSnap, emailsSnap] = await Promise.all([
      adminDb.collection("notifications").orderBy("createdAt", "desc").limit(200).get(),
      adminDb.collection("emails").orderBy("createdAt", "desc").limit(200).get(),
    ]);

    const unreadNotifications = notificationsSnap.docs.filter((doc) => !doc.data()?.isRead).length;
    const emailStatusCounts = emailsSnap.docs.reduce(
      (acc, doc) => {
        const status = String(doc.data()?.status || "queued");
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const lastNotificationAt = toIso(notificationsSnap.docs[0]?.data()?.createdAt);
    const lastEmailAt = toIso(emailsSnap.docs[0]?.data()?.createdAt);

    return NextResponse.json({
      ok: true,
      notifications: {
        total: notificationsSnap.size,
        unread: unreadNotifications,
        lastCreatedAt: lastNotificationAt,
      },
      emails: {
        total: emailsSnap.size,
        statusCounts: emailStatusCounts,
        lastCreatedAt: lastEmailAt,
      },
    });
  } catch (err: any) {
    const message = err?.message || "Server error";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
