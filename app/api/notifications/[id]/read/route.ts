import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { NotificationService } from "@/lib/notifications/notification-service";
import { getCurrentUser } from "../../../admin/_utils";
import { requireNotificationsModule } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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

    const docRef = adminDb.collection("notifications").doc(params.id);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = snapshot.data() || {};
    if (data.tenantId !== tenantId || data.userId !== me.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await NotificationService.markAsRead(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}
