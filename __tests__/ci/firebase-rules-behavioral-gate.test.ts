import fs from 'fs';
import path from 'path';

/**
 * P0-04 — the gate that keeps the behavioural rules certification a gate.
 *
 * __tests__/rules/ evaluates the real firestore.rules and storage.rules inside real
 * Firebase emulators. That evidence is only worth anything while it keeps RUNNING, and it
 * runs under its own Jest project (jest.rules.config.js) which the ordinary `npm test`
 * deliberately excludes — so nothing in the default suite would notice if the CI step, the
 * npm script or the dev dependency quietly disappeared, and the certification would report
 * green by not existing.
 *
 * This file closes that loop from INSIDE the ordinary suite: it runs on every PR, needs no
 * emulator, and fails if any part of the wiring is removed or softened. It asserts on
 * configuration, never on authorization — the authorization questions are answered by the
 * emulator, in __tests__/rules/.
 */

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/test.yml');
const jestConfig = read('jest.config.js');
const rulesJestConfig = read('jest.rules.config.js');
const emulatorConfig = JSON.parse(read('firebase.emulator.json'));
const harness = read('__tests__/rules/helpers/emulator.ts');

const RULES_SUITES = [
  '__tests__/rules/firestore-authorization.rules.test.ts',
  '__tests__/rules/storage-authorization.rules.test.ts',
] as const;

/** The workflow minus its comment lines — i.e. what CI actually RUNS. */
const workflowCommands = workflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

/** Rules text with `//` comments stripped, so prose can never satisfy an assertion. */
const activeRules = (file: 'firestore.rules' | 'storage.rules') =>
  read(file).replace(/\/\/.*/g, '');

/**
 * Source with `//` and block comments stripped — i.e. the code that actually RUNS.
 *
 * Same discipline as the two rules guards: the files below EXPLAIN at length why they do
 * not use `describe.skip`, why they do not load jest.setup.js and why they do not touch
 * firebase-admin, so matching the raw text would let a comment about a thing satisfy an
 * assertion about the absence of that thing.
 */
const activeSource = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

