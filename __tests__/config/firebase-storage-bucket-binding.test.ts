import fs from 'fs';
import path from 'path';

/**
 * firebase.json must bind the Storage ruleset to an EXPLICIT bucket.
 *
 * WHY THIS SUITE EXISTS
 *
 * PR #1006 repaired GitHub -> Google authentication for `Deploy Security Rules`. The
 * next production run got all the way through OIDC/WIF, reached the Firebase CLI, and
 * died there:
 *
 *   Firebase Storage has not been set up on project 'la-creativo-erp'.
 *
 * That message is false on its face — the bucket la-creativo-erp.firebasestorage.app
 * exists and serves traffic. It is emitted from exactly one place in firebase-tools
 * 13.35.1, the 404 branch of getDefaultBucket() in lib/gcp/storage.js, and
 * getDefaultBucket() has exactly one caller in the whole library:
 *
 *   // lib/deploy/storage/prepare.js
 *   if (!Array.isArray(rulesConfig) && options.project) {
 *     const defaultBucket = await gcp.storage.getDefaultBucket(options.project);
 *     rulesConfig = [Object.assign(rulesConfig, { bucket: defaultBucket })];
 *   }
 *
 * So the single-object form `"storage": { "rules": "storage.rules" }` is what sends the
 * CLI to Google's v1alpha `projects/{p}/defaultBucket` endpoint to ask which bucket the
 * release should name. When that endpoint answers 404 the publish dies, whatever the
 * bucket's actual state. The ARRAY form skips that branch outright — `Array.isArray` is
 * true — so the lookup never happens and lib/deploy/storage/release.js takes the bucket
 * straight from the config entry:
 *
 *   toRelease.push({ bucket: ruleConfig.bucket, rules: ruleConfig.rules });
 *
 * The bucket string then becomes a path segment of the Rules release resource name,
 * `projects/{p}/releases/firebase.storage/{bucket}`, un-encoded. That is why the value
 * is the bare bucket name and never a gs:// URI: a scheme would inject `//` into the
 * REST path and name a release that does not exist.
 *
 * WHAT COULD SILENTLY UNDO THIS
 *
 * Every assertion below guards a single-edit regression that no other test in this
 * repository would catch. Rules are published to Firebase rather than executed from
 * here, so a firebase.json that deploys nothing — or deploys to the wrong bucket —
 * fails in CI against production, long after review. The rules guards next door assert
 * that firestore.rules and storage.rules are SAFE; this suite asserts they are
 * ADDRESSED.
 *
 * Note on scope: this suite deliberately does not pin the CONTENTS of firestore.rules
 * or storage.rules. Those files are expected to change, and their semantics already
 * have dedicated guards. Freezing their bytes here would break every future rules edit.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The production bucket, exactly as the Rules release must name it. */
const PRODUCTION_BUCKET = 'la-creativo-erp.firebasestorage.app';

const raw = read('firebase.json');
const config = JSON.parse(raw) as {
  storage?: unknown;
  firestore?: { rules?: string; indexes?: string };
  hosting?: unknown;
};

/**
 * The keys firebase-tools 13.35.1 accepts on an array-form storage entry, from its
 * shipped schema (schema/firebase-config.json). That schema sets
 * `additionalProperties: false`, so an unrecognised key is a hard config error rather
 * than something the CLI ignores.
 */
const ALLOWED_ENTRY_KEYS = ['bucket', 'rules', 'target', 'predeploy', 'postdeploy'];

