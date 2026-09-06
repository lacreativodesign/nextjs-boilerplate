import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import admin from 'firebase-admin';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { getBackupBucketName } from '@/lib/backup/backup-bucket';
import { requireSuperAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BACKUP_BUCKET = getBackupBucketName();
const RUN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

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

type Manifest = {
  runDate: string;
  files: ManifestFile[];
};

/** Only accept the canonical daily manifest path, never an arbitrary bucket object. */
function isBackupManifestPath(value: unknown): value is string {
  return typeof value === 'string' && /^backups\/\d{4}-\d{2}-\d{2}\/manifest\.json$/.test(value);
}

function expectedFilePath(runDate: string, file: Pick<ManifestFile, 'tenantId' | 'collection'>) {
  return `backups/${runDate}/${file.tenantId}/${file.collection}.json`;
}

function validateManifestFile(runDate: string, value: unknown): ManifestFile {
  const file = value as Partial<ManifestFile> | null;
  if (
    !file ||
    typeof file.path !== 'string' ||
    typeof file.tenantId !== 'string' ||
    typeof file.collection !== 'string' ||
    !Number.isInteger(file.records) ||
    Number(file.records) < 0 ||
    typeof file.sha256 !== 'string' ||
    !SAFE_SEGMENT_RE.test(file.tenantId) ||
    !SAFE_SEGMENT_RE.test(file.collection) ||
    !SHA256_RE.test(file.sha256) ||
    file.path !== expectedFilePath(runDate, file as ManifestFile)
  ) {
    throw new Error('Invalid manifest file entry');
  }
  return file as ManifestFile;
}

async function loadManifest(
  bucket: ReturnType<typeof adminStorage.bucket>,
  manifestPath: string,
): Promise<Manifest> {
  const [raw] = await bucket.file(manifestPath).download();
  const parsed = JSON.parse(raw.toString('utf8')) as Partial<Manifest> | null;
  if (!parsed || typeof parsed.runDate !== 'string' || !RUN_DATE_RE.test(parsed.runDate)) {
    throw new Error('Invalid manifest');
  }
  if (manifestPath !== `backups/${parsed.runDate}/manifest.json` || !Array.isArray(parsed.files)) {
    throw new Error('Invalid manifest');
  }

  const files = parsed.files.map((file) => validateManifestFile(parsed.runDate as string, file));

  // A manifest that names the same object twice is not a manifest we wrote. Two entries for
  // one path can disagree on sha256 or records, so whichever is validated last decides what
  // "verified" means, and the file is downloaded and applied more than once.
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) {
      throw new Error('Invalid manifest: duplicate file entry');
    }
    seen.add(file.path);
  }

  return { runDate: parsed.runDate, files };
}

