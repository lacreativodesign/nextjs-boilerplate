import fs from 'fs';
import path from 'path';

/**
 * COMP-2 — billing mode is settable from the product, not from the Firebase console.
 *
 * COMP-1 built the model and made four systems respect it, but left it unreachable: the
 * Super Admin tenant GET did not return `billingMode`, no screen could set it, and the
 * plan route refused any change to the operator's own workspace — which is Bizosto's own
 * tenant, the single workspace that most obviously needs comping. The only way to comp
 * anything was to hand-edit Firestore, which is neither validated nor audited. A feature
 * with no writer is the same shape as the attendance module that shipped broken for
 * months.
 *
 * Three things have to hold together:
 *
 *   - The GET must return the mode, or the form opens on the default every time and an
 *     operator editing something else silently converts a comped workspace back.
 *   - The screen must send a reason, because the server rejects a comp without one and a
 *     form that cannot satisfy its own API is worse than no form.
 *   - The self-tenant guard must distinguish granting capability from forgoing revenue.
 *     Marking your own workspace comped takes capability from nobody; moving it back onto
 *     Stripe billing, or changing your own plan, remains blocked.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about comping is not read as behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const TENANT_GET = 'app/api/super_admin/tenants/[tenantId]/route.ts';
const PLAN_ROUTE = 'app/api/super_admin/tenants/[tenantId]/plan/route.ts';
const TENANT_PAGE = 'app/super_admin/tenants/[tenantId]/page.tsx';

describe('COMP-2: the screen can read the current billing mode', () => {
  const src = active(TENANT_GET);

  it('returns billingMode from the tenant GET', () => {
    expect(src).toContain('billingMode: resolveBillingMode(data.billingMode)');
  });

  it('returns the grant itself, so the reason is visible before it is overwritten', () => {
    expect(src).toContain('comped:');
    expect(src).toContain('compExpired:');
  });

  it('resolves the mode rather than passing the raw field through', () => {
    // A tenant document written before COMP-1 has no billingMode at all; the resolver is
    // what turns that into 'stripe' instead of undefined.
    expect(src).toContain('resolveBillingMode');
  });
});

describe('COMP-2: the screen can set it, with a reason', () => {
  const page = read(TENANT_PAGE);

  it('posts billingMode to the plan route', () => {
    expect(page).toContain('updateBillingMode');
    expect(page).toMatch(
      /payload:\s*Record<string, unknown>\s*=\s*\{\s*billingMode: nextMode\s*\}/,
    );
  });

  it('sends the comp grant when marking a workspace comped', () => {
    const fn = page.slice(page.indexOf('const updateBillingMode'));
    expect(fn).toContain('payload.comped');
    expect(fn).toContain('type: compType');
    expect(fn).toContain('reason: compReason');
    expect(fn).toContain('expiresAt: compExpiresAt');
  });

  it('will not submit without a reason, since the server rejects one', () => {
    expect(page).toContain('!compReason.trim()');
  });

  it('surfaces a server rejection rather than appearing to save', () => {
    expect(page).toContain('setBillingModeError');
    const fn = page.slice(page.indexOf('const updateBillingMode'));
    expect(fn).toMatch(/if \(!json\?\.ok\)/);
  });

  it('hydrates the form from the stored grant', () => {
    // Re-saving an existing comp must not blank its reason or expiry.
    expect(page).toContain('setCompReason(json.tenant.comped.reason');
    expect(page).toContain('setCompExpiresAt(');
  });

  it('reloads the tenant after a successful change', () => {
    const fn = page.slice(page.indexOf('const updateBillingMode'));
    expect(fn).toContain('await loadTenant()');
  });

  it('shows the current state and warns when a comp has lapsed', () => {
    expect(page).toContain('tenant.compExpired');
    expect(page).toContain('Comped — $0');
  });
});

describe('COMP-2: the self-tenant guard forgoes revenue but never grants capability', () => {
  const src = active(PLAN_ROUTE);

  it('still blocks an operator changing their own plan or modules', () => {
    expect(src).toContain('isSelfTenant && (planProvided || modulesProvided)');
    expect(src).toContain('Cannot modify your own tenant plan.');
  });

  it('allows an operator to comp their own workspace', () => {
    // Bizosto's own tenant is the one that most needs marking, and comping it removes it
    // from revenue rather than granting it anything.
    const guard = src.slice(src.indexOf('const isSelfTenant'));
    expect(guard).toMatch(/isSelfTenant && billingModeProvided/);
    expect(guard).toContain("!== 'comped'");
  });

  it('never lets an operator move their own workspace back onto Stripe billing', () => {
    expect(src).toContain('Cannot move your own tenant onto Stripe billing.');
  });

  it('keeps validating the grant regardless of whose tenant it is', () => {
    const validateAt = src.indexOf('validateCompedGrant(');
    const writeAt = src.indexOf('tenantRef.set(updates');
    expect(validateAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(validateAt);
  });
});
