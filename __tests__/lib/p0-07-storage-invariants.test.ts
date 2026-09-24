import fs from 'fs';
import path from 'path';

/**
 * P0-07 — repository-wide invariants for Firebase Storage.
 *
 * The behavioural suites prove each refactored surface. These scans make the next surface
 * safe by default: they fail the build the moment new product code
 *
 *   - resolves a bucket without the canonical resolver,
 *   - signs a URL anywhere but the shared short-lived minter,
 *   - writes, reads or requests a Firebase download token,
 *   - calls getDownloadURL() from the browser,
 *   - trusts or returns a stored downloadUrl.
 *
 * Each allow-list entry is a deliberate, commented exception.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments removed, so prose explaining a banned pattern never trips a scan. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) out.push(rel.split(path.sep).join('/'));
  }
  return out;
}

const PRODUCT_SOURCES = [...walk('app'), ...walk('lib'), ...walk('components'), ...walk('hooks')];

const offenders = (pattern: RegExp, allow: string[] = []) =>
  PRODUCT_SOURCES.filter((rel) => !allow.includes(rel) && pattern.test(code(rel)));

describe('P0-07: every normal product storage path uses the canonical bucket', () => {
  /**
   * Backups resolve through lib/backup/backup-bucket.ts ON PURPOSE, so a backup location
   * can diverge from product storage; those three files are the only other bucket() users.
   */
  const ALLOWED = [
    'lib/storage/product-bucket.ts',
    'lib/backup/restore.ts',
    'app/api/cron/backup/route.ts',
    'app/api/super_admin/restore/route.ts',
  ];

  it('no product file calls adminStorage.bucket( outside the resolver and the backup path', () => {
    expect(offenders(/adminStorage\s*\.\s*bucket\s*\(/, ALLOWED)).toEqual([]);
  });

  it('nothing calls .bucket() with no name — the Admin app has no default bucket', () => {
    expect(offenders(/\.bucket\(\s*\)/)).toEqual([]);
  });

  it('the backup files resolve through the backup helper, not a bare bucket()', () => {
    for (const rel of ALLOWED.slice(1)) {
      expect(code(rel)).toMatch(/adminStorage\.bucket\((BACKUP_BUCKET|getBackupBucketName\(\))\)/);
    }
  });

  it('the resolver consults getStorageBucketName() and fails closed when it is unset', () => {
    const src = code('lib/storage/product-bucket.ts');
    expect(src).toContain('getStorageBucketName()');
    expect(src).toMatch(/if \(!bucketName\) throw new StorageBucketNotConfiguredError\(\)/);
  });
});

describe('P0-07: signed URLs are minted in one place, briefly', () => {
  it('only lib/storage/protected-download.ts calls getSignedUrl', () => {
    expect(offenders(/getSignedUrl\s*\(/, ['lib/storage/protected-download.ts'])).toEqual([]);
  });

  it('the minter clamps every TTL to the 15-minute ceiling', () => {
    const src = code('lib/storage/protected-download.ts');
    expect(src).toMatch(/export const PROTECTED_DOWNLOAD_TTL_MS = 5 \* 60 \* 1000;/);
    expect(src).toMatch(/export const MAX_PROTECTED_DOWNLOAD_TTL_MS = 15 \* 60 \* 1000;/);
    expect(src).toMatch(/Math\.min\([\s\S]*?MAX_PROTECTED_DOWNLOAD_TTL_MS/);
  });

  it('no product code persists a signed URL: stored URL fields are only ever written null', () => {
    const writes = PRODUCT_SOURCES.flatMap((rel) =>
      [...code(rel).matchAll(/\b(previewUrl|storageUrl|signedUrl)\s*:\s*([^,\n}]+)/g)]
        .filter(([, , value]) => !/^\s*(null|undefined)\b/.test(value))
        .filter(([, , value]) => !/^\s*(string|boolean|number)\b/.test(value)) // type annotations
        .filter(([, , value]) => !/^\s*(minted\.url|previewUrl|string \|)/.test(value))
        .map(([match]) => `${rel}: ${match.trim()}`),
    );
    // The only remaining non-null signedUrl is the value RETURNED (not stored) to the
    // caller who just ran an export; it is never written to Firestore.
    expect(writes.filter((w) => !w.startsWith('components/'))).toEqual([]);
  });
});

describe('P0-07: no product code path creates or requests a Firebase download token', () => {
  it('firebaseStorageDownloadTokens is named only by the code that removes it', () => {
    expect(offenders(/firebaseStorageDownloadTokens/, ['lib/storage/download-tokens.ts'])).toEqual(
      [],
    );
  });

  it('no product code builds a tokenized firebasestorage URL', () => {
    expect(offenders(/alt=media&token=/)).toEqual([]);
  });

  it('no browser code calls getDownloadURL()', () => {
    expect(offenders(/\bgetDownloadURL\b/)).toEqual([]);
  });

  it('no product code imports firebase/storage read APIs (READ is denied by storage.rules)', () => {
    expect(
      offenders(/from 'firebase\/storage'[\s\S]*?/).filter((rel) =>
        /import\s*\{[^}]*\b(getBytes|getBlob|getStream|getMetadata|listAll|list)\b[^}]*\}\s*from 'firebase\/storage'/.test(
          code(rel),
        ),
      ),
    ).toEqual([]);
  });
});

