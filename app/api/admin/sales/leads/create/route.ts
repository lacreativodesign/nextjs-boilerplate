import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createNotifications, getUsersByRoles } from '@/lib/notifications';
import { sendEmail } from '@/lib/email/email-service';
import { createSalesEvent, parseString, requireAdmin, serverTimestamp } from '../../_utils';

export const dynamic = 'force-dynamic';

/**
 * PII-1: a lead belongs to the tenant, not to Bizosto.
 *
 * Every lead created in ANY workspace used to email the lead's name, email address,
 * source, owner and pipeline stage to the hard-coded platform inbox admin@bizosto.com.
 * That is the tenant's customer data — the person who filled in their form — disclosed to
 * the platform operator on every single create, with no consent, no configuration, and no
 * way for the tenant to know it was happening.
 *
 * The alert now goes to the tenant's own managers, resolved through getUsersByRoles(),
 * which is tenant-scoped and throws rather than degrading into a cross-tenant query. The
 * platform receives nothing.
 *
 * This is a Bizosto application notification to subscriber staff, so it correctly uses the
 * platform sender. It is NOT tenant-to-customer mail, which requires a verified tenant
 * provider that does not exist yet.
 */

/** Bounded so a workspace with many managers cannot fan one create into a mail storm. */
const MAX_ALERT_RECIPIENTS = 25;

/** Escapes lead-supplied values so a name cannot inject markup into the alert. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLeadAlertHtml(lead: {
  name: string;
  email: string;
  source: string;
  ownerName: string | null;
  stage: string;
  appUrl: string;
}) {
  const name = escapeHtml(lead.name || '—');
  const email = escapeHtml(lead.email || '—');
  const source = escapeHtml(lead.source || '—');
  const owner = escapeHtml(lead.ownerName || 'Unassigned');
  const stage = escapeHtml(lead.stage);
  const leadsUrl = `${lead.appUrl.replace(/\/$/, '')}/admin/sales/leads`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#F8FAFC;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#012167,#6692f9);padding:24px 32px;">
<table cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle;"><div style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;line-height:44px;font-size:26px;font-weight:900;color:#fff;font-family:Arial,sans-serif;">B</div></td>
<td style="vertical-align:middle;"><div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.1em;">BIZOSTO</div><div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:3px;">Sales Update</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px;color:#1E293B;font-size:15px;line-height:1.7;">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#012167;">🎯 New Lead Created</h1>
<p style="margin:0 0 24px;color:#64748B;font-size:14px;">A new lead has been added to your pipeline.</p>
<table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:8px;margin:16px 0;">
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Name</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${name}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Email</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${email}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Source</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${source}</td></tr>
<tr><td style="color:#64748B;font-size:13px;border-bottom:1px solid #F1F5F9;">Assigned to</td><td style="font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${owner}</td></tr>
<tr><td style="color:#64748B;font-size:13px;">Stage</td><td style="font-weight:600;color:#1E293B;text-align:right;">${stage}</td></tr>
</table>
<p style="margin:24px 0 0;"><a href="${leadsUrl}" style="display:inline-block;padding:12px 24px;background:#012167;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Lead →</a></p>
</td></tr>
<tr><td style="background:#F1F5F9;padding:20px 32px;border-top:1px solid #E2E8F0;"><p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">© ${new Date().getFullYear()} Bizosto · <a href="https://bizosto.com" style="color:#012167;text-decoration:none;">bizosto.com</a></p></td></tr>
</table></td></tr></table></body></html>`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = await req.json();
    const name = parseString(payload.name, '');
    const email = parseString(payload.email, '');
    const phone = parseString(payload.phone, '');
    const source = parseString(payload.source, '');
    const stage = parseString(payload.stage, 'New');
    const ownerId = parseString(payload.ownerId, '') || null;
    const ownerName = parseString(payload.ownerName, '') || null;

    const docRef = await adminDb.collection('leads').add({
      name,
      email,
      phone,
      source,
      stage,
      ownerId,
      ownerName,
      tenantId: auth.user.tenantId || null,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createSalesEvent({
      type: 'lead_created',
      title: 'Lead created',
      description: `${name || 'Lead'} created`,
      entityType: 'lead',
      entityId: docRef.id,
      createdByUid: auth.user.uid,
      createdByName: auth.user.name || auth.user.fullName || '',
      tenantId: auth.user.tenantId,
    });

    const tenantId = String(auth.user.tenantId || '');
    const recipients = await getUsersByRoles(
      ['sales_manager', 'admin', 'super_admin'],
      tenantId || null,
    );
    await createNotifications({
      recipients,
      tenantId: tenantId || null,
      type: 'new_lead',
      title: 'New lead created',
      message: `${name || 'Lead'} was created.`,
      entityType: 'lead',
      entityId: docRef.id,
      deepLink: '/admin/sales/leads',
      createdBy: { uid: auth.user.uid, name: auth.user.name || auth.user.fullName || '' },
    });

    // Alert the tenant's own managers. Non-blocking: a mail failure must never roll back a
    // lead that is already committed.
    const alertRecipients = recipients
      .map((user) => String(user.email || '').trim())
      .filter((address) => address.includes('@'))
      .slice(0, MAX_ALERT_RECIPIENTS);

    if (alertRecipients.length) {
      const html = buildLeadAlertHtml({
        name,
        email,
        source,
        ownerName,
        stage,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.bizosto.com',
      });

      void Promise.allSettled(
        alertRecipients.map((address) =>
          sendEmail({
            to: address,
            subject: `🎯 New lead — ${name || 'Unnamed'}`,
            html,
          }),
        ),
        // Logged without the lead, the recipients or the tenant: this path handles customer
        // PII and route logs must not carry any of it.
      ).catch(() => console.error('[LEAD_CREATE] lead alert dispatch failed'));
    }

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err: any) {
    console.error('sales leads create error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to create lead.' }, { status: 500 });
  }
}
