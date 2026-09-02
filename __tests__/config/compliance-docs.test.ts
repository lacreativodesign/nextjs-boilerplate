import fs from 'fs';
import path from 'path';
import { BILLING_LIFECYCLE } from '@/lib/billing/lifecycle-policy';

/**
 * SOC2 F-15 / F-16 regression guard.
 *
 * Two documents an auditor will ask for on day one did not exist: a subprocessor
 * register (CC9.2, GDPR Art. 28) and a data retention schedule (C1.2, P4.2).
 *
 * Writing them is the easy half. The hard half is that a compliance document is
 * worth nothing once it drifts from the system it describes — and prose drifts
 * silently, because nothing fails when it does. This suite binds both documents to
 * the code: every retention period is read from the constant that implements it,
 * and the subprocessor register is checked against the integrations that actually
 * exist in the repository.
 *
 * The repo already applies this idea to generated artefacts in doc-drift.test.ts.
 * This extends it to hand-written compliance documents.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SUBPROCESSORS = 'docs/security/subprocessors.md';
const RETENTION = 'docs/security/data-retention-schedule.md';

describe('compliance documents exist', () => {
  it.each([SUBPROCESSORS, RETENTION])('%s is committed', (rel) => {
    expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
  });
});

describe('retention schedule matches the code', () => {
  const doc = () => read(RETENTION);

  it('states the failed-payment ladder exactly as implemented', () => {
    const source = doc();
    expect(source).toContain(`${BILLING_LIFECYCLE.failedPayment.graceDays} days`);
    expect(source).toContain(`day ${BILLING_LIFECYCLE.failedPayment.readOnlyOnDay}`);
    expect(source).toContain(`day ${BILLING_LIFECYCLE.failedPayment.hardLockOnDay}`);
    expect(source).toContain(
      `${BILLING_LIFECYCLE.failedPayment.retentionDays} days after hard lock`,
    );
  });

  it('states the termination retention period exactly as implemented', () => {
    expect(doc()).toContain(`${BILLING_LIFECYCLE.termination.retentionDays} days`);
  });

  it('lists every allowlisted retention entity type and no others', () => {
    const module = read('lib/compliance/data-retention.ts');
    const block = module.slice(
      module.indexOf('const RETENTION_TARGETS'),
      module.indexOf('function retentionDeletionArmed'),
    );
    const types = Array.from(block.matchAll(/^\s{2}(\w+):\s*\{/gm)).map((m) => m[1]);

    expect(types.length).toBeGreaterThan(0);
    for (const type of types) {
      expect(doc()).toContain(`\`${type}\``);
    }
    // users must never become eligible; scheduled erasure would orphan Auth accounts.
    expect(types).not.toContain('users');
    expect(doc()).toContain('`users` is deliberately **not** eligible');
  });

  it('records that retention deletion is gated behind the arming flag', () => {
    expect(read('lib/compliance/data-retention.ts')).toContain('ERP_ENABLE_RETENTION_DELETION');
    expect(doc()).toContain('ERP_ENABLE_RETENTION_DELETION');
  });
});

describe('subprocessor register matches the integrations that exist', () => {
  const doc = () => read(SUBPROCESSORS);

  it.each([
    ['Vercel'],
    ['Google (Firebase)'],
    ['Stripe'],
    ['Resend'],
    ['Upstash'],
    ['Sentry'],
    ['Anthropic'],
  ])('names %s as an active subprocessor', (name) => {
    expect(doc()).toContain(name);
  });

  it.each([
    ['Twilio', 'lib/integrations/twilio.ts'],
    ['DocuSign', 'lib/integrations/docusign.ts'],
    ['Calendly', 'lib/integrations/calendly.ts'],
  ])('accounts for the deferred %s integration that has code in the repo', (name, file) => {
    expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    expect(doc()).toContain(name);
  });

  it('does not claim Uploadcare receives data while it is unmounted', () => {
    // The mounted uploader writes to Firebase Storage; the Uploadcare component is
    // dead code. Listing it would misstate where customer files actually go.
    const mounted = read('app/dashboard/documents/page.tsx');
    expect(mounted).toContain('@/components/files/FileUploader');
    expect(doc()).toContain('Uploadcare receives\nno data and is not a subprocessor');
  });
});
