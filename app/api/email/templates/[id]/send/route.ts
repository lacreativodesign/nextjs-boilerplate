import admin from 'firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { adminDb } from '@/lib/firebaseAdmin';
import { sendEmail } from '@/lib/email/email-service';
import { generatePreviewPayload, renderTemplate } from '@/lib/email/template-engine';
import { normalizeTenantId } from '@/lib/tenant';
import { buildEmailBrandingTemplate, getTenantBranding } from '@/lib/white-label/branding';

const sendSchema = z.object({
  to: z.string().email(),
  locale: z.string().trim().min(2).max(10).optional(),
  context: z.record(z.any()).optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const templateSnap = await adminDb.collection('email_templates').doc(params.id).get();
    if (!templateSnap.exists)
      return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 });

    const template = templateSnap.data() || {};
    const tenantId = normalizeTenantId(me.tenantId || null);
    if (normalizeTenantId(template.tenantId) !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const context = generatePreviewPayload(parsed.data.context || {});
    const rendered = renderTemplate({
      template: {
        subject: String(template.subject || ''),
        body: String(template.body || ''),
        language: String(template.language || 'en'),
        translations: (template.translations || {}) as Record<
          string,
          { subject: string; body: string }
        >,
      },
      context,
      locale: parsed.data.locale,
    });

    const branding = await getTenantBranding(tenantId);
    const brandedHtml = buildEmailBrandingTemplate({ branding, html: rendered.renderedHtml });

    await sendEmail({
      to: parsed.data.to,
      subject: rendered.renderedSubject,
      html: brandedHtml,
      text: rendered.renderedText,
      fromName: branding.emailBranding.fromName || undefined,
      fromEmail: branding.emailBranding.fromEmail || undefined,
    });

    await adminDb.collection('email_template_usage').add({
      templateId: params.id,
      tenantId,
      channel: 'test_send',
      locale: rendered.locale,
      renderedSubject: rendered.renderedSubject,
      renderedHtml: brandedHtml,
      recipientEmail: parsed.data.to,
      actorUid: me.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('POST /api/email/templates/[id]/send error', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to send test email' },
      { status: 500 },
    );
  }
}
