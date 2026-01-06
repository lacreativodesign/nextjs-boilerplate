import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  notifyUsers,
  parseString,
  requireSalesManager,
  serverTimestamp,
} from "../../_utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await requireSalesManager();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const id = parseString(payload.id, "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing lead id." }, { status: 400 });
    }

    const leadRef = adminDb.collection("leads").doc(id);
    let assignedUserId: string | null = null;
    let assignedUserName: string | null = null;
    let assignmentChanged = false;

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(leadRef);
      if (!snap.exists) {
        throw new Error("Lead not found");
      }
      const data = snap.data() || {};
      if (data.tenantId && data.tenantId !== auth.user.tenantId) {
        throw new Error("Forbidden");
      }
      const prevOwnerId = data.ownerId || null;

      const updates: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      if (payload.name !== undefined) updates.companyName = parseString(payload.name, "");
      if (payload.email !== undefined) updates.contactEmail = parseString(payload.email, "");
      if (payload.phone !== undefined) updates.contactPhone = parseString(payload.phone, "");
      if (payload.source !== undefined) updates.source = parseString(payload.source, "");
      if (payload.stage !== undefined) updates.stage = parseString(payload.stage, "New Lead");

      if (payload.ownerId !== undefined) {
        const nextOwnerId = parseString(payload.ownerId, "") || null;
        const nextOwnerName = parseString(payload.ownerName, "") || null;
        updates.ownerId = nextOwnerId;
        updates.ownerName = nextOwnerName;

        if (nextOwnerId && nextOwnerId !== prevOwnerId) {
          assignmentChanged = true;
          assignedUserId = nextOwnerId;
          assignedUserName = nextOwnerName;
        }
      }

      tx.set(leadRef, updates, { merge: true });
    });

    if (assignmentChanged && assignedUserId) {
      await notifyUsers({
        userIds: [assignedUserId, auth.user.uid],
        title: "Lead assigned",
        body: `Lead ${id} assigned to ${assignedUserName || "sales rep"}.`,
        entityType: "lead",
        entityId: id,
        deepLink: "/sales-manager/leads",
        createdBy: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || "" },
      });

      await createSalesEvent({
        type: "lead_assigned",
        title: "Lead assigned",
        description: `Lead ${id} assigned to ${assignedUserName || "sales rep"}`,
        entityType: "lead",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: auth.user.name || auth.user.fullName || "",
      });
    } else {
      await createSalesEvent({
        type: "lead_updated",
        title: "Lead updated",
        description: `Lead ${id} updated`,
        entityType: "lead",
        entityId: id,
        createdByUid: auth.user.uid,
        createdByName: auth.user.name || auth.user.fullName || "",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("sales manager leads update error:", err);
    return NextResponse.json({ ok: false, error: "Unable to update lead." }, { status: 500 });
  }
}
