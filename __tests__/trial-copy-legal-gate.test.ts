import * as fs from 'fs';
import * as path from 'path';

/**
 * Trial copy + legal page gate (S35, audit P0-5 / P0-6).
 *
 * Locked launch model: card required at signup, no charge until day 15, cancel
 * before day 15 = no charge. The app previously said "No credit card required"
 * in several places and "No payment is required during the trial period" in the
 * signup terms — a direct contradiction. It also lacked refund/cancellation,
 * cookie, and security pages, which are mandatory before charging cards. These
 * assertions keep the corrected copy and the new pages from regressing.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
const exists = (relative: string): boolean => fs.existsSync(path.join(process.cwd(), relative));

describe('trial copy alignment (P0-5)', () => {
  const files = [
    'lib/billing/plans.ts',
    'lib/email/html-templates.ts',
    'components/pricing/PricingPageClient.tsx',
    'app/signup/page.tsx',
    'app/terms/page.tsx',
    'docs/bizosto-com-content/pricing-page.md',
  ];

  it.each(files)('%s contains no misleading no-card / free-payment copy', (file) => {
    const source = read(file).toLowerCase();
    expect(source).not.toContain('no credit card');
    expect(source).not.toContain('no payment is required');
  });

  it('signup terms require a card at signup and bill on day 15', () => {
    const source = read('app/signup/page.tsx');
    expect(source).toContain('payment method is required at signup');
    expect(source).toContain('day 15');
  });

  it('signup failed-payment ladder matches the locked schedule (day 8 read-only, day 21 lock, 60-day retention)', () => {
    const source = read('app/signup/page.tsx');
    expect(source).toContain('day 8');
    expect(source).toContain('day 21');
    expect(source).toContain('60 days');
  });

  it('pricing doc reflects locked pricing, not the stale $99/$299/$799', () => {
    const source = read('docs/bizosto-com-content/pricing-page.md');
    expect(source).toContain('$79/month');
    expect(source).toContain('$149/month');
    expect(source).toContain('$299/month');
    expect(source).not.toContain('$99/month');
    expect(source).not.toContain('$799/month');
  });
});

describe('legal / trust pages exist (P0-6)', () => {
  it.each([
    ['refund-cancellation', 'app/refund-cancellation/page.tsx'],
    ['cookie-policy', 'app/cookie-policy/page.tsx'],
    ['security', 'app/security/page.tsx'],
  ])('%s page exists', (_name, file) => {
    expect(exists(file)).toBe(true);
  });

  it('refund page covers the locked failed-payment ladder', () => {
    const source = read('app/refund-cancellation/page.tsx');
    expect(source).toContain('day 8');
    expect(source).toContain('day 21');
    expect(source).toContain('60 days');
    expect(source).toContain('Stripe');
  });

  it('security page makes no SOC 2 certification claim', () => {
    const source = read('app/security/page.tsx');
    expect(source).toContain('does not currently hold');
    expect(source).not.toMatch(/SOC 2 (certified|compliant)/i);
  });
});
