import * as fs from 'fs';
import * as path from 'path';

const ROUTE = 'app/api/super_admin/restore/route.ts';
const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('super_admin restore — dry-run + isolated apply (DR-03 / PR5)', () => {
  const source = read(ROUTE);
  const getBody = source.slice(
    source.indexOf('export async function GET'),
    source.indexOf('export async function POST'),
  );
  const postBody = source.slice(source.indexOf('export async function POST'));
  // The apply path is POST's two passes. They are separate functions so the handler stays
  // readable, so the invariants below are pinned where they now live and POST is checked to
  // call them in the order that makes a half-applied restore impossible.
  const verifyBody = source.slice(
    source.indexOf('async function verifySelectedFiles'),
    source.indexOf('async function applyVerifiedFiles'),
  );
  const applyBody = source.slice(
    source.indexOf('async function applyVerifiedFiles'),
    source.indexOf('function statusForError'),
  );

  it('gates both GET and POST behind super_admin', () => {
    expect(source).toContain("from '../_utils'");
    expect(getBody).toContain('requireSuperAdmin(');
    expect(postBody).toContain('requireSuperAdmin(');
  });

  it('the GET dry-run writes nothing', () => {
    for (const write of ['.set(', '.add(', '.update(', '.commit(', '.save(']) {
      expect(getBody).not.toContain(write);
    }
  });

  it('POST restores only into the isolated restore_<runDate>__ prefix', () => {
    expect(applyBody).toContain('restore_${auditContext.runDate}__');
    expect(applyBody).toContain('adminDb.collection(restoreCollection)');
    // Only POST reaches the writing pass; the dry run must never call it.
    expect(postBody).toContain('applyVerifiedFiles(');
    expect(getBody).not.toContain('applyVerifiedFiles(');
  });

  it('POST aborts on any checksum mismatch before writes', () => {
    expect(verifyBody).toContain('sha256');
    expect(verifyBody).toMatch(/actualSha256 !== file\.sha256/);
    expect(verifyBody).toMatch(/throw new Error\(`Checksum mismatch/);
    // Verification of every file completes before the first write is issued.
    expect(postBody.indexOf('verifySelectedFiles(')).toBeGreaterThan(-1);
    expect(postBody.indexOf('verifySelectedFiles(')).toBeLessThan(
      postBody.indexOf('applyVerifiedFiles('),
    );
  });

  it('audits successful applies and aborted/failed restore attempts', () => {
    expect(source).toContain("adminDb.collection('restore_audit')");
    expect(applyBody).toContain("status: 'applied'");
    expect(source).toContain("status: 'aborted'");
    expect(postBody).toContain("reason: 'restore_apply_failed'");
  });

  it('accepts only a canonical dated manifest path', () => {
    expect(source).toContain('/^backups\\/\\d{4}-\\d{2}-\\d{2}\\/manifest\\.json$/');
    expect(source).toContain('manifestPath !== `backups/${parsed.runDate}/manifest.json`');
    expect(getBody).toContain('isBackupManifestPath(');
    expect(postBody).toContain('isBackupManifestPath(');
  });

  it('requires each manifest file to resolve to its declared run/tenant/collection path', () => {
    expect(source).toContain('expectedFilePath(runDate');
    expect(source).toContain('file.path !== expectedFilePath(runDate');
    expect(source).toContain('SAFE_SEGMENT_RE');
    expect(source).toContain('SHA256_RE');
  });

  it('pins payload record counts, document ids and tenant ownership before apply', () => {
    expect(source).toContain('value.length !== file.records');
    expect(source).toContain('ids.has(id)');
    expect(source).toContain("file.tenantId !== '__no_tenant__'");
    expect(source).toContain("String(doc.tenantId || '') !== file.tenantId");
  });

  it('does not report success for an empty scoped restore selection', () => {
    expect(postBody).toContain("error: 'No backup files matched the restore scope'");
    expect(postBody).toContain('status: 404');
  });
});
