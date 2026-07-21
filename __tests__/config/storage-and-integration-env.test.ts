import fs from 'fs';
import path from 'path';
import { getBackupBucketName } from '@/lib/backup/backup-bucket';

/**
 * Q9 — env/codebase sync guard.
 *
 * 1. Backups/restore must resolve the real Cloud Storage bucket, never the
 *    nonexistent hardcoded 'bizosto-backups' (which silently broke backups).
 * 2. The dead lib/firebase.ts (which read a nonexistent NEXT_PUBLIC_FB_* var set)
 *    must stay deleted.
 * 3. Twilio config must accept TWILIO_PHONE_NUMBER (the name provisioned in Vercel),
 *    not only TWILIO_FROM_NUMBER.
 */

const read = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('getBackupBucketName', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('prefers FIREBASE_STORAGE_BUCKET', () => {
    process.env.FIREBASE_STORAGE_BUCKET = 'explicit-bucket';
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'public-bucket';
    expect(getBackupBucketName()).toBe('explicit-bucket');
  });

  it('falls back to the public Firebase bucket', () => {
    delete process.env.FIREBASE_STORAGE_BUCKET;
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'public-bucket';
    expect(getBackupBucketName()).toBe('public-bucket');
  });

  it('returns undefined (SDK default) when neither is set — never a hardcoded bucket', () => {
    delete process.env.FIREBASE_STORAGE_BUCKET;
    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    expect(getBackupBucketName()).toBeUndefined();
  });
});

describe('backup/restore no longer reference a nonexistent bucket', () => {
  const files = [
    'app/api/cron/backup/route.ts',
    'app/api/super_admin/restore/route.ts',
    'lib/backup/restore.ts',
  ];

  it("no source file falls back to the 'bizosto-backups' bucket", () => {
    for (const rel of files) {
      expect(read(rel)).not.toContain('bizosto-backups');
    }
  });

  it('backup/restore resolve the bucket via getBackupBucketName()', () => {
    for (const rel of files) {
      expect(read(rel)).toContain('getBackupBucketName()');
    }
  });
});

describe('dead lib/firebase.ts stays deleted', () => {
  it('lib/firebase.ts does not exist', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'lib/firebase.ts'))).toBe(false);
  });
});

describe('Twilio accepts the Vercel-provisioned TWILIO_PHONE_NUMBER', () => {
  const files = [
    'lib/sms/sms-service.ts',
    'lib/integrations/twilio.ts',
    'app/api/integrations/twilio/connection/route.ts',
  ];
  it('every Twilio from-number read falls back to TWILIO_PHONE_NUMBER', () => {
    for (const rel of files) {
      expect(read(rel)).toContain('TWILIO_PHONE_NUMBER');
    }
  });
});
