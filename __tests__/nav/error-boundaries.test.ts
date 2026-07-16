import * as fs from 'fs';
import * as path from 'path';

/**
 * S32 — the core role dashboards each have their own error boundary.
 *
 * Before this, only three orphaned module folders under app/(modules) carried an error.tsx —
 * and those folders have no pages under them. The real dashboards (app/finance, app/sales, …)
 * had none, so any render error or failed fetch there bubbled to the ROOT boundary, which
 * replaces the entire page: the user loses the sidebar and their place, and it looks like the
 * whole app crashed rather than one section failing.
 *
 * Each core dashboard now has a segment-level error.tsx that keeps the shell intact and shows
 * a scoped retry via the shared ErrorFallback. This test fails the build if any of them loses
 * its boundary.
 */
const SEGMENTS = [
  'dashboard',
  'sales',
  'finance',
  'hr',
  'production',
  'am',
  'client',
  'super_admin',
];

describe('S32: role dashboards have error boundaries', () => {
  it.each(SEGMENTS)('app/%s has an error.tsx boundary', (seg) => {
    expect(fs.existsSync(path.join(process.cwd(), 'app', seg, 'error.tsx'))).toBe(true);
  });

  it.each(SEGMENTS)('app/%s error boundary uses the shared ErrorFallback', (seg) => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app', seg, 'error.tsx'),
      'utf8',
    );
    expect(src).toContain("from '@/components/errors/ErrorFallback'");
    expect(src).toContain('resetError={reset}');
    expect(src).toContain("'use client'");
  });
});
