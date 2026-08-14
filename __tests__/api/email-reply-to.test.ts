import fs from 'fs';
import path from 'path';

/**
 * MAIL-3 — a tenant's message to its own customer says who it is from, and replies reach
 * the tenant.
 *
 * The invoice reminder cron sent through the raw Resend client, bypassing sendEmail()
 * entirely, hard-coded as `Bizosto <invoices@bizosto.com>`. So a client of Website Design
 * Dogs received a payment chase from a company they have never heard of, about an invoice
 * issued by a company they have. Three things follow from that:
 *
 *   - It reads as a phishing attempt, which is the last thing a payment reminder should
 *     look like. It is the tenant's collection rate that suffers.
 *   - It discloses the tenant's supplier. Enterprise customers pay for white-label
 *     specifically so their clients never see Bizosto.
 *   - Replies went to a Bizosto inbox the tenant cannot read. A customer answering "I paid
 *     this last week" was talking to nobody.
 *
 * Reply-To was declared on EmailParams and sent by no provider — Resend, SendGrid and SES
 * all omitted it — so it could not have helped even where it was set.
 *
 * The resolution is deliberately two-tier. A verified tenant sender is used as-is. Without
 * one, the platform ADDRESS is kept, because it is the only domain Bizosto is authorised
 * to send from, but the tenant's NAME becomes the display name and Reply-To points at the
 * tenant. Claiming a name is not claiming a domain, so this is not the silent
 * Bizosto-sender fallback MAIL-2 forbids: the envelope stays honest about which service
 * sent the mail while the recipient learns who is actually chasing them.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about the old behaviour is not the behaviour. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const SERVICE = 'lib/email/email-service.ts';
const REMINDERS = 'app/api/cron/invoice-reminders/route.ts';

describe('MAIL-3: Reply-To actually reaches the provider', () => {
  const src = active(SERVICE);

  it('is part of the email contract', () => {
    expect(src).toContain('replyTo?: string');
  });

  it('is sent by Resend', () => {
    expect(src).toContain('...(params.replyTo ? { replyTo: params.replyTo } : {})');
  });

  it('is sent by SendGrid, under its own field name', () => {
    expect(src).toContain('reply_to: { email: params.replyTo }');
  });

  it('is sent by SES, as an array', () => {
    expect(src).toContain('ReplyToAddresses: [params.replyTo]');
  });

  it('is omitted rather than sent empty when unset', () => {
    // An empty Reply-To is worse than none: some clients render it as the reply target.
    const spreads = src.match(/\.\.\.\(params\.replyTo \?/g) || [];
    expect(spreads.length).toBe(3);
  });
});

describe('MAIL-3: a display name without an address is honoured', () => {
  const src = active(SERVICE);

  it('composes From through one helper rather than inline per provider', () => {
    expect(src).toContain('function composeFrom(');
    expect(src).toContain('composeFrom(params, RESEND_FROM)');
  });

  it('keeps the platform address while showing the given name', () => {
    // This is the case the old expression dropped: it honoured fromName only when
    // fromEmail was also set, so a name-only caller silently got the Bizosto identity.
    const fn = src.slice(src.indexOf('function composeFrom('));
    expect(fn).toContain('`${params.fromName} <${addressOf(configuredFrom)}>`');
  });

  it('extracts the bare address from a display-name configuration', () => {
    // ONBOARDING_FROM_EMAIL is stored as `Bizosto <hello@bizosto.com>`.
    expect(src).toContain('function addressOf(');
    expect(src).toContain('/<([^>]+)>/');
  });

  it('still prefers an explicit address when one is given', () => {
    const fn = src.slice(src.indexOf('function composeFrom('));
    expect(fn).toMatch(/if \(params\.fromEmail\)/);
  });

  it('SES sends the display name too', () => {
    expect(src).toContain('FromEmailAddress: fromHeader');
  });
});

describe('MAIL-3: the invoice reminder is the tenant speaking', () => {
  const src = active(REMINDERS);

  it('goes through the shared email service', () => {
    // Bypassing it meant every improvement to sending — MAIL-2's gating included — did
    // not apply to the one message that reaches a tenant's customer.
    expect(src).toContain('sendEmail(');
    expect(src).not.toContain('resend.emails.send(');
    expect(src).not.toContain('new Resend(');
  });

  it('no longer hard-codes the Bizosto sender', () => {
    expect(src).not.toContain("from: 'Bizosto <invoices@bizosto.com>'");
  });

  it('resolves the sender identity from the tenant record', () => {
    // MAIL-4 moved this decision into lib/email/tenant-sender.ts so the three
    // customer-facing send sites cannot drift apart. The behaviour it used to assert
    // inline — verified address, name-only fallback, Reply-To — is exercised directly
    // against the helper in __tests__/api/tenant-sender-identity.test.ts. What matters
    // here is that this route delegates rather than deciding for itself.
    expect(src).toContain('resolveTenantSender(tenant)');
    expect(src).not.toContain('const senderVerified =');
  });

  it('passes the identity into the send rather than building a From string', () => {
    const sendBlock = src.slice(src.indexOf('await sendEmail('));
    expect(sendBlock).toContain('...resolveTenantSender(tenant)');
    expect(sendBlock).not.toMatch(/from:\s*['"`]/);
  });
});
