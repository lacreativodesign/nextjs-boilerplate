import fs from 'fs';
import path from 'path';
import { getStorageBucketName } from '@/lib/storage/bucket';
import { getBackupBucketName } from '@/lib/backup/backup-bucket';

/**
 * P1-6a — one storage-bucket resolver, no dead env fallback.
 *
 * Ten server-side storage call sites each inlined the same chain:
 *
 *   process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FB_STORAGE || undefined
 *
 * `NEXT_PUBLIC_FB_STORAGE` is set nowhere — the real public var is
 * `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`. So whenever the server var was unset, every one of
 * those sites silently used the Admin SDK default bucket instead of the configured one, and
 * the legacy name could never resolve. This mirrors the backup cron's old hardcoded
 * `bizosto-backups` fallback, which pointed at a bucket that does not exist.
 *
 * These assertions pin the single resolver and prove no caller re-inlines the broken chain.
 */

const STORAGE_CALLERS = [
  'lib/export/bulk-export.ts',
  'lib/files/file-manager.ts',
  'lib/integrations/docusign.ts',
  'lib/storage/storage-service.ts',
  'lib/import/bulk-import.ts',
];

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('P1-6a: the resolver prefers configured vars and never invents a bucket', () => {
  const KEYS = ['FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('prefers the explicit server var', () => {
    process.env.FIREBASE_STORAGE_BUCKET = 'server-bucket.app';
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'public-bucket.app';
    expect(getStorageBucketName()).toBe('server-bucket.app');
  });

  it('falls back to the real public Firebase bucket var', () => {
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'public-bucket.app';
    expect(getStorageBucketName()).toBe('public-bucket.app');
  });

  it('returns undefined when neither is set, so callers use the Admin SDK default', () => {
    expect(getStorageBucketName()).toBeUndefined();
  });

  it('never returns the phantom bizosto-backups bucket', () => {
    expect(getStorageBucketName()).not.toBe('bizosto-backups');
  });

  it('does not consult the legacy NEXT_PUBLIC_FB_STORAGE name', () => {
    process.env.NEXT_PUBLIC_FB_STORAGE = 'legacy-should-be-ignored.app';
    try {
      expect(getStorageBucketName()).toBeUndefined();
    } finally {
      delete process.env.NEXT_PUBLIC_FB_STORAGE;
    }
  });
});

describe('P1-6a: backup and restore resolve the same bucket as everything else', () => {
  const saved = process.env.FIREBASE_STORAGE_BUCKET;
  afterEach(() => {
    if (saved === undefined) delete process.env.FIREBASE_STORAGE_BUCKET;
    else process.env.FIREBASE_STORAGE_BUCKET = saved;
  });

  it('the backup helper delegates to the single resolver', () => {
    process.env.FIREBASE_STORAGE_BUCKET = 'shared-bucket.app';
    expect(getBackupBucketName()).toBe(getStorageBucketName());
    expect(getBackupBucketName()).toBe('shared-bucket.app');
  });

  it('the backup helper still no longer hardcodes bizosto-backups', () => {
    const src = read('lib/backup/backup-bucket.ts');
    expect(src).toContain("from '@/lib/storage/bucket'");
    const codeOnly = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
      .join('\n');
    expect(codeOnly).not.toContain('bizosto-backups');
  });
});

describe('P1-6a: no storage caller re-inlines the broken bucket chain', () => {
  it.each(STORAGE_CALLERS)('%s resolves the bucket through the shared helper', (rel) => {
    const src = read(rel);
    expect(src).toContain("import { getStorageBucketName } from '@/lib/storage/bucket'");
    expect(src).toContain('getStorageBucketName()');
  });

  it.each(STORAGE_CALLERS)('%s no longer references the dead legacy env var', (rel) => {
    expect(read(rel)).not.toContain('NEXT_PUBLIC_FB_STORAGE');
  });

  it('no source file outside the resolver re-inlines the old chain', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.name === 'node_modules' || full.includes('__tests__')) continue;
        if (entry.isDirectory()) walk(full);
        else if (
          /\.ts$/.test(entry.name) &&
          !full.endsWith(path.join('lib', 'storage', 'bucket.ts'))
        ) {
          // The resolver's own doc comment quotes the legacy name to explain what it replaced.
          const src = fs.readFileSync(full, 'utf8');
          if (src.includes('process.env.NEXT_PUBLIC_FB_STORAGE')) {
            offenders.push(path.relative(process.cwd(), full));
          }
        }
      }
    };
    walk(path.join(process.cwd(), 'lib'));
    walk(path.join(process.cwd(), 'app'));
    expect(offenders).toEqual([]);
  });
});
