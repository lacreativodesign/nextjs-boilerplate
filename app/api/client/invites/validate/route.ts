import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { docTenantId, normalizeTenantId } from '@/lib/tenant';
import { hashInviteToken } from '@/lib/clientInvites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get('token') || '').trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Missing token.' }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);
    const snap = await adminDb
      .collection('inviteTokens')
      .where('tokenHash', '==', tokenHash)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json({ ok: false, error: 'Invalid token.' }, { status: 404 });
    }

    const doc = snap.docs[0];
    const data = doc.data() || {};
    const tenantId = normalizeTenantId(data.tenantId || null);

    if (docTenantId(data) !== tenantId) {
      return NextResponse.json({ ok: false, error: 'Invalid token.' }, { status: 404 });
    }

    if (data.usedAt) {
      return NextResponse.json({ ok: false, error: 'Invite already used.' }, { status: 410 });
    }

    const expiresAt = data.expiresAt?.toDate
      ? data.expiresAt.toDate()
      : new Date(data.expiresAt || 0);
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: 'Invite expired.' }, { status: 410 });
    }

    return NextResponse.json({
      ok: true,
      email: String(data.email || ''),
      tenantId,
      clientId: String(data.clientId || ''),
    });
  } catch (err: any) {
    console.error('invite validate error:', err);
    return NextResponse.json({ ok: false, error: 'Unable to validate invite.' }, { status: 500 });
  }
}
