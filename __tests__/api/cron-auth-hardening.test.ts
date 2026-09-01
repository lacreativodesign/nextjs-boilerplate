import fs from 'fs';
import path from 'path';

/**
 * SOC2 F-04 regression guard.
 *
 * Four cron routes authenticated with:
 *
 *   const isCronFromVercel =
 *     process.env.VERCEL === '1' && request.headers.get('x-vercel-cron') === '1';
 *   if (isCronFromVercel) return true;
 *
 * `x-vercel-cron` is a request header, so it is supplied by whoever makes the
 * request. The short-circuit ran BEFORE the CRON_SECRET check, so any caller able
 * to reach the handler could assert it and trigger a cross-tenant backup run, or
 * force tenant downgrades and hard-locks via the billing crons.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` whenever CRON_SECRET is
 * set, which is the only mechanism the other eight cron routes ever relied on.
 *
 * This is a source-level guard across every cron route so a future route cannot
 * reintroduce header-based authorization.
 */

const CRON_DIR = path.join(process.cwd(), 'app', 'api', 'cron');

function cronRouteFiles(): string[] {
  return fs
    .readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(CRON_DIR, entry.name, 'route.ts'))
    .filter((file) => fs.existsSync(file));
}

const routes = cronRouteFiles();

describe('cron route authentication', () => {
  it('finds every cron route on disk', () => {
    expect(routes.length).toBeGreaterThanOrEqual(12);
  });

  it.each(routes.map((file) => [path.relative(process.cwd(), file), file]))(
    '%s requires a CRON_SECRET bearer token',
    (_label, file) => {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).toContain('CRON_SECRET');
      expect(source).toMatch(/Bearer \$\{(secret|CRON_SECRET)\}/);
    },
  );

  it.each(routes.map((file) => [path.relative(process.cwd(), file), file]))(
    '%s never authorizes on a client-supplied header',
    (_label, file) => {
      const source = fs.readFileSync(file, 'utf8');
      // The header may still be mentioned in a comment explaining why it is not trusted;
      // what must never reappear is a code path that returns true because of it.
      expect(source).not.toMatch(/if\s*\(\s*isCronFromVercel\s*\)\s*return\s+true\s*;/);
      expect(source).not.toMatch(/return\s+request\.headers\.get\(['"]x-vercel-cron['"]\)/);
    },
  );
});
