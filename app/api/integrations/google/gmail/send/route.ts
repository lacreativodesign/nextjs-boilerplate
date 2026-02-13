import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/settings/_utils";
import { sendEmailViaGmail } from "@/lib/integrations/gmail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body?.to) || !body?.subject || !body?.html || !body?.from) {
      return NextResponse.json({ ok: false, error: "from, to[], subject and html are required." }, { status: 400 });
    }

    const sent = await sendEmailViaGmail({
      tenantId: auth.user.tenantId,
      actorUid: auth.user.uid,
      from: String(body.from),
      to: body.to.map((entry: any) => String(entry)),
      subject: String(body.subject),
      html: String(body.html),
      text: body.text ? String(body.text) : undefined,
      threadId: body.threadId ? String(body.threadId) : undefined,
      attachments: Array.isArray(body.attachments)
        ? body.attachments.map((attachment: any) => ({
            filename: String(attachment.filename),
            mimeType: String(attachment.mimeType),
            base64Content: String(attachment.base64Content),
          }))
        : undefined,
      trackOpens: Boolean(body.trackOpens),
    });

    return NextResponse.json({ ok: true, message: sent });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to send Gmail message." }, { status: 500 });
  }
}
