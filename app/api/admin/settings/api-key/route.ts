import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, logSettingsChange } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Returns whether an API key is currently configured for this tenant. Never returns the key. */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const tenantSnap = await adminDb.collection('tenants').doc(auth.user.tenantId).get();
    const hasApiKey = Boolean(tenantSnap.data()?.apiKeyHash);

    return NextResponse.json({ ok: true, hasApiKey });
  } catch (err) {
    console.error('settings/api-key GET error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

/**
 * Generates a new per-tenant ingest API key, stores its SHA-256 hash on the
 * tenant document, and returns the plaintext key exactly once.
 */
export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const plaintext = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(plaintext).digest('hex');

    await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .set({ apiKeyHash: keyHash }, { merge: true });

    await logSettingsChange({
      user: auth.user,
      section: 'api-key',
      summary: 'Ingest API key rotated.',
    });

    return NextResponse.json({ ok: true, apiKey: plaintext });
  } catch (err) {
    console.error('settings/api-key POST error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

/** Revokes the current API key by removing the hash from the tenant document. */
export async function DELETE() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .update({ apiKeyHash: FieldValue.delete() });

    await logSettingsChange({
      user: auth.user,
      section: 'api-key',
      summary: 'Ingest API key revoked.',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('settings/api-key DELETE error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
