import fs from 'fs';
import path from 'path';
import {
  COLLECTION_REGISTRY,
  BACKED_UP_CLASSES,
  getBackupCollections,
  isClassified,
  type BackupClass,
} from '@/lib/backup/backup-registry';

/**
 * P1-6a — every top-level collection is classified, and the backup covers the durable + audit set.
 *
 * The nightly backup used to cover seven hardcoded collections while the app wrote tenant data
 * to ~40 more, including the append-only finance ledger. Nothing detected the drift. This test
 * walks app/ and lib/, extracts every top-level `collection('name')` reference, and fails the
 * build if any is not classified in the registry — so coverage cannot silently regress when a
 * new collection is added.
 */

const ROOT = process.cwd();

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (/\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every distinct top-level collection referenced in code (excludes `.doc(x).collection(y)`). */
function referencedTopLevelCollections(): Set<string> {
  const refs = new Set<string>();
  const files = [walk(path.join(ROOT, 'app')), walk(path.join(ROOT, 'lib'))].flat();

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /(?:adminDb|adminDB|db|firestore)\.collection\('([a-z_]+)'\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(src)) !== null) {
      const preceding = src.slice(Math.max(0, match.index - 8), match.index);
      // Skip subcollection access: `.doc(...)` immediately before `.collection(`.
      if (/\.doc\([^)]*\)\s*$/.test(preceding)) continue;
      refs.add(match[1]);
    }
  }
  return refs;
}

describe('P1-6a: the registry classifies every referenced top-level collection', () => {
  const referenced = referencedTopLevelCollections();

  it('discovers a realistic number of collections', () => {
    expect(referenced.size).toBeGreaterThan(80);
  });

  it('every referenced collection is classified — no silent coverage gap', () => {
    const unclassified = [...referenced].filter((name) => !isClassified(name)).sort();
    if (unclassified.length > 0) {
      throw new Error(
        'Top-level collection(s) referenced in code but not classified in\n' +
          'lib/backup/backup-registry.ts. Add each with a class (durable | audit | ephemeral |\n' +
          'subcollection) and a one-line reason so backup coverage cannot silently regress:\n' +
          unclassified.map((name) => `  - ${name}`).join('\n'),
      );
    }
    expect(unclassified).toEqual([]);
  });

  it('every registry entry has a valid class and a non-empty reason', () => {
    const valid: BackupClass[] = ['durable', 'audit', 'ephemeral', 'subcollection'];
    const bad = Object.entries(COLLECTION_REGISTRY).filter(
      ([, entry]) => !valid.includes(entry.class) || !entry.reason.trim(),
    );
    expect(bad.map(([name]) => name)).toEqual([]);
  });
});

describe('P1-6a: the backed-up set is the durable + audit classes', () => {
  const backed = getBackupCollections();

  it('backs up the durable and audit classes only', () => {
    expect([...BACKED_UP_CLASSES].sort()).toEqual(['audit', 'durable']);
    for (const name of backed) {
      expect(['durable', 'audit']).toContain(COLLECTION_REGISTRY[name].class);
    }
  });

  it('includes the financial and business records that must never be lost', () => {
    for (const name of [
      'finance_ledger',
      'invoices',
      'payments',
      'credit_notes',
      'deals',
      'leads',
      'orders',
      'expenses',
      'payroll',
      'tax_rates',
      'projects',
      'clients',
      'users',
      'tenants',
    ]) {
      expect(backed).toContain(name);
    }
  });

  it('includes the append-only audit trails', () => {
    for (const name of ['finance_ledger', 'audit_logs', 'billing_state_audit']) {
      expect(backed).toContain(name);
    }
  });

  it('excludes high-volume, low-restore-value noise that would inflate cost', () => {
    for (const name of [
      'csp_violations',
      'notifications',
      'activity_feed',
      'api_usage_logs',
      'automation_workflow_runs',
      'sessions',
      'email_otps',
      'report_cache',
    ]) {
      expect(backed).not.toContain(name);
    }
  });

  it('excludes single-use nonces and dead-letter queues', () => {
    for (const name of [
      'stripe_connect_oauth_states',
      'dead_letter_backups',
      'dead_letter_webhooks',
    ]) {
      expect(backed).not.toContain(name);
    }
  });

  it('does not try to back up subcollections as if they were top-level', () => {
    for (const name of ['counters', 'messages']) {
      expect(COLLECTION_REGISTRY[name].class).toBe('subcollection');
      expect(backed).not.toContain(name);
    }
  });

  it('returns a sorted, de-duplicated list', () => {
    expect(backed).toEqual([...new Set(backed)].sort());
  });
});

describe('P1-6a: the backup cron reads the registry and prunes old backups', () => {
  const cron = fs.readFileSync(path.join(ROOT, 'app/api/cron/backup/route.ts'), 'utf8');

  it('derives its collection set from the registry, not a hardcoded list', () => {
    expect(cron).toContain("import { getBackupCollections } from '@/lib/backup/backup-registry'");
    expect(cron).toContain('const BACKUP_COLLECTIONS = getBackupCollections();');
    expect(cron).not.toMatch(/const BACKUP_COLLECTIONS = \[\s*'users'/);
  });

  it('has a bounded retention window', () => {
    expect(cron).toContain('RETENTION_DAYS');
    expect(cron).toContain('BACKUP_RETENTION_DAYS');
  });

  it('prunes only dated backup folders and never the current run', () => {
    expect(cron).toContain('pruneOldBackups');
    expect(cron).toContain('fileDate < cutoff && fileDate !== runDate');
    expect(cron).toMatch(/backups\\\/\(\\d\{4\}-\\d\{2\}-\\d\{2\}\)/);
  });

  it('prunes only after the new backup is written, and never fails the run on a prune error', () => {
    expect(cron.indexOf('manifestPath')).toBeLessThan(
      cron.indexOf('pruneOldBackups(bucket, runDate)'),
    );
    const pruneCall = cron.slice(cron.indexOf('retention = await pruneOldBackups'));
    expect(pruneCall).toContain('catch');
  });
});
