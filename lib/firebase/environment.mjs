/**
 * P0-01 — the one authoritative Firebase environment-isolation contract.
 *
 * WHY THIS EXISTS
 *
 * Production and Preview/staging shared one Firebase project. Observed on main
 * (da41e8d), the PR #1008 Vercel Preview answered `/api/public/firebase-config` with
 *
 *   {"projectId":"la-creativo-erp","storageBucket":"la-creativo-erp.firebasestorage.app"}
 *
 * — byte-identical to https://app.bizosto.com. So a write-capable browser/E2E
 * certification run against a Preview wrote into the production project, and the golden
 * tenant reset in `.github/workflows/smoke.yml` deleted production documents in nine
 * collections. Nothing in the codebase said that was wrong: `lib/env.ts` accepted any
 * service account with a non-empty `project_id`, and the config route served whatever
 * `NEXT_PUBLIC_FIREBASE_*` happened to hold.
 *
 * WHY IT IS ONE MODULE, AND WHY IT IS `.mjs`
 *
 * The boundary has to hold in five places that do not share a module system: the boot
 * gate (`lib/env.ts`), the Admin SDK (`lib/firebaseAdmin.ts`), two route handlers, and
 * `scripts/verify-golden-tenant-signin.mjs`, which plain `node` executes in CI. Five
 * hand-written string comparisons would be five chances to disagree, and the one that
 * drifts is the one that lets a Preview through. Plain ESM with JSDoc types is what all
 * five can import — the same reason `lib/demo/password-policy.mjs` is `.mjs`.
 *
 * WHAT IT IS NOT
 *
 * It reads `FIREBASE_ADMIN_KEY` for exactly one field, `project_id`, and returns nothing
 * else from it. A project id and a bucket name are public identifiers — they ship in
 * `.env.example`, in `firebase.json`, and in every browser's Firebase config — so naming
 * them in a diagnostic discloses nothing. No private key, client email, token or
 * credential is read, returned or logged anywhere in this file.
 */

/** The canonical production Firebase project. Named in `.env.example` and firebase.json. */
export const PRODUCTION_FIREBASE_PROJECT_ID = 'la-creativo-erp';

/** The canonical production Storage bucket, exactly as firebase.json binds it. */
export const PRODUCTION_FIREBASE_STORAGE_BUCKET = 'la-creativo-erp.firebasestorage.app';

/**
 * Names the Firebase project and bucket a Vercel Preview deployment must use.
 *
 * Hard-pinning the production identifiers as forbidden (above) closes the specific
 * accident that happened. It does not close the general one: a Preview pointed at some
 * OTHER tenant-bearing project would pass a "not production" test and still be wrong. So
 * the staging identity stays explicit and configurable, and Preview must match it
 * exactly rather than merely differ from production.
 */
export const STAGING_PROJECT_ENV_VAR = 'STAGING_FIREBASE_PROJECT_ID';
export const STAGING_BUCKET_ENV_VAR = 'STAGING_FIREBASE_STORAGE_BUCKET';

/** @param {unknown} value */
const text = (value) => String(value ?? '').trim();

/**
 * Which deployment environment this process is serving.
 *
 * `production` and `preview` are the two enforced environments. `unrecognised` is the
 * fail-closed case: a process that IS on Vercel but whose `VERCEL_ENV` this contract
 * cannot classify. Without it, deleting `VERCEL_ENV` would be a one-variable bypass of
 * the entire boundary. `local` covers a developer machine, CI and `next build` off
 * Vercel, where there is no environment boundary to enforce.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {'production' | 'preview' | 'development' | 'unrecognised' | 'local'}
 */
export function resolveDeploymentEnvironment(env = process.env) {
  const vercelEnv = text(env.VERCEL_ENV);
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'development') return 'development';
  if (vercelEnv) return 'unrecognised';
  // On Vercel with no VERCEL_ENV at all: the platform always sets it, so its absence is
  // tampering or a broken runtime, not a local shell.
  return text(env.VERCEL) === '1' ? 'unrecognised' : 'local';
}

/** The environments whose Firebase identity this contract enforces. */
const ENFORCED_ENVIRONMENTS = new Set(['production', 'preview', 'unrecognised']);

