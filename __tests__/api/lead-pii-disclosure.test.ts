import fs from 'fs';
import path from 'path';

/**
 * PII-1 — tenant customer data never leaves the tenant.
 *
 * Every lead created in any workspace emailed the lead's name, email address, source,
 * owner and pipeline stage to the hard-coded platform inbox admin@bizosto.com. That is the
 * tenant's customer — a person who filled in their form — disclosed to the platform
 * operator on every create, with no consent, no configuration, and no way for the tenant
 * to know it was happening. It is also indefensible under any processing agreement a
 * paying tenant would expect.
 *
 * The distinction this file pins is WHOSE data is in the message, not which address
 * appears in the source:
 *
 *   - Platform mail ABOUT Bizosto's own business legitimately reaches Bizosto. A failed
 *     nightly backup, a Stripe subscription event for a subscriber, a support ticket
 *     raised by a tenant — the subject of all three is Bizosto's own operation.
 *   - Mail carrying a tenant's CUSTOMER data must reach only that tenant's own staff.
 *
 * So the guard is scoped rather than blanket: the tenant-data surfaces may not name a
 * platform inbox as a recipient at all, while the platform surfaces are listed explicitly
 * with the reason each one is allowed.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments removed, so prose naming an old address is not a false positive. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const LEAD_CREATE = 'app/api/admin/sales/leads/create/route.ts';

/**
 * Routes that legitimately email a Bizosto inbox, each because the SUBJECT of the message
 * is Bizosto's own business rather than a tenant's customer.
 */
const PLATFORM_MAIL_ROUTES: Record<string, string> = {
  'app/api/cron/backup/route.ts': 'Nightly backup failure — a platform operational alert.',
  'app/api/stripe/subscription-webhook/route.ts':
    "Bizosto's own subscription billing events for a subscriber.",
  'app/api/support/tickets/route.ts': 'A tenant raising a support ticket with Bizosto.',
};

/** Every API route file. */
function apiRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') out.push(path.relative(ROOT, full));
    }
  };
  walk(path.join(ROOT, 'app', 'api'));
  return out.sort();
}

/**
 * Files naming a bizosto.com address as a mail RECIPIENT.
 *
 * Both spellings count: the address written straight into `to:`, and the address bound to
 * an identifier that `to:` then references — /api/support/tickets does the latter, and a
 * detector that only saw string literals would have declared it clean.
 *
 * Senders (`from:`), support addresses quoted inside user-facing copy, and configuration
 * defaults are deliberately not recipients and are not flagged.
 */
function routesEmailingPlatform(): string[] {
  return apiRoutes()
    .filter((rel) => {
      const src = active(rel);

      if (/to:\s*['"`][^'"`]*@bizosto\.com['"`]/.test(src)) return true;

      // Identifiers bound to a bizosto address anywhere in the file...
      const bound = [
        ...src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*['"`][^'"`]*@bizosto\.com['"`]/g),
      ].map(([, identifier]) => identifier);

      // ...and then handed to `to:`.
      return bound.some((identifier) => new RegExp(String.raw`to:\s*${identifier}\b`).test(src));
    })
    .sort();
}

describe('PII-1: the lead alert stays inside the tenant', () => {
  const src = active(LEAD_CREATE);

  it('names no platform inbox at all', () => {
    expect(src).not.toContain('@bizosto.com');
  });

  it('resolves recipients through the tenant-scoped lookup', () => {
    // getUsersByRoles throws on a blank tenantId rather than querying every tenant, so
    // deriving the mailing list from it is what makes the alert tenant-safe.
    expect(src).toContain('getUsersByRoles(');
    expect(src).toContain('recipients');
    expect(src).toMatch(/alertRecipients[\s\S]*user\.email/);
  });

  it('sends only to addresses that came from that lookup', () => {
    // A literal address anywhere in the send path would bypass the tenant scoping.
    const sendBlock = src.slice(src.indexOf('alertRecipients.map'));
    expect(sendBlock).toContain('to: address');
    expect(sendBlock).not.toMatch(/to:\s*['"`]/);
  });

  it('caps the fan-out so one create cannot become a mail storm', () => {
    expect(src).toContain('MAX_ALERT_RECIPIENTS');
    expect(src).toMatch(/slice\(0,\s*MAX_ALERT_RECIPIENTS\)/);
  });

  it('escapes lead-supplied values before putting them in the message', () => {
    expect(src).toContain('escapeHtml');
  });

  it('never rolls the lead back when mail fails', () => {
    // The lead is committed before the alert is attempted, and the send is not awaited.
    const commitAt = src.indexOf("collection('leads').add");
    const sendAt = src.indexOf('alertRecipients.map');
    expect(commitAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(commitAt);
    expect(src).toContain('void Promise.allSettled(');
  });

  it('keeps the lead out of the failure log', () => {
    const catchBlock = src.slice(src.indexOf('lead alert dispatch failed') - 120);
    expect(catchBlock).not.toContain('${name}');
    expect(catchBlock).not.toContain('${email}');
    expect(catchBlock).not.toContain('tenantId');
  });
});

describe('PII-1: no tenant-data route emails a platform inbox', () => {
  it('leaves only the routes whose subject is Bizosto itself', () => {
    expect(routesEmailingPlatform()).toEqual(Object.keys(PLATFORM_MAIL_ROUTES).sort());
  });

  it('records why each of those is allowed, so the list cannot grow silently', () => {
    for (const [rel, reason] of Object.entries(PLATFORM_MAIL_ROUTES)) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });

  it('excludes every CRM and ingest surface, which carry tenant customer data', () => {
    const tenantDataRoutes = apiRoutes().filter(
      (rel) =>
        rel.startsWith('app/api/admin/sales/') ||
        rel.startsWith('app/api/admin/crm/') ||
        rel.startsWith('app/api/ingest/'),
    );
    expect(tenantDataRoutes.length).toBeGreaterThan(0);

    const offenders = tenantDataRoutes.filter((rel) => active(rel).includes('@bizosto.com'));
    expect(offenders).toEqual([]);
  });
});
