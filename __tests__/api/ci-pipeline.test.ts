import * as fs from 'fs';
import * as path from 'path';

/**
 * Single authoritative CI pipeline gate (Q1).
 *
 * Two overlapping PR workflows used to exist: the comprehensive Quality Gates
 * (test.yml) and a weaker CI duplicate (ci.yml — only tsc/lint/build). Two
 * pipelines drift, so ci.yml was deleted and Quality Gates is now the one
 * required pipeline. A dependency-audit gate was added: it BLOCKS on critical
 * vulnerabilities and REPORTS high ones non-blocking (continue-on-error) until
 * Q3 triages the current highs.
 *
 * This gate pins that consolidation so the redundant pipeline cannot quietly
 * return and the audit gate cannot be weakened.
 */

const CI = '.github/workflows/ci.yml';
const TEST = '.github/workflows/test.yml';

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('single Quality Gates pipeline (Q1)', () => {
  it('removes the redundant ci.yml duplicate pipeline', () => {
    expect(fs.existsSync(path.join(process.cwd(), CI))).toBe(false);
  });

  it('runs the full gate set in Quality Gates (test.yml)', () => {
    const src = read(TEST);
    expect(src).toContain('npm run format:check');
    expect(src).toContain('npm run lint');
    expect(src).toContain('npm run typecheck');
    expect(src).toContain('npm test');
    expect(src).toContain('TZ=Asia/Karachi npm test');
    expect(src).toContain('npm run build');
    expect(src).toContain('npm run bundle:check');
    expect(src).toContain('npm run licenses:check');
  });

  it('blocks on critical vulnerabilities and reports high ones non-blocking', () => {
    const src = read(TEST);
    expect(src).toContain('npm audit --audit-level=critical');
    expect(src).toContain('npm audit --audit-level=high');
    expect(src).toContain('continue-on-error: true');

    // The critical gate must remain blocking — only the high report is softened.
    const criticalIndex = src.indexOf('npm audit --audit-level=critical');
    const highIndex = src.indexOf('npm audit --audit-level=high');
    const continueIndex = src.indexOf('continue-on-error: true');
    expect(continueIndex).toBeGreaterThan(highIndex);
    expect(highIndex).toBeGreaterThan(criticalIndex);
  });

  it('runs on every pull request', () => {
    const src = read(TEST);
    expect(src).toContain('pull_request:');
  });
});
