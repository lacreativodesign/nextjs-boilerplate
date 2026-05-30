import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { NotificationService } from "@/lib/notifications/notification-service";
import { getCurrentUser } from "../admin/_utils";
import { requireNotificationsModule } from "./_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIso(value: unknown) {
  if (!value) return null;
  if (typeof (value as Record<string, unknown>).toDate === "function") return (value as Record<string, unknown>).toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = normalizeTenantId(me.tenantId as string | null | undefined);
    const moduleAccess = await requireNotificationsModule(tenantId, me.role);
    if (!moduleAccess.ok) {
      return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const limitRaw = parseInt(searchParams.get("limit") || "20");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const category = searchParams.get("category");

    await NotificationService.processPendingDeliveriesForUser(me.uid, tenantId);

    let query: FirebaseFirestore.Query = adminDb
      .collection("notifications")
      .where("tenantId", "==", tenantId)
      .where("userId", "==", me.uid)
      .where("isArchived", "==", false)
      .orderBy("createdAt", "desc");

    if (unreadOnly) {
      query = query.where("isRead", "==", false);
    }

    if (category) {
      query = query.where("category", "==", category);
    }

    const offset = (page - 1) * limit;
    query = query.limit(limit).offset(offset);

    const snapshot = await query.get();
    const notifications = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: toIso(data.createdAt),
        readAt: toIso(data.readAt),
        archivedAt: toIso(data.archivedAt),
      };
    });

    const unreadCount = await NotificationService.getUnreadCount(me.uid, tenantId);

    return NextResponse.json({
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total: snapshot.size,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
