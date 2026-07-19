import * as fs from 'fs';
import * as path from 'path';

/**
 * Q3 bundle-split + dependency triage guard (QUAL-07, SEC-05).
 *
 * QUAL-07: the finance reports route used to statically import recharts, pulling
 * the whole library into the route's initial bundle. The chart now lives in
 * components/finance/ExpenseBreakdownChart.tsx and is loaded via next/dynamic
 * (ssr:false), so recharts is only fetched when a report actually renders. These
 * assertions keep that split from regressing.
 *
 * SEC-05: docs/security/dependency-triage.md records the high-severity advisory
 * triage and the criterion for raising the audit block level from critical to high.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const REPORTS_PAGE = 'app/admin/finance/reports/page.tsx';
const CHART_COMPONENT = 'components/finance/ExpenseBreakdownChart.tsx';
const TRIAGE_DOC = 'docs/security/dependency-triage.md';

describe('QUAL-07: recharts is code-split out of the finance reports route', () => {
  it('reports page no longer imports recharts statically and loads the chart via next/dynamic(ssr:false)', () => {
    const source = read(REPORTS_PAGE);

    // No static recharts import anywhere in the route module.
    expect(source).not.toMatch(/from ['"]recharts['"]/);

    // The chart is pulled in with next/dynamic, client-only.
    expect(source).toContain("import dynamic from 'next/dynamic'");
    expect(source).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(/);
    expect(source).toContain('@/components/finance/ExpenseBreakdownChart');
    expect(source).toMatch(/ssr:\s*false/);
  });

  it('the extracted chart component owns the recharts import', () => {
    const source = read(CHART_COMPONENT);

    expect(source).toContain("'use client'");
    expect(source).toMatch(/from ['"]recharts['"]/);
    expect(source).toContain('PieChart');
    expect(source).toContain('ResponsiveContainer');
  });
});

describe('SEC-05: dependency triage documents the block-level criterion', () => {
  it('triage doc records raising the audit block level from critical to high', () => {
    const source = read(TRIAGE_DOC).toLowerCase();

    expect(source).toContain('critical');
    expect(source).toContain('high');
    // The criterion: raise the block level once next / @sentry are patched.
    expect(source).toMatch(/block level/);
    expect(source).toContain('next');
    expect(source).toContain('@sentry');
  });
});
