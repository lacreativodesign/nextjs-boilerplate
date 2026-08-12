import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import {
  createDomainVerificationToken,
  getTenantBranding,
  updateTenantBranding,
  verifyEmailSender,
} from '@/lib/white-label/branding';

const schema = z.object({ fromEmail: z.string().email() });

export async function POST(req: Request) {
  const auth = await requireAdminOrSuperAdmin();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'Invalid email.' }, { status: 400 });

  try {
    const domain = parsed.data.fromEmail.trim().toLowerCase().split('@')[1];

    // MAIL-1: the token is derived from the tenant and the domain, so it is unguessable by
    // another tenant and is the same challenge the custom-domain flow already uses. It is
    // returned to the caller so the settings screen can show the record to publish.
    const verificationToken = createDomainVerificationToken(auth.user.tenantId, domain);
    const verification = await verifyEmailSender(parsed.data.fromEmail, verificationToken);
    const current = await getTenantBranding(auth.user.tenantId);
    const now = new Date().toISOString();

    await updateTenantBranding(
      auth.user.tenantId,
      {
        emailBranding: {
          ...current.emailBranding,
          fromEmail: parsed.data.fromEmail,
          // Verified means the tenant proved it controls the domain. SPF and DKIM are
          // recorded alongside as deliverability information, not as evidence.
          status: verification.verified ? 'verified' : 'pending',
          domainOwned: verification.domainOwned,
          spfValid: verification.spfValid,
          dkimValid: verification.dkimValid,
          verifiedAt: verification.verified ? now : null,
        },
      },
      auth.user.uid,
    );

    return NextResponse.json({ ok: true, verification, verificationToken });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Email verification failed' },
      { status: 400 },
    );
  }
}
