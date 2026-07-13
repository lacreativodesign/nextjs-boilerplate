import * as fs from 'fs';
import * as path from 'path';

/**
 * S13 — The tenant-repair backfills have an execution path.
 *
 * Two backfills were shipped as CLI scripts only. Bizosto is operated entirely through
 * Claude Code and the browser — there is no terminal, no Codespaces and no local machine —
 * so those scripts could never actually be run: they were dead code guarding real data
 * corruption. (The pre-existing /api/super_admin/backfill-invoice-tokens route has the same
 * problem: no caller anywhere in the app.)
 *
 * The runner is super_admin-only, supports a dry run that writes nothing, and audit-logs
 * any real repair.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S13: the maintenance runner is locked to super_admin', () => {
  const src = read('app/api/super_admin/maintenance/backfill/route.ts');

  it('requires super_admin', () => {
    expect(src).toContain('requireSuperAdmin(req)');
  });

  it('rejects an unknown job rather than guessing', () => {
    expect(src).toContain('JOBS.includes(job)');
    expect(src).toMatch(/job must be one of/);
  });

  it('runs both repairs', () => {
    expect(src).toContain('backfillFileTenantIds(');
    expect(src).toContain('backfillHrDocumentTenantIds(');
  });

  it('audit-logs a real repair but not a dry run', () => {
    expect(src).toContain('if (!dryRun) {');
    expect(src).toContain('platform.maintenance.backfill_tenant_ids');
  });
});

describe('S13: a dry run writes nothing', () => {
  const files = read('lib/tenant/backfill-file-tenant.ts');
  const hr = read('lib/tenant/backfill-hr-document-tenant.ts');

  it.each([
    ['lib/tenant/backfill-file-tenant.ts', files],
    ['lib/tenant/backfill-hr-document-tenant.ts', hr],
  ])('%s skips the commit when dryRun is set', (_name, src) => {
    expect(src).toContain('const dryRun = options.dryRun === true;');
    expect(src).toContain('if (hasUpdates && !dryRun) {');
    expect(src).toContain('await batch.commit();');
  });

  it.each([
    ['lib/tenant/backfill-file-tenant.ts', files],
    ['lib/tenant/backfill-hr-document-tenant.ts', hr],
  ])('%s still never assigns an arbitrary tenant', (_name, src) => {
    expect(src).not.toMatch(/DEFAULT_TENANT_ID/);
  });
});

describe('S13: the repair is reachable from the UI', () => {
  it('a maintenance page exists and calls the runner', () => {
    const page = read('app/super_admin/maintenance/page.tsx');
    expect(page).toContain('/api/super_admin/maintenance/backfill');
    expect(page).toContain('dryRun');
  });

  it('applying a repair requires a dry run for that job first', () => {
    const page = read('app/super_admin/maintenance/page.tsx');
    expect(page).toContain('lastDryRun !== job.key');
  });

  it('is linked from the super_admin console', () => {
    expect(read('app/super_admin/page.tsx')).toContain("href: '/super_admin/maintenance'");
  });
});
