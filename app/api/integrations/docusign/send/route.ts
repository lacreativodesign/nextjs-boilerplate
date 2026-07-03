import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/admin/settings/_utils';
import { remindSigners, sendDocumentForSignature } from '@/lib/integrations/docusign';

export const runtime = 'nodejs';

function parseSignerEmails(raw: string | null) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((value, index, arr) => value.includes('@') && arr.indexOf(value) === index);
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      if (body?.action !== 'remind') {
        return NextResponse.json({ ok: false, error: 'Unsupported JSON action.' }, { status: 400 });
      }

      const envelopeId = typeof body.envelopeId === 'string' ? body.envelopeId.trim() : '';
      const signerEmails = Array.isArray(body.signerEmails)
        ? body.signerEmails
            .map((item: unknown) =>
              String(item || '')
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean)
        : [];

      if (!envelopeId || !signerEmails.length) {
        return NextResponse.json(
          { ok: false, error: 'envelopeId and signerEmails are required for reminders.' },
          { status: 400 },
        );
      }

      await remindSigners({ tenantId: auth.user.tenantId, envelopeId, signerEmails });
      return NextResponse.json({ ok: true });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const signerEmails = parseSignerEmails(formData.get('signerEmails') as string | null);
    const subject = String(formData.get('subject') || 'Please sign this document').trim();
    const message = String(
      formData.get('message') || 'Please review and sign this document.',
    ).trim();

    if (!file)
      return NextResponse.json({ ok: false, error: 'A file is required.' }, { status: 400 });
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { ok: false, error: 'Only PDF files are supported for DocuSign.' },
        { status: 400 },
      );
    }
    if (!signerEmails.length) {
      return NextResponse.json(
        { ok: false, error: 'At least one signer email is required.' },
        { status: 400 },
      );
    }

    const fileBytes = Buffer.from(await file.arrayBuffer());
    const sent = await sendDocumentForSignature({
      tenantId: auth.user.tenantId,
      userUid: auth.user.uid,
      userEmail: auth.user.email || '',
      fileName: file.name,
      fileBytes,
      signerEmails,
      subject,
      message,
    });

    return NextResponse.json({ ok: true, envelopeId: sent.envelopeId, status: sent.status });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to send document for signature.' },
      { status: 500 },
    );
  }
}
