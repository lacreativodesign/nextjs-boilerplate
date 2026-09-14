/**
 * The Security Rules deployment workflow's safety properties, pinned.
 *
 * WHY THIS SUITE EXISTS
 *
 * Every run of `Deploy Security Rules` failed with "Failed to authenticate, have you
 * run firebase login?", and nothing in this repository noticed. The workflow
 * publishes to production rather than being executed from the repo, so neither the
 * type checker nor any runtime test could see it; the rules guards asserted that
 * firestore.rules and storage.rules were SAFE, never that they had been PUBLISHED.
 * PR #1005 is what made the gap expensive: it tightened the paid browser upload
 * prefixes in storage.rules to CREATE-only, the guard went green, the merge went in,
 * and the bucket kept running the previous ruleset.
 *
 * Each assertion below is a property somebody could remove in a single careless
 * edit, and none of them would fail any other test in this repository.
 *
 * Absence assertions run against the workflow with its comment lines stripped. The
 * comments explain at length what the old authentication model was and which broad
 * IAM roles must not be granted, so asserting "this file does not mention
 * FIREBASE_TOKEN" would fail on the very documentation that exists to prevent it.
 */
import * as fs from 'fs';
import * as path from 'path';

const WORKFLOW_PATH = '.github/workflows/deploy-rules.yml';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const workflow = read(WORKFLOW_PATH);

/** The workflow without its comment lines — i.e. what it actually RUNS. */
const commands = workflow
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

/**
 * Asserts `first` appears before `second` within `haystack`, and that BOTH are
 * present. A bare indexOf comparison passes vacuously when the earlier string is
 * missing altogether (-1 is less than everything), which would let a deleted guard
 * satisfy an ordering assertion.
 */
const assertOrder = (haystack: string, first: string, second: string): void => {
  const a = haystack.indexOf(first);
  const b = haystack.indexOf(second);
  expect({ first, found: a !== -1 }).toEqual({ first, found: true });
  expect({ second, found: b !== -1 }).toEqual({ second, found: true });
  expect(a).toBeLessThan(b);
};

