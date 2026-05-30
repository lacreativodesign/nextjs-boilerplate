import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireClient } from "../../_utils";
import { createNotification, createNotificationEvent, getUserIdsByRoles, getUsersByRoles } from "@/lib/notifications";
import { sendEmail } from "@/lib/email/email-service";

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

    // Email AM and admins — non-blocking
    getUsersByRoles(["am", "am_manager", "admin"], String(project.tenantId || "")).then((members) => {
      return Promise.all(members.map((member) =>
        sendEmail({
          to: member.email as unknown || "",
          subject: `✅ Project approved by client — ${project.projectName || projectId}`,
          html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Project Update</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#059669;">✅ Project Approved by Client</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">The client has approved the project. You can proceed to the next stage.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Project</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${project.projectName || projectId}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Approved by</td><td style="font-weight:600;color:#059669;text-align:right;">${actorName || "Client"}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="https://app.bizosto.com/am/projects" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Project →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto ERP · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`,
        }).catch(() => {})
      ));
    }).catch((err) => console.error("[PROJECT_APPROVE] Failed to email team", err));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("client/projects approve error:", err);
    const rawMessage = String((err instanceof Error ? err.message : undefined) || "");
    const isIndexError =
      rawMessage.includes("FAILED_PRECONDITION") ||
      rawMessage.toLowerCase().includes("index") ||
      rawMessage.toLowerCase().includes("indexes");
    const safeMessage = isIndexError ? "Missing Firestore index." : "Unable to approve project.";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}