describe('P0-04 — the real Firebase rules test environment is a dependency', () => {
  it('declares @firebase/rules-unit-testing as a dev dependency', () => {
    expect(pkg.devDependencies).toHaveProperty('@firebase/rules-unit-testing');
  });

  it('pins it exactly, like every other tool this certification depends on', () => {
    expect(pkg.devDependencies['@firebase/rules-unit-testing']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps it on the major that matches the firebase client SDK it drives', () => {
    // @firebase/rules-unit-testing carries `firebase` as a PEER dependency: the 3.x line
    // pairs with firebase 10.x, 4.x with 11.x. A mismatch installs two copies of the
    // client SDK and the compat handles the library hands back stop talking to the
    // emulator, which would surface as an opaque transport failure rather than a version
    // error. Pinned together on purpose.
    const harnessMajor = pkg.devDependencies['@firebase/rules-unit-testing'].split('.')[0];
    const firebaseMajor = pkg.dependencies.firebase.replace(/^[^\d]*/, '').split('.')[0];
    expect({ harnessMajor, firebaseMajor }).toEqual({ harnessMajor: '3', firebaseMajor: '10' });
  });

  it('is a dev dependency only — it must never ship in the app bundle', () => {
    expect(pkg.dependencies).not.toHaveProperty('@firebase/rules-unit-testing');
  });
});

describe('P0-04 — the npm entry point runs both emulators against the real rules', () => {
  const script: string = pkg.scripts['test:rules'];

  it('exists', () => {
    expect(typeof script).toBe('string');
  });

  it('starts the Firestore AND Storage emulators, not just Firestore', () => {
    // The Storage half of the matrix is the larger one: five prefixes, a role matrix per
    // prefix, and the size ceiling. Dropping `storage` here would silently reduce the
    // certification to Firestore while still exiting zero.
    expect(script).toContain('emulators:exec');
    expect(script).toMatch(/--only\s+firestore,storage/);
  });

  it('pins firebase-tools to the version that publishes production rules', () => {
    // deploy-rules.yml publishes with firebase-tools@13.35.1. Certifying on a different
    // CLI would mean the rules runtime that approved the ruleset is not the one that
    // ships it.
    expect(script).toContain('firebase-tools@13.35.1');
    expect(script).not.toContain('firebase-tools@latest');
    expect(workflowCommands).toContain('firebase-tools@13.35.1');
  });

  it('runs the dedicated Jest project, in band', () => {
    expect(script).toContain('--config jest.rules.config.js');
    expect(script).toContain('--runInBand');
  });

  it('targets a disposable demo project, never a real Firebase project', () => {
    expect(script).toMatch(/--project\s+demo-[a-z0-9-]+/);
    expect(script).not.toContain('la-creativo-erp');
    expect(script).not.toContain('bizosto-staging');
  });

  it('is part of the local quality:ci chain as well as CI', () => {
    expect(pkg.scripts['quality:ci']).toContain('npm run test:rules');
  });
});

describe('P0-04 — the certification is a blocking Quality Gate', () => {
  const stepName = 'Firebase Security Rules behavioral certification (P0-04)';

  it('runs as a step of the Quality Gates workflow', () => {
    expect(workflow).toContain('name: Quality Gates');
    expect(workflowCommands).toContain(stepName);
    expect(workflowCommands).toContain('run: npm run test:rules');
  });

  it('runs inside the `quality` job, so a failure fails that required check', () => {
    const qualityJob = workflowCommands.slice(
      workflowCommands.indexOf('  quality:'),
      workflowCommands.indexOf('  sonar:'),
    );
    expect(qualityJob).toContain(stepName);
  });

  it('is never allowed to continue on error', () => {
    // continue-on-error on this step would turn a proven authorization regression into a
    // yellow annotation. The `high` audit step below it is the only tolerated exception in
    // this workflow, so the check is positional rather than global.
    const step = workflowCommands.slice(
      workflowCommands.indexOf(stepName),
      workflowCommands.indexOf('- name: Build application'),
    );
    expect(step).not.toContain('continue-on-error');
    expect(step).not.toContain('if:');
  });

  it('runs before the build, so a rules regression fails fast', () => {
    expect(workflowCommands.indexOf(stepName)).toBeLessThan(
      workflowCommands.indexOf('- name: Build application'),
    );
  });

  it('preserves every gate that existed before it', () => {
    // P0-04 adds a gate; it must not have cost one. Listed explicitly so a future edit
    // that "tidies" the workflow has to argue with this test.
    [
      'run: npm run docs:api',
      'git diff --exit-code -- docs/api/openapi.yaml',
      'run: npm run docs:schema',
      'git diff --exit-code -- docs/database/collections.generated.md',
      'run: npm run format:check',
      'run: npm run lint',
      'run: npm run typecheck',
      'run: npm run typecheck:e2e',
      'run: npm test',
      'TZ=Asia/Karachi npm test',
      '__tests__/integration/client-payment-engine.emulator.test.ts',
      '__tests__/integration/staff-seat-concurrency.emulator.test.ts',
      '__tests__/integration/storage-quota-concurrency.emulator.test.ts',
      'run: npm run build',
      'run: npm run bundle:check',
      'run: npm run licenses:check',
      'npm audit --audit-level=critical',
      'sonar.qualitygate.wait=true',
    ].forEach((gate) => {
      expect(workflowCommands).toContain(gate);
    });
  });
});

describe('P0-04 — the suites fail on a missing prerequisite, they never skip', () => {
  it('has no skip, todo or conditional-describe construct anywhere in the matrix', () => {
    // The three suites in __tests__/integration use
    // `process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip`, which is right for
    // them: they are optional depth over unit suites that already cover the same code. An
    // authorization matrix has no such fallback — skipped, it reports green while proving
    // nothing, which is the exact failure mode P0-04 exists to remove.
    [...RULES_SUITES, '__tests__/rules/helpers/emulator.ts'].forEach((suite) => {
      const source = activeSource(suite);
      expect(source).not.toMatch(/\b(describe|it|test)\.(skip|todo)\b/);
      expect(source).not.toMatch(/\b(xdescribe|xit|xtest)\s*\(/);
      expect(source).not.toMatch(/describe\.skip|it\.skip/);
      expect(source).not.toMatch(/\?\s*describe\s*:/);
    });
  });

  it('throws from the harness when an emulator variable is absent', () => {
    expect(harness).toContain('process.env[envVar]');
    expect(harness).toMatch(/throw new Error\(/);
    expect(harness).toContain('FIRESTORE_EMULATOR_HOST');
    expect(harness).toContain('FIREBASE_STORAGE_EMULATOR_HOST');
  });

  it('loads the rulesets from the repository root, so the certified bytes are this commit', () => {
    expect(harness).toContain("readRulesFile('firestore.rules')");
    expect(harness).toContain("readRulesFile('storage.rules')");
    expect(harness).toContain('fs.readFileSync(path.join(process.cwd(), file)');
  });

  it('asserts with the real rules-unit-testing helpers, not a local reimplementation', () => {
    RULES_SUITES.forEach((suite) => {
      const source = activeSource(suite);
      expect(source).toContain("from '@firebase/rules-unit-testing'");
      expect(source).toContain('assertSucceeds');
      expect(source).toContain('assertFails');
      // No hand-rolled authorization: the ruleset decides, not TypeScript.
      expect(source).not.toMatch(/function\s+(isSuperAdmin|belongsToTenant|tenantRole)\s*\(/);
      expect(source).not.toMatch(/jest\.mock\(/);
    });
  });
});

describe('P0-04 — the dedicated Jest project stays correctly isolated', () => {
  it('is excluded from the default `npm test` run', () => {
    expect(jestConfig).toContain(
      "testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/rules/']",
    );
  });

  it('collects the rules suites and nothing else', () => {
    expect(rulesJestConfig).toContain(
      "testMatch: ['<rootDir>/__tests__/rules/**/*.rules.test.ts']",
    );
  });

  it('runs in the Node environment', () => {
    expect(rulesJestConfig).toContain("testEnvironment: 'node'");
  });

  it('does not load jest.setup.js, whose MSW interceptor would block the emulators', () => {
    // jest.setup.js calls server.listen({ onUnhandledRequest: 'error' }). The rules
    // suites reach the emulators over plain HTTP through the Firebase JS SDK, so every
    // request would be intercepted and rejected before a rule was ever evaluated.
    expect(activeSource('jest.rules.config.js')).not.toContain('jest.setup.js');
    expect(jestConfig).toContain('jest.setup.js');
  });

  it('serialises the suites, because both publish a ruleset to one emulator', () => {
    expect(rulesJestConfig).toContain('maxWorkers: 1');
  });
});

describe('P0-04 — nothing in the certification can reach live Firebase', () => {
  it('uses an emulator-only firebase config that names no production bucket', () => {
    expect(emulatorConfig.firestore.rules).toBe('firestore.rules');
    expect(emulatorConfig.storage.rules).toBe('storage.rules');
    expect(emulatorConfig.storage.bucket).toBeUndefined();
    expect(JSON.stringify(emulatorConfig)).not.toContain('la-creativo-erp');
    expect(JSON.stringify(emulatorConfig)).not.toContain('bizosto-staging');
  });

  it('leaves the production bucket binding in firebase.json untouched', () => {
    // firebase.emulator.json exists so that the emulator run never has to borrow the
    // production config. The deploy path is unchanged and still asserted in full by
    // __tests__/config/firebase-storage-bucket-binding.test.ts.
    const production = JSON.parse(read('firebase.json'));
    expect(production.storage).toEqual([
      { bucket: 'la-creativo-erp.firebasestorage.app', rules: 'storage.rules' },
    ]);
  });

  it('names a demo project id, which firebase-tools refuses to resolve remotely', () => {
    expect(harness).toMatch(/CERT_PROJECT_ID = 'demo-[a-z0-9-]+'/);
  });

  it('reads no service-account credential and no Firebase secret', () => {
    [...RULES_SUITES, '__tests__/rules/helpers/emulator.ts', 'jest.rules.config.js'].forEach(
      (file) => {
        const source = activeSource(file);
        expect(source).not.toContain('FIREBASE_ADMIN_KEY');
        expect(source).not.toContain('GOOGLE_APPLICATION_CREDENTIALS');
        expect(source).not.toContain('firebase-admin');
        expect(source).not.toContain('la-creativo-erp');
        expect(source).not.toContain('bizosto-staging');
      },
    );
  });
});

describe('P0-04 — every surface the rulesets define is behaviourally covered', () => {
  const firestoreSuite = read(RULES_SUITES[0]);
  const storageSuite = read(RULES_SUITES[1]);

  it('covers every named Firestore collection and subcollection', () => {
    // Derived from firestore.rules rather than hard-coded, so ADDING a match block
    // without a behavioural case for it fails this test instead of shipping uncertified.
    const named = new Set<string>();
    for (const statement of activeRules('firestore.rules').matchAll(/match\s+(\/[^\s{[]*\S*)/g)) {
      for (const segment of statement[1].split('/')) {
        // Literal collection names only: `{tenantId}`, `{document=**}` and the
        // /databases/{database}/documents service preamble are not surfaces.
        if (/^[a-z_]+$/.test(segment) && segment !== 'databases' && segment !== 'documents') {
          named.add(segment);
        }
      }
    }
    expect([...named].sort()).toEqual([
      'activity_feed',
      'clients',
      'invoices',
      'notifications',
      'projects',
      'tenants',
      'users',
    ]);
    named.forEach((collection) => {
      expect(firestoreSuite).toContain(collection);
    });
  });

  it('covers every Storage prefix that has an explicit grant', () => {
    const prefixes = [
      ...activeRules('storage.rules').matchAll(
        /match \/tenants\/\{tenantId\}\/([a-z-]+)\/\{allPaths=\*\*\}/g,
      ),
    ].map((m) => m[1]);
    expect(prefixes.sort()).toEqual([
      'brand',
      'client-files',
      'employee-documents',
      'employees',
      'projects',
    ]);
    prefixes.forEach((prefix) => {
      expect(storageSuite).toContain(`tenants/${'${TENANT_A}'}/${prefix}/`);
    });
  });

  it('covers every role named in a Storage prefix grant', () => {
    const roles = new Set(
      [...activeRules('storage.rules').matchAll(/'([a-z_]+)'/g)]
        .map((m) => m[1])
        .filter((role) => role !== 'true' && role !== 'false'),
    );
    expect(roles.has('client')).toBe(true);
    expect(roles.has('super_admin')).toBe(true);
    roles.forEach((role) => {
      expect(storageSuite).toContain(`'${role}'`);
    });
  });

  it('covers every Admin-SDK-only prefix the ruleset comment enumerates', () => {
    // The ruleset names these as the prefixes only firebase-admin writes. Each must be
    // proven unreachable from the browser SDK rather than assumed to be.
    ['exports', 'imports', 'support', 'documents', 'docusign', 'files', 'branding'].forEach(
      (prefix) => {
        expect(storageSuite).toContain(`/${prefix}/`);
      },
    );
  });
});
