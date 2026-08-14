import fs from 'fs';
import path from 'path';
import { hasVerifiedSender, resolveTenantSender } from '@/lib/email/tenant-sender';

/**
 * MAIL-4 — every message to a tenant's customer is addressed as the tenant.
 *
 * MAIL-3 worked out how to address one of these and inlined the rule in the invoice
 * reminder cron. Two more customer-facing send sites still went out as Bizosto:
 *
 *   - /api/cron/generate-invoices sent the INVOICE ITSELF as
 *     `Bizosto <invoices@bizosto.com>`, through the raw Resend client. That is the first
 *     message a customer receives about money owed, and it came from a company they have
 *     never heard of about an invoice issued by a company they have. MAIL-3 fixed the
 *     chaser and left the thing being chased.
 *   - /api/ai/tools/finance-write sends the AI agent's payment reminder to the same
 *     customer, and used the plain platform identity.
 *
 * Three copies of a rule about who a message claims to be from is how they drift, so the
 * decision now lives in lib/email/tenant-sender.ts and all three call it.
 *
 * Mail to a tenant's own STAFF is deliberately untouched: an approval request, a lead
 * alert, a payroll notice or an invoice-paid confirmation is Bizosto talking to its own
 * subscriber, and the platform identity is the honest one there.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about the old behaviour is not the behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const HELPER = 'lib/email/tenant-sender.ts';

/** Every send site whose recipient is the tenant's customer, not the tenant's staff. */
const CUSTOMER_FACING = [
  'app/api/cron/invoice-reminders/route.ts',
  'app/api/cron/generate-invoices/route.ts',
  'app/api/ai/tools/finance-write/route.ts',
];

describe('MAIL-4: the identity rule is decided in one place', () => {
  const verified = {
    name: 'Website Design Dogs',
    whiteLabel: {
      emailBranding: {
        fromName: 'WDD Billing',
        fromEmail: 'hello@websitedesigndogs.com',
        status: 'verified',
        domainOwned: true,
      },
    },
  };

  it('uses a verified tenant address, so Bizosto disappears entirely', () => {
    const identity = resolveTenantSender(verified);
    expect(identity.fromEmail).toBe('hello@websitedesigndogs.com');
    expect(identity.fromName).toBe('WDD Billing');
    expect(identity.replyTo).toBe('hello@websitedesigndogs.com');
  });

  it('never puts an unverified domain in From', () => {
    // This is the line between "identify the tenant" and "impersonate the tenant".
    const pending = {
      ...verified,
      whiteLabel: {
        emailBranding: { ...verified.whiteLabel.emailBranding, status: 'pending' },
      },
    };
    const identity = resolveTenantSender(pending);
    expect(identity.fromEmail).toBeUndefined();
  });

  it('still names the tenant and routes replies when unverified', () => {
    // The recipient learns who is writing to them; a reply reaches the right company.
    const pending = {
      ...verified,
      whiteLabel: {
        emailBranding: { ...verified.whiteLabel.emailBranding, domainOwned: false },
      },
    };
    const identity = resolveTenantSender(pending);
    expect(identity.fromName).toBe('WDD Billing');
    expect(identity.replyTo).toBe('hello@websitedesigndogs.com');
    expect(identity.fromEmail).toBeUndefined();
  });

  it('falls back to the tenant name when no sender is configured at all', () => {
    const identity = resolveTenantSender({ name: 'Acme Ltd' });
    expect(identity.fromName).toBe('Acme Ltd');
    expect(identity.fromEmail).toBeUndefined();
    expect(identity.replyTo).toBeUndefined();
  });

  it('returns nothing for an unknown tenant rather than inventing an identity', () => {
    expect(resolveTenantSender(null)).toEqual({});
    expect(resolveTenantSender(undefined)).toEqual({});
    expect(resolveTenantSender({})).toEqual({});
  });

  it('requires both the status and the ownership proof', () => {
    expect(hasVerifiedSender(verified)).toBe(true);
    expect(
      hasVerifiedSender({
        whiteLabel: { emailBranding: { status: 'verified', domainOwned: false } },
      }),
    ).toBe(false);
    expect(
      hasVerifiedSender({
        whiteLabel: { emailBranding: { status: 'pending', domainOwned: true } },
      }),
    ).toBe(false);
  });
});

describe('MAIL-4: a lookup failure never loses the message', () => {
  const src = active(HELPER);

  it('resolves by id without throwing', () => {
    // An invoice lost because a branding read failed would be worse than one sent with a
    // plain sender.
    const fn = src.slice(src.indexOf('export async function resolveTenantSenderById'));
    expect(fn).toContain('catch');
    expect(fn).toContain('return {}');
  });

  it('logs the failure without the tenant id', () => {
    expect(src).toContain('[EMAIL] failed to resolve tenant sender identity');
    const fn = src.slice(src.indexOf('export async function resolveTenantSenderById'));
    expect(fn).not.toMatch(/console\.error\([^)]*\$\{/);
  });
});

describe('MAIL-4: every customer-facing send uses it', () => {
  it.each(CUSTOMER_FACING)('%s resolves the tenant identity', (rel) => {
    expect(active(rel)).toMatch(/resolveTenantSender(ById)?\(/);
  });

  it.each(CUSTOMER_FACING)('%s hard-codes no Bizosto sender', (rel) => {
    const src = active(rel);
    expect(src).not.toMatch(/from:\s*['"`]Bizosto/);
    expect(src).not.toContain('invoices@bizosto.com');
  });

  it.each(CUSTOMER_FACING)('%s sends through the shared email service', (rel) => {
    // Bypassing it means every improvement to sending stops applying to exactly the
    // messages that reach a tenant's customer.
    const src = active(rel);
    expect(src).toContain('sendEmail(');
    expect(src).not.toContain('resend.emails.send(');
    expect(src).not.toContain('new Resend(');
  });

  it('no longer keeps a second copy of the resolution inline', () => {
    // MAIL-3 inlined it in the reminder cron; that copy is gone.
    const src = active('app/api/cron/invoice-reminders/route.ts');
    expect(src).not.toContain('const senderVerified =');
  });
});

describe('MAIL-4: staff mail keeps the platform identity', () => {
  /** Bizosto talking to its own subscriber. The platform sender is the honest one. */
  const STAFF_FACING = [
    'app/api/approvals/request/route.ts',
    'app/api/finance/invoices/update/route.ts',
    'app/api/admin/clients/create/route.ts',
  ];

  it.each(STAFF_FACING)('%s does not adopt a tenant identity', (rel) => {
    expect(active(rel)).not.toContain('resolveTenantSender');
  });
});