/**
 * True during `next build` or under jest, where the boot-critical secrets are legitimately
 * absent and the app is intentionally buildable with stub credentials.
 *
 * ONLY the two boot surfaces may consult this — `assertServerEnv` and the Admin SDK
 * bootstrap. A route handler must not: a phase that serves an HTTP request is a runtime by
 * definition, and `next build` serves none. Reading it there would turn `NEXT_PHASE`, an
 * ordinary settable environment variable, into a way to make a deployed Preview present
 * itself as a harmless build.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function isNonRuntimePhase(env = process.env) {
  return env.NEXT_PHASE === 'phase-production-build' || env.NODE_ENV === 'test';
}

/**
 * The `project_id` carried by `FIREBASE_ADMIN_KEY`, and nothing else from it.
 *
 * Returns a reason rather than throwing, so callers can aggregate it with the other
 * findings instead of losing them to the first failure. The reason describes the SHAPE of
 * the problem; it never contains any part of the key.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ projectId: string | null, reason: string | null }}
 */
export function readAdminProjectId(env = process.env) {
  const raw = text(env.FIREBASE_ADMIN_KEY);
  if (!raw) {
    return { projectId: null, reason: 'FIREBASE_ADMIN_KEY is not set' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { projectId: null, reason: 'FIREBASE_ADMIN_KEY is not valid JSON' };
  }
  const projectId = text(/** @type {{ project_id?: unknown }} */ (parsed)?.project_id);
  if (!projectId) {
    return { projectId: null, reason: 'FIREBASE_ADMIN_KEY carries no project_id' };
  }
  return { projectId, reason: null };
}

/**
 * The Firebase identity this environment is REQUIRED to resolve to.
 *
 * @param {ReturnType<typeof resolveDeploymentEnvironment>} environment
 * @param {Record<string, string | undefined>} env
 * @returns {{ projectId: string, storageBucket: string }}
 */
function expectedIdentity(environment, env) {
  if (environment === 'production') {
    return {
      projectId: PRODUCTION_FIREBASE_PROJECT_ID,
      storageBucket: PRODUCTION_FIREBASE_STORAGE_BUCKET,
    };
  }
  if (environment === 'preview') {
    return {
      projectId: text(env[STAGING_PROJECT_ENV_VAR]),
      storageBucket: text(env[STAGING_BUCKET_ENV_VAR]),
    };
  }
  return { projectId: '', storageBucket: '' };
}

/**
 * The non-secret Firebase facts a deployment can state about itself.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function readFirebaseIdentity(env = process.env) {
  const admin = readAdminProjectId(env);
  return {
    browserProjectId: text(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) || null,
    browserStorageBucket: text(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) || null,
    // The server-side override read by lib/storage/bucket.ts. It decides where Admin SDK
    // writes land, so it is part of the boundary even though it is usually unset.
    serverStorageBucket: text(env.FIREBASE_STORAGE_BUCKET) || null,
    adminProjectId: admin.projectId,
    adminProjectReason: admin.reason,
  };
}

/**
 * Evaluates the whole contract. Pure: same environment in, same verdict out, no I/O.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function evaluateFirebaseEnvironment(env = process.env) {
  const environment = resolveDeploymentEnvironment(env);
  const enforced = ENFORCED_ENVIRONMENTS.has(environment);
  const identity = readFirebaseIdentity(env);
  const expected = expectedIdentity(environment, env);

  /** @type {string[]} */
  const violations = [];

  if (!enforced) {
    return {
      environment,
      enforced,
      violations,
      ...identity,
      expectedProjectId: null,
      expectedStorageBucket: null,
    };
  }

  if (environment === 'unrecognised') {
    violations.push(
      `VERCEL_ENV is ${env.VERCEL_ENV ? `"${text(env.VERCEL_ENV)}"` : 'not set'} on a Vercel ` +
        'runtime, so this deployment cannot state which Firebase environment it belongs to. ' +
        'Refusing rather than guessing.',
    );
  }

  if (environment === 'preview') {
    // The Preview-only prohibitions, stated separately from the match rules below so the
    // diagnostic names the actual danger rather than a generic mismatch — and so the guard
    // still fires if STAGING_FIREBASE_* is itself set to the production identifiers.
    if (identity.browserProjectId === PRODUCTION_FIREBASE_PROJECT_ID) {
      violations.push(
        `A Vercel Preview deployment must never serve the production Firebase project ` +
          `"${PRODUCTION_FIREBASE_PROJECT_ID}". Set NEXT_PUBLIC_FIREBASE_* to the staging ` +
          'project in the Preview environment only.',
      );
    }
    if (identity.browserStorageBucket === PRODUCTION_FIREBASE_STORAGE_BUCKET) {
      violations.push(
        `A Vercel Preview deployment must never serve the production Storage bucket ` +
          `"${PRODUCTION_FIREBASE_STORAGE_BUCKET}".`,
      );
    }
    if (identity.serverStorageBucket === PRODUCTION_FIREBASE_STORAGE_BUCKET) {
      violations.push(
        `FIREBASE_STORAGE_BUCKET names the production bucket ` +
          `"${PRODUCTION_FIREBASE_STORAGE_BUCKET}" on a Vercel Preview deployment.`,
      );
    }
    if (identity.adminProjectId === PRODUCTION_FIREBASE_PROJECT_ID) {
      violations.push(
        `FIREBASE_ADMIN_KEY is a service account for the production Firebase project ` +
          `"${PRODUCTION_FIREBASE_PROJECT_ID}". A Vercel Preview deployment must hold a ` +
          'staging service account, which cannot reach production at all.',
      );
    }
    if (!expected.projectId) {
      violations.push(
        `${STAGING_PROJECT_ENV_VAR} must name the isolated staging Firebase project for ` +
          'Vercel Preview deployments.',
      );
    } else if (expected.projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
      violations.push(
        `${STAGING_PROJECT_ENV_VAR} names the production project ` +
          `"${PRODUCTION_FIREBASE_PROJECT_ID}". Staging must be a separate Firebase project.`,
      );
    }
    if (!expected.storageBucket) {
      violations.push(
        `${STAGING_BUCKET_ENV_VAR} must name the isolated staging Storage bucket for Vercel ` +
          'Preview deployments.',
      );
    } else if (expected.storageBucket === PRODUCTION_FIREBASE_STORAGE_BUCKET) {
      violations.push(
        `${STAGING_BUCKET_ENV_VAR} names the production bucket ` +
          `"${PRODUCTION_FIREBASE_STORAGE_BUCKET}". Staging must be a separate bucket.`,
      );
    }
  }

  // The match rules. They run for every enforced environment once an expected identity is
  // known, which is what makes production and Preview one contract rather than two.
  if (expected.projectId) {
    if (!identity.browserProjectId) {
      violations.push(
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID is not configured, so this deployment cannot state ' +
          'which Firebase project its browsers use.',
      );
    } else if (identity.browserProjectId !== expected.projectId) {
      violations.push(
        `The browser Firebase project is "${identity.browserProjectId}", but this ` +
          `${environment} deployment must use "${expected.projectId}".`,
      );
    }
    if (!identity.adminProjectId) {
      violations.push(
        `${identity.adminProjectReason}, so this deployment cannot prove which Firebase ` +
          'project its server writes to.',
      );
    } else if (identity.adminProjectId !== expected.projectId) {
      violations.push(
        `The Admin service account belongs to Firebase project "${identity.adminProjectId}", ` +
          `but this ${environment} deployment must use "${expected.projectId}".`,
      );
    }
  }

  if (expected.storageBucket) {
    if (!identity.browserStorageBucket) {
      violations.push(
        'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not configured, so this deployment cannot ' +
          'state which Storage bucket its browsers use.',
      );
    } else if (identity.browserStorageBucket !== expected.storageBucket) {
      violations.push(
        `The browser Storage bucket is "${identity.browserStorageBucket}", but this ` +
          `${environment} deployment must use "${expected.storageBucket}".`,
      );
    }
    if (identity.serverStorageBucket && identity.serverStorageBucket !== expected.storageBucket) {
      violations.push(
        `FIREBASE_STORAGE_BUCKET is "${identity.serverStorageBucket}", but this ` +
          `${environment} deployment must use "${expected.storageBucket}".`,
      );
    }
  }

  // Browser/Admin agreement, stated in its own right. With an expected identity known the
  // two rules above already imply it, but this is the invariant certification reports, and
  // it is the one that still has to hold when `unrecognised` leaves the expectation empty.
  if (
    identity.adminProjectId &&
    identity.browserProjectId &&
    identity.adminProjectId !== identity.browserProjectId
  ) {
    violations.push(
      `The Admin service account belongs to Firebase project "${identity.adminProjectId}" ` +
        `while browsers are served "${identity.browserProjectId}". A deployment must read and ` +
        'write one project.',
    );
  }

  return {
    environment,
    enforced,
    violations,
    ...identity,
    expectedProjectId: expected.projectId || null,
    expectedStorageBucket: expected.storageBucket || null,
  };
}

