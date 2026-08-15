import fs from 'fs';
import path from 'path';
import { maskApiKey, isSupportedProvider } from '@/lib/email/tenant-provider';

/**
 * MAIL-6 — a tenant's mail can leave through their own provider account.
 *
 * Every message Bizosto sends went through Bizosto's own Resend account, including mail a
 * tenant sends to its own customers. MAIL-1 through MAIL-4 made the envelope as honest as
 * it can be, but the account doing the sending was still Bizosto's, which has consequences
 * a tenant cannot fix from inside the product: deliverability reputation is shared, so one
 * tenant sending badly hurts everyone and a careful tenant cannot build a reputation of
 * their own; bounce and complaint data lands in Bizosto's dashboard rather than where the
 * tenant can act on it; and volume counts against Bizosto's quota.
 *
 * The credential is the sensitive part, and the rules around it are what these tests pin:
 * encrypted at rest with the same helper the AI BYOK keys use, never returned to a browser,
 * never written to an audit record, and never used for platform mail.
 *
 * That last one matters most. Only messages carrying a tenantId are eligible. Routing a
 * password reset or an OTP through a tenant's provider would put a Bizosto security message
 * in a third party's sending logs — so platform mail passes no tenantId at all.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose about a credential is not read as handling one. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const PROVIDER = 'lib/email/tenant-provider.ts';
const SERVICE = 'lib/email/email-service.ts';
const ROUTE = 'app/api/admin/settings/email-provider/route.ts';
const OUTBOX = 'lib/email/outbox.ts';

describe('MAIL-6: the credential is encrypted and unreadable', () => {
  const src = active(PROVIDER);

  it('encrypts before writing', () => {
    expect(src).toContain('apiKeyEnc: encryptApiKey(input.apiKey.trim())');
  });

  it('reuses the platform BYOK helper rather than inventing a second scheme', () => {
    // One style of encryption key for an operator to manage, not two.
    expect(src).toContain("from '@/lib/ai/byok-crypto'");
  });

  it('stores no plaintext field alongside it', () => {
    expect(src).not.toMatch(/apiKey:\s*input\.apiKey/);
    const type = src.slice(src.indexOf('export type TenantEmailProviderConfig'));
    expect(type.slice(0, 500)).not.toMatch(/^\s*apiKey:/m);
  });

  it('masks a key down to something useless if stolen', () => {
    expect(maskApiKey('re_1234567890abcdef')).toBe('••••cdef');
    expect(maskApiKey('abc')).toBe('••••');
    expect(maskApiKey('')).toBe('••••');
  });

  it('refuses a stored value that was never encrypted', () => {
    // A plaintext value would round-trip through decryptApiKey unchanged. Sending with
    // something that was never meant to be a credential is worse than not sending.
    expect(src).toContain('if (!isEncryptedApiKey(config.apiKeyEnc)) return null;');
  });
});

describe('MAIL-6: the credential never leaves the server', () => {
  const route = active(ROUTE);
  const provider = active(PROVIDER);

  it('the status shape carries no credential field', () => {
    const type = provider.slice(provider.indexOf('export type TenantEmailProviderStatus'));
    const block = type.slice(0, 300);
    expect(block).toContain('maskedKey');
    expect(block).not.toContain('apiKeyEnc');
    expect(block).not.toMatch(/\bapiKey\b/);
  });

  it('no response returns the ciphertext or the key', () => {
    expect(route).not.toContain('apiKeyEnc');
    expect(route).not.toMatch(/apiKey:\s*(?!String)/);
  });

  it('the audit record names the provider but never the credential', () => {
    // An audit log containing secrets is the thing an attacker goes for.
    expect(route).toContain('Tenant email provider connected (${provider})');
    const auditBlock = route.slice(route.indexOf('logSettingsChange({'));
    expect(auditBlock).not.toContain('apiKey');
  });

  it('validates the provider against an allow-list', () => {
    expect(isSupportedProvider('resend')).toBe(true);
    expect(isSupportedProvider('sendgrid')).toBe(true);
    expect(isSupportedProvider('ses')).toBe(true);
    expect(isSupportedProvider('mailgun')).toBe(false);
    expect(isSupportedProvider('')).toBe(false);
    expect(isSupportedProvider(null)).toBe(false);
  });

  it('takes the tenant from the session, never the request', () => {
    expect(route).toContain('auth.user.tenantId');
    expect(route).not.toMatch(/body\??\.\s*tenantId/);
  });
});

describe('MAIL-6: only tenant business mail uses a tenant provider', () => {
  const src = active(SERVICE);

  it('is eligible only when a tenantId is supplied', () => {
    // Platform mail — OTP, password setup, subscription billing — passes none, so a
    // Bizosto security message can never appear in a third party's sending logs.
    expect(src).toContain('if (params.tenantId) {');
  });

  it('resolves the provider before falling through to the platform path', () => {
    const resolveAt = src.indexOf('resolveTenantEmailProvider(params.tenantId)');
    const defaultAt = src.indexOf('const provider = DEFAULT_PROVIDER');
    expect(resolveAt).toBeGreaterThan(-1);
    expect(defaultAt).toBeGreaterThan(resolveAt);
  });

  it('passes the tenant key to the provider rather than the platform one', () => {
    expect(src).toContain('sendWithResend(params, tenantProvider.apiKey)');
    expect(src).toContain('sendWithSendGrid(params, tenantProvider.apiKey)');
  });

  it('still works when no tenant key is given', () => {
    // The platform path must be untouched: every existing call site passes no tenantId.
    expect(src).toContain('const resend = new Resend(apiKey || RESEND_API_KEY);');
    expect(src).toContain('const sendGridKey = apiKey || SENDGRID_API_KEY;');
  });

  it('falls back rather than failing when a credential cannot be resolved', () => {
    // A rotated encryption key must not stop a tenant's invoices going out. A worse
    // envelope beats an undelivered invoice.
    const fn = active(PROVIDER).slice(
      active(PROVIDER).indexOf('export async function resolveTenantEmailProvider'),
    );
    expect(fn).toContain('return null');
    expect(fn).toContain('catch');
  });

  it('logs a resolution failure without the tenant id', () => {
    expect(active(PROVIDER)).toContain('[EMAIL] failed to resolve tenant email provider');
    expect(active(PROVIDER)).not.toMatch(/console\.error\([^)]*\$\{/);
  });
});

describe('MAIL-6: queued mail routes the same way on every retry', () => {
  const src = active(OUTBOX);

  it('stores the tenant on the record', () => {
    expect(src).toContain('tenantId: input.tenantId');
  });

  it('reads it back when retrying rather than re-deciding', () => {
    // A retry must leave through the same account as the original attempt, even if the
    // tenant changed providers in between.
    expect(src).toContain('...(record.tenantId ? { tenantId: record.tenantId } : {})');
  });
});

describe('MAIL-6: the stored credential is unreachable from a browser', () => {
  it('relies on the existing deny-by-default rule for tenant subcollections', () => {
    // tenants/{id}/integrations/email is covered by the catch-all below, so the ciphertext
    // is unreachable by default rather than by a rule somebody remembered to add.
    const rules = read('firestore.rules');
    expect(rules).toContain('match /tenants/{tenantId}/{subcollection}/{docId=**}');
    expect(rules).toMatch(
      /match \/tenants\/\{tenantId\}\/\{subcollection\}\/\{docId=\*\*\} \{\s*allow read, write: if false;/,
    );
  });

  it('stores it under the established integrations convention', () => {
    const src = active(PROVIDER);
    expect(src).toContain(".collection('integrations')");
    expect(src).toContain('EMAIL_INTEGRATION_DOC');
  });
});
