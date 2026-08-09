import fs from 'fs';
import path from 'path';

/**
 * Regression guard for storage.rules (STOR-1).
 *
 * Storage rules are published to Firebase rather than executed from this repo, so a bad
 * edit cannot be caught by the type checker or by any runtime test. These assertions run
 * on every PR and again inside the deploy workflow, so a dangerous ruleset fails BEFORE
 * it reaches the bucket.
 *
 * What went wrong. S4/S5 moved every object under tenants/{tenantId}/... and granted the
 * whole subtree to anyone holding that tenant's claim. That was tenant-scoped but neither
 * role- nor path-scoped: inside a workspace, a tenant's EXTERNAL client could read
 * employee contracts under employees/** and employee-documents/**, and every other
 * client's deliverables under projects/**. Any user could delete any object. Prefixes
 * only ever written by the Admin SDK — exports, imports, support screenshots, DocuSign
 * envelopes — were reachable from the browser.
 *
 * Access is now granted per prefix to the roles that actually upload there. Firebase
 * Security Rules OR every matching allow, so the absence of a grant is the denial: these
 * tests therefore pin both the grants that must exist and the ones that must not.
 *
 * Comments are stripped before matching so that prose describing an old rule can never
 * be mistaken for the rule itself.
 */

const rulesSource = fs.readFileSync(path.join(process.cwd(), 'storage.rules'), 'utf8');

/** Rules text with all // comments removed, so only live directives are matched. */
const activeRules = rulesSource.replace(/\/\/.*/g, '');

/**
 * Extracts one rules helper function body. A fixed-size slice would run past the closing
 * brace into the next function and assert against the wrong roles, so the window ends at
 * the brace. These helpers contain no nested braces.
 */
function helperBody(name: string): string {
  const start = activeRules.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`storage.rules is missing helper ${name}()`);
  return activeRules.slice(start, activeRules.indexOf('}', start) + 1);
}

/**
 * Extracts one match block, bounded by the next sibling `match` rather than by a fixed
 * window or the next brace — the path segment `{tenantId}` contains a brace of its own.
 */
function matchBlock(header: string): string {
  const start = activeRules.indexOf(header);
  if (start === -1) throw new Error(`storage.rules is missing block ${header}`);
  const next = activeRules.indexOf('match /', start + header.length);
  return next === -1 ? activeRules.slice(start) : activeRules.slice(start, next);
}

/** The prefixes the browser may address, and the roles allowed on each. */
const PREFIX_GRANTS: Array<{ prefix: string; guard: string }> = [
  { prefix: 'projects', guard: 'canProjectFiles' },
  { prefix: 'client-files', guard: 'canClientFiles' },
  { prefix: 'employees', guard: 'canEmployeeFiles' },
  { prefix: 'employee-documents', guard: 'canEmployeeDocuments' },
];