/** The executable lines of one job, from its key to the next job key. */
const job = (name: 'preflight' | 'deploy'): string => {
  const start = commands.indexOf(`\n  ${name}:`);
  if (start === -1) throw new Error(`${WORKFLOW_PATH} is missing the ${name} job`);
  const rest = commands.slice(start + 1);
  const next = rest.search(/\n {2}\w[\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next);
};

describe('the legacy token mechanism is gone', () => {
  it('never references FIREBASE_TOKEN', () => {
    // The secret was never configured, so `--token "${{ secrets.FIREBASE_TOKEN }}"`
    // rendered as an empty string. firebase-tools treats an empty token as absent,
    // skips the token path, finds no logged-in user, falls through to Application
    // Default Credentials, and reports a login error. Re-adding this authenticates
    // with nothing at all.
    expect(commands).not.toContain('FIREBASE_TOKEN');
  });

  it('never passes --token, which firebase-tools has deprecated for removal', () => {
    expect(commands).not.toContain('--token');
  });

  it('does not depend on an interactive firebase login', () => {
    expect(commands).not.toMatch(/firebase login/);
    expect(commands).not.toMatch(/firebase\s+login:ci/);
  });

  it('reuses no other long-lived Firebase or Google credential', () => {
    expect(commands).not.toContain('FIREBASE_ADMIN_KEY');
    expect(commands).not.toContain('GOOGLE_APPLICATION_CREDENTIALS');
  });
});

describe('authentication is keyless Workload Identity Federation', () => {
  it('authenticates through the certified google-github-actions/auth pattern', () => {
    // Same action and major version as deploy-indexes.yml, which is the provider
    // architecture already certified against this project.
    expect(commands).toContain('uses: google-github-actions/auth@v2');
    expect(commands).toContain(
      'workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}',
    );
  });

  it('impersonates the dedicated rules deployer held in a repository variable', () => {
    expect(commands).toContain('service_account: ${{ vars.GCP_FIREBASE_RULES_DEPLOYER_SA }}');
  });

  it('does not reuse the Firestore index identities, which hold index permissions', () => {
    // The index reader and deployer are scoped to datastore.indexes.*. Borrowing
    // either would give a rules publish index authority, or give an index run rules
    // authority — collapsing the separation deploy-indexes.yml was rewritten to get.
    expect(commands).not.toContain('GCP_FIRESTORE_INDEX_READER_SA');
    expect(commands).not.toContain('GCP_FIRESTORE_INDEX_DEPLOYER_SA');
  });

  it('introduces no service-account key, and reads no secret at all', () => {
    // A JSON key would be a long-lived credential in a repository secret: the exact
    // thing federation exists to avoid. The service-account email is non-sensitive
    // configuration and belongs in `vars`, so a `secrets.` reference appearing
    // anywhere in this workflow means something has become a stored credential.
    expect(commands).not.toContain('credentials_json');
    expect(commands).not.toContain('private_key');
    expect(commands).not.toMatch(/secrets\./);
    expect(commands).not.toMatch(/\$\{\{\s*secrets/);
  });
});

describe('GitHub permissions stay least privilege', () => {
  it('declares id-token: write, without which no token can be minted', () => {
    expect(commands).toMatch(/^permissions:\n(?: {2}.*\n)* {2}id-token: write$/m);
  });

  it('keeps contents: read', () => {
    expect(commands).toMatch(/^permissions:\n(?: {2}.*\n)* {2}contents: read$/m);
  });

  it('grants nothing beyond those two scopes', () => {
    const block = commands.match(/^permissions:\n((?: {2}\S.*\n)+)/m);
    expect(block).not.toBeNull();
    const granted = (block?.[1] ?? '')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => line.trim());
    expect(granted.sort()).toEqual(['contents: read', 'id-token: write']);
  });
});

describe('production publication is gated on an approved main ref', () => {
  it('refuses any ref but refs/heads/main', () => {
    expect(commands).toContain('if [ "$REF" != "refs/heads/main" ]; then');
    expect(commands).toMatch(/Refusing to publish Security Rules/);
  });

  it('proves the ref in the job that holds the credential, not only in preflight', () => {
    // `needs: preflight` is one line away from deletion, and the environment's branch
    // restriction lives outside this repository, so the publishing job must fail
    // closed on its own.
    expect(job('preflight')).toContain('if [ "$REF" != "refs/heads/main" ]; then');
    expect(job('deploy')).toContain('if [ "$REF" != "refs/heads/main" ]; then');
  });

  it('checks the ref before Google authentication, not after', () => {
    assertOrder(job('deploy'), 'refs/heads/main', 'google-github-actions/auth@v2');
  });

  it('refuses a workflow_dispatch from a feature branch by the same guard', () => {
    // workflow_dispatch stays available for controlled recovery, so the guard — not
    // the trigger list — is what keeps an arbitrary branch from publishing.
    expect(commands).toContain('workflow_dispatch:');
    expect(job('preflight')).toContain('exit 1');
  });

  it('runs the publish inside the environment that carries the reviewer requirement', () => {
    expect(commands).toMatch(/environment:\s*firebase-rules-production/);
    expect(job('deploy')).toMatch(/environment:\s*firebase-rules-production/);
  });

  it('fails closed on blank deployment configuration instead of authenticating', () => {
    // An unset `vars.X` renders as '' rather than failing, which would surface as an
    // opaque authentication error instead of a named missing setting.
    expect(commands).toContain('if [ -z "$WIF_PROVIDER" ]; then');
    expect(commands).toContain('if [ -z "$DEPLOYER_SA" ]; then');
  });

  it('keeps two publishes from racing a ruleset that takes effect immediately', () => {
    expect(commands).toMatch(/concurrency:\n\s+group: deploy-firestore-rules/);
    expect(commands).toMatch(/cancel-in-progress: false/);
  });

  it('interpolates contexts through env, never directly into a shell line', () => {
    // `${{ github.ref }}` inside a run block is a script-injection vector.
    const runBlocks = commands.split(/\n\s+run: \|/).slice(1);
    expect(runBlocks.length).toBeGreaterThan(0);
    for (const block of runBlocks) {
      const body = block.split(/\n\s+- name:/)[0];
      expect(body).not.toMatch(/\$\{\{\s*github\./);
      expect(body).not.toMatch(/\$\{\{\s*inputs\./);
      expect(body).not.toMatch(/\$\{\{\s*vars\./);
      expect(body).not.toMatch(/\$\{\{\s*steps\./);
      expect(body).not.toMatch(/\$\{\{\s*needs\./);
    }
  });
});

describe('the deploy target cannot be redirected or widened', () => {
  it('pins the project as a constant rather than accepting it as an input', () => {
    expect(commands).toMatch(/PROJECT_ID:\s*la-creativo-erp/);
    expect(commands).not.toMatch(/inputs\.project/);
    expect(commands).not.toMatch(/^\s+project_id:\s*$/m);
  });

  it('re-checks the project constant in preflight', () => {
    expect(commands).toContain('if [ "$PROJECT_ID" != "la-creativo-erp" ]; then');
  });

  it('deploys exactly firestore:rules,storage and nothing else', () => {
    const only = commands.match(/--only\s+(\S+)/g) || [];
    expect(only).toEqual(['--only firestore:rules,storage']);
  });

  it('never asks for `storage:rules`, a scope that silently matches nothing', () => {
    // firebase-tools 13.35.1 is asymmetric here, and the asymmetry cost a production
    // deploy. deploy/firestore/prepare.js special-cases the literals `firestore:rules`
    // and `firestore:indexes`. deploy/storage/prepare.js does not: everything after
    // `storage:` is read as the name of a NAMED DEPLOY TARGET from .firebaserc. With no
    // .firebaserc in this repository, `storage:rules` requested a target called "rules",
    // matched no config entry, and aborted the publish with "Could not find rules for
    // the following storage targets: rules". Bare `storage` sets that file's allStorage
    // flag and deploys every entry of firebase.json's storage array.
    expect(commands).not.toContain('storage:rules');
    expect(commands).toMatch(/--only\s+firestore:rules,storage(?![:\w])/);
  });

  it('keeps the storage scope from widening past a ruleset', () => {
    // Bare `storage` is not a privilege increase: the storage deploy target's
    // prepare/deploy/release trio only compiles a ruleset, uploads it, and repoints a
    // release. There is no bucket-object, CORS, lifecycle or metadata path in it. What
    // WOULD widen the publish is naming another target, so the scope stays exhaustive.
    const only = commands.match(/--only\s+(\S+)/)?.[1] ?? '';
    expect(only.split(',').sort()).toEqual(['firestore:rules', 'storage']);
  });

  it('invokes firebase deploy exactly once', () => {
    expect(commands.match(/firebase-tools@[^\s"']+" deploy/g)).toHaveLength(1);
  });

  it('never deploys hosting, functions, indexes, data or extensions', () => {
    // firebase.json declares a hosting target and an indexes file, so a bare
    // `firebase deploy` here would publish the public/ directory and reconcile
    // indexes in BOTH directions — deploy-indexes.yml exists because that
    // reconciliation would propose removing most of the live index set.
    for (const target of [
      'firestore:indexes',
      'hosting',
      'functions',
      'extensions',
      'remoteconfig',
      'dataconnect',
      'database',
    ]) {
      expect(commands).not.toContain(`:${target}`);
      expect(commands).not.toMatch(new RegExp(`--only[^\\n]*\\b${target}\\b`));
    }
  });

  it('keeps --non-interactive, which also blocks a project IAM policy edit', () => {
    // firebase-tools will try to grant a role to the Storage service agent when
    // storage rules use cross-service functions. --non-interactive returns before
    // that, so the publish cannot modify the project IAM policy.
    expect(commands).toContain('--non-interactive');
  });

  it('never passes --force, and never --debug, which logs bearer tokens', () => {
    expect(commands).not.toContain('--force');
    expect(commands).not.toContain('--debug');
  });
});

describe('the Firebase CLI version is pinned to the one this repo has certified', () => {
  it('is an exact version, never @latest', () => {
    expect(commands).not.toContain('firebase-tools@latest');
    expect(commands).not.toMatch(/firebase-tools@\^/);
    expect(commands).toMatch(/FIREBASE_CLI_VERSION:\s*'?\d+\.\d+\.\d+'?\s*$/m);
  });

  it('is the same version the emulator gates already run on', () => {
    // test.yml runs all three Firestore emulator suites on this version. Pinning to
    // it means the CLI that publishes production rules is the CLI this repository's
    // gates have actually exercised.
    const pinned = commands.match(/FIREBASE_CLI_VERSION:\s*'?(\d+\.\d+\.\d+)'?/);
    expect(pinned).not.toBeNull();
    const version = pinned?.[1];
    expect(read('.github/workflows/test.yml')).toContain(`firebase-tools@${version}`);
  });

  it('installs the pinned version rather than resolving one at run time', () => {
    expect(commands).toContain('npx --yes "firebase-tools@${FIREBASE_CLI_VERSION}" deploy');
  });
});

describe('both rules guards run before production publication', () => {
  it.each([
    ['Firestore', '__tests__/config/firestore-rules-guard.test.ts'],
    ['Storage', '__tests__/config/storage-rules-guard.test.ts'],
  ])('runs the %s rules guard, and the guard file exists', (_label, guard) => {
    expect(commands).toContain(`npx jest ${guard} --coverage=false`);
    // A workflow step naming a deleted test file passes silently as a jest no-op.
    expect(fs.existsSync(path.join(process.cwd(), guard))).toBe(true);
  });

  it('runs both guards in the publishing job, so the publish cannot skip them', () => {
    const deploy = job('deploy');
    expect(deploy).toContain('firestore-rules-guard.test.ts');
    expect(deploy).toContain('storage-rules-guard.test.ts');
    assertOrder(deploy, 'storage-rules-guard.test.ts', '--only firestore:rules,storage');
    assertOrder(deploy, 'firestore-rules-guard.test.ts', '--only firestore:rules,storage');
  });

  it('runs both guards before the environment approval too', () => {
    // So the reviewer approving the environment sees them green first.
    const preflight = job('preflight');
    expect(preflight).toContain('firestore-rules-guard.test.ts');
    expect(preflight).toContain('storage-rules-guard.test.ts');
  });
});

describe('the deployer needs no index authority', () => {
  it('asks for no datastore.indexes permission anywhere', () => {
    // `--only firestore:rules` maps to firebase-tools' `firestore` target, whose
    // informational permission probe asks for datastore.indexes.create, .update and
    // .delete. The runtime path touches no index API, so the probe is skipped rather
    // than satisfied — satisfying it would mean granting index write authority to a
    // rules deployer.
    expect(commands).not.toContain('datastore.indexes');
    expect(commands).toContain("FIREBASE_SKIP_INFORMATIONAL_IAM: 'true'");
  });

  it('recommends no broad role in anything it prints on failure', () => {
    const printed = commands.match(/^\s+echo .*/gm)?.join('\n') ?? '';
    for (const role of [
      'roles/owner',
      'roles/editor',
      'roles/datastore.owner',
      'roles/firebase.admin',
      'roles/storage.admin',
    ]) {
      expect(printed).not.toContain(`Add ${role}`);
      expect(printed).not.toContain(`grant ${role}`);
    }
  });
});

describe('a successful publish is confirmed where it can be read back', () => {
  it('writes a confirmation to the job summary, not only to the step log', () => {
    expect(commands).toContain('Firestore and Storage rules deployed successfully');
    expect(commands).toContain('GITHUB_STEP_SUMMARY');
    expect(commands).toContain('## Security Rules published');
  });

  it('triggers on a change to this pipeline, so a fix can prove itself', () => {
    // Otherwise verifying a repair to this file requires a no-op edit to a
    // production ruleset.
    expect(commands).toMatch(/- '\.github\/workflows\/deploy-rules\.yml'/);
    expect(commands).toMatch(/- 'firestore\.rules'/);
    expect(commands).toMatch(/- 'storage\.rules'/);
  });
});
