import fs from 'fs';
import path from 'path';
import { approvalsPathForRole, appUrl, getAppUrl, invoicePaymentUrl } from '@/lib/urls';

/**
 * P0-4b — every application link the product emits must resolve to a real route.
 *
 * Two dead links were shipping to customers before this guard existed:
 *   - /approvals            — the only entry point to the approval queue, sent by email to
 *                             every approver. There is no /approvals page; the queues are
 *                             role-scoped (/sales_manager/approvals, /am_manager/approvals,
 *                             /production_manager/approvals) and nothing else links to them.
 *   - /client/invoices/{id} — the payable page is /pay/{id}.
 *
 * This test builds the real route set from app/page files and resolves every hardcoded
 * app.bizosto.com link in the repository against it.
 */

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'app');

/**
 * lib/urls.ts is the definition module: it necessarily contains both base URLs and, in its
 * header comment, the wrong patterns it exists to replace. It is the one file exempt from
 * both sweeps below.
 */
const URL_MODULE = path.join('lib', 'urls.ts');

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    if (entry.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

/** Every rendered route, as a regex (dynamic segments match one path segment). */
function buildRouteMatchers(): RegExp[] {
  return walk(APP_DIR)
    .filter((file) => /[\\/]page\.tsx$/.test(file))
    .map((file) =>
      `/${path
        .relative(APP_DIR, file)
        .replace(/\\/g, '/')
        .replace(/\/page\.tsx$/, '')}`
        .replace(/\/\(.*?\)/g, '')
        .replace(/\/page\.tsx$/, ''),
    )
    .map((route) => {
      const pattern = route
        .split('/')
        .map((segment) =>
          /^\[.*\]$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('/');
      return new RegExp(`^${pattern || '/'}$`);
    });
}

/** Every distinct app path referenced by a hardcoded absolute URL, with its source files. */
function collectLinkedPaths(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const sources = walk(ROOT).filter(
    (file) => /\.(ts|tsx)$/.test(file) && !file.includes('__tests__') && !file.endsWith(URL_MODULE),
  );

  for (const file of sources) {
    const src = fs.readFileSync(file, 'utf8');
    const pattern = /https:\/\/app\.bizosto\.com(\/[A-Za-z0-9_\-/[\]${}.]*)?/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(src)) !== null) {
      const raw = (match[1] || '/').split('?')[0];
      const normalized = raw.replace(/\$\{[^}]*\}/g, 'X').replace(/\/+$/, '') || '/';
      const rel = path.relative(ROOT, file);
      found.set(normalized, [...(found.get(normalized) || []), rel]);
    }
  }

  return found;
}

describe('P0-4b: every hardcoded application link resolves to a real route', () => {
  const matchers = buildRouteMatchers();
  const linked = collectLinkedPaths();

  it('the route tree was discovered', () => {
    expect(matchers.length).toBeGreaterThan(200);
  });

  it('no link points at a route that does not exist', () => {
    const broken = [...linked.entries()]
      .filter(([route]) => route !== '/' && !matchers.some((rx) => rx.test(route)))
      .map(([route, files]) => `${route}  <- ${[...new Set(files)].join(', ')}`)
      .sort();

    if (broken.length > 0) {
      throw new Error(
        'Link(s) point at routes that do not exist. Build them with lib/urls.ts helpers\n' +
          'and use a path that appears in the app route tree:\n' +
          broken.map((entry) => `  - ${entry}`).join('\n'),
      );
    }

    expect(broken).toEqual([]);
  });

  it('the two known dead links are gone', () => {
    expect([...linked.keys()]).not.toContain('/approvals');
    expect([...linked.keys()].some((route) => route.startsWith('/client/invoices'))).toBe(false);
  });
});

describe('P0-4b: no surface falls back to the marketing site for an app link', () => {
  it('nothing resolves an app base URL to bizosto.com', () => {
    const offenders = walk(ROOT)
      .filter(
        (file) =>
          /\.(ts|tsx)$/.test(file) && !file.includes('__tests__') && !file.endsWith(URL_MODULE),
      )
      .filter((file) => {
        const src = fs.readFileSync(file, 'utf8');
        return /NEXT_PUBLIC_APP_URL[^\n]{0,80}['"]https:\/\/bizosto\.com/.test(src);
      })
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('lib/urls.ts keeps the two bases distinct', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/urls.ts'), 'utf8');
    expect(src).toContain("const APP_FALLBACK = 'https://app.bizosto.com'");
    expect(src).toContain("const MARKETING_FALLBACK = 'https://bizosto.com'");
  });

  it('the billing portal returns the customer to the application', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/api/billing/portal/route.ts'), 'utf8');
    expect(src).toContain('getAppUrl()');
    expect(src).not.toContain("|| 'https://bizosto.com'");
  });

  it('onboarding and trial emails link into the application', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/email/onboarding-emails.ts'), 'utf8');
    expect(src).toContain('const appUrl = getAppUrl();');
    expect(src).not.toContain('process.env.APP_URL');
  });
});

describe('P0-4b: the URL helpers behave', () => {
  it('builds app paths without a trailing slash', () => {
    expect(appUrl('/')).toBe(getAppUrl());
    expect(appUrl('/billing')).toBe(`${getAppUrl()}/billing`);
    expect(appUrl('billing')).toBe(`${getAppUrl()}/billing`);
    expect(appUrl('/billing/')).toBe(`${getAppUrl()}/billing`);
  });

  it('builds payable invoice links against /pay, with the token when present', () => {
    expect(invoicePaymentUrl('inv_1')).toBe(`${getAppUrl()}/pay/inv_1`);
    expect(invoicePaymentUrl('inv_1', 'tok 1')).toBe(`${getAppUrl()}/pay/inv_1?token=tok%201`);
  });

  it('maps each approver role to its real queue and never to /approvals', () => {
    expect(approvalsPathForRole('sales_manager')).toBe('/sales_manager/approvals');
    expect(approvalsPathForRole('am_manager')).toBe('/am_manager/approvals');
    expect(approvalsPathForRole('production_manager')).toBe('/production_manager/approvals');
    expect(approvalsPathForRole('Sales-Manager')).toBe('/sales_manager/approvals');
  });

  it('sends roles without a queue page to the root, which redirects by role', () => {
    expect(approvalsPathForRole('admin')).toBe('/');
    expect(approvalsPathForRole('super_admin')).toBe('/');
    expect(approvalsPathForRole('')).toBe('/');
  });

  it('every mapped approvals path is a real page', () => {
    for (const role of ['sales_manager', 'am_manager', 'production_manager']) {
      const route = approvalsPathForRole(role);
      expect(fs.existsSync(path.join(APP_DIR, route, 'page.tsx'))).toBe(true);
    }
  });
});