describe('storage.rules — structural guarantees', () => {
  it('declares rules_version 2', () => {
    expect(rulesSource.trimStart().startsWith("rules_version = '2';")).toBe(true);
  });

  it('is wired into firebase.json', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
    expect(cfg.storage?.rules).toBe('storage.rules');
  });

  it('denies everything outside a tenant prefix', () => {
    expect(activeRules).toMatch(/match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
  });

  it('denies every tenant prefix that has no explicit grant', () => {
    // exports/**, imports/**, support/**, documents/**, docusign/**, files/**, branding/**
    expect(activeRules).toMatch(
      /match \/tenants\/\{tenantId\}\/\{allPaths=\*\*\} \{\s*allow read, write: if false;/,
    );
  });
});

describe('storage.rules — dangerous patterns', () => {
  it('never grants an unconditional allow (if true)', () => {
    expect(activeRules.match(/allow[^:]*:\s*if\s+true/g) || []).toEqual([]);
  });

  it('never grants blanket access to any signed-in user', () => {
    expect(activeRules).not.toMatch(/allow[^:\n]*:\s*if\s+request\.auth != null\s*;/);
    expect(activeRules).not.toMatch(/allow[^:\n]*:\s*if\s+isSignedIn\(\)\s*;/);
  });

  it('never regrants the whole tenant subtree on a tenant claim alone', () => {
    // The STOR-1 defect itself: one match on the tenant subtree granted by tenancy only.
    const blanket = new RegExp(
      String.raw`match /tenants/\{tenantId\}/\{allPaths=\*\*\} \{[^}]*allow (read|create|update|delete|write)[^:]*:\s*if\s+inCallerTenant`,
    );
    expect(activeRules).not.toMatch(blanket);
  });

  it('grants no delete from the client SDK; removals go through the Admin SDK', () => {
    const deleteGrants = activeRules.match(/allow[^:\n]*\bdelete\b[^:\n]*:\s*if\s+([^;]+);/g) || [];
    expect(deleteGrants.length).toBeGreaterThan(0);
    expect(deleteGrants.filter((grant) => !/:\s*if\s+false\s*;/.test(grant))).toEqual([]);
  });

  it('caps every write with the size ceiling', () => {
    const writeGrants = activeRules.match(/allow create, update:\s*if\s+([^;]+);/g) || [];
    expect(writeGrants.length).toBe(5);
    expect(writeGrants.filter((grant) => !grant.includes('withinSizeLimit()'))).toEqual([]);
  });
});

describe('storage.rules — per-prefix authorization', () => {
  it.each(PREFIX_GRANTS)('$prefix/** is gated by $guard', ({ prefix, guard }) => {
    expect(activeRules).toContain(`match /tenants/{tenantId}/${prefix}/{allPaths=**}`);
    expect(activeRules).toContain(`allow read: if ${guard}(tenantId);`);
    expect(activeRules).toContain(
      `allow create, update: if ${guard}(tenantId) && withinSizeLimit();`,
    );
  });

  it('restricts HR prefixes to HR and admin roles, never the external client', () => {
    expect(helperBody('canEmployeeFiles')).toContain("['admin']");
    expect(helperBody('canEmployeeDocuments')).toContain("['hr', 'admin']");

    // The role lists are the whole point: 'client' must appear in exactly one of them.
    const roleLists = activeRules.match(/tenantRole\(tenantId, \[[^\]]*\]\)/g) || [];
    expect(roleLists.filter((list) => list.includes("'client'"))).toEqual([
      "tenantRole(tenantId, ['client'])",
    ]);
  });

  it('keeps project delivery roles off the client upload prefix', () => {
    const body = helperBody('canClientFiles');
    expect(body).not.toContain("'admin'");
    expect(body).not.toContain('isSuperAdmin()');
  });

  it('grants the project prefix to delivery roles only', () => {
    const body = helperBody('canProjectFiles');
    expect(body).toContain("'admin', 'am', 'production', 'production_manager'");
    expect(body).not.toContain("'client'");
    expect(body).not.toContain("'finance'");
  });

  it('reserves brand writes for the platform operator', () => {
    const block = matchBlock('match /tenants/{tenantId}/brand/{allPaths=**}');
    expect(block).toContain('allow create, update: if isSuperAdmin() && withinSizeLimit();');
    expect(block).toContain('allow delete: if false;');
  });

  it('still fails closed on a missing or blank tenant claim', () => {
    expect(activeRules).toContain('callerTenant() is string');
    expect(activeRules).toContain("callerTenant() != ''");
    expect(activeRules).toContain('callerTenant() == tenantId');
  });

  it('treats a missing role claim as no role', () => {
    expect(helperBody('tenantRole')).toContain('callerRole() is string');
  });
});

describe('storage.rules — deployment', () => {
  const workflow = fs.readFileSync(
    path.join(process.cwd(), '.github', 'workflows', 'deploy-rules.yml'),
    'utf8',
  );

  it('is published by the deploy workflow, not only committed to the repo', () => {
    expect(workflow).toContain('storage:rules');
  });

  it('redeploys when the ruleset changes', () => {
    expect(workflow).toContain("- 'storage.rules'");
  });

  it('runs this guard before publishing', () => {
    expect(workflow).toContain('__tests__/config/storage-rules-guard.test.ts');
  });
});