describe('firebase.json binds Storage rules to an explicit bucket', () => {
  it('uses the array form, which is what skips default-bucket discovery', () => {
    // This is the whole fix. The single-object form is a valid config that resolves its
    // bucket at deploy time through an API call that returned 404 for this project.
    expect(Array.isArray(config.storage)).toBe(true);
  });

  it('declares exactly one storage entry', () => {
    // A second entry would publish storage.rules to a second bucket. There is one
    // Firebase Storage bucket on this project and it is the one named below.
    expect(config.storage as unknown[]).toHaveLength(1);
  });

  it('names the production bucket exactly', () => {
    const [entry] = config.storage as Array<{ bucket?: string }>;
    expect(entry.bucket).toBe(PRODUCTION_BUCKET);
  });

  it('points at storage.rules', () => {
    const [entry] = config.storage as Array<{ rules?: string }>;
    expect(entry.rules).toBe('storage.rules');
  });

  it('cannot fall back to an unspecified default bucket', () => {
    // Three separate ways the fallback could return, all closed:
    const entries = config.storage as Array<Record<string, unknown>>;
    for (const entry of entries) {
      // 1. A missing or blank bucket. In the array form firebase-tools does NOT look a
      //    default up — RulesDeploy.release() throws `Cannot release resource type
      //    "firebase.storage"` when the sub-resource is falsy — so this fails the
      //    deploy rather than publishing somewhere unintended. Either way it must not
      //    reach main.
      expect(typeof entry.bucket).toBe('string');
      expect((entry.bucket as string).trim()).not.toHaveLength(0);
      // 2. A `target` instead of a bucket. That is a legitimate firebase-tools feature,
      //    but it resolves the bucket through .firebaserc at deploy time — indirection
      //    this repository has no .firebaserc to satisfy, and which would move the
      //    production bucket name out of version control.
      expect(entry).not.toHaveProperty('target');
      // 3. An unrecognised key, which the CLI's own schema rejects outright.
      expect(Object.keys(entry).sort()).toEqual(
        Object.keys(entry)
          .filter((key) => ALLOWED_ENTRY_KEYS.includes(key))
          .sort(),
      );
    }
    expect(fs.existsSync(path.join(ROOT, '.firebaserc'))).toBe(false);
  });

  it('gives the bare bucket name, not a gs:// URI and not a path', () => {
    // The value is interpolated into `projects/{p}/releases/firebase.storage/{bucket}`
    // without URI-encoding, so a scheme or a slash produces a malformed release name
    // that silently does not match the live release.
    const [entry] = config.storage as Array<{ bucket: string }>;
    expect(entry.bucket).not.toMatch(/^gs:\/\//);
    expect(entry.bucket).not.toContain('/');
    expect(entry.bucket).not.toMatch(/\s/);
  });

  it('addresses a rules file that exists', () => {
    // A config naming a deleted file is a silent no-op at deploy time.
    const [entry] = config.storage as Array<{ rules: string }>;
    expect(fs.existsSync(path.join(ROOT, entry.rules))).toBe(true);
  });
});

describe('the rest of the deploy config is unchanged by this binding', () => {
  it('leaves the Firestore configuration exactly as it was', () => {
    expect(config.firestore).toEqual({
      rules: 'firestore.rules',
      indexes: 'firestore.indexes.json',
    });
  });

  it('still addresses both Firestore files, and they exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'firestore.rules'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'firestore.indexes.json'))).toBe(true);
  });

  it('keeps Firestore as a single object, which the CLI requires', () => {
    // Unlike storage, the firestore key's multi-database array form means something
    // else entirely (one entry per named database). This project has one database.
    expect(Array.isArray(config.firestore)).toBe(false);
  });

  it('declares no functions target', () => {
    // OPS-01 decommissioned functions/. A bare `firebase deploy` must not find one.
    expect(config).not.toHaveProperty('functions');
  });
});

describe('the deploy workflow asks for a storage scope that can actually match', () => {
  const workflow = read('.github/workflows/deploy-rules.yml');
  const commands = workflow
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  it('scopes storage as `storage`, never `storage:rules`', () => {
    // firebase-tools' storage prepare has no `:rules` case — unlike firestore's, which
    // special-cases the literal. Everything after `storage:` is read as a NAMED DEPLOY
    // TARGET from .firebaserc, so `storage:rules` asked for a target called "rules",
    // matched nothing, and aborted with "Could not find rules for the following storage
    // targets: rules". That failure was masked in production by the default-bucket 404,
    // which happens earlier in the same function.
    expect(commands).toContain('--only firestore:rules,storage');
    expect(commands).not.toContain('storage:rules');
  });

  it('still scopes Firestore to rules, so indexes stay with their own pipeline', () => {
    // firestore's prepare sets firestoreIndexes=false from this literal. deploy-indexes.yml
    // owns indexes behind a separate identity and approval.
    expect(commands).toContain('firestore:rules');
    expect(commands).not.toMatch(/--only[^\n]*firestore:indexes/);
  });

  it('publishes the bucket this config names, and no other', () => {
    // The workflow must not carry a competing bucket literal: firebase.json is the one
    // place the production bucket is declared.
    const buckets = workflow.match(/[a-z0-9-]+\.(?:firebasestorage\.app|appspot\.com)/g) ?? [];
    for (const bucket of buckets) {
      expect(bucket).toBe(PRODUCTION_BUCKET);
    }
  });
});