describe('P0-07: stored bearer URLs are neither trusted nor returned', () => {
  const UPLOAD_ROUTES = [
    'app/api/am/files/upload/route.ts',
    'app/api/admin/files/create/route.ts',
    'app/api/client/files/upload/route.ts',
    'app/api/production/files/upload/route.ts',
    'app/api/hr/documents/upload/route.ts',
    'app/api/admin/hr/documents/upload/route.ts',
  ];

  it.each(UPLOAD_ROUTES)('%s never reads downloadUrl from the request', (rel) => {
    const src = code(rel);
    expect(src).not.toMatch(/body\??\.\s*downloadUrl/);
    expect(src).toMatch(/downloadUrl:\s*null/);
    expect(src).toMatch(/isSurfaceStoragePath\(/);
  });

  const LIST_ROUTES = [
    'app/api/am/files/list/route.ts',
    'app/api/admin/files/list/route.ts',
    'app/api/production/files/list/route.ts',
    'app/api/admin/production/files/list/route.ts',
    'app/api/client/files/list/route.ts',
    'app/api/client/projects/get/route.ts',
  ];

  it.each(LIST_ROUTES)('%s returns a same-origin downloadHref, never the stored URL', (rel) => {
    const src = code(rel);
    expect(src).not.toMatch(/downloadUrl\s*:/);
    expect(src).toContain('projectFileDownloadHref(');
  });

  it.each(['app/api/hr/documents/list/route.ts', 'app/api/admin/hr/documents/list/route.ts'])(
    '%s strips the stored downloadUrl before spreading the record',
    (rel) => {
      expect(code(rel)).toMatch(/const \{ downloadUrl: _legacyBearerUrl, \.\.\.data \}/);
    },
  );

  it('no protected UI renders a stored downloadUrl or previewUrl', () => {
    const UI = [...walk('app'), ...walk('components')].filter((rel) => rel.endsWith('.tsx'));
    const bad = UI.filter((rel) =>
      /\.(downloadUrl|previewUrl|screenshotUrl)\b/.test(code(rel)),
    ).filter(
      // docusign's downloadUrl is minted per status request (15-minute ceiling), not stored;
      // ImportErrorList receives a prop, not a record field.
      (rel) =>
        rel !== 'app/admin/settings/integrations/docusign/page.tsx' &&
        rel !== 'components/import-export/ImportErrorList.tsx',
    );
    expect(bad).toEqual([]);
  });
});

describe('P0-07: storage.rules changes only what P0-07 proved', () => {
  const rules = read('storage.rules').replace(/\/\/.*/g, '');

  it('denies browser READ on exactly the four protected file prefixes', () => {
    for (const prefix of ['projects', 'client-files', 'employees', 'employee-documents']) {
      const start = rules.indexOf(`match /tenants/{tenantId}/${prefix}/{allPaths=**}`);
      // Bounded by the next match, not the next brace: `{tenantId}` is a brace too.
      expect(start).toBeGreaterThan(-1);
      const block = rules.slice(start, rules.indexOf('match /', start + 1));
      expect(block).toContain('allow read: if false;');
    }
  });

  it('keeps brand/** READ for the tenant (logos are public-facing) and nothing wider', () => {
    expect(rules).toContain('allow read: if inCallerTenant(tenantId) || isSuperAdmin();');
    expect((rules.match(/allow read: if (?!false)/g) || []).length).toBe(1);
  });
});
