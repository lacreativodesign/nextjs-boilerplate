import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { sendEmail } from '@/lib/email/email-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Canonical nightly backup cron (DR-01, DR-02).
 *
 * DR-01: Bizosto stores tenant data in TOP-LEVEL collections keyed by a
 * `tenantId` field — not under tenants/{id}/{collection} subcollections. The
 * old Firebase function read those (empty) subcollections, so its backups were
 * near-useless. This route reads the real top-level collections, groups every
 * document by its tenantId, and writes one JSON file per tenant per collection.
 *
 * DR-02: the old function was never wired for deployment. This route ships as a
 * Vercel cron (see vercel.json) authenticated with CRON_SECRET / x-vercel-cron.
 *
 * Integrity: alongside the per-tenant files it writes a manifest.json listing
 * every file with its record count and a sha256 checksum of the bytes written,
 * so a restore can verify each file has not been truncated or corrupted.
 *
 * Durability: any failure dead-letters to `dead_letter_backups` and alerts
 * admin@bizosto.com, so a silently failing nightly backup can never go
 * unnoticed.
 */

const BACKUP_COLLECTIONS = [
  'users',
  'clients',
  'invoices',
  'projects',
  'products',
  'payments',
  'documents',
] as const;

const BACKUP_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'bizosto-backups';

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const isCronFromVercel =
    process.env.VERCEL === '1' && request.headers.get('x-vercel-cron') === '1';

  if (isCronFromVercel) return true;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

type ManifestFile = {
  path: string;
  tenantId: string;
  collection: string;
  records: number;
  sha256: string;
};

/**
 * Dead-letter + alert on any backup failure. The Firestore write is wrapped in
 * its own try/catch so a broken alert path can never mask the original error,
 * and the email is fire-and-forget so a mail outage does not swallow the run.
 */
async function deadLetterBackup(runDate: string, error: unknown) {
  const reason = error instanceof Error ? error.message : 'Unknown backup error';
  const nowIso = new Date().toISOString();

  try {
    await adminDb.collection('dead_letter_backups').add({
      runDate,
      reason,
      status: 'failed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[backup] Failed to write dead-letter record', err);
  }

  sendEmail({
    to: 'admin@bizosto.com',
    subject: `⚠️ Nightly backup failed — ${runDate}`,
    html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1E293B;">
<h1 style="font-size:18px;color:#DC2626;">Nightly backup failed</h1>
<p>The canonical nightly backup cron threw before completing. Tenant data was not backed up for this run and the failure has been dead-lettered.</p>
<table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
<tr><td style="color:#64748B;">Run date</td><td style="font-weight:600;">${runDate}</td></tr>
<tr><td style="color:#64748B;">Reason</td><td style="font-weight:600;">${reason}</td></tr>
<tr><td style="color:#64748B;">At</td><td>${nowIso}</td></tr>
</table></body></html>`,
  }).catch((err) => console.error('[backup] Failed to alert admin of dead-letter', err));
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const runDate = new Date().toISOString().slice(0, 10);
  const generatedAt = new Date().toISOString();

  try {
    const bucket = adminStorage.bucket(BACKUP_BUCKET);

    // Read each TOP-LEVEL collection once and group its documents by tenantId.
    // The `tenantId` field is what scopes a document to a tenant here — there
    // are no per-tenant subcollections to walk.
    const byTenant: Record<string, Record<string, Array<Record<string, unknown>>>> = {};

    for (const collectionName of BACKUP_COLLECTIONS) {
      const snap = await adminDb.collection(collectionName).get();
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const rawTenantId = data.tenantId;
        const tenantId =
          typeof rawTenantId === 'string' && rawTenantId.length > 0 ? rawTenantId : '__no_tenant__';

        const tenantBucket = (byTenant[tenantId] ??= {});
        const collectionDocs = (tenantBucket[collectionName] ??= []);
        collectionDocs.push({ id: doc.id, ...data });
      }
    }

    const files: ManifestFile[] = [];
    let totalRecords = 0;

    for (const [tenantId, collections] of Object.entries(byTenant)) {
      for (const [collectionName, docs] of Object.entries(collections)) {
        const json = JSON.stringify(docs);
        const checksum = sha256(json);
        const filePath = `backups/${runDate}/${tenantId}/${collectionName}.json`;

        await bucket.file(filePath).save(json, {
          contentType: 'application/json',
          metadata: {
            metadata: {
              tenantId,
              collection: collectionName,
              records: String(docs.length),
              sha256: checksum,
              generatedAt,
            },
          },
        });

        files.push({
          path: filePath,
          tenantId,
          collection: collectionName,
          records: docs.length,
          sha256: checksum,
        });
        totalRecords += docs.length;
      }
    }

    const manifest = {
      generatedAt,
      runDate,
      collections: BACKUP_COLLECTIONS,
      tenants: Object.keys(byTenant).length,
      totalRecords,
      files,
    };
    const manifestPath = `backups/${runDate}/manifest.json`;
    await bucket.file(manifestPath).save(JSON.stringify(manifest, null, 2), {
      contentType: 'application/json',
    });

    await adminDb.collection('backups').add({
      runDate,
      storagePath: `backups/${runDate}`,
      manifestPath,
      collections: BACKUP_COLLECTIONS,
      tenants: Object.keys(byTenant).length,
      fileCount: files.length,
      totalRecords,
      status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      runDate,
      tenants: Object.keys(byTenant).length,
      fileCount: files.length,
      totalRecords,
      manifestPath,
    });
  } catch (err) {
    console.error('backup cron error:', err instanceof Error ? err.message : err);
    await deadLetterBackup(runDate, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown backup error' },
      { status: 500 },
    );
  }
}
