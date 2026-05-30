import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { normalizeTenantId } from "@/lib/tenant";
import { NotificationService } from "@/lib/notifications/notification-service";
import { getCurrentUser } from "../../admin/_utils";
import { requireNotificationsModule } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function POST() {
  try {
    const me = await getCurrentUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = normalizeTenantId(me.tenantId as string | null | undefined);
    const moduleAccess = await requireNotificationsModule(tenantId, me.role);
    if (!moduleAccess.ok) {
      return NextResponse.json({ ok: false, error: moduleAccess.error }, { status: moduleAccess.status });
    }

    const updatedNew = await NotificationService.markAllAsRead(me.uid, tenantId);
    const baseQueries = [
      adminDb.collection("notifications").where("recipientUid", "==", me.uid).where("isRead", "==", false),
      adminDb.collection("notifications").where("toUserId", "==", me.uid).where("isRead", "==", false),
      adminDb.collection("notifications").where("toUid", "==", me.uid).where("isRead", "==", false),
      adminDb.collection("notifications").where("userId", "==", me.uid).where("read", "==", false),
    ];

    const snapshots = await Promise.all(baseQueries.map((query) => query.where("tenantId", "==", tenantId).get()));
    const docs = snapshots.flatMap((snap) => snap.docs);

    const uniqueDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    docs.forEach((doc) => uniqueDocs.set(doc.id, doc));

    const now = admin.firestore.FieldValue.serverTimestamp();
    const batches = chunk(Array.from(uniqueDocs.values()), 450);

    for (const batchDocs of batches) {
      const batch = adminDb.batch();
      batchDocs.forEach((doc) => {
        batch.set(
          doc.ref,
          {
            isRead: true,
            read: true,
            updatedAt: now,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    return NextResponse.json({ ok: true, updated: uniqueDocs.size + updatedNew });
  } catch (err) {
    console.error("notifications mark-all-read error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to update notifications.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
