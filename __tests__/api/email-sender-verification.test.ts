import fs from 'fs';
import path from 'path';

/**
 * MAIL-1 — "verified" must mean the tenant controls the domain.
 *
 * verifyEmailSender() returned `verified: spfValid && dkimValid`: an SPF record exists on
 * the domain, and something answers at `default._domainkey`. Neither fact says anything
 * about the tenant asking. Every domain on Google Workspace or Microsoft 365 publishes
 * SPF, and `default` is the stock DKIM selector — so a tenant could type
 * `billing@some-other-company.com`, click Verify, and be told it was verified. The check
 * proved somebody had configured mail for that domain. Not this tenant, and not that
 * Bizosto was authorised to send as it.
 *
 * The correct pattern was already in the same file, twenty lines above: verifyCustomDomain
 * asks for a per-tenant token in a `_bizosto-verify` TXT record, which only someone with
 * control of the domain's DNS can publish. Sender verification now uses that same proof.
 *
 * Nothing sends with this address yet — the tenant email plane does not exist — which is
 * exactly why it was worth fixing now. That flag is what would gate sending the moment it
 * is built, and a false "verified" would have become load-bearing without anyone noticing.
 *
 * SPF and DKIM are still reported, as deliverability signals. They are useful. They are
 * not evidence of ownership, and they no longer decide `verified`.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose describing the old rule is not the rule. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const BRANDING = 'lib/white-label/branding.ts';
const VERIFY_ROUTE = 'app/api/admin/email/verify/route.ts';
const BRANDING_PAGE = 'app/admin/settings/branding/page.tsx';

describe('MAIL-1: ownership decides verification', () => {
  const src = active(BRANDING);

  it('never derives verified from SPF and DKIM', () => {
    // The defect in one line.
    expect(src).not.toContain('verified: spfValid && dkimValid');
  });

  it('derives verified from the ownership challenge alone', () => {
    expect(src).toContain('verified: domainOwned');
  });

  it('checks a per-tenant token in a _bizosto-verify record', () => {
    const fn = src.slice(src.indexOf('export async function verifyEmailSender'));
    expect(fn).toContain('`_bizosto-verify.${domain}`');
    expect(fn).toContain('bizosto-verification=${verificationToken}');
    expect(fn).toContain('domainOwned = flattenedOwnership.includes(expected)');
  });

  it('requires the token as an argument, so it cannot be called without proof', () => {
    expect(src).toMatch(/verifyEmailSender\(fromEmail: string, verificationToken: string\)/);
  });

  it('uses the same challenge as the custom-domain flow', () => {
    // Two different ownership proofs would be two things to get wrong.
    const domainFn = src.slice(src.indexOf('export async function verifyCustomDomain'));
    const emailFn = src.slice(src.indexOf('export async function verifyEmailSender'));
    expect(domainFn).toContain('_bizosto-verify.');
    expect(emailFn).toContain('_bizosto-verify.');
    expect(domainFn).toContain('bizosto-verification=');
    expect(emailFn).toContain('bizosto-verification=');
  });

  it('still reports SPF and DKIM, as advisory signals', () => {
    const fn = src.slice(src.indexOf('export async function verifyEmailSender'));
    expect(fn).toContain('spfValid');
    expect(fn).toContain('dkimValid');
    expect(fn).toContain('domainOwned,');
  });
});

describe('MAIL-1: the route derives the token per tenant', () => {
  const src = active(VERIFY_ROUTE);

  it('derives the token from the authenticated tenant, never from the request', () => {
    expect(src).toContain('createDomainVerificationToken(auth.user.tenantId, domain)');
    expect(src).not.toMatch(/body\??\.\s*verificationToken/);
    expect(src).not.toMatch(/parsed\.data\.verificationToken/);
  });

  it('passes the token into verification', () => {
    expect(src).toContain('verifyEmailSender(parsed.data.fromEmail, verificationToken)');
  });

  it('persists the ownership result, not just SPF and DKIM', () => {
    expect(src).toContain('domainOwned: verification.domainOwned');
    expect(src).toContain('status: verification.verified');
  });

  it('returns the token so the tenant can publish the record', () => {
    expect(src).toContain('verificationToken');
  });
});

describe('MAIL-1: the screen tells the tenant what to actually do', () => {
  const page = read(BRANDING_PAGE);

  it('no longer blames SPF and DKIM for a failed verification', () => {
    // That message pointed a tenant at a problem that was never the reason it failed.
    expect(page).not.toContain('SPF/DKIM records are incomplete.');
  });

  it('shows the record name and value to publish', () => {
    expect(page).toContain('data.verification.recordName');
    expect(page).toContain('data.verification.expected');
  });

  it('says what verification means when it succeeds', () => {
    expect(page).toContain('you control this domain');
  });
});

describe('MAIL-1: the stored shape carries the distinction', () => {
  const src = active(BRANDING);

  it('records domainOwned separately from the deliverability flags', () => {
    const type = src.slice(src.indexOf('emailBranding: {'));
    expect(type.slice(0, 400)).toContain('domainOwned: boolean');
  });

  it('defaults to unowned, so an unverified sender is never assumed good', () => {
    const defaults = src.slice(src.indexOf('const DEFAULT_BRANDING'));
    expect(defaults.slice(0, 800)).toContain('domainOwned: false');
  });
});
