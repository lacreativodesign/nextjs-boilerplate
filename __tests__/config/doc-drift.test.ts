import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

/**
 * DOC-03 — the generated documentation matches the code that generates it.
 *
 * Two artefacts in this repo are produced by a script and committed: the OpenAPI spec
 * (docs/api/openapi.yaml) and the Firestore collection inventory
 * (docs/database/collections.generated.md). CI regenerates both and fails on any diff —
 * the DOC-01 and DOC-02 steps in Quality Gates.
 *
 * Both had drifted, and had been failing for several merges. The spec still listed
 * /api/login-stamp, deleted in S6, and /api/hr/attendance/list, deleted in S12; it was
 * missing the four support-ticket routes that had since been added. The inventory still
 * listed `hr_employees` (retired in S10) plus the global `finance` and `workflows`
 * settings documents (retired in SET-1 and SET-2), and was missing `ingest_idempotency`
 * (added in IDEM-1).
 *
 * The reason it went unnoticed is worth stating plainly: a deploy going green on Vercel
 * says nothing about the Quality Gates workflow, and these two checks live only there.
 * The four gates run before delivering a session — prettier, tsc, lint, jest — do not
 * include the generators, so a route deletion or a new collection passed all four while
 * leaving CI red.
 *
 * This suite closes that gap from the other side. It regenerates both artefacts in a temp
 * copy and fails if the committed files differ, so drift surfaces in the same jest run
 * that every session already has to pass.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const OPENAPI = 'docs/api/openapi.yaml';
const INVENTORY = 'docs/database/collections.generated.md';
const WORKFLOW = '.github/workflows/test.yml';

/** Runs a generator into a scratch copy and returns what it would have written. */
function regenerate(script: string, output: string): string {
  const committed = read(output);
  const backup = `${output}.doc03.bak`;
  fs.copyFileSync(path.join(ROOT, output), path.join(ROOT, backup));
  try {
    execFileSync('node', [script], { cwd: ROOT, stdio: 'pipe' });
    return read(output);
  } finally {
    // Always restore, so a failing assertion never leaves the working tree modified.
    fs.copyFileSync(path.join(ROOT, backup), path.join(ROOT, output));
    fs.unlinkSync(path.join(ROOT, backup));
    // Sanity: the restore must have worked, or this test corrupted the repo.
    if (read(output) !== committed) {
      throw new Error(`DOC-03 failed to restore ${output}`);
    }
  }
}

describe('DOC-03: the committed docs are current', () => {
  // Generators walk the whole app/api tree; give them room.
  jest.setTimeout(60_000);

  it('the OpenAPI spec matches the routes on disk', () => {
    // A deleted route left in the spec is worse than no spec: it documents an endpoint
    // that answers 404, and anyone integrating against it builds on a promise that is gone.
    expect(regenerate('scripts/generate-openapi.mjs', OPENAPI)).toBe(read(OPENAPI));
  });

  it('the Firestore inventory matches the collections in use', () => {
    expect(regenerate('scripts/generate-firestore-schema.mjs', INVENTORY)).toBe(read(INVENTORY));
  });
});

describe('DOC-03: CI still enforces both, so this suite is a backstop not a replacement', () => {
  const workflow = read(WORKFLOW);

  it('regenerates and diffs the OpenAPI spec', () => {
    expect(workflow).toContain('npm run docs:api');
    expect(workflow).toContain(`git diff --exit-code -- ${OPENAPI}`);
  });

  it('regenerates and diffs the Firestore inventory', () => {
    expect(workflow).toContain('npm run docs:schema');
    expect(workflow).toContain(`git diff --exit-code -- ${INVENTORY}`);
  });

  it('keeps the generator scripts wired to the documented npm commands', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
    expect(scripts['docs:api']).toContain('generate-openapi.mjs');
    expect(scripts['docs:schema']).toContain('generate-firestore-schema.mjs');
  });
});

describe('DOC-03: the drift that was there is gone', () => {
  it('no longer documents routes that were deleted', () => {
    const spec = read(OPENAPI);
    // Deleted in S6 and S12 respectively.
    expect(spec).not.toContain('/api/login-stamp:');
    expect(spec).not.toContain('/api/hr/attendance/list:');
  });

  it('documents the routes that were added', () => {
    const spec = read(OPENAPI);
    expect(spec).toContain('/api/support/help-feedback:');
    expect(spec).toContain('/api/super_admin/tickets:');
  });

  it('no longer lists collections that were retired', () => {
    const inventory = read(INVENTORY);
    // hr_employees retired in S10; the global finance and workflows settings documents
    // in SET-1 and SET-2.
    expect(inventory).not.toMatch(/^- `hr_employees`$/m);
    expect(inventory).not.toMatch(/^- `finance`$/m);
    expect(inventory).not.toMatch(/^- `workflows`$/m);
  });

  it('lists the collection that was added', () => {
    expect(read(INVENTORY)).toMatch(/^- `ingest_idempotency`$/m);
  });
});
