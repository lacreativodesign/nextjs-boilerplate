import * as fs from 'fs';
import * as path from 'path';

/**
 * S33 — the investor/security documents exist and stay factually anchored to the codebase.
 *
 * SECURITY.md and ARCHITECTURE.md are the first artifacts an enterprise security reviewer or a
 * technical-diligence investor asks for. A doc that quietly drifts from the code is worse than
 * none — it erodes trust the moment a reviewer checks a claim. This test pins the load-bearing
 * facts: the docs must exist, and the specific things they assert (the canonical isolation and
 * billing files, the enforced-CSP file, the plan matrix source) must actually be present, so
 * the docs cannot cite files that were moved or deleted.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(process.cwd(), rel));

describe('S33: investor documentation', () => {
  it('both documents exist', () => {
    expect(exists('docs/SECURITY.md')).toBe(true);
    expect(exists('docs/ARCHITECTURE.md')).toBe(true);
  });

  it('every source file the docs cite as a control actually exists', () => {
    const cited = [
      'lib/tenant/server.ts',
      'lib/tenant/plan-access.ts',
      'lib/billing/apply-subscription-state.ts',
      'lib/security/headers.ts',
      'lib/storage/paths.ts',
      'storage.rules',
      'app/config/plans.ts',
      'lib/erpAccess.ts',
      'middleware.ts',
    ];
    const missing = cited.filter((f) => !exists(f));
    expect(missing).toEqual([]);
  });

  it('the roles listed in SECURITY.md match the code', () => {
    const security = read('docs/SECURITY.md');
    const roles = [
      'super_admin',
      'admin',
      'sales_manager',
      'sales',
      'am_manager',
      'am',
      'production_manager',
      'production',
      'finance',
      'hr',
      'client',
    ];
    roles.forEach((r) => expect(security).toContain(r));
    expect(security).toContain('11 roles');
  });

  it('the guard tests referenced by SECURITY.md are real test files', () => {
    const referenced = [
      '__tests__/api/isolation-hardening.test.ts',
      '__tests__/api/no-pii-in-logs.test.ts',
      '__tests__/lib/csp-enforcement.test.ts',
      '__tests__/nav/all-nav-resolves.test.ts',
      '__tests__/nav/error-boundaries.test.ts',
    ];
    const missing = referenced.filter((f) => !exists(f));
    expect(missing).toEqual([]);
  });
});
