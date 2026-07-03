import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/admin/settings/_utils';
import { sendEmailViaOutlook } from '@/lib/integrations/outlook';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await request.json().catch(() => ({}))) as {
      to?: unknown;
      cc?: unknown;
      bcc?: unknown;
      subject?: string;
      html?: string;
      threadId?: string;
      from?: string;
      trackOpens?: boolean;
      attachments?: Array<{ filename?: string; mimeType?: string; base64Content?: string }>;
    };

    if (!Array.isArray(body.to) || !body.subject || !body.html) {
      return NextResponse.json(
        { ok: false, error: 'to[], subject and html are required.' },
        { status: 400 },
      );
    }

    const sent = await sendEmailViaOutlook({
      tenantId: auth.user.tenantId,
      actorUid: auth.user.uid,
      from: body.from ? String(body.from) : undefined,
      to: body.to.map((entry) => String(entry)),
      cc: Array.isArray(body.cc) ? body.cc.map((entry) => String(entry)) : undefined,
      bcc: Array.isArray(body.bcc) ? body.bcc.map((entry) => String(entry)) : undefined,
      subject: String(body.subject),
      html: String(body.html),
      threadId: body.threadId ? String(body.threadId) : undefined,
      trackOpens: Boolean(body.trackOpens),
      attachments: Array.isArray(body.attachments)
        ? body.attachments.map((attachment) => ({
            filename: String(attachment.filename || 'attachment'),
            mimeType: String(attachment.mimeType || 'application/octet-stream'),
            base64Content: String(attachment.base64Content || ''),
          }))
        : undefined,
    });

    return NextResponse.json({ ok: true, message: sent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send Outlook email.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
