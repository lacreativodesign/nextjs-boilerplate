import * as fs from 'fs';
import * as path from 'path';

/**
 * SKU-driven consent copy gate (F8, BIL-01).
 *
 * The signup terms body and consent checkbox previously said "recurring monthly
 * basis" and "automatic monthly billing" unconditionally, so a customer buying
 * the Annual plan agreed to monthly-billing language — a legal mismatch between
 * the authorized cadence and the actual SKU. The static termsText constant is
 * now buildTermsText(isAnnual), which swaps the cadence words, and the checkbox
 * label switches between annual/monthly. These assertions keep the cadence-aware
 * copy from regressing back to hardcoded monthly wording.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const source = read('app/signup/page.tsx');

describe('signup consent cadence copy (BIL-01)', () => {
  it('exposes buildTermsText(isAnnual) instead of a static termsText constant', () => {
    expect(source).toContain('function buildTermsText(isAnnual: boolean)');
    expect(source).not.toContain('const termsText =');
  });

  it('billing terms use the cadence variable, not hardcoded monthly wording', () => {
    expect(source).toContain('recurring ${cadenceAdjective} basis');
    expect(source).not.toContain('recurring monthly basis');
  });

  it('the terms tail authorizes the selected cadence, not automatic monthly billing', () => {
    expect(source).toContain('automatic ${cadenceAdjective} billing after your free trial ends');
    expect(source).not.toContain('automatic monthly billing after your free trial ends');
  });

  it('the consent checkbox label switches cadence between annual and monthly', () => {
    expect(source).toContain("{isAnnual ? 'annual' : 'monthly'} billing of my selected plan");
    expect(source).not.toMatch(/automatic\s+monthly billing of my selected plan/);
  });
});
