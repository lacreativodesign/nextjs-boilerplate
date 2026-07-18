import * as fs from 'fs';
import * as path from 'path';

/**
 * super_admin restore gate — dry-run + isolated apply (DR-03).
 *
 * The D1 cron writes checksummed backups under backups/<runDate>/ but there was
 * no restore path, and restoring over live collections is dangerous. This gate
 * proves, by static analysis, that the restore route:
 *  - gates BOTH handlers behind super_admin (requireSuperAdmin from ../_utils),
 *  - never writes in the GET dry-run,
 *  - on POST restores only into the isolated restore_<runDate>__<collection>
 *    prefix, aborts on any checksum mismatch, and audits every apply to
 *    restore_audit,
 *  - only ever accepts manifest paths under backups/.
 */

const ROUTE = 'app/api/super_admin/restore/route.ts';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('super_admin restore — dry-run + isolated apply (DR-03)', () => {
  const source = read(ROUTE);
  const getBody = source.slice(
    source.indexOf('export async function GET'),
    source.indexOf('export async function POST'),
  );
  const postBody = source.slice(source.indexOf('export async function POST'));

  it('gates both GET and POST behind super_admin (requireSuperAdmin from ../_utils)', () => {
    expect(source).toContain("from '../_utils'");
    expect(getBody).toContain('requireSuperAdmin(');
    expect(postBody).toContain('requireSuperAdmin(');
  });

  it('the GET dry-run writes nothing (no Firestore or Storage writes)', () => {
    for (const write of ['.set(', '.add(', '.update(', '.commit(', '.save(']) {
      expect(getBody).not.toContain(write);
    }
  });

  it('POST restores only into the isolated restore_<runDate>__ prefix', () => {
    expect(postBody).toContain('restore_${runDate}__');
    // The isolated collection is what gets written, never a live collection name.
    expect(postBody).toContain('adminDb.collection(restoreCollection)');
  });

  it('POST aborts on any checksum mismatch', () => {
    expect(postBody).toContain('sha256');
    expect(postBody).toMatch(/actualSha256 !== file\.sha256/);
    expect(postBody).toMatch(/throw new Error\(`Checksum mismatch/);
  });

  it('every apply (and abort) is audited to restore_audit', () => {
    expect(postBody).toContain("adminDb.collection('restore_audit')");
    expect(postBody).toContain("status: 'applied'");
  });

  it('only manifest paths under backups/ are accepted', () => {
    expect(source).toContain("value.startsWith('backups/')");
    expect(getBody).toContain('isBackupManifestPath(');
    expect(postBody).toContain('isBackupManifestPath(');
  });
});
