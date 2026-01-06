import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
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
      if (lead.tenantId && lead.tenantId !== tenantId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      if (auth.user.role === "sales" && lead.ownerId !== auth.user.uid) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }
    const userSignature = String(auth.user.emailSignature || "").trim();
    const signatureUsed = userSignature;
    const renderedText = bodyText ? `${bodyText}${signatureUsed ? `\n\n${signatureUsed}` : ""}` : "";
    const renderedHtml = bodyHtml ? `${bodyHtml}${signatureUsed ? `<br/><br/>${signatureUsed}` : ""}` : "";

    const fromAddress = String(auth.user.email || "");
    const threadKey = normalizeThreadKey(subject, [fromAddress, to]);

    const emailRef = adminDb.collection("emails").doc();
    await emailRef.set({
      id: emailRef.id,
      tenantId,
      mailboxUserId: auth.user.uid,
      emailAccountId: null,
      direction: "outbound",
      messageId: null,
      threadKey,
      subject,
      from: [fromAddress],
      to: [to],
      cc: [],
      bodyText,
      bodyHtml: bodyHtml || null,
      renderedBody: renderedText || renderedHtml || bodyText || bodyHtml || "",
      signatureUsed: signatureUsed || null,
      leadId: leadId || null,
      clientId: null,
      status: "queued",
      createdAt: serverTimestamp(),
      receivedAt: null,
      isRead: true,
    });

    return NextResponse.json({ ok: true, id: emailRef.id, status: "queued" });
  } catch (err) {
    console.error("sales email send error:", err);
    return NextResponse.json({ ok: false, error: "Unable to send email." }, { status: 500 });
  }
}
