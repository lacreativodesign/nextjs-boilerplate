/**
 * Marketing proof policy (P0-3b).
 *
 * The pricing page carried four invented customer testimonials, a four-name logo wall for
 * companies that are not customers, a "reduced month-end close time by 42%" metric with no
 * source, a "SOC 2 Ready" and "GDPR Compliant" badge with no audit or DPA behind either, and
 * a 30-day money-back guarantee that contradicts the refund policy.
 *
 * A pre-revenue product cannot cite customers it does not have. Fabricated social proof is a
 * deceptive-advertising exposure, not a copy choice, and it is the first thing an investor
 * checks. This module is the single list of what may not be claimed until it is true, and
 * `__tests__/marketing/pricing-truth.test.ts` enforces it across customer-facing surfaces.
 *
 * To retire an entry: ship the thing, gather the evidence, delete the entry here in the same
 * PR that adds the claim back, and say in the PR body what the evidence is.
 */

/** Customer-facing files that must not contain unsubstantiated proof. */
export const PROOF_GATED_SURFACES = [
  'components/pricing/PricingPageClient.tsx',
  'app/pricing/page.tsx',
  'docs/bizosto-com-content/pricing-page.md',
] as const;

/**
 * Names used as customers or logos that are not customers.
 * Do not add a name here to "allow" it — remove the name from the page instead.
 */
export const FABRICATED_CUSTOMER_NAMES = [
  'Northline',
  'Alder Retail Group',
  'Alder Group',
  'TerraBuild',
  'Helios Logistics',
] as const;

/** Certification and compliance claims with no audit, report or agreement behind them. */
export const UNEARNED_COMPLIANCE_CLAIMS = [
  'soc 2 ready',
  'soc 2 certified',
  'soc2',
  'gdpr compliant',
  'hipaa compliant',
  'iso 27001',
  'pci compliant',
] as const;

/** Commercial promises that contradict the canonical billing lifecycle policy. */
export const CONTRADICTED_PROMISES = [
  'money-back guarantee',
  'money back guarantee',
  'satisfaction guarantee',
  'cancel for a full refund',
] as const;

/**
 * Outcome metrics quoted as fact. Any percentage or multiple attributed to a customer result
 * needs a named, dated, verifiable source before it can appear.
 */
export const UNSOURCED_METRIC_PATTERN =
  /(reduced|increased|improved|cut|saved|grew|boosted)[^.]{0,60}\b\d{1,3}(\.\d+)?%/i;

/**
 * Capabilities that are NOT shipped and may only appear marked as planned.
 * Verified against the v40 source, not assumed:
 *   - SAML: lib/auth/sso-oauth.ts supports google | microsoft | okta | auth0 over OAuth 2.0 /
 *     OIDC only. There is no SAML implementation anywhere in the repo.
 *   - AI forecasting: no forecasting code exists in lib/ai or app/reports. The AI Workforce
 *     ships agents and natural-language reports, which is a different capability.
 */
export const UNSHIPPED_CAPABILITIES = ['SAML', 'AI forecasting'] as const;