function selectFiles(
  files: ManifestFile[],
  collection?: string | null,
  tenantId?: string | null,
): ManifestFile[] {
  if (collection && !SAFE_SEGMENT_RE.test(collection)) throw new Error('Invalid collection filter');
  if (tenantId && !SAFE_SEGMENT_RE.test(tenantId)) throw new Error('Invalid tenant filter');
  let selected = files;
  if (collection) selected = selected.filter((file) => file.collection === collection);
  if (tenantId) selected = selected.filter((file) => file.tenantId === tenantId);
  return selected;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/**
 * Firestore's own document-id rules, enforced before the id reaches `.doc()`.
 *
 * A slash makes `.doc(id)` address a deeper path, so a crafted backup could place documents
 * outside the isolated restore collection. `.` and `..` are rejected by the SDK, and the
 * `__name__` reserved form is not writable — all three arrive as a 500 rather than the
 * explicit rejection an operator needs to see in the restore audit.
 */
function isValidDocumentId(id: string): boolean {
  if (id.includes('/')) return false;
  if (id === '.' || id === '..') return false;
  if (/^__.*__$/.test(id)) return false;
  return Buffer.byteLength(id, 'utf8') <= 1500;
}

function validateBackupDocuments(
  file: ManifestFile,
  value: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length !== file.records) {
    throw new Error(`Invalid backup payload for ${file.path}: record count mismatch`);
  }

  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid backup payload for ${file.path}`);
    }
    const doc = entry as Record<string, unknown>;
    const id = doc.id;
    if (typeof id !== 'string' || !id || ids.has(id) || !isValidDocumentId(id)) {
      throw new Error(`Invalid document id in ${file.path}`);
    }
    ids.add(id);

    // Tenant-scoped files must contain only documents that still assert that same tenant.
    // `__no_tenant__` is the backup bucket for platform/root records without a tenant field.
    if (file.tenantId !== '__no_tenant__' && String(doc.tenantId || '') !== file.tenantId) {
      throw new Error(`Tenant mismatch in backup payload ${file.path}`);
    }
    return doc;
  });
}

async function auditAbort(params: {
  manifestPath: string;
  runDate: string;
  actorUserId: string;
  reason: string;
  file?: ManifestFile;
  details?: Record<string, unknown>;
}) {
  await adminDb.collection('restore_audit').add({
    manifestPath: params.manifestPath,
    runDate: params.runDate,
    status: 'aborted',
    reason: params.reason,
    ...(params.file
      ? {
          path: params.file.path,
          collection: params.file.collection,
          tenantId: params.file.tenantId,
        }
      : {}),
    ...(params.details || {}),
    actorUserId: params.actorUserId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

type RestoreAuditContext = { manifestPath: string; runDate: string; actorUserId: string };
type VerifiedFile = { file: ManifestFile; docs: Array<Record<string, unknown>> };

/**
 * Pass 1 — prove every selected file before anything is written.
 *
 * Checksum, declared record count, document-id validity and per-document tenant ownership
 * are all asserted here. Any failure aborts the whole restore with an audit record, so a
 * corrupt file cannot leave a partially applied restore behind.
 */
async function verifySelectedFiles(
  bucket: ReturnType<typeof adminStorage.bucket>,
  files: ManifestFile[],
  auditContext: RestoreAuditContext,
): Promise<VerifiedFile[]> {
  const verified: VerifiedFile[] = [];

  for (const file of files) {
    const [raw] = await bucket.file(file.path).download();
    const text = raw.toString('utf8');
    const actualSha256 = sha256(text);

    if (actualSha256 !== file.sha256) {
      await auditAbort({
        ...auditContext,
        reason: 'checksum_mismatch',
        file,
        details: { expectedSha256: file.sha256, actualSha256 },
      });
      throw new Error(`Checksum mismatch for ${file.path}`);
    }

    try {
      verified.push({ file, docs: validateBackupDocuments(file, JSON.parse(text)) });
    } catch (error) {
      await auditAbort({ ...auditContext, reason: 'invalid_backup_payload', file });
      throw error;
    }
  }

  return verified;
}

/** Pass 2 — write only into the isolated restore_<runDate>__<collection> namespace. */
async function applyVerifiedFiles(
  verified: VerifiedFile[],
  auditContext: RestoreAuditContext,
): Promise<{ applied: Array<Record<string, unknown>>; restoredRecords: number }> {
  const applied: Array<Record<string, unknown>> = [];
  let restoredRecords = 0;

  for (const { file, docs } of verified) {
    const restoreCollection = `restore_${auditContext.runDate}__${file.collection}`;

    for (const batchDocs of chunk(docs, 400)) {
      const batch = adminDb.batch();
      for (const docPayload of batchDocs) {
        const { id, ...docData } = docPayload;
        batch.set(adminDb.collection(restoreCollection).doc(id as string), {
          ...docData,
          __restoredFrom: file.path,
          __restoredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    restoredRecords += docs.length;
    applied.push({
      path: file.path,
      restoreCollection,
      collection: file.collection,
      tenantId: file.tenantId,
      records: docs.length,
    });

    await adminDb.collection('restore_audit').add({
      manifestPath: auditContext.manifestPath,
      runDate: auditContext.runDate,
      status: 'applied',
      path: file.path,
      restoreCollection,
      collection: file.collection,
      tenantId: file.tenantId,
      records: docs.length,
      sha256: file.sha256,
      actorUserId: auditContext.actorUserId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { applied, restoredRecords };
}

/** Maps a thrown authorization/validation error to the status the caller should see. */
function statusForError(message: string): number {
  if (message === 'Forbidden') return 403;
  if (message.startsWith('Checksum mismatch')) return 422;
  if (message.startsWith('Invalid') || message.startsWith('Tenant mismatch')) return 400;
  return 500;
}

/** GET — checksum-validating dry run. Writes nothing. */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const manifestPath = req.nextUrl.searchParams.get('manifestPath');
    if (!isBackupManifestPath(manifestPath)) {
      return NextResponse.json(
        { ok: false, error: 'manifestPath must be a backups/<runDate>/manifest.json path' },
        { status: 400 },
      );
    }

    const bucket = adminStorage.bucket(BACKUP_BUCKET);
    const manifest = await loadManifest(bucket, manifestPath);
    const files = selectFiles(
      manifest.files,
      req.nextUrl.searchParams.get('collection'),
      req.nextUrl.searchParams.get('tenantId'),
    );

    const results = [];
    let verified = 0;
    let mismatched = 0;
    let totalRecords = 0;

    for (const file of files) {
      const [raw] = await bucket.file(file.path).download();
      const actualSha256 = sha256(raw.toString('utf8'));
      const ok = actualSha256 === file.sha256;
      if (ok) verified += 1;
      else mismatched += 1;
      totalRecords += file.records;

      results.push({
        path: file.path,
        collection: file.collection,
        tenantId: file.tenantId,
        records: file.records,
        restoreCollection: `restore_${manifest.runDate}__${file.collection}`,
        expectedSha256: file.sha256,
        actualSha256,
        ok,
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun: true,
      runDate: manifest.runDate,
      manifestPath,
      files: files.length,
      verified,
      mismatched,
      totalRecords,
      results,
    });
  } catch (error: any) {
    const message = error?.message || 'Server error';
    return NextResponse.json({ ok: false, error: message }, { status: statusForError(message) });
  }
}

/** POST — checksum-validating apply into isolated restore_ collections only. */
export async function POST(req: NextRequest) {
  let auditContext: { manifestPath: string; runDate: string; actorUserId: string } | null = null;
  try {
    const user = await requireSuperAdmin(req);

    const body = (await req.json()) as {
      manifestPath?: string;
      collection?: string;
      tenantId?: string;
    };
    const manifestPath = body?.manifestPath;
    if (!isBackupManifestPath(manifestPath)) {
      return NextResponse.json(
        { ok: false, error: 'manifestPath must be a backups/<runDate>/manifest.json path' },
        { status: 400 },
      );
    }

    const bucket = adminStorage.bucket(BACKUP_BUCKET);
    const manifest = await loadManifest(bucket, manifestPath);
    const runDate = manifest.runDate;
    auditContext = { manifestPath, runDate, actorUserId: user.uid };
    const files = selectFiles(manifest.files, body.collection, body.tenantId);
    if (!files.length) {
      return NextResponse.json(
        { ok: false, error: 'No backup files matched the restore scope' },
        { status: 404 },
      );
    }

    // Pass 1 verifies EVERY selected file before pass 2 writes anything, so a corrupt file
    // late in the manifest cannot leave a half-applied restore behind.
    const verified = await verifySelectedFiles(bucket, files, auditContext);
    const { applied, restoredRecords } = await applyVerifiedFiles(verified, {
      manifestPath,
      runDate,
      actorUserId: user.uid,
    });

    return NextResponse.json({
      ok: true,
      runDate,
      manifestPath,
      filesApplied: applied.length,
      restoredRecords,
      applied,
    });
  } catch (error: any) {
    const message = error?.message || 'Server error';
    if (
      auditContext &&
      !message.startsWith('Checksum mismatch') &&
      !message.startsWith('Invalid backup payload') &&
      !message.startsWith('Invalid document id') &&
      !message.startsWith('Tenant mismatch')
    ) {
      await auditAbort({
        ...auditContext,
        reason: 'restore_apply_failed',
        details: { error: String(message).slice(0, 300) },
      }).catch(() => undefined);
    }

    return NextResponse.json({ ok: false, error: message }, { status: statusForError(message) });
  }
}
