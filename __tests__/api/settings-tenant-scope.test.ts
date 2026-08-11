import fs from 'fs';
import path from 'path';

/**
 * SET-1 — a tenant's saved settings are the settings that get applied.
 *
 * getWorkflowSettings() read the global document `settings/workflows`. The settings page
 * has always SAVED to `settings/{tenantId}_workflows`. The two never met, so every
 * tenant's SLA days, at-risk threshold and overdue threshold were stored correctly,
 * displayed back correctly, and then ignored by every screen that computes project
 * health — production overview and queue, AM overview, pipeline and project list, and all
 * five assign / move-stage / QA routes.
 *
 * Ignored is the charitable reading. The global document is shared, so a value written
 * there by any earlier code path applied to every tenant at once.
 *
 * getNotificationSettings() had the identical split: it read `settings/notifications`
 * while the route saved and re-read `settings/{tenantId}_notifications`.
 *
 * The rule these tests encode is that a settings reader must address the same document id
 * as the writer, and must fail closed on a missing tenant rather than silently reaching
 * for a shared global — the same discipline getUsersByRoles() already follows.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Source with comments stripped, so prose naming an old document id is not a match. */
const active = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const SETTINGS_UTILS = 'app/api/admin/settings/_utils.ts';
const REPORTS_UTILS = 'app/api/admin/reports/_utils.ts';

/** Every route that consumes workflow thresholds. */
const WORKFLOW_CONSUMERS = [
  'app/api/admin/production/overview/route.ts',
  'app/api/admin/production/queue/route.ts',
  'app/api/admin/production/project/assign/route.ts',
  'app/api/admin/production/project/move-stage/route.ts',
  'app/api/am/overview/route.ts',
  'app/api/am/projects/list/route.ts',
  'app/api/am/projects/move-stage/route.ts',
  'app/api/am/pipeline/route.ts',
  'app/api/production/overview/route.ts',
  'app/api/production/queue/route.ts',
  'app/api/production/project/qa/route.ts',
  'app/api/production/project/move-stage/route.ts',
];

/** Every route that consumes report settings. */
const REPORT_CONSUMERS = [
  'app/api/admin/overview/route.ts',
  'app/api/admin/reports/overview/route.ts',
  'app/api/admin/reports/revenue/route.ts',
  'app/api/admin/reports/delivery/route.ts',
  'app/api/admin/reports/settings/route.ts',
  'app/api/admin/reports/production/route.ts',
  'app/api/admin/reports/clients/route.ts',
];

describe('SET-1: the reader addresses the document the writer saves to', () => {
  const utils = active(SETTINGS_UTILS);

  it('reads workflow settings from the tenant document', () => {
    expect(utils).toContain('`${scopedTenantId}_workflows`');
  });

  it('reads notification settings from the tenant document', () => {
    expect(utils).toContain('`${scopedTenantId}_notifications`');
  });

  it('never reads the shared global workflow or notification document', () => {
    expect(utils).not.toMatch(/\.doc\(\s*['"`]workflows['"`]\s*\)/);
    expect(utils).not.toMatch(/\.doc\(\s*['"`]notifications['"`]\s*\)/);
  });

  it('matches the ids the settings routes write', () => {
    // If a writer is ever repointed, this fails rather than the two silently diverging.
    expect(active('app/api/admin/settings/workflows/route.ts')).toContain(
      '`${auth.user.tenantId}_workflows`',
    );
    expect(active('app/api/admin/settings/notifications/route.ts')).toContain(
      '`${auth.user.tenantId}_notifications`',
    );
  });
});

describe('SET-1: a missing tenant fails closed', () => {
  const utils = active(SETTINGS_UTILS);

  it.each(['getWorkflowSettings', 'getNotificationSettings'])(
    '%s requires a tenantId at compile time',
    (fn) => {
      expect(utils).toMatch(new RegExp(`${fn}\\(tenantId: string\\)`));
    },
  );

  it.each(['getWorkflowSettings', 'getNotificationSettings'])(
    '%s throws on a blank tenant',
    (fn) => {
      const body = utils.slice(utils.indexOf(`export async function ${fn}(`));
      expect(body.slice(0, 400)).toContain(`${fn}: tenantId is required`);
    },
  );

  it('leaves no optional-tenant reader that could reach a global document', () => {
    expect(utils).not.toMatch(/getWorkflowSettings\(\s*tenantId\?/);
    expect(utils).not.toMatch(/getNotificationSettings\(\s*tenantId\?/);
  });
});

describe('SET-1: every consumer passes its own tenant', () => {
  it.each(WORKFLOW_CONSUMERS)('%s scopes getWorkflowSettings', (rel) => {
    const src = active(rel);
    expect(src).toMatch(/getWorkflowSettings\(\s*\w[\w.]*\s*\)/);
    // A bare call would read another tenant's thresholds, which is the whole defect.
    expect(src).not.toContain('getWorkflowSettings()');
  });

  it.each(REPORT_CONSUMERS)('%s scopes getReportSettings', (rel) => {
    const src = active(rel);
    expect(src).toMatch(/getReportSettings\(\s*\w[\w.]*\s*\)/);
    expect(src).not.toContain('getReportSettings()');
  });

  it('threads the tenant through the report settings resolver', () => {
    const src = active(REPORTS_UTILS);
    expect(src).toMatch(/getReportSettings\(tenantId: string\)/);
    expect(src).toContain('getWorkflowSettings(tenantId)');
    expect(src).toContain('getFinanceSettings(tenantId)');
  });

  it('leaves no unscoped call anywhere in the codebase', () => {
    const roots = ['app', 'lib'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const rel = path.relative(ROOT, full);
          const src = active(rel);
          if (
            /getWorkflowSettings\(\)|getNotificationSettings\(\)|getReportSettings\(\)/.test(src)
          ) {
            offenders.push(rel);
          }
        }
      }
    };
    for (const root of roots) walk(path.join(ROOT, root));
    expect(offenders).toEqual([]);
  });
});
