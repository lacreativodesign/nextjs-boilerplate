import fs from 'fs';
import path from 'path';

/**
 * MAIL-2 — a verified sender is the only one that reaches the provider.
 *
 * MAIL-1 made `verified` mean something real: proof, through a per-tenant DNS record, that
 * the tenant controls the sending domain. It did not make anything depend on it. Two gaps
 * left the flag decorative, and together they let any tenant admin send mail from Bizosto's
 * own Resend account claiming to be from an address they do not own.
 *
 *   - /api/email/templates/[id]/send passed `emailBranding.fromEmail` straight into
 *     sendEmail() with no status check. The branding endpoint accepts any well-formed
 *     address — it validates z.string().email() and nothing else. So a tenant admin could
 *     type billing@some-other-company.com, choose an arbitrary recipient, and the platform
 *     provider would deliver it.
 *   - updateTenantBranding() spread the incoming emailBranding over the current one,
 *     carrying `status`, `domainOwned` and `verifiedAt` across a change of address. A
 *     tenant could verify hello@their-own-domain.com, publish the ownership record, then
 *     edit the address and keep the badge. Proof of control over one domain is not proof
 *     of control over another.
 *
 * Either alone is enough to spoof. Both are closed here: the sender must be verified to
 * reach the provider, and changing it takes the verification away.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about the old behaviour is not the behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const BRANDING_LIB = 'lib/white-label/branding.ts';
const TEMPLATE_SEND = 'app/api/email/templates/[id]/send/route.ts';

describe('MAIL-2: changing the sender takes its verification away', () => {
  const src = active(BRANDING_LIB);

  it('detects a change of address', () => {
    expect(src).toContain('senderChanged');
    // Compared case-insensitively and trimmed, so Hello@X.com is not a new address.
    expect(src).toContain('.toLowerCase()');
  });

  it('resets status, ownership and the verified timestamp together', () => {
    // Leaving any one of the three behind would keep a stale claim alive somewhere.
    const reset = src.slice(src.indexOf('senderChanged'));
    expect(reset).toContain("status: 'pending'");
    expect(reset).toContain('domainOwned: false');
    expect(reset).toContain('verifiedAt: null');
  });

  it('applies the reset AFTER the incoming values, so it cannot be overridden', () => {
    // A spread ordering mistake here silently restores the defect. Anchored on the
    // updateTenantBranding body — `emailBranding: {` appears several times in this file.
    const fn = src.slice(src.indexOf('export async function updateTenantBranding'));
    const block = fn.slice(fn.indexOf('emailBranding: {'), fn.indexOf('customDomains:'));
    const inputAt = block.indexOf('...(input.emailBranding || {})');
    const resetAt = block.indexOf('senderChanged');
    expect(inputAt).toBeGreaterThan(-1);
    expect(resetAt).toBeGreaterThan(inputAt);
  });

  it('leaves verification intact when the address is unchanged', () => {
    // Editing a colour or a footer must not force a tenant to re-verify DNS.
    expect(src).toMatch(/senderChanged\s*\?[\s\S]{0,160}:\s*\{\}/);
  });
});

describe('MAIL-2: an unverified sender never reaches the provider', () => {
  const src = active(TEMPLATE_SEND);

  it('requires both the status and the ownership proof', () => {
    // status alone could be set by a future code path that does not prove control.
    expect(src).toContain("branding.emailBranding.status === 'verified'");
    expect(src).toContain('branding.emailBranding.domainOwned');
  });

  it('refuses rather than silently sending as Bizosto', () => {
    // A tenant asked to send AS THEMSELVES. Substituting a different sender would
    // misrepresent the message to its recipient and hide the problem from the tenant.
    expect(src).toContain("code: 'sender_unverified'");
    expect(src).toContain('status: 409');
  });

  it('names the fix in the error', () => {
    expect(src).toContain('Settings → Branding');
  });

  it('checks before calling the provider', () => {
    const guardAt = src.indexOf('senderVerified');
    const sendAt = src.indexOf('await sendEmail(');
    expect(guardAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(guardAt);
  });

  it('passes the identity only when it is verified', () => {
    // The ternaries are the actual gate — a bare `|| undefined` would send regardless.
    expect(src).toMatch(/fromName: senderVerified \?/);
    expect(src).toMatch(/fromEmail: senderVerified \?/);
    expect(src).not.toMatch(/fromEmail: branding\.emailBranding\.fromEmail \|\| undefined/);
  });

  it('still sends when no tenant sender is configured', () => {
    // With nothing set there is nothing to spoof, and sendEmail falls back to the platform
    // identity — correct for a Bizosto-operated test send.
    expect(src).toContain('if (branding.emailBranding.fromEmail && !senderVerified)');
  });
});

describe('MAIL-2: the branding endpoint cannot grant verification', () => {
  const src = active('app/api/admin/branding/route.ts');

  it('accepts only the three presentational email fields', () => {
    const schema = src.slice(src.indexOf('emailBranding: z.object('));
    expect(schema.slice(0, 220)).toContain('fromName');
    expect(schema.slice(0, 220)).toContain('fromEmail');
    expect(schema.slice(0, 220)).toContain('emailFooter');
  });

  it('never accepts a verification field from the request', () => {
    // Verification is earned through DNS, never asserted in a payload.
    expect(src).not.toContain('domainOwned');
    expect(src).not.toContain('verifiedAt');
    expect(src).not.toMatch(/status:\s*z\./);
  });
});
