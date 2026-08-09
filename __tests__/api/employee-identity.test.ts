import fs from 'fs';
import path from 'path';
import { ERP_ROLES } from '@/lib/erpAccess';

/**
 * S10 — one employee identity model.
 *
 * Three collections were competing to describe a member of staff:
 *
 *   users         the real identity. Keyed by the Firebase Auth uid, carries the
 *                 { role, tenantId } custom claims, and is what /api/hr/employees/list,
 *                 /get, /update, /delete and every /api/admin/hr/employees/* route read.
 *   employees     written ONLY by /api/hr/employees/create, with a Firestore auto-id and
 *                 no uid. Nothing that reads staff has ever opened it.
 *   hr_employees  written ONLY by /api/admin/users/create, and read by NOTHING.
 *
 * The user-visible consequence was a broken create flow, not merely redundancy: HR filled
 * in the form, saw "Employee created!", was redirected to /hr/employees — which lists
 * `users` — and the person was not there. They could never be listed, opened, edited,
 * removed, or logged in as, because every other route keys on a uid the orphan document
 * never had.
 *
 * `users` wins because it is the only one of the three the Auth uid can key. These tests
 * pin that decision: employee creation provisions a real user, and no creation path
 * writes a mirror copy of a person anywhere else.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/**
 * Source with comments removed.
 *
 * Every assertion about which collection a file touches runs against this, not the raw
 * text: these routes carry doc comments that NAME the collections they no longer use, and
 * matching the prose instead of the code would make the guard permanently red.
 */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

/** Whitespace-insensitive `.collection('name')` matcher — prettier moves the line breaks. */
const collectionPattern = (name: string) =>
  new RegExp(String.raw`\.collection\(\s*(['"\`])${name}\1\s*\)`);

const HR_CREATE = 'app/api/hr/employees/create/route.ts';
const ADMIN_CREATE = 'app/api/admin/users/create/route.ts';

/** Every route in the HR employees namespace. All must agree on one collection. */
const HR_EMPLOYEE_ROUTES = [
  'app/api/hr/employees/create/route.ts',
  'app/api/hr/employees/list/route.ts',
  'app/api/hr/employees/get/route.ts',
  'app/api/hr/employees/update/route.ts',
  'app/api/hr/employees/delete/route.ts',
];

/** Source files, excluding tests, that could reach a staff collection. */
function sourceFiles(): string[] {
  const roots = ['app', 'lib', 'components', 'hooks'];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(path.relative(process.cwd(), full));
    }
  };
  for (const root of roots) walk(path.join(process.cwd(), root));
  return out;
}

const SOURCE_FILES = sourceFiles();

/** Files referencing a collection by exact name. */
function filesUsingCollection(name: string): string[] {
  const pattern = collectionPattern(name);
  return SOURCE_FILES.filter((rel) => pattern.test(active(rel))).sort();
}

describe('S10: creating an employee creates a user', () => {
  const src = read(HR_CREATE);

  it('writes the person into users, keyed by the Auth uid', () => {
    const code = active(HR_CREATE);
    expect(code).toMatch(collectionPattern('users'));
    expect(code).toMatch(/\.doc\(\s*userRecord\.uid\s*\)/);
    expect(code).not.toMatch(collectionPattern('employees'));
  });

  it('provisions a real Auth account rather than a bare document', () => {
    expect(src).toContain('adminAuth.createUser(');
  });

  it('stamps BOTH role and tenantId in the custom claims', () => {
    expect(src).toContain('setCustomUserClaims(userRecord.uid, { role, tenantId })');
  });

  it('takes tenantId from the session, never the request body', () => {
    expect(src).toContain("String(access.user.tenantId || '')");
    expect(src).not.toMatch(/body\??\.\s*tenantId/);
  });

  it('checks the seat limit before the Auth user exists', () => {
    const seatIdx = src.indexOf('checkUserLimit(');
    const createIdx = src.indexOf('adminAuth.createUser(');
    expect(seatIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(seatIdx).toBeLessThan(createIdx);
    expect(src).toContain('planLimitResponseBody(seatCheck)');
  });

  it('honours the tenant role allow-list', () => {
    expect(src).toContain('isRoleEnabled(rolesEnabled, role)');
  });

  it('never returns the set-password link in the response body (S-1)', () => {
    // The first NextResponse.json in the file is an auth failure; the link could only
    // leak from the success body, so slice from there.
    const successBody = src.slice(src.indexOf('success: true'));
    expect(successBody).not.toContain('tokenData.link');
    expect(successBody).not.toContain('link');
    expect(src).toContain('sendSetPasswordEmail({ email, link: tokenData.link })');
  });
});

describe('S10: HR cannot mint a privileged account', () => {
  const src = read(HR_CREATE);
  const allowList = src.slice(
    src.indexOf('const HR_CREATABLE_ROLES'),
    src.indexOf('] as const;', src.indexOf('const HR_CREATABLE_ROLES')),
  );

  it.each(['admin', 'super_admin', 'client'])('excludes %s from the creatable roles', (role) => {
    expect(allowList).not.toContain(`'${role}'`);
  });

  it('rejects a role outside the allow-list with a 403', () => {
    expect(src).toContain('HR_CREATABLE_ROLES as readonly string[]).includes(role)');
    expect(src).toContain('HR cannot create an account with that role.');
  });

  it('only lists real ERP roles, so a typo cannot create an unreachable account', () => {
    const listed = [...allowList.matchAll(/'([a-z_]+)'/g)].map(([, role]) => role);
    expect(listed.length).toBeGreaterThan(0);
    for (const role of listed) {
      expect(ERP_ROLES as readonly string[]).toContain(role);
    }
  });

  it('offers the same roles in the form as the API accepts', () => {
    const page = read('app/hr/employees/new/page.tsx');
    const options = [...page.matchAll(/\{ value: '([a-z_]+)', label:/g)].map(([, role]) => role);
    const listed = [...allowList.matchAll(/'([a-z_]+)'/g)].map(([, role]) => role);
    expect(options.sort()).toEqual(listed.sort());
  });
});

describe('S10: no staff record is mirrored into a second collection', () => {
  it('nothing anywhere writes or reads hr_employees', () => {
    expect(filesUsingCollection('hr_employees')).toEqual([]);
    expect(active(ADMIN_CREATE)).not.toContain('hr_employees');
  });

  it('the whole HR employees namespace agrees on the users collection', () => {
    for (const rel of HR_EMPLOYEE_ROUTES) {
      const code = active(rel);
      expect(code).toMatch(collectionPattern('users'));
      expect(code).not.toMatch(collectionPattern('employees'));
      expect(code).not.toMatch(collectionPattern('hr_employees'));
    }
  });

  it('leaves the legacy employees collection with no writer outside the demo seed', () => {
    // The three readers are the DEFERRED attendance surface (T-1), already unlinked from
    // navigation and capped. They are rebuilt on `users` in a later session; until then
    // the only thing that may populate the collection is demo seeding.
    const writers = filesUsingCollection('employees').filter((rel) =>
      /\.(set|add|update)\(/.test(active(rel)),
    );
    expect(writers).toEqual(['lib/demo/seed.ts']);
  });
});
