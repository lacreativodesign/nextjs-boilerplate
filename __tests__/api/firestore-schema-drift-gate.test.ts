import * as fs from 'fs';
import * as path from 'path';

/**
 * Q5 (DOC-02) — Firestore collection inventory drift gate guard.
 *
 * docs/database/collections.generated.md is a complete, machine-generated inventory
 * of every Firestore collection the code references, produced by
 * scripts/generate-firestore-schema.mjs. CI regenerates it and runs
 * `git diff --exit-code`, so adding/removing a collection without regenerating fails
 * the build (same drift-gate pattern as the OpenAPI spec, DOC-01). These
 * source-inspection assertions keep the wiring from regressing; the real byte-level
 * drift check lives in CI (it needs git).
 */

const read = (relative: string): string =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const WORKFLOW = '.github/workflows/test.yml';
const INVENTORY = 'docs/database/collections.generated.md';
const GENERATOR = 'scripts/generate-firestore-schema.mjs';
const PACKAGE_JSON = 'package.json';

describe('DOC-02: CI enforces Firestore inventory parity', () => {
  it('the Quality Gates workflow generates then diff-checks the inventory', () => {
    const workflow = read(WORKFLOW);
    expect(workflow).toContain('npm run docs:schema');
    expect(workflow).toMatch(
      /git diff --exit-code[^\n]*docs\/database\/collections\.generated\.md/,
    );
  });

  it('docs:schema points at the generator and is part of quality:ci', () => {
    const pkg = JSON.parse(read(PACKAGE_JSON)) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.['docs:schema']).toContain('generate-firestore-schema.mjs');
    expect(pkg.scripts?.['quality:ci']).toContain('docs:schema');

    const generator = read(GENERATOR);
    expect(generator).toContain('docs/database/collections.generated.md');
    // The generator must skip its own file so its example comments do not pollute.
    expect(generator).toContain('SELF_PATH');
  });

  it('the committed inventory exists, is well-formed, and non-trivial', () => {
    const doc = read(INVENTORY);
    expect(doc.startsWith('# Firestore Collection Inventory (generated)')).toBe(true);
    expect(doc).toContain('## Collections (');

    // Bullet entries look like: - `collection_name`
    const entries = doc.match(/^- `[a-zA-Z][a-zA-Z0-9_]*`$/gm) || [];
    expect(entries.length).toBeGreaterThan(100);

    // Guard against the single-letter example placeholders leaking back in.
    expect(doc).not.toMatch(/^- `x`$/m);

    // Spot-check a few collections we know the app uses.
    for (const name of ['tenants', 'users', 'clients', 'invoices', 'finance_ledger']) {
      expect(doc).toContain(`- \`${name}\``);
    }
  });
});
