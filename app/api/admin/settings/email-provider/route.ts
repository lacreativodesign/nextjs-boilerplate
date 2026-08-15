import { NextResponse } from 'next/server';
import { requireAdmin, logSettingsChange } from '../_utils';
import {
  deleteTenantEmailProvider,
  getTenantEmailProviderStatus,
  isSupportedProvider,
  saveTenantEmailProvider,
} from '@/lib/email/tenant-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tenant email provider settings (MAIL-6).
 *
 * A tenant stores their own Resend or SendGrid key here, and their customer-facing mail
 * leaves through their account rather than Bizosto's. The credential is write-only: it is
 * encrypted before storage and this route never returns it, in any response, to anyone —
 * including a Super Admin. A masked hint is enough to tell two keys apart and useless to
 * whoever steals a response body.
 */

/** Reports whether a provider is configured. Never returns the credential. */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const status = await getTenantEmailProviderStatus(auth.user.tenantId);
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    console.error('settings/email-provider GET error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

/** Stores or replaces the credential. */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const provider = String(body?.provider || '').toLowerCase();
    const apiKey = String(body?.apiKey || '').trim();

    if (!isSupportedProvider(provider)) {
      return NextResponse.json(
        { ok: false, error: 'Choose Resend, SendGrid or SES.' },
        { status: 400 },
      );
    }
    if (apiKey.length < 16) {
      return NextResponse.json(
        { ok: false, error: 'That does not look like a provider API key.' },
        { status: 400 },
      );
    }
    if (provider === 'ses' && !String(body?.region || '').trim()) {
      return NextResponse.json({ ok: false, error: 'SES requires a region.' }, { status: 400 });
    }

    await saveTenantEmailProvider({
      tenantId: auth.user.tenantId,
      provider,
      apiKey,
      region: String(body?.region || ''),
      actorUid: auth.user.uid,
    });

    // The audit trail records that a credential changed and which provider it was for.
    // It must never record the credential, or the audit log becomes the thing to steal.
    await logSettingsChange({
      user: auth.user,
      section: 'email-provider',
      summary: `Tenant email provider connected (${provider}).`,
    });

    const status = await getTenantEmailProviderStatus(auth.user.tenantId);
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    console.error('settings/email-provider POST error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

/** Disconnects the provider. Mail falls back to the platform account immediately. */
export async function DELETE() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await deleteTenantEmailProvider(auth.user.tenantId);

    await logSettingsChange({
      user: auth.user,
      section: 'email-provider',
      summary: 'Tenant email provider disconnected.',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('settings/email-provider DELETE error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