/** @typedef {ReturnType<typeof evaluateFirebaseEnvironment>} FirebaseEnvironmentVerdict */

/**
 * The verdict as certification reads it: `ok`, `violation`, or `not-enforced` where there
 * is no environment boundary (a developer machine, CI, a build off Vercel).
 *
 * @param {FirebaseEnvironmentVerdict} verdict
 * @returns {'ok' | 'violation' | 'not-enforced'}
 */
export function isolationStatus(verdict) {
  if (!verdict.enforced) return 'not-enforced';
  return verdict.violations.length ? 'violation' : 'ok';
}

/**
 * One aggregated message naming every violation, or null when there is nothing to report.
 *
 * @param {FirebaseEnvironmentVerdict} verdict
 * @returns {string | null}
 */
export function describeFirebaseEnvironmentViolations(verdict) {
  if (!verdict.enforced || !verdict.violations.length) return null;
  return (
    `Refusing to serve: this ${verdict.environment} deployment does not satisfy the Firebase ` +
    'environment-isolation contract (P0-01).\n' +
    verdict.violations.map((violation) => `  - ${violation}`).join('\n')
  );
}

/**
 * Throws unless the environment satisfies the contract. Used by the two boot surfaces.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function assertFirebaseEnvironment(env = process.env) {
  const message = describeFirebaseEnvironmentViolations(evaluateFirebaseEnvironment(env));
  if (message) throw new Error(message);
}

/**
 * The non-secret block a deployment publishes so CI can prove what it is wired to.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function firebaseEnvironmentReport(env = process.env) {
  const verdict = evaluateFirebaseEnvironment(env);
  return {
    // Raw, as Vercel set it. Deliberately NOT called `environment`: /api/health already has
    // a field of that name carrying NODE_ENV, and spreading this over it would silently
    // change what an existing consumer reads.
    vercelEnv: text(env.VERCEL_ENV) || null,
    firebase: {
      // How the contract classified that value — which is what decides whether the
      // boundary is enforced, and distinguishes a laptop from a Vercel runtime that has
      // had its VERCEL_ENV removed.
      environment: verdict.environment,
      browserProjectId: verdict.browserProjectId,
      browserStorageBucket: verdict.browserStorageBucket,
      // The Admin project id, not the credential. It is the same public identifier the
      // browser config already carries whenever the deployment is correctly wired, and
      // naming it is the only way CI can prove server/browser agreement rather than
      // assume it.
      adminProjectId: verdict.adminProjectId,
      expectedProjectId: verdict.expectedProjectId,
      expectedStorageBucket: verdict.expectedStorageBucket,
      isolation: isolationStatus(verdict),
      violations: verdict.violations,
    },
  };
}

/**
 * The CI half of the contract: may this deployment be the target of a MUTABLE golden
 * tenant certification run?
 *
 * `evaluateFirebaseEnvironment` above asks "is THIS process correctly wired?". This asks
 * the different question CI has to answer before it resets anything: "is the deployment
 * over there an isolated staging environment, and does the credential in my hand belong
 * to the same place?". Both halves live here because the second is worthless if it drifts
 * from the first.
 *
 * `reported` is the `/api/health` body of the deployment under test — untrusted input from
 * over the network, so every field is treated as absent until proven otherwise.
 *
 * @param {{
 *   reported: unknown,
 *   credentialProjectId?: string | null,
 *   credentialReason?: string | null,
 * }} input
 */
