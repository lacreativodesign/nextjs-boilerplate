import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, logSettingsChange } from '../_utils';
import {
  API_KEYS_SUBCOLLECTION,
  createTenantApiKey,
  type TenantApiKeyRecord,
} from '@/lib/ingest/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * KEY-2: a workspace holds several keys, so rotation has no downtime.
 *
 * This used to store one hash on the tenant document, and POST overwrote it. Rotating
 * therefore meant an outage: the instant an admin clicked Rotate, every request from their
 * website began failing and kept failing until somebody pasted the new key into the other
 * system and redeployed. Under those terms nobody rotates, which is the real cost — a
 * credential that cannot be rotated safely stays live after it leaks.
 *
 * The safe sequence is now possible: create a key, deploy it, revoke the old one.
 */

/** Lists this workspace's keys. Never returns a secret — only its prefix and metadata. */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const snap = await adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .collection(API_KEYS_SUBCOLLECTION)
      .get();

    const keys = snap.docs
      .map((doc) => {
        const record = doc.data() as TenantApiKeyRecord;
        return {
          keyId: doc.id,
          name: record.name,
          prefix: record.prefix,
          createdAt: record.createdAt,
          lastUsedAt: record.lastUsedAt ?? null,
          revokedAt: record.revokedAt ?? null,
        };
      })
      .filter((key) => !key.revokedAt)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    // A tenant that has never rotated since KEY-2 still authenticates on the old root
    // hash, so the screen must show that it has a working key rather than "none".
    const tenantSnap = await adminDb.collection('tenants').doc(auth.user.tenantId).get();
    const hasLegacyKey = Boolean(tenantSnap.data()?.apiKeyHash);

    return NextResponse.json({ ok: true, keys, hasLegacyKey });
  } catch (err) {
    console.error('settings/api-key GET error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

/** Issues an additional key. Existing keys keep working. Returns the secret once. */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim() || 'Untitled key';

    const created = await createTenantApiKey({
      tenantId: auth.user.tenantId,
      name,
      createdBy: auth.user.uid,
    });

    await logSettingsChange({
      user: auth.user,
      section: 'api-key',
      summary: `Ingest API key created (${created.prefix}…).`,
    });

    return NextResponse.json({
      ok: true,
      apiKey: created.plaintext,
      keyId: created.keyId,
      prefix: created.prefix,
    });
  } catch (err) {
    console.error('settings/api-key POST error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

/**
 * Revokes one key by id, or the legacy root key when no id is given.
 *
 * Revoked rather than deleted: the record is the only evidence that a key existed, when it
 * was last used and who withdrew it. Deleting it would erase exactly what an incident
 * review needs.
 */
export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const keyId = String(new URL(req.url).searchParams.get('keyId') || '').trim();

    if (!keyId) {
      // Legacy path: the single hash on the tenant document.
      await adminDb
        .collection('tenants')
        .doc(auth.user.tenantId)
        .set({ apiKeyHash: null }, { merge: true });

      await logSettingsChange({
        user: auth.user,
        section: 'api-key',
        summary: 'Legacy ingest API key revoked.',
      });

      return NextResponse.json({ ok: true });
    }

    const ref = adminDb
      .collection('tenants')
      .doc(auth.user.tenantId)
      .collection(API_KEYS_SUBCOLLECTION)
      .doc(keyId);

    // Read first: a key id from another workspace must not be revocable through this
    // tenant's session, and a missing one should say so rather than silently succeed.
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'Key not found.' }, { status: 404 });
    }

    await ref.update({
      revokedAt: new Date().toISOString(),
      revokedBy: auth.user.uid,
    });

    await logSettingsChange({
      user: auth.user,
      section: 'api-key',
      summary: `Ingest API key revoked (${(snap.data() as TenantApiKeyRecord).prefix}…).`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('settings/api-key DELETE error', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
