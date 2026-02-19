import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireClient } from "../../_utils";
import { createNotification, createNotificationEvent, getUserIdsByRoles } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireClient();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId || "").trim();
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Project is required." }, { status: 400 });
    }

    const projectRef = adminDb.collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists || projectSnap.data()?.isDeleted) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    const project = projectSnap.data() || {};
    if (String(project.clientId || "") !== auth.clientId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await projectRef.set(
      {
        clientApprovalStatus: "approved",
        clientApprovedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const actorName = auth.user.name || auth.user.fullName || auth.user.displayName || "";
    const recipients = new Set<string>();
    if (project.ownerAmUid) recipients.add(String(project.ownerAmUid));
    const adminIds = await getUserIdsByRoles(["admin", "super_admin"]);
    adminIds.forEach((id) => recipients.add(id));

    await Promise.all(
      Array.from(recipients)
        .filter(Boolean)
        .map((uid) =>
          createNotification({
            toUserId: uid,
            title: "Client approved stage",
            body: `${project.projectName || "Project"} was approved by the client.`,
            type: "success",
            entityType: "project",
            entityId: projectId,
            deepLink: uid === project.ownerAmUid ? "/am/projects" : "/admin/projects",
            createdBy: { uid: auth.user.uid, name: actorName },
          })
        )
    );

    await createNotificationEvent({
      type: "project.client_approved",
      title: "Client approval received",
      description: `${project.projectName || "Project"} was approved by the client.`,
      entityType: "project",
      entityId: projectId,
      createdByUid: auth.user.uid,
      createdByName: actorName,
      metadata: {
        clientId: auth.clientId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("client/projects approve error:", err);
    const rawMessage = String(err?.message || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to approve project.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
