import * as fs from 'fs';
import * as path from 'path';

/**
 * S3 — Notification recipient lookups are tenant-required and fail closed.
 *
 * getUsersByRoles/getUserIdsByRoles previously took an OPTIONAL tenantId. When it was
 * omitted (20 call sites) or passed as an empty string, the users collection was
 * queried across EVERY tenant: a workflow in tenant A selected admins, finance,
 * managers and HR staff from tenant B and sent them notifications containing tenant A
 * project, client, invoice and file names.
 *
 * The parameter is now mandatory at compile time and a blank tenant throws. These
 * assertions guard the contract so it cannot silently regress.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S3: recipient lookup requires a tenant', () => {
  const src = read('app/lib/notifications.ts');

  it('getUsersByRoles takes a required (non-optional) tenantId', () => {
    expect(src).toMatch(/getUsersByRoles\(roles: string\[\], tenantId: string \| null\)/);
    expect(src).not.toMatch(/getUsersByRoles\(roles: string\[\], tenantId\?:/);
  });

  it('getUserIdsByRoles takes a required (non-optional) tenantId', () => {
    expect(src).toMatch(/getUserIdsByRoles\(roles: string\[\], tenantId: string \| null\)/);
    expect(src).not.toMatch(/getUserIdsByRoles\(roles: string\[\], tenantId\?:/);
  });

  it('throws on a blank tenant rather than querying across tenants', () => {
    expect(src).toMatch(/tenantId is required and must be non-empty/);
  });

  it('always constrains the query by tenantId', () => {
    expect(src).not.toMatch(/if \(tenantId\) \{\s*query = query\.where\('tenantId'/);
    expect(src).toMatch(/\.where\('tenantId', '==', scopedTenantId\)/);
  });
});

describe('S3: no API route omits the tenant argument', () => {
  const API_ROOT = path.join(process.cwd(), 'app', 'api');

  function walk(dir: string): string[] {
    let out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out = out.concat(walk(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  it('every getUserIdsByRoles/getUsersByRoles call passes a second argument', () => {
    const offenders: string[] = [];

    /**
     * Blanks comments before scanning.
     *
     * A comment cannot call anything, so matching one is a false positive, not extra
     * safety — a doc block that merely NAMES getUsersByRoles() was reported as a route
     * omitting its tenant argument. Comment characters are replaced with spaces rather
     * than removed so every reported line number still points at the real line.
     */
    const blankComments = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (line) => ' '.repeat(line.length));

    for (const file of walk(API_ROOT)) {
      const src = blankComments(fs.readFileSync(file, 'utf8'));
      const re = /get(?:User|Users)IdsByRoles\(|getUsersByRoles\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const open = src.indexOf('(', m.index);
        let depth = 0;
        let j = open;
        while (j < src.length) {
          if (src[j] === '(') depth += 1;
          else if (src[j] === ')') {
            depth -= 1;
            if (depth === 0) break;
          }
          j += 1;
        }
        const inner = src.slice(open + 1, j);
        let d = 0;
        let args = inner.trim() === '' ? 0 : 1;
        for (const ch of inner) {
          if ('([{'.includes(ch)) d += 1;
          else if (')]}'.includes(ch)) d -= 1;
          else if (ch === ',' && d === 0) args += 1;
        }
        if (args < 2) {
          offenders.push(
            `${path.relative(process.cwd(), file)}:${src.slice(0, m.index).split('\n').length}`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
