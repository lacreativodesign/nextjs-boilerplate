import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { createPasswordSetupToken, sendSetPasswordEmail } from '@/lib/passwordSetup';
import { getCurrentUser, isAdminRole, isSuperAdmin } from '../../admin/_utils';

export const runtime = 'nodejs';

/**
 * Issues a set-password token for a target user and emails the link to that user.
 *
 * SECURITY (S-1): the target `uid` arrives in the request body, so it MUST be
 * authorized against the caller's tenant before any token is minted. Without that
 * check an admin of tenant A could mint a live password-setup credential for any
 * user in any other tenant — including the platform super_admin — because
 * `users` is a top-level collection keyed by a `tenantId` field, not a per-tenant
 * subcollection. A cross-tenant target now returns 404 (not 403) so the endpoint
 * cannot be used to probe which uids exist in other tenants.
 *
 * The minted link is a live credential. It is delivered ONLY by email and is never
 * returned in the HTTP response, so a caller who can reach this route cannot obtain
 * a usable token for someone else's account by forcing the email send to fail.
 */
export async function POST(req: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(current.role)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const uid = String(body?.uid || '').trim();

    if (!uid) {
      return NextResponse.json({ ok: false, error: 'Missing uid' }, { status: 400 });
    }

    const userSnap = await adminDb.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data() || {};

    // Tenant authorization. super_admin is the platform operator and may target any
    // tenant; every other admin is confined to their own. Fails closed when either
    // side has no tenant context.
    if (!isSuperAdmin(current.role)) {
      const callerTenantId = String(current.tenantId || '').trim();
      const targetTenantId = String(userData.tenantId || '').trim();
      if (!callerTenantId || !targetTenantId || callerTenantId !== targetTenantId) {
        return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
      }
    }

    const email = String(userData?.email || '').trim();

    if (!email) {
      return NextResponse.json({ ok: false, error: 'User email missing' }, { status: 400 });
    }

    const tokenData = await createPasswordSetupToken({
      uid,
      email,
      createdBy: current.uid,
    });

    const emailResult = await sendSetPasswordEmail({ email, link: tokenData.link });

    if (!emailResult.sent) {
      // The token exists but could not be delivered. Report the failure — never hand
      // the raw link back to the caller as a fallback.
      return NextResponse.json(
        {
          ok: false,
          uid,
          email,
          emailSent: false,
          error: emailResult.error || 'Unable to send the set-password email.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      uid,
      email,
      expiresAt: tokenData.expiresAt,
      emailSent: true,
    });
  } catch (err: any) {
    console.error('CREATE SET PASSWORD TOKEN ERROR:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
