import fs from 'fs';
import path from 'path';
import {
  PROOF_GATED_SURFACES,
  FABRICATED_CUSTOMER_NAMES,
  UNEARNED_COMPLIANCE_CLAIMS,
  CONTRADICTED_PROMISES,
  UNSOURCED_METRIC_PATTERN,
  UNSHIPPED_CAPABILITIES,
} from '@/lib/marketing/proof-policy';

/**
 * P0-3b — the pricing page may only claim what is true.
 *
 * Removed in this session: four invented customer testimonials, a four-name logo wall for
 * companies that are not customers, an unsourced "42%" outcome metric, "SOC 2 Ready" and
 * "GDPR Compliant" badges with no audit or DPA behind them, a 30-day money-back guarantee
 * that contradicts the Refund & Cancellation Policy, an Enterprise "AI forecasting: yes"
 * row with no forecasting code anywhere in the repo, and an "SSO / SAML" label when only
 * OAuth 2.0 / OIDC is implemented.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const PRICING = 'components/pricing/PricingPageClient.tsx';

describe('P0-3b: no fabricated social proof on customer-facing surfaces', () => {
  it.each(PROOF_GATED_SURFACES)('%s names no company that is not a customer', (rel) => {
    const src = read(rel);
    const hits = FABRICATED_CUSTOMER_NAMES.filter(
      (name) => src.includes(name) && !src.includes(`invented`) && !src.includes(`removed`),
    );
    expect(hits).toEqual([]);
  });

  it.each(PROOF_GATED_SURFACES)('%s quotes no unsourced outcome metric', (rel) => {
    expect(UNSOURCED_METRIC_PATTERN.test(read(rel))).toBe(false);
  });

  it('the pricing page renders no testimonial block', () => {
    const src = read(PRICING);
    expect(src).not.toContain('<blockquote');
    expect(src).not.toMatch(/const testimonials\s*=/);
  });

  it('the pricing page no longer claims to be trusted by teams it has not served', () => {
    expect(read(PRICING)).not.toContain('Trusted by operations-driven teams');
  });
});

describe('P0-3b: no unearned compliance or certification claims', () => {
  it.each(PROOF_GATED_SURFACES)('%s claims no certification it does not hold', (rel) => {
    const src = read(rel).toLowerCase();
    const hits = UNEARNED_COMPLIANCE_CLAIMS.filter(
      (claim) => src.includes(claim) && !src.includes(`not ${claim}`),
    );
    expect(hits).toEqual([]);
  });

  it('the pricing page states plainly that Bizosto is not SOC 2 certified', () => {
    expect(read(PRICING)).toContain('not SOC 2 certified');
  });
});

describe('P0-3b: commercial promises match the canonical lifecycle policy', () => {
  it.each(PROOF_GATED_SURFACES)('%s makes no promise the policy contradicts', (rel) => {
    const src = read(rel).toLowerCase();
    const hits = CONTRADICTED_PROMISES.filter(
      (claim) => src.includes(claim) && !src.includes(`withdrawn`),
    );
    expect(hits).toEqual([]);
  });

  it('the trial-end and refund answers are derived, not written by hand', () => {
    const src = read(PRICING);
    expect(src).toContain("from '@/lib/billing/lifecycle-policy'");
    expect(src).toContain('answer: LIFECYCLE_COPY.trial,');
    expect(src).toContain('answer: LIFECYCLE_COPY.refunds,');
  });

  it('the pricing page no longer says the workspace is paused after the trial', () => {
    expect(read(PRICING)).not.toContain('your workspace is paused');
  });
});

describe('P0-3b: unshipped capabilities are marked planned, never sold', () => {
  it('SAML is not offered as a shipped capability', () => {
    const src = read(PRICING);
    expect(src).not.toContain("'SSO / SAML'");
    expect(src).toContain("'SSO (OAuth/OIDC)'");
    expect(src).toMatch(/SAML is planned/);
  });

  it('the SSO label matches what lib/auth/sso-oauth.ts actually implements', () => {
    const sso = read('lib/auth/sso-oauth.ts');
    expect(sso).toContain("export type SsoProvider = 'google' | 'microsoft' | 'okta' | 'auth0'");
    expect(sso.toLowerCase()).not.toContain('saml');
  });

  it('AI forecasting is not marked available on any plan', () => {
    const src = read(PRICING);
    const matrix = src.slice(
      src.indexOf('const comparisonMatrix'),
      src.indexOf('} as const;', src.indexOf('const comparisonMatrix')),
    );
    const forecastRows = matrix
      .split('\n')
      .filter((line) => line.includes("'AI forecasting'"))
      .map((line) => line.trim());

    expect(forecastRows).toHaveLength(3);
    forecastRows.forEach((row) => expect(row).toBe("'AI forecasting': 'coming-soon',"));
  });

  it('every unshipped capability is still listed in the proof policy', () => {
    expect(UNSHIPPED_CAPABILITIES).toContain('SAML');
    expect(UNSHIPPED_CAPABILITIES).toContain('AI forecasting');
  });
});

describe('P0-3b: what replaced the removed proof is verifiable', () => {
  it('the replacement section describes controls, not customers', () => {
    const src = read(PRICING);
    expect(src).toContain('Built for operations you can audit');
    expect(src).toContain('founder-led beta');
    expect(src).toMatch(/const verifiedControls\s*=/);
  });

  it('the claimed controls exist in the repository', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'lib/tenant/ownership.ts'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'lib/audit.ts'))).toBe(true);
    expect(
      fs.existsSync(
        path.join(process.cwd(), '__tests__/api/v37-tenant-mutation-ownership.test.ts'),
      ),
    ).toBe(true);
  });

  it('the plan storage figures still match lib/billing/plans.ts', () => {
    const plans = read('lib/billing/plans.ts');
    expect(plans).toContain('storage: 21474836480'); // 20GB  Starter
    expect(plans).toContain('storage: 80530636800'); // 75GB  Pro
    expect(plans).toContain('storage: 268435456000'); // 250GB Enterprise

    const src = read(PRICING);
    expect(src).toContain("Storage: '20GB'");
    expect(src).toContain("Storage: '75GB'");
    expect(src).toContain("Storage: '250GB'");
  });
});