export function evaluateStagingCertificationTarget({
  reported,
  credentialProjectId = null,
  credentialReason = null,
}) {
  /** @type {string[]} */
  const violations = [];
  const body = /** @type {Record<string, any> | null} */ (
    reported && typeof reported === 'object' ? reported : null
  );
  const firebase = body && typeof body.firebase === 'object' ? body.firebase : null;

  const vercelEnv = text(body?.vercelEnv) || null;
  const browserProjectId = text(firebase?.browserProjectId) || null;
  const browserStorageBucket = text(firebase?.browserStorageBucket) || null;
  const adminProjectId = text(firebase?.adminProjectId) || null;
  const isolation = text(firebase?.isolation) || null;
  const credential = text(credentialProjectId) || null;

  if (!firebase) {
    // A deployment built before this contract cannot answer, and a certification run must
    // not read that silence as a pass.
    violations.push(
      'The deployment does not report its Firebase environment, so it cannot be proven to ' +
        'be an isolated staging target. /api/health began reporting it on this branch, so a ' +
        'deployment that answers without it is older than the commit under test.',
    );
    return { ok: false, violations, projectId: null };
  }

  if (vercelEnv !== 'preview') {
    violations.push(
      `The deployment reports VERCEL_ENV "${vercelEnv ?? '(none)'}". A mutable golden tenant ` +
        'run resets the fixture, so it may only target a Vercel Preview deployment backed by ' +
        'the isolated staging Firebase project.',
    );
  }

  if (browserProjectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    violations.push(
      `The deployment serves the production Firebase project "${PRODUCTION_FIREBASE_PROJECT_ID}". ` +
        'Refusing to reset the golden tenant against production.',
    );
  }
  if (browserStorageBucket === PRODUCTION_FIREBASE_STORAGE_BUCKET) {
    violations.push(
      `The deployment serves the production Storage bucket ` +
        `"${PRODUCTION_FIREBASE_STORAGE_BUCKET}". Refusing to certify against production.`,
    );
  }
  if (!browserProjectId) {
    violations.push('The deployment does not name the Firebase project it serves to browsers.');
  }

  if (isolation !== 'ok') {
    violations.push(
      `The deployment reports its Firebase environment isolation as "${isolation ?? '(none)'}". ` +
        'Only a deployment that proves its own isolation may be certified.',
    );
  }

  if (!adminProjectId) {
    violations.push(
      'The deployment does not name the Firebase project its server writes to, so server and ' +
        'browser cannot be proven to agree.',
    );
  } else if (browserProjectId && adminProjectId !== browserProjectId) {
    violations.push(
      `The deployment's server writes to Firebase project "${adminProjectId}" while its ` +
        `browsers are served "${browserProjectId}".`,
    );
  }

  if (!credential) {
    violations.push(
      `${credentialReason || 'No staging Admin credential was supplied'}, so this run cannot ` +
        'prove the credential it holds belongs to the staging project.',
    );
  } else if (credential === PRODUCTION_FIREBASE_PROJECT_ID) {
    violations.push(
      `The Admin credential supplied to this run belongs to the production Firebase project ` +
        `"${PRODUCTION_FIREBASE_PROJECT_ID}". A staging certification run must be given the ` +
        'staging service account and nothing else.',
    );
  } else if (browserProjectId && credential !== browserProjectId) {
    violations.push(
      `The Admin credential supplied to this run belongs to Firebase project "${credential}", ` +
        `but the deployment serves "${browserProjectId}".`,
    );
  }

  return { ok: violations.length === 0, violations, projectId: browserProjectId };
}

/**
 * The staging target, or an error naming every reason it is not one.
 *
 * @param {Parameters<typeof evaluateStagingCertificationTarget>[0]} input
 * @returns {string} the staging Firebase project id
 */
export function assertStagingCertificationTarget(input) {
  const verdict = evaluateStagingCertificationTarget(input);
  if (!verdict.ok || !verdict.projectId) {
    throw new Error(
      'Refusing to run a mutable golden tenant certification against this deployment ' +
        '(P0-01).\n' +
        verdict.violations.map((violation) => `  - ${violation}`).join('\n'),
    );
  }
  return verdict.projectId;
}
