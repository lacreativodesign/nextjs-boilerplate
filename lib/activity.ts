import { adminDb } from "@/lib/firebaseAdmin";

export async function logActivity({
  tenantId,
  actorUid,
  actorRole,
  action,
  targetUid = null,
  details = {},
}: {
  tenantId: string;
  actorUid: string;
  actorRole: string;
  action: string;
  targetUid?: string | null;
  details?: any;
}) {
  try {
    await adminDb.collection("activity_logs").add({
      tenantId,
      actorUid,
      actorRole,
      action,
      targetUid,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Activity log failed:", e);
  }
}
