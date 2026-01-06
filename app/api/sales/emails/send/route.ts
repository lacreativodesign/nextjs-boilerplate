import admin from "firebase-admin";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  createSalesEvent,
  getWatcherUserIds,
  notifyUsers,
  parseString,
  requireSalesWrite,
  serverTimestamp,
  userLabel,
} from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, "").trim();
}

function toHtml(text: string) {
  return text.replace(/\n/g, "<br/>");
}

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const leadId = parseString(body.leadId, "");
    const to = parseString(body.to, "").trim();
    const subject = parseString(body.subject, "").trim();
    const bodyText = parseString(body.bodyText, "").trim();
    const bodyHtml = parseString(body.bodyHtml, "").trim();

    if (!to || !subject || (!bodyText && !bodyHtml)) {
      return NextResponse.json({ ok: false, error: "Recipient, subject, and body are required." }, { status: 400 });
    }

    const tenantId = auth.user.tenantId || "";
    if (leadId) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (!leadSnap.exists) {
        return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
      }
      const lead = leadSnap.data() || {};
      if (lead.tenantId && lead.tenantId !== tenantId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const userSnap = await adminDb.collection("users").doc(auth.user.uid).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const signatureHtml = parseString(userData.emailSignatureHtml, "").trim();
    const signatureText = signatureHtml ? stripHtml(signatureHtml) : "";

    const combinedBodyText = bodyText
      ? `${bodyText}${signatureText ? `\n\n${signatureText}` : ""}`
      : signatureText;
    const combinedBodyHtml = bodyHtml
      ? `${bodyHtml}${signatureHtml ? `<br/><br/>${signatureHtml}` : ""}`
      : signatureHtml
      ? `${bodyText ? toHtml(bodyText) : ""}${bodyText ? "<br/><br/>" : ""}${signatureHtml}`
      : null;

    const emailRef = adminDb.collection("emails").doc();
    await emailRef.set({
      id: emailRef.id,
      tenantId,
      leadId: leadId || null,
      mailboxUserId: auth.user.uid,
      direction: "outbound",
      to: [to],
      from: String(auth.user.email || userData.email || ""),
      subject,
      bodyText: combinedBodyText,
      bodyHtml: combinedBodyHtml,
      signatureHtml: signatureHtml || null,
      status: "queued",
      provider: "manual",
      createdAt: serverTimestamp(),
    });

    if (leadId) {
      await adminDb
        .collection("leads")
        .doc(leadId)
        .set(
          {
            emailsCount: admin.firestore.FieldValue.increment(1),
            lastActivityAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
    }

    const senderName = userLabel(auth.user);
    if (leadId) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      const lead = leadSnap.exists ? leadSnap.data() || {} : {};
      const ownerId = String(lead.ownerId || "");
      await createSalesEvent({
        type: "lead_email_queued",
        title: "Email queued",
        description: `Outbound email queued by ${senderName}.`,
        entityType: "lead",
        entityId: leadId,
        createdByUid: auth.user.uid,
        createdByName: senderName,
      });

      const watchers = await getWatcherUserIds(tenantId);
      await notifyUsers({
        userIds: [ownerId, ...watchers],
        title: "Lead email queued",
        body: `Outbound email queued by ${senderName}.`,
        deepLink: `/sales/leads?open=${leadId}`,
        entityType: "lead",
        entityId: leadId,
        createdBy: { uid: auth.user.uid, name: senderName },
      });
    }

    return NextResponse.json({ ok: true, id: emailRef.id });
  } catch (err) {
    console.error("sales email send error:", err);
    return NextResponse.json({ ok: false, error: "Unable to send email." }, { status: 500 });
  }
}
