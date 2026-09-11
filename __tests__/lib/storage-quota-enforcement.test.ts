import * as fs from 'fs';
import * as path from 'path';
import { plans } from '@/lib/billing/plans';
import {
  storageLimitForPlan,
  storageLimitResponseBody,
  normalizeBytes,
  STORAGE_LIMIT_EXCEEDED,
} from '@/lib/billing/storage-limit';

/**
 * PR4 — storage quota enforcement is complete across every upload path.
 *
 * The audited P0 was that /api/documents/upload wrote file metadata into `documents`,
 * `documents` was not part of canonical tenant storage usage, and the route performed no
 * quota check at all. That path could therefore consume Bizosto-billed Storage without
 * ever reducing the tenant's entitlement — on a plan where storage is a sold, metered
 * dimension (Starter 20GB, Pro 75GB, Enterprise 250GB).
 *
 * The forensic inventory found four more bypasses of the same defect class:
 *
 *   PR4-B  `erp_file_versions` was unmetered. Usage summed `erp_files.size`, which holds
 *          only the CURRENT version, while storeVersion() writes a new physical object
 *          per version and keeps the old ones.
 *   PR4-C  The six browser-direct routes metered the `size` the CALLER declared. The
 *          bytes are written to the bucket by the browser, so a caller declaring
 *          `size: 0` stored a real object for free, repeatedly.
 *   PR4-D  `files` and `employeeDocuments` deletes cleared metadata only. Quota came
 *          back instantly while the object — and its bill — stayed. Upload, delete,
 *          repeat stored without bound on any plan.
 *   PR4-E  Every path used a read (checkStorageLimit) as a gate, so two concurrent
 *          uploads both observed the same free space and both passed.
 *
 * Concurrency and the live accounting are proven against the real Firestore emulator in
 * __tests__/integration/storage-quota-concurrency.emulator.test.ts. This suite pins the
 * wiring: that each surface reaches the canonical layer, spends only its own tenant's
 * quota, meters measured bytes, and returns the agreed error contract.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const GB = 1024 ** 3;

/** Every route that registers an object the browser uploaded directly. */
const BROWSER_DIRECT_ROUTES = [
  'app/api/production/files/upload/route.ts',
  'app/api/am/files/upload/route.ts',
  'app/api/client/files/upload/route.ts',
  'app/api/admin/files/create/route.ts',
  'app/api/hr/documents/upload/route.ts',
  'app/api/admin/hr/documents/upload/route.ts',
];

/** Every route whose bytes are streamed through the server. */
const SERVER_STREAMED_ROUTES = [
  'app/api/documents/upload/route.ts',
  'app/api/documents/[id]/version/route.ts',
  'app/api/files/upload/route.ts',
];

/** Delete routes that must free real bytes before they free quota. */
const DELETE_ROUTES = [
  'app/api/admin/files/delete/route.ts',
  'app/api/hr/documents/delete/route.ts',
  'app/api/admin/hr/documents/delete/route.ts',
];

describe('PR4: the sold storage limits are unchanged', () => {
  it('Starter 20GB, Pro 75GB, Enterprise 250GB', () => {
    expect(plans.starter.limits.storage).toBe(20 * GB);
    expect(plans.pro.limits.storage).toBe(75 * GB);
    expect(plans.enterprise.limits.storage).toBe(250 * GB);
  });

  it('resolves each tier from the canonical catalog', () => {
    expect(storageLimitForPlan('starter')).toBe(20 * GB);
    expect(storageLimitForPlan('pro')).toBe(75 * GB);
    expect(storageLimitForPlan('enterprise')).toBe(250 * GB);
  });

  it('trial is entitled to the Starter allowance, never to unlimited', () => {
    expect(storageLimitForPlan('trial')).toBe(20 * GB);
  });

  it('no plan — Enterprise included — is sold unlimited storage', () => {
    (['starter', 'trial', 'pro', 'enterprise'] as const).forEach((tier) => {
      expect(storageLimitForPlan(tier)).toBeGreaterThan(0);
    });
  });

  it('falls back to the smallest tier on an unrecognised plan, never to unlimited', () => {
    expect(storageLimitForPlan('not-a-plan' as never)).toBe(plans.starter.limits.storage);
  });
});

