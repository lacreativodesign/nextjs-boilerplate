#!/usr/bin/env node
/**
 * Precondition check for the Golden Tenant gate: does ONE demo account actually
 * sign in, against the deployment being certified, with the password this run holds?
 *
 * WHY THIS EXISTS
 *
 * The gate depends on an invariant nothing verified: that the ten `bizosto-demo` Auth
 * identities carry the same password the Playwright run uses. That password lives in two
 * places — the deployment's server environment, which the seeder reads, and the GitHub
 * Actions secret, which the browser types — and they were kept in step by hand. When they
 * drifted, the gate spent twenty minutes failing all thirteen tests with "Incorrect
 * password", which is also what Firebase says when the account does not exist at all.
 *
 * This makes the drift a ten-second failure with the real reason, before the browser
 * suite starts.
 *
 * WHAT IT PROVES
 *
 * The Firebase config is fetched from the deployment under test rather than from local
 * configuration, so a pass establishes the whole chain the suite depends on: this URL,
 * serving this Firebase project, holding this account, accepting this password. A demo
 * tenant seeded into a different project than the deployment reads cannot pass it.
 *
 * It is the same Identity Platform endpoint and API key the browser SDK uses, so it is
 * the authentication path being certified, not a substitute for it. It is a precondition,
 * never a replacement: the suite still performs every real browser login itself.
 *
 * Nothing secret is printed. The password, the bypass secret and the returned tokens are
 * never written to the log; the Firebase project id is, because identifying the project
 * is the point.
 *
 * Usage: node scripts/verify-golden-tenant-signin.mjs [--print-project]
 *   --print-project  print only the Firebase project id the deployment serves, so a
 *                    reseed can target the project the deployment actually reads rather
 *                    than one someone typed in. Signs nobody in.
 *   BASE_URL                         deployment being certified (https)
 *   E2E_DEMO_PASSWORD                the password the browser suite will type
 *   VERCEL_AUTOMATION_BYPASS_SECRET  optional; required while the target is protected
 *   EXPECTED_COMMIT_SHA              optional; the deployment must be serving this commit
 *   E2E_ADMIN_EMAIL                  optional override, mirrors e2e/helpers/auth.ts
 */

import { pathToFileURL } from 'node:url';
import { requireDemoPassword } from '../lib/demo/password-policy.mjs';

/** Mirrors ROLE_EMAILS.admin in e2e/helpers/auth.ts; pinned by the PR6 contract suite. */
export const DEFAULT_PROBE_EMAIL = 'demo_admin@bizosto.com';

const IDENTITY_TOOLKIT_SIGN_IN =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

/**
 * What each Identity Platform rejection means for this gate, and what to do about it.
 *
 * `INVALID_LOGIN_CREDENTIALS` is deliberately ambiguous: with Email Enumeration
 * Protection enabled — the default for current projects — Identity Platform returns it
 * both for a wrong password and for an account that does not exist, precisely so that a
 * caller cannot tell which. Reporting it as "wrong password" would be a guess, so it is
 * reported as the two possibilities it actually is.
 */
export const SIGN_IN_FAILURE_GUIDANCE = {
  INVALID_LOGIN_CREDENTIALS:
    'Either the demo accounts do not carry this password, or they do not exist in this ' +
    'Firebase project. Email Enumeration Protection makes Identity Platform answer both ' +
    'cases identically. Re-seed the golden tenant with the same E2E_DEMO_PASSWORD this ' +
    'run uses (Actions -> Seed Golden Tenant), which creates the accounts if they are missing.',
  INVALID_PASSWORD:
    'The account exists but carries a different password. Re-seed the golden tenant with ' +
    'the same E2E_DEMO_PASSWORD this run uses (Actions -> Seed Golden Tenant).',
  EMAIL_NOT_FOUND:
    'This Firebase project has no such account. Seed the golden tenant into the project ' +
    'the deployment actually reads (Actions -> Seed Golden Tenant).',
  USER_DISABLED:
    'The account exists and is disabled. Re-seeding re-enables it (Actions -> Seed Golden Tenant).',
  TOO_MANY_ATTEMPTS_TRY_LATER:
    'Identity Platform has throttled this account after repeated failed sign-ins, which a ' +
    'failing certification run produces 39 of. Fix the credential first, then wait for the ' +
    'throttle to clear before re-running the suite.',
  PASSWORD_LOGIN_DISABLED:
    'Email/password sign-in is disabled for this Firebase project. Enable the Email/Password ' +
    'provider in Firebase Authentication.',
};

