import * as fs from 'fs';
import * as path from 'path';

/**
 * Q4b (DOC-01) — OpenAPI drift gate guard.
 *
 * The committed API spec (docs/api/openapi.yaml) is generated from the App Router
 * route handlers by scripts/generate-openapi.mjs. CI regenerates it and then runs
 * `git diff --exit-code`, so a PR that adds/changes routes without regenerating the
 * spec fails. These source-inspection assertions keep that wiring from regressing.
 * The real byte-level drift check lives in CI (it needs git); here we assert the
 * gate exists and the committed spec is present and well-formed.
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const WORKFLOW = '.github/workflows/test.yml';
const SPEC = 'docs/api/openapi.yaml';
const GENERATOR = 'scripts/generate-openapi.mjs';
const PACKAGE_JSON = 'package.json';

describe('DOC-01: CI enforces OpenAPI spec/route parity', () => {
  it('the Quality Gates workflow generates then diff-checks the spec', () => {
    const workflow = read(WORKFLOW);
    expect(workflow).toContain('npm run docs:api');
    // The drift gate: after regenerating, fail if the committed spec differs.
    expect(workflow).toMatch(/git diff --exit-code[^\n]*docs\/api\/openapi\.yaml/);
  });

  it('docs:api points at the generator that writes docs/api/openapi.yaml', () => {
    const pkg = JSON.parse(read(PACKAGE_JSON)) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['docs:api']).toContain('generate-openapi.mjs');

    const generator = read(GENERATOR);
    expect(generator).toContain('docs/api/openapi.yaml');
  });

  it('the committed spec exists and is a well-formed, non-trivial OpenAPI document', () => {
    const spec = read(SPEC);
    expect(spec.startsWith('openapi: 3.0.3')).toBe(true);
    expect(spec).toContain('title: Bizosto ERP API');
    // Sanity floor: the ERP exposes hundreds of routes; guard against an empty or
    // truncated spec slipping through.
    const pathCount = (spec.match(/^ {2}\/api/gm) || []).length;
    expect(pathCount).toBeGreaterThan(100);
  });
});