describe('PR4: byte counts are coerced safely', () => {
  it('floors a fractional size and rejects nonsense', () => {
    expect(normalizeBytes(10.9)).toBe(10);
    expect(normalizeBytes('2048')).toBe(2048);
    expect(normalizeBytes(-1)).toBe(0);
    expect(normalizeBytes(Number.NaN)).toBe(0);
    expect(normalizeBytes(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeBytes(undefined)).toBe(0);
    expect(normalizeBytes(null)).toBe(0);
  });
});

describe('PR4: the quota refusal is a stable machine-readable contract', () => {
  const body = storageLimitResponseBody({
    ok: false,
    limit: 20 * GB,
    used: 19 * GB,
    incoming: 2 * GB,
    plan: 'starter',
  });

  it('carries a stable error code the UI can branch on', () => {
    expect(body.error).toBe(STORAGE_LIMIT_EXCEEDED);
    expect(body.ok).toBe(false);
  });

  it('reports the limit, the usage and the requested bytes', () => {
    expect(body.limit).toBe(20 * GB);
    expect(body.used).toBe(19 * GB);
    expect(body.incoming).toBe(2 * GB);
    expect(body.plan).toBe('starter');
  });

  it('explains the refusal in the tenant’s own terms and leaks no other tenant', () => {
    expect(body.message).toContain('20.0GB');
    expect(body.message).toContain('19.0GB');
    expect(body.message).toMatch(/upgrade your plan/i);
    expect(JSON.stringify(body)).not.toMatch(/tenantId|uid|email/i);
  });
});

describe('PR4-A: the document library is enforced like every other upload path', () => {
  const service = read('lib/storage/storage-service.ts');

  it('reserves quota before a single byte reaches the bucket', () => {
    expect(service).toContain('reserveTenantStorageOrThrow({');
    expect(service.indexOf('reserveTenantStorageOrThrow')).toBeLessThan(
      service.indexOf('await file.save('),
    );
  });

  it('charges the real assembled length, never a caller-declared size', () => {
    expect(service).toContain('bytes: params.file.length,');
  });

  it('spends the tenant carried by the upload, never one from the request body', () => {
    expect(service).toContain('tenantId: params.tenantId,');
    expect(service).not.toMatch(/tenantId: (body|payload|formData)/);
  });

  it('releases the reservation on every path', () => {
    expect(service).toContain('} finally {');
    expect(service).toContain('await releaseTenantStorage(reservation);');
  });

  it('removes the object if the record could not be written', () => {
    // Otherwise releasing the reservation hands back quota for bytes still in the bucket.
    expect(service).toContain(
      'await file.delete({ ignoreNotFound: true }).catch(() => undefined);',
    );
  });

  it('stores a new version only after it has been admitted', () => {
    // createVersion() used to demote the original BEFORE uploading, so a refused upload
    // left the document with no version marked latest.
    const demote = service.indexOf('isLatestVersion: false,\n      updatedAt: now,');
    const upload = service.indexOf('const newDocId = await this.uploadFile({');
    expect(upload).toBeGreaterThan(-1);
    expect(demote).toBeGreaterThan(upload);
  });

  it('the upload route answers an over-quota caller with 403 and the contract', () => {
    const route = read('app/api/documents/upload/route.ts');
    expect(route).toContain('StorageLimitExceededError');
    expect(route).toContain('storageLimitResponseBody(error.check)');
    expect(route).toContain('{ status: 403 }');
  });

  it('the version route answers an over-quota caller the same way', () => {
    const route = read('app/api/documents/[id]/version/route.ts');
    expect(route).toContain('StorageLimitExceededError');
    expect(route).toContain('storageLimitResponseBody(error.check)');
    expect(route).toContain('{ status: 403 }');
  });
});

describe('PR4: every upload surface reaches the canonical enforcement layer', () => {
  it.each(SERVER_STREAMED_ROUTES)('%s enforces quota on server-held bytes', (rel) => {
    const src = read(rel);
    // Either the route reserves directly, or it delegates to a service that does.
    const delegates = /StorageService|FileManager/.test(src);
    expect(delegates || src.includes('reserveTenantStorage')).toBe(true);
  });

  it.each(BROWSER_DIRECT_ROUTES)('%s admits the upload before persisting', (rel) => {
    const src = read(rel);
    expect(src).toContain('admitTenantUpload(');
    expect(src).toContain('return uploadAdmissionRefusal(admission);');
  });

  it('no upload route carries a storage limit of its own', () => {
    [...BROWSER_DIRECT_ROUTES, ...SERVER_STREAMED_ROUTES].forEach((rel) => {
      const src = read(rel);
      // A hardcoded GB/TB figure in a route would be a second pricing table.
      expect(src).not.toMatch(/1024\s*\*\*\s*3|1073741824|21474836480/);
    });
  });
});

describe('PR4-C: the metered size is measured, never declared', () => {
  const helper = read('lib/storage/tenant-object.ts');
  const admission = read('lib/billing/upload-admission.ts');

  it('reads the size Cloud Storage recorded', () => {
    expect(helper).toContain('getMetadata()');
    expect(helper).toContain('Number(metadata?.size)');
  });

  it('fails closed when the object is missing or cannot be measured', () => {
    expect(helper).toContain("'Uploaded file was not found in storage.'");
    expect(helper).toContain("error: 'Uploaded file could not be measured.'");
    expect(helper).toContain("error: 'Uploaded file could not be identified.'");
  });

  it('refuses a path outside the caller’s own tenant prefix', () => {
    expect(helper).toContain('isTenantStoragePath(storagePath, tenantId)');
  });

  it('re-checks the app size ceiling against the real bytes', () => {
    // validateFile() only ever saw the declared size, and the app ceiling (25MB) is
    // stricter than the Storage-rules ceiling (50MB).
    expect(admission).toContain('measured.size > MAX_FILE_SIZE');
  });

  it('removes a rejected object instead of leaving a billable orphan', () => {
    expect(admission).toContain(
      'await deleteTenantObject(params.storagePath, tenantId, measured.generation);',
    );
  });

  it('never deletes a generation it did not measure', () => {
    // Deleting by path alone could destroy a replacement that landed after measurement.
    expect(helper).toContain('ifGenerationMatch: target');
    expect(helper).toContain('Refusing to delete without a generation');
    expect(admission).not.toMatch(/deleteTenantObject\(params\.storagePath, tenantId\)/);
  });

  it('recognises an already-registered object before charging for it again', () => {
    // The reservation is released once the record lands, so a retry would otherwise be
    // charged a second time for bytes canonical usage already contains.
    expect(admission).toContain('alreadyRegistered: true');
    expect(admission).toContain('existingGeneration === measured.generation');
    expect(admission.indexOf('existingGeneration === measured.generation')).toBeLessThan(
      admission.indexOf('const reservation = await reserveTenantStorage('),
    );
  });

  it('guards the metadata commit against a stale generation', () => {
    expect(admission).toContain('export async function commitUploadRegistration');
    expect(admission).toContain('stored > incoming');
  });

  it('reserves the measured size, not the declared one', () => {
    expect(admission).toContain('bytes: measured.size,');
  });

  it.each(BROWSER_DIRECT_ROUTES)('%s persists the measured size', (rel) => {
    expect(read(rel)).toContain('size: admission.bytes,');
  });
});

describe('PR4-D: quota is recovered only when the bytes are actually gone', () => {
  it.each(DELETE_ROUTES)('%s removes the Storage object before clearing the record', (rel) => {
    const src = read(rel);
    expect(src).toContain('await purgeRecordStorageObject(data)');
    expect(src).toContain('if (blocked) return blocked;');
    expect(src.indexOf('purgeRecordStorageObject')).toBeLessThan(src.indexOf('isDeleted: true'));
  });

  it.each(BROWSER_DIRECT_ROUTES)('%s derives its record id from the storage path', (rel) => {
    // A random id per POST let a retry after a partial failure write a SECOND live
    // record for one physical object, and canonical usage counted its bytes twice.
    const src = read(rel);
    expect(src).toContain('registrationIdForPath(storagePath)');
    expect(src).not.toMatch(/collection\('(files|employeeDocuments)'\)\.doc\(\)/);
    expect(src).not.toMatch(/collection\('(files|employeeDocuments)'\)\.add\(/);
  });

  it('a real removal failure blocks the delete so usage keeps counting the bytes', () => {
    const helper = read('lib/storage/tenant-object.ts');
    expect(helper).toContain('if (!purge.removed)');
    expect(helper).toContain('{ status: 502 }');
  });

  it.each(BROWSER_DIRECT_ROUTES)('%s commits through the guarded primitive', (rel) => {
    const src = read(rel);
    expect(src).toContain('await commitUploadRegistration({');
    expect(src).toContain('generation: admission.generation,');
    // A raw set() would skip the stale-generation guard.
    expect(src).not.toMatch(/await (docRef|ref)\.set\(payload, \{ merge: true \}\)/);
  });

  it('an unprovable legacy path blocks the delete instead of freeing quota', () => {
    // Every route has validated the tenant prefix at write time since S5, so an
    // unaddressable path is pre-S5 data. Its object cannot be proven to belong to this
    // tenant, so it is not deleted — and the record must not be cleared either, because
    // usage excludes soft-deleted records and clearing it would recover quota for bytes
    // still in the bucket.
    const helper = read('lib/storage/tenant-object.ts');
    expect(helper).toContain('addressable: false, removed: false');
    expect(helper).toContain('LEGACY_STORAGE_PATH');
    expect(helper).toContain('{ status: 409 }');
  });

  it('the purge is scoped to the record’s owning tenant', () => {
    // A super_admin may delete another tenant's record; the object still lives under
    // the OWNER's prefix, so the owner's id is what proves the path.
    const helper = read('lib/storage/tenant-object.ts');
    expect(helper).toContain("const tenantId = String(record?.tenantId || '');");
    expect(helper).toContain('getVerifiedTenantObjectSize(storagePath, tenantId)');
    expect(helper).toContain('deleteTenantObject(storagePath, tenantId, measured.generation)');
  });

  it('the document library already removed its object, and still does', () => {
    const service = read('lib/storage/storage-service.ts');
    const deleteStart = service.indexOf('static async deleteFile(');
    const body = service.slice(deleteStart, service.indexOf('static async createVersion('));
    expect(body).toContain('await file.delete({ ignoreNotFound: true });');
    expect(body.indexOf('file.delete')).toBeLessThan(body.indexOf('deletedAt:'));
  });
});

describe('PR4: usage and reservations cannot cross tenants', () => {
  const limit = read('lib/billing/storage-limit.ts');
  const reservation = read('lib/billing/storage-reservation.ts');

  it('every byte source is scoped to one tenant, by filter or by path', () => {
    const start = limit.indexOf('export function tenantStorageSources');
    const sources = limit.slice(start, limit.indexOf('\n}', start));

    // A source is tenant-scoped either by an explicit equality filter, or by hanging off
    // the tenant document itself (`tenants/{id}/...`), which is scoped by construction.
    // Count the subcollection sources first, then remove them so the rest are top-level.
    const subcollection = /\.doc\(id\)\s*\.collection\('[a-zA-Z_]+'\)/g;
    const subcollectionSources = (sources.match(subcollection) || []).length;
    const topLevelOnly = sources.replace(subcollection, '');
    const topLevelSources = (topLevelOnly.match(/\.collection\('(?!tenants')[a-zA-Z_]+'\)/g) || [])
      .length;
    const tenantFilters = (sources.match(/where\('tenantId', '==', id\)/g) || []).length;

    expect(topLevelSources).toBeGreaterThan(0);
    // Every top-level source carries its own tenant filter; nothing is left unscoped.
    expect(tenantFilters).toBe(topLevelSources);
    // And any subcollection source is reached through `tenants/{id}`.
    expect(subcollectionSources).toBeGreaterThan(0);
    expect(sources).not.toMatch(/collectionGroup\(/);
  });

  it('the reservation ledger is keyed by tenant and never read across tenants', () => {
    expect(reservation).toContain("adminDb.collection('tenant_storage_ledgers').doc(id)");
    expect(reservation).toContain("const reservationsRef = ledgerRef.collection('reservations');");
    expect(reservation).not.toMatch(/collectionGroup\(/);
  });

  it('a blank tenant is refused rather than defaulted', () => {
    expect(reservation).toContain('Tenant context is required to reserve storage.');
  });

  it('reservation ids stay opaque so they cannot escape their ledger', () => {
    expect(reservation).toContain('SAFE_RESERVATION_ID');
    expect(reservation).toContain("createHash('sha256')");
  });
});

describe('PR4: the reservation cannot leak or oversubscribe', () => {
  const src = read('lib/billing/storage-reservation.ts');

  it('decides inside a Firestore transaction, not a bare read', () => {
    expect(src).toContain('adminDb.runTransaction(async (tx) => {');
  });

  it('counts committed bytes and in-flight reservations together', () => {
    expect(src).toContain('const used = committed + held;');
    expect(src).toContain('if (used + incoming > limit)');
  });

  it('writes the ledger on every grant so concurrent grants conflict', () => {
    expect(src).toContain('reservationSeq');
    expect(src).toContain('lastReservedAt');
  });

  it('never writes on the denial path', () => {
    const denial = src.slice(src.indexOf('if (used + incoming > limit)'));
    const beforeReturn = denial.slice(0, denial.indexOf('return {'));
    expect(beforeReturn).not.toContain('tx.set');
  });

  it('sweeps expired reservations instead of letting them park quota', () => {
    expect(src).toContain('expiresAt > now');
    expect(src).toContain('tx.delete(doc.ref);');
  });

  it('reuses a live reservation for the same idempotency key', () => {
    expect(src).toContain('doc.id === reservationId');
    expect(src).toContain('alreadyHeld');
  });

  it('release never throws and is safe on a no-op reservation', () => {
    expect(src).toContain('if (!reservation?.reservationId || !reservation.tenantId) return;');
    expect(src).toContain('} catch (error) {');
  });

  it('holds reservations for minutes, not hours', () => {
    expect(src).toContain('export const STORAGE_RESERVATION_TTL_MS = 300_000;');
  });
});

describe('PR4: authorization on the upload paths is unchanged', () => {
  it('the document routes still require an authenticated tenant session', () => {
    [...SERVER_STREAMED_ROUTES].forEach((rel) => {
      const src = read(rel);
      expect(src).toMatch(/getCurrentUser\(\)/);
      expect(src).toContain('{ status: 401 }');
    });
  });

  it('the version route still restricts who may version a document', () => {
    const src = read('app/api/documents/[id]/version/route.ts');
    expect(src).toContain('document.uploadedBy === user.uid');
    expect(src).toContain('isAdminOrSuper(user.role)');
    expect(src).toContain('original.tenantId !== session.tenantId');
  });

  it('the client upload route is still client-gated', () => {
    expect(read('app/api/client/files/upload/route.ts')).toContain('await requireClient()');
  });

  it('the HR routes are still HR-gated', () => {
    expect(read('app/api/hr/documents/upload/route.ts')).toContain('await requireHrAccess()');
    expect(read('app/api/admin/hr/documents/upload/route.ts')).toContain('await requireHrAccess()');
  });

  // A caller who may not upload here must never reach the bucket or the ledger: admission
  // performs a Storage metadata read, opens a Firestore transaction, and on refusal
  // DELETES the object. All of that has to sit behind the route's ownership checks.
  const OWNERSHIP_GATE: Array<[string, string]> = [
    ['app/api/client/files/upload/route.ts', "String(project.clientId || '') !== auth.clientId"],
    ['app/api/am/files/upload/route.ts', "String((project as any).tenantId || '') !== me.tenantId"],
    [
      'app/api/production/files/upload/route.ts',
      "String((project as any).tenantId || '') !== me.tenantId",
    ],
    ['app/api/admin/files/create/route.ts', 'project?.tenantId !== me.tenantId'],
    ['app/api/hr/documents/upload/route.ts', "'Employee not found'"],
    ['app/api/admin/hr/documents/upload/route.ts', 'await requireHrAccess()'],
  ];

  it.each(OWNERSHIP_GATE)('%s decides quota only after authorization', (rel, gate) => {
    const src = read(rel);
    const gateIndex = src.indexOf(gate);
    expect(gateIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(src.indexOf('admitTenantUpload('));
  });
});

describe('PR4: STOR-2 Storage rules are intact', () => {
  const rules = read('storage.rules');

  it('client-files stays restricted to the client role', () => {
    expect(rules).toContain('function canClientFiles(tenantId) {');
    expect(rules).toContain("return tenantRole(tenantId, ['client']);");
  });

  it('every write prefix still carries a size ceiling', () => {
    const grants = rules.match(/allow create, update: if [^;]+;/g) || [];
    expect(grants.length).toBeGreaterThan(0);
    grants.forEach((grant) => expect(grant).toContain('withinSizeLimit()'));
  });

  it('browser deletes remain denied so removal goes through the Admin SDK', () => {
    expect(rules).toContain('allow delete: if false;');
    expect(rules).not.toMatch(/allow delete: if (?!false)/);
  });

  it('anything outside a tenant prefix is still denied', () => {
    expect(rules).toContain('match /{allPaths=**} {\n      allow read, write: if false;');
  });

  it('rules are not asked to enforce byte quotas they cannot see', () => {
    // Storage rules cannot read Firestore usage; quota lives in the API layer. The word
    // "quota" appears only in the comment explaining why brand/** sits outside it.
    const directives = rules
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(directives).not.toMatch(/storageLimit|quota|plan/i);
  });

  it('browser writes cannot replace an object that has already been measured', () => {
    ['projects', 'client-files', 'employees', 'employee-documents'].forEach((prefix) => {
      const start = rules.indexOf(`match /tenants/{tenantId}/${prefix}/{allPaths=**}`);
      expect(start).toBeGreaterThan(-1);
      // The rule block ends at the first closing brace on its own line.
      const block = rules.slice(start, rules.indexOf('\n    }', start));
      expect(block).toContain('allow update: if false;');
      expect(block).not.toMatch(/allow create, update:/);
    });
  });
});
