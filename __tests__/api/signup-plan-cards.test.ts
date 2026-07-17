import * as fs from 'fs';
import * as path from 'path';
import { plans } from '@/lib/billing/plans';
import { PLAN_MODULES } from '@/app/config/plans';

/**
 * Signup plan-card accuracy gate (S42, audit P0-6).
 *
 * The /signup plan cards previously misstated what each tier includes — Starter
 * listed "Finance" (a Pro+ module) and "10GB" (real: 20GB); Pro listed "50 users"
 * (real: 20) and "50GB" (real: 75GB) and "HR" (an Enterprise module). That is a
 * material misrepresentation at the point of sale. These assertions pin the card
 * copy to the two servers-side sources of truth — lib/billing/plans.ts (price,
 * users, storage) and app/config/plans.ts PLAN_MODULES (module access) — so the
 * cards can never silently drift from what a customer actually receives.
 */

const signup = fs.readFileSync(path.join(process.cwd(), 'app/signup/page.tsx'), 'utf8');

// Isolate the plan-card array so we only assert against card copy, not the
// whole page (which legitimately mentions many module names elsewhere).
const cardsBlock = (() => {
  const start = signup.indexOf('const plans: Array<{');
  expect(start).toBeGreaterThan(-1);
  // The array closes at the first "];" that begins a line (column 0). The inner
  // features: [...] arrays close mid-line, so an indented "];" never matches.
  const rel = signup.slice(start).search(/\n\];/);
  expect(rel).toBeGreaterThan(-1);
  const raw = signup.slice(start, start + rel);
  // Drop // comment lines: the guidance comments intentionally name excluded
  // modules ("NOT Finance..."), which are not customer-facing card copy.
  return raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
})();

describe('signup plan cards match billing source of truth (S42)', () => {
  it('shows each plan price from lib/billing/plans.ts', () => {
    expect(cardsBlock).toContain(`price: ${plans.starter.price}`);
    expect(cardsBlock).toContain(`price: ${plans.pro.price}`);
    expect(cardsBlock).toContain(`price: ${plans.enterprise.price}`);
  });

  it('states the correct storage per tier (20GB / 75GB / 250GB)', () => {
    expect(cardsBlock).toContain('20GB');
    expect(cardsBlock).toContain('75GB');
    expect(cardsBlock).toContain('250GB');
    // The old wrong values must be gone.
    expect(cardsBlock).not.toMatch(/\b10GB\b/);
    expect(cardsBlock).not.toMatch(/(?<!2)50GB/);
  });

  it('states the correct user counts (10 / 20 / unlimited)', () => {
    expect(cardsBlock).toContain('10 users');
    expect(cardsBlock).toContain('20 users');
    expect(cardsBlock.toLowerCase()).toContain('unlimited users');
    // The old wrong "50 users" claim must be gone.
    expect(cardsBlock).not.toContain('50 users');
  });

  it('does not attribute Pro/Enterprise-only modules to Starter', () => {
    // Split the block into per-plan slices to check module claims in context.
    const starterSlice = cardsBlock.slice(
      cardsBlock.indexOf("key: 'starter'"),
      cardsBlock.indexOf("key: 'pro'"),
    );
    // Finance and HR are NOT in the Starter module set.
    expect(PLAN_MODULES.starter.finance).toBe(false);
    expect(PLAN_MODULES.starter.hr).toBe(false);
    expect(starterSlice).not.toMatch(/\bFinance\b/);
    expect(starterSlice).not.toMatch(/\bHR\b/);
  });

  it('does not attribute the Enterprise-only HR module to Pro', () => {
    const proSlice = cardsBlock.slice(
      cardsBlock.indexOf("key: 'pro'"),
      cardsBlock.indexOf("key: 'enterprise'"),
    );
    expect(PLAN_MODULES.pro.hr).toBe(false);
    expect(proSlice).not.toMatch(/\bHR\b/);
  });

  it('surfaces each tier’s headline additions', () => {
    // Pro’s headline modules are Finance + Production; Enterprise’s is HR.
    expect(cardsBlock).toMatch(/Finance & Production/);
    expect(cardsBlock).toMatch(/HR module/);
  });
});
