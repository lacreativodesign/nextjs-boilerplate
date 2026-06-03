import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { adminDb } from "@/lib/firebaseAdmin";
import { docTenantId } from "@/lib/tenant";
import { parseString, requireSalesWrite, serverTimestamp } from "../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeThreadKey(subject: string, participants: string[]) {
  const normalizedSubject = subject.toLowerCase().replace(/^re:\s*/i, "").trim();
  const sorted = participants.map((p) => p.toLowerCase().trim()).sort().join("|");
  return `${normalizedSubject}::${sorted}`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireSalesWrite();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const leadId = parseString(body.leadId, "");
    const to = parseString(body.to, "");
    const subject = parseString(body.subject, "");
    const bodyText = parseString(body.bodyText, "");
    const bodyHtml = parseString(body.bodyHtml, "");

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
      if (docTenantId(lead) !== tenantId && auth.user.role !== "super_admin") {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }
    const mailboxSnap = await adminDb
      .collection("userMailboxes")
      .where("tenantId", "==", tenantId)
      .where("userId", "==", auth.user.uid)
      .where("enabled", "==", true)
      .limit(1)
      .get();

    if (mailboxSnap.empty) {
      return NextResponse.json({ ok: false, error: "Mailbox not configured." }, { status: 400 });
    }

    const mailbox = mailboxSnap.docs[0].data() || {};
    const accountId = String(mailbox.emailAccountId || "");
    if (!accountId) {
      return NextResponse.json({ ok: false, error: "Mailbox account missing." }, { status: 400 });
    }

    const accountSnap = await adminDb.collection("emailAccounts").doc(accountId).get();
    if (!accountSnap.exists) {
      return NextResponse.json({ ok: false, error: "Email account not found." }, { status: 404 });
    }

    const account = accountSnap.data() || {};
    if (!account.enabled) {
      return NextResponse.json({ ok: false, error: "Email account disabled." }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: String(account.smtpHost || ""),
      port: Number(account.smtpPort || 587),
      secure: Boolean(account.smtpSecure),
      auth: {
        user: String(account.username || ""),
        pass: String(account.passwordEncrypted || ""),
      },
    });

    const fromName = mailbox.fromName || auth.user.name || auth.user.displayName || "";
    const fromAddress = account.username;
    const signature = mailbox.signature ? `\n\n${mailbox.signature}` : "";

    const mailInfo = await transporter.sendMail({
      from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
      to,
      subject,
      text: bodyText ? `${bodyText}${signature}` : undefined,
      html: bodyHtml ? `${bodyHtml}${signature}` : undefined,
    });

    const threadKey = normalizeThreadKey(subject, [fromAddress, to]);

    const emailRef = adminDb.collection("emails").doc();
    await emailRef.set({
      id: emailRef.id,
      tenantId,
      mailboxUserId: auth.user.uid,
      emailAccountId: accountId,
      direction: "outbound",
      messageId: mailInfo.messageId || null,
      threadKey,
      subject,
      from: [fromAddress],
      to: [to],
      cc: [],
      bodyText,
      bodyHtml: bodyHtml || null,
      leadId: leadId || null,
      clientId: null,
      status: "sent",
      createdAt: serverTimestamp(),
      receivedAt: null,
      isRead: true,
    });

    return NextResponse.json({ ok: true, id: emailRef.id });
  } catch (err) {
    console.error("sales email send error:", err);
    return NextResponse.json({ ok: false, error: "Unable to send email." }, { status: 500 });
  }
}
