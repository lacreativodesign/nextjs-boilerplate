import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";
import { getAmUser, isOwnedByAm } from "../../_utils";

export const runtime = "nodejs";

type ProjectDoc = {
  projectName?: string;
  clientName?: string;
  ownerAmUid?: string | null;
  productionUid?: string | null;
  ownerId?: string | null;
  amId?: string | null;
  isDeleted?: boolean;
};

function cleanString(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const me = await getAmUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = cleanString(body?.projectId);
    const messageBody = cleanString(body?.body);

    if (!projectId || !messageBody) {
      return NextResponse.json({ ok: false, error: "Message body is required." }, { status: 400 });
    }

    const projectSnap = await adminDb.collection("projects").doc(projectId).get();
    if (!projectSnap.exists || projectSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const project = projectSnap.data() as ProjectDoc;
    if (String((project as unknown).tenantId || "") !== me.tenantId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (!isOwnedByAm(project, me.uid)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const messageRef = adminDb.collection("projects").doc(projectId).collection("messages").doc();
    const senderName = cleanString(me.name || me.fullName || me.displayName || "");
    await messageRef.set({
      id: messageRef.id,
      projectId,
      senderId: me.uid,
      senderRole: "am",
      senderName,
      body: messageBody,
      createdAt: now,
    });

    const adminIds = await getUserIdsByRoles(["admin", "super_admin"]);
    const recipients = new Set<string>();
    if (project.productionUid) recipients.add(String(project.productionUid));
    adminIds.forEach((id) => recipients.add(id));

    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: "New project message",
            body: `${project.projectName || "Project"} has a new message from ${senderName || "AM"}.`,
            type: "info",
            entityType: "project",
            entityId: projectId,
            deepLink: "/admin/projects",
            createdBy: { uid: me.uid, name: senderName },
          })
        )
    );

    await createNotificationEvent({
      type: "project.message.sent",
      title: "New message",
      description: `${project.projectName || "Project"} received a new message.`,
      entityType: "project",
      entityId: projectId,
      createdByUid: me.uid,
      createdByName: senderName,
      metadata: {
        body: messageBody,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("am/messages send error:", err);
    return NextResponse.json({ ok: false, error: "Unable to send message right now." }, { status: 500 });
  }
}
