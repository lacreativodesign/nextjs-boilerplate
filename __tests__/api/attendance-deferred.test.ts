import fs from 'fs';
import path from 'path';
import { PUBLIC_ROUTES } from '@/lib/api/route-contract';

/**
 * T-1 — the attendance feature is deferred, and stays safely deferred.
 *
 * Attendance shipped live in the HR sidebar for every Pro/Enterprise tenant and never worked:
 *   - Its only writer was /api/login-stamp, which nothing in the app ever called. The
 *     `attendance` collection therefore never received a single document, so every screen
 *     showed an empty grid, $0 payroll, and "everyone absent".
 *   - That writer took a session cookie out of the JSON request body (a credential-in-body
 *     antipattern sitting on the reviewed PUBLIC route list) and appended each event to a single
 *     `logs` array on one doc per user — an unbounded array that breaches Firestore's 1 MB
 *     document ceiling at roughly 10k logins and then hard-fails that user's writes forever.
 *   - /api/hr/attendance and /api/hr/payroll called only getCurrentUser(), so ANY authenticated
 *     user of the tenant — including the external `client` role — could read the whole employee
 *     roster with email addresses, hourly rates and computed salaries.
 *
 * The remediation removes the dead writer, restores requireHrAccess() on the two unguarded
 * readers, caps the unbounded reads, and unlinks both screens from navigation. The pages and
 * reader routes stay on disk for the rebuild (which starts from the employees-vs-users identity
 * decision), so this test pins every part of that state rather than the join logic itself.
 */

const ROOT = process.cwd();

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

/** Every .ts/.tsx file under app/ and lib/. */
function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const SOURCE_FILES = [walk(path.join(ROOT, 'app')), walk(path.join(ROOT, 'lib'))].flat();

/**
 * Files that touch the `attendance` collection, top-level or as a subcollection path.
 *
 * The name is matched to its closing quote on purpose. `attendance_logs` is a SEPARATE
 * collection — a fourth identity space, read only by the two HR overview routes, both already
 * behind requireHrAccess() and already capped. It is out of scope here and must not be swept
 * into this list by a prefix match.
 */
function attendanceFiles(): string[] {
  return SOURCE_FILES.filter((file) =>
    // walk() yields absolute paths — read() joins against ROOT and would double-prefix them.
    /\.collection\(\s*(['"`])attendance(?:\/[^'"`]*)?\1/.test(fs.readFileSync(file, 'utf8')),
  )
    .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
    .sort();
}

/** The five read-only routes that survive the deferral. */
const READERS = [
  'app/api/hr/attendance/absentees/route.ts',
  'app/api/hr/attendance/employee/route.ts',
  'app/api/hr/attendance/list/route.ts',
  'app/api/hr/attendance/route.ts',
  'app/api/hr/payroll/route.ts',
];

/** The three readers that scanned a whole collection with no bound. */
const BOUNDED_READERS = [
  'app/api/hr/attendance/route.ts',
  'app/api/hr/payroll/route.ts',
  'app/api/hr/attendance/absentees/route.ts',
];

describe('T-1: the dead attendance writer is gone', () => {
  it('removes /api/login-stamp entirely', () => {
    expect(exists('app/api/login-stamp/route.ts')).toBe(false);
    expect(exists('app/api/login-stamp')).toBe(false);
  });

  it('drops login-stamp from the reviewed public route surface', () => {
    expect(PUBLIC_ROUTES['login-stamp']).toBeUndefined();
  });

  it('leaves no code path that writes to the attendance collection', () => {
    expect(attendanceFiles()).toEqual([...READERS].sort());

    const writers = READERS.filter((rel) => /\.(set|add|update)\(/.test(read(rel)));
    expect(writers).toEqual([]);
  });

  it('leaves no unbounded arrayUnion on an attendance document', () => {
    const offenders = READERS.filter((rel) => read(rel).includes('arrayUnion'));
    expect(offenders).toEqual([]);
  });
});

describe('T-1: the attendance readers are guarded and bounded', () => {
  it.each(['app/api/hr/attendance/route.ts', 'app/api/hr/payroll/route.ts'])(
    '%s enforces requireHrAccess, not a bare getCurrentUser call',
    (rel) => {
      const src = read(rel);
      expect(src).toContain('requireHrAccess()');
      // The call and the import, not the word — the comment above the guard names the old one.
      expect(src).not.toMatch(/await\s+getCurrentUser\s*\(/);
      expect(src).not.toMatch(/^\s*import\s+\{[^}]*getCurrentUser/m);
    },
  );

  it('every attendance reader is behind the HR guard', () => {
    for (const rel of READERS) {
      expect(read(rel)).toContain('requireHrAccess');
    }
  });

  it('every whole-collection scan is capped', () => {
    const unbounded = BOUNDED_READERS.filter((rel) => !read(rel).includes('.limit('));
    expect(unbounded).toEqual([]);
  });

  it('reads tenantId off the authenticated principal, never the request', () => {
    for (const rel of READERS) {
      const src = read(rel);
      expect(src).toContain('.user.tenantId');
      expect(src).not.toMatch(/searchParams\.get\(\s*['"]tenantId['"]/);
    }
  });
});

describe('T-1: neither screen is reachable from navigation', () => {
  const DEFERRED_HREFS = ['/hr/attendance', '/hr/payroll'];

  it('the sidebar links to neither screen', () => {
    const src = read('lib/navigation/sidebarConfig.ts');
    for (const href of DEFERRED_HREFS) {
      expect(src).not.toContain(`href: '${href}'`);
    }
  });

  it('the HR tab bar links to neither screen', () => {
    const src = read('app/hr/layout.tsx');
    for (const href of DEFERRED_HREFS) {
      expect(src).not.toContain(`href: '${href}'`);
    }
  });

  it('the HR overview cards link to neither screen', () => {
    const src = read('app/hr/page.tsx');
    for (const href of DEFERRED_HREFS) {
      expect(src).not.toContain(`href: '${href}'`);
    }
  });

  it('keeps the pages on disk for the rebuild', () => {
    expect(exists('app/hr/attendance/page.tsx')).toBe(true);
    expect(exists('app/hr/payroll/page.tsx')).toBe(true);
  });
});