/**
 * Reads required configuration, failing closed rather than defaulting.
 *
 * The parameter is typed to the keys it actually reads rather than to `NodeJS.ProcessEnv`,
 * so a caller — a test especially — can hand it exactly those without fabricating a whole
 * environment or reaching for a cast.
 *
 * @param {Record<string, string | undefined>} env
 */
export function readConfig(env) {
  const baseUrl = String(env.BASE_URL || '').replace(/\/$/, '');
  const missing = [];
  if (!baseUrl) missing.push('BASE_URL');
  if (!String(env.E2E_DEMO_PASSWORD || '')) missing.push('E2E_DEMO_PASSWORD');
  if (missing.length) {
    throw new Error(`${missing.join(' and ')} must be configured for the golden tenant gate`);
  }
  if (!baseUrl.startsWith('https://')) {
    throw new Error('BASE_URL must use https://');
  }
  // The shared rule, not a local one. This step used to send the value raw while the
  // seeder stored it trimmed, so a pasted newline made a correctly-configured pair look
  // like a credential mismatch — the one failure this check exists to tell apart.
  const password = requireDemoPassword(env);

  const email = String(env.E2E_ADMIN_EMAIL || '').trim() || DEFAULT_PROBE_EMAIL;
  const bypassSecret = String(env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
  const expectedCommit = String(env.EXPECTED_COMMIT_SHA || '').trim();
  return { baseUrl, password, email, bypassSecret, expectedCommit };
}

/**
 * Turns an Identity Platform error body into an actionable one-line reason.
 *
 * @param {{ error?: { message?: string } } | null | undefined} body
 * @returns {string}
 */
export function describeSignInFailure(body) {
  const raw = String(body?.error?.message || '').trim();
  // Identity Platform appends detail to some codes, e.g. "TOO_MANY_ATTEMPTS_TRY_LATER : ...".
  const code = raw.split(/\s*[:.]\s*/)[0] || 'UNKNOWN_ERROR';
  const guidance = SIGN_IN_FAILURE_GUIDANCE[code];
  return guidance ? `${code}. ${guidance}` : `${code}. Unrecognised Identity Platform rejection.`;
}

/** Every request to the deployment carries the bypass, and only the deployment. */
function deploymentHeaders(bypassSecret) {
  return bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {};
}

/**
 * Establishes that the URL under test is serving the commit being certified.
 *
 * `E2E_BASE_URL` may legitimately hold a branch alias, which re-points at whichever
 * deployment landed most recently. Certification has to name an exact SHA, so the
 * deployment is asked which commit it was built from rather than assumed to be current.
 *
 * @param {{ baseUrl: string, bypassSecret: string, expectedCommit: string }} config
 * @param {typeof fetch} fetchImpl
 */
async function assertDeploymentCommit({ baseUrl, bypassSecret, expectedCommit }, fetchImpl) {
  const response = await fetchImpl(`${baseUrl}/api/health`, {
    headers: deploymentHeaders(bypassSecret),
  });
  if (!response.ok) {
    throw new Error(`${baseUrl}/api/health returned HTTP ${response.status}.`);
  }

  const { commit } = await response.json();
  const deployed = String(commit || '').trim();
  if (!expectedCommit) return deployed;

  if (!deployed) {
    throw new Error(
      `${baseUrl} does not report the commit it was built from, so this run cannot be ` +
        `certified against ${expectedCommit}. /api/health began reporting its commit on ` +
        'this branch, so a deployment that answers without one is older than the commit ' +
        'under test — a pinned preview URL or the production alias, rather than this ' +
        "branch's own deployment. Point E2E_BASE_URL at the deployment built from the " +
        'commit being certified.',
    );
  }
  if (deployed !== expectedCommit) {
    throw new Error(
      `${baseUrl} is serving commit ${deployed}, but this run certifies ${expectedCommit}. ` +
        'Point E2E_BASE_URL at the deployment built from the commit under test, or wait for ' +
        'that deployment to finish.',
    );
  }
  return deployed;
}

/**
 * Asks the deployment which Firebase project it serves. This is the public browser
 * config, so it carries nothing secret — and taking it from the deployment rather than
 * from local configuration is what makes the check prove the deployment's own wiring.
 *
 * @param {{ baseUrl: string, bypassSecret: string }} config
 * @param {typeof fetch} fetchImpl
 */
async function fetchDeploymentFirebaseConfig({ baseUrl, bypassSecret }, fetchImpl) {
  const response = await fetchImpl(`${baseUrl}/api/public/firebase-config`, {
    headers: deploymentHeaders(bypassSecret),
  });

  if (!response.ok) {
    throw new Error(
      `${baseUrl}/api/public/firebase-config returned HTTP ${response.status}. ` +
        (response.status === 401
          ? 'The deployment is behind Vercel Deployment Protection and ' +
            'VERCEL_AUTOMATION_BYPASS_SECRET is missing or wrong.'
          : 'The deployment cannot report its Firebase configuration.'),
    );
  }

  const config = await response.json();
  if (!config?.apiKey || !config?.projectId) {
    throw new Error('The deployment returned an incomplete Firebase configuration.');
  }
  return config;
}

/**
 * The Firebase project this deployment serves, and nothing else.
 *
 * A reseed has to land in the project the deployment reads. Asking the deployment rather
 * than accepting a typed-in value is what makes "seeded into the wrong project" — one of
 * the two causes Email Enumeration Protection makes indistinguishable at the login form —
 * impossible rather than merely unlikely.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export async function resolveDeploymentFirebaseProject(env = process.env, fetchImpl = fetch) {
  const config = readConfig(env);
  const firebase = await fetchDeploymentFirebaseConfig(config, fetchImpl);
  return firebase.projectId;
}

/**
 * Signs in once. Returns the verified project id, or throws with the real reason.
 * The id token in a successful response is discarded; nothing is kept or printed.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export async function verifyGoldenTenantSignIn(env = process.env, fetchImpl = fetch) {
  const config = readConfig(env);
  const commit = await assertDeploymentCommit(config, fetchImpl);
  const firebase = await fetchDeploymentFirebaseConfig(config, fetchImpl);

  const response = await fetchImpl(
    `${IDENTITY_TOOLKIT_SIGN_IN}?key=${encodeURIComponent(firebase.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `returnSecureToken` is the browser SDK's own request shape. The tokens in a
      // successful response are read by nobody: the value below is discarded with the
      // response object, and only the project id reaches the log.
      body: JSON.stringify({
        email: config.email,
        password: config.password,
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      `${config.email} could not sign in to Firebase project "${firebase.projectId}" ` +
        `as served by ${config.baseUrl}: ${describeSignInFailure(body)}`,
    );
  }

  return { projectId: firebase.projectId, email: config.email, baseUrl: config.baseUrl, commit };
}

// Importable for tests, executable for CI: the entry point runs only when this file is
// the process's own argv[1], never when a suite imports the functions above.
const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly && process.argv.includes('--print-project')) {
  // stdout carries the project id alone so a workflow can capture it; anything the
  // operator needs to read goes to stderr.
  resolveDeploymentFirebaseProject()
    .then((projectId) => console.log(projectId))
    .catch((error) => {
      console.error(`Could not resolve the deployment's Firebase project.\n  ${error.message}`);
      process.exit(1);
    });
} else if (invokedDirectly) {
  verifyGoldenTenantSignIn()
    .then(({ projectId, email, baseUrl, commit }) => {
      console.log(`Golden tenant credential verified against the deployment under test.`);
      console.log(`  deployment:       ${baseUrl}`);
      console.log(`  commit:           ${commit || '(not reported)'}`);
      console.log(`  firebase project: ${projectId}`);
      console.log(`  account:          ${email}`);
    })
    .catch((error) => {
      console.error(`Golden tenant credential check failed.\n  ${error.message}`);
      process.exit(1);
    });
}
