import admin from 'firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/app/api/admin/_utils';
import { adminDb } from '@/lib/firebaseAdmin';
import { generatePreviewPayload, renderTemplate } from '@/lib/email/template-engine';
import { normalizeTenantId } from '@/lib/tenant';
import { buildEmailBrandingTemplate, getTenantBranding } from '@/lib/white-label/branding';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const templateSnap = await adminDb.collection('email_templates').doc(params.id).get();
    if (!templateSnap.exists)
      return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 });

    const template = templateSnap.data() || {};
    const tenantId = normalizeTenantId(me.tenantId || null);
    if (normalizeTenantId(template.tenantId) !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const context = generatePreviewPayload(body?.context || {});
    const preview = renderTemplate({
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
      locale: typeof body?.locale === 'string' ? body.locale : undefined,
    });

    const branding = await getTenantBranding(tenantId);
    const brandedHtml = buildEmailBrandingTemplate({ branding, html: preview.renderedHtml });

    await adminDb.collection('email_template_usage').add({
      templateId: params.id,
      tenantId,
      channel: 'preview',
      locale: preview.locale,
      renderedSubject: preview.renderedSubject,
      renderedHtml: brandedHtml,
      actorUid: me.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      preview: { ...preview, renderedHtml: brandedHtml },
      context,
      branding,
    });
  } catch (error: any) {
    console.error('POST /api/email/templates/[id]/preview error', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to generate preview' },
      { status: 500 },
    );
  }
}
