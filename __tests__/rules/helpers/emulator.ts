import fs from 'fs';
import path from 'path';
import { setLogLevel } from 'firebase/app';
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';

/**
 * P0-04 — shared harness for the Firebase Security Rules BEHAVIOURAL certification.
 *
 * Everything else in this repository that talks about firestore.rules or storage.rules
 * reads the files as text: __tests__/config/firestore-rules-guard.test.ts and
 * __tests__/config/storage-rules-guard.test.ts strip the comments and pin the directives
 * that must (and must not) appear. Those guards catch a dangerous EDIT, but they cannot
 * answer the only question that matters at runtime — what does the deployed ruleset
 * actually DO when a given principal addresses a given path?
 *
 * This harness answers that question the way Firebase itself does: the real rules files
 * are loaded into the real Firestore and Storage emulators and evaluated by the real
 * rules runtime. No authorization logic is reimplemented in TypeScript and no helper is
 * mocked; a test that passes here passed because the ruleset said so.
 *
 * FAIL, NEVER SKIP. The three existing emulator suites in __tests__/integration use
 * `process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip`, which is correct for
 * them: they are optional depth on top of unit suites that already cover the same code.
 * An authorization matrix has no such fallback — a silently skipped matrix reports green
 * while proving nothing. So the prerequisites are resolved at module load and a missing
 * one throws, which Jest reports as a failed suite. __tests__/ci/firebase-rules-behavioral
 * -gate.test.ts pins that property, and the CI wiring, from inside the ordinary suite.
 *
 * NOTHING LIVE IS TOUCHED. The project id is `demo-` prefixed, which makes firebase-tools
 * refuse to reach any real Google service, and the host/port come from the emulator
 * variables that `npm run test:rules` exports. Neither la-creativo-erp nor
 * bizosto-staging is addressable from this suite even if a credential were present on the
 * runner.
 */

/**
 * Disposable project id for the certification run. The `demo-` prefix is load-bearing:
 * firebase-tools treats such ids as emulator-only and refuses to contact production
 * Google APIs for them.
 */
export const CERT_PROJECT_ID = 'demo-bizosto-rules';

/** Tenants used across both matrices. Two are required to prove cross-tenant denial. */
export const TENANT_A = 'tenant-alpha';
export const TENANT_B = 'tenant-beta';

export type EmulatorAddress = { host: string; port: number };

/**
 * Resolves one emulator address, or explains exactly how to get one. Called at module
 * load so that an unmet prerequisite fails the suite instead of quietly disabling it.
 */
function requireEmulator(envVar: string, emulator: string): EmulatorAddress {
  const raw = (process.env[envVar] || '').trim();
  if (!raw) {
    throw new Error(
      `P0-04: the ${emulator} emulator is required to certify the Security Rules, but ` +
        `${envVar} is not set. This suite deliberately has no skip path — run it with ` +
        '`npm run test:rules`, which starts isolated Firestore and Storage emulators via ' +
        'the pinned firebase-tools and exports the host variables.',
    );
  }
  // Accepts host:port and [ipv6]:port, which is the shape emulators:exec exports.
  const parsed = /^(?:\[(.+)\]|([^:]+)):(\d+)$/.exec(raw);
  if (!parsed) {
    throw new Error(
      `P0-04: ${envVar} is "${raw}", which is not a host:port pair. Refusing to guess an ` +
        'emulator address: a wrong guess would silently certify nothing.',
    );
  }
  return { host: parsed[1] ?? parsed[2], port: Number(parsed[3]) };
}

export const FIRESTORE_EMULATOR = requireEmulator('FIRESTORE_EMULATOR_HOST', 'Firestore');
export const STORAGE_EMULATOR = requireEmulator('FIREBASE_STORAGE_EMULATOR_HOST', 'Storage');

/**
 * Most of this certification consists of requests that are SUPPOSED to be refused, and
 * the JS SDK logs a multi-line gRPC warning for each one. Several hundred expected
 * denials would bury the assertions that failed for a real reason. Silenced here rather
 * than per-suite so no suite can forget; failures still report the rules runtime's own
 * per-line explanation through the thrown FirebaseError.
 */
setLogLevel('silent');

/**
 * Reads a ruleset from the repository root — the same bytes the deploy workflow publishes.
 * The rules are handed to initializeTestEnvironment() rather than left to firebase.json
 * discovery, so the certified ruleset is unambiguously the file in this commit.
 */
export function readRulesFile(file: 'firestore.rules' | 'storage.rules'): string {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  if (!source.trimStart().startsWith("rules_version = '2';")) {
    throw new Error(`P0-04: ${file} does not declare rules_version 2; refusing to certify it.`);
  }
  return source;
}

export function initFirestoreRulesEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: CERT_PROJECT_ID,
    firestore: { rules: readRulesFile('firestore.rules'), ...FIRESTORE_EMULATOR },
  });
}

export function initStorageRulesEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: CERT_PROJECT_ID,
    storage: { rules: readRulesFile('storage.rules'), ...STORAGE_EMULATOR },
  });
}

type FirestoreHandle = ReturnType<RulesTestContext['firestore']>;
type StorageHandle = ReturnType<RulesTestContext['storage']>;

/**
 * A named principal: the uid the token carries plus its custom claims. `claims` is
 * deliberately loose so that MALFORMED claims — a numeric role, a blank tenant, an absent
 * one — can be minted and proven to fail closed, which is the whole point of the
 * `is string` guards in storage.rules.
 */
export type Principal = { uid: string; claims?: TokenOptions };

/**
 * Memoised per-principal handles.
 *
 * `RulesTestContext.firestore()` and `.storage()` call `useEmulator()` on every
 * invocation while the compat SDK caches one service instance per app, so calling either
 * twice for the same context throws "Firestore has already been started and its settings
 * can no longer be changed". Handles are therefore created once per principal here
 * instead of at each call site.
 */
export function createRealm(env: RulesTestEnvironment) {
  const contexts = new Map<string, RulesTestContext>();
  const firestores = new Map<string, FirestoreHandle>();
  const storages = new Map<string, StorageHandle>();

  function context(name: string, principal: Principal | null): RulesTestContext {
    let ctx = contexts.get(name);
    if (!ctx) {
      ctx = principal
        ? env.authenticatedContext(principal.uid, principal.claims)
        : env.unauthenticatedContext();
      contexts.set(name, ctx);
    }
    return ctx;
  }

  return {
    firestore(name: string, principal: Principal | null): FirestoreHandle {
      let handle = firestores.get(name);
      if (!handle) {
        handle = context(name, principal).firestore();
        firestores.set(name, handle);
      }
      return handle;
    },
    storage(name: string, principal: Principal | null): StorageHandle {
      let handle = storages.get(name);
      if (!handle) {
        handle = context(name, principal).storage();
        storages.set(name, handle);
      }
      return handle;
    },
  };
}
