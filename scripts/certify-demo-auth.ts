#!/usr/bin/env node
/**
 * P0-02 — live Firebase Auth certification for the `bizosto-demo` golden tenant.
 *
 * WHAT THIS IS FOR
 *
 * `scripts/seedDemoTenant.ts` makes the ten canonical identities correct. It cannot make
 * the demo AUTH SURFACE correct, because it only ever looks up the ten emails it already
 * knows. Anything else in the project — an identity from an earlier roster, a renamed
 * alias, an account still carrying `tenantId: bizosto-demo` — is invisible to it, and an
 * invisible enabled account is an authentication path nobody is watching.
 *
 * This walks the WHOLE Auth population, page by page, and says what is actually there.
 *
 *   --mode=audit      read-only. Performs no write of any kind.
 *   --mode=remediate  rotates the ten canonical passwords, revokes their refresh tokens,
 *                     restores exact claims, and disables + revokes proven legacy demo
 *                     identities. It never deletes: see planRemediation.
 *
 *   --project=<id>            REQUIRED. The project this run is FOR, stated by the
 *                             operator and verified against the credential.
 *   --credential-env=<VAR>    which variable carries that project's service account.
 *                             Defaults to FIREBASE_ADMIN_KEY; staging must pass
 *                             FIREBASE_ADMIN_KEY_STAGING, and the two may not be crossed.
 *   --prove-historical-rejected
 *                             also prove the demo password published in git history is
 *                             refused. The candidate is recovered from this repository's
 *                             own object database at run time, matched against a recorded
 *                             SHA-256, and never written to disk or a log.
 *   --json                    emit the machine-readable report as well.
 *
 * FAIL-CLOSED
 *
 * Every exit that is not a completed inventory is a FAILURE exit. "Firebase was
 * unreachable" and "there are no legacy demo accounts" produce the same empty table, and a
 * gate that cannot tell them apart reports the most dangerous state in the system as its
 * healthiest.
 *
 * NOTHING SECRET IS PRINTED
 *
 * No password, ID token, refresh token, service-account field or API key reaches stdout,
 * stderr or any artefact. The report is checked against `assertReportCarriesNoSecrets`
 * before it is emitted, so a future field cannot quietly become a leak. Sign-in proof
 * decodes only the ID token's claim set, in memory, and discards the token.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as admin from 'firebase-admin';

import { DEMO_TENANT_ID, DEMO_USERS } from '../lib/demo/users';
import { requireDemoPassword } from '../lib/demo/password-policy.mjs';
import {
  assertCredentialProject,
  assertReportCarriesNoSecrets,
  certificationVerdict,
  classifyIdentity,
  countInventory,
  emptyCounts,
  fingerprintUid,
  HISTORICAL_DEMO_PASSWORD_SHA256,
  parseCertificationArgs,
  planRemediation,
  type AuthIdentity,
  type CertificationReport,
  type ClassifiedIdentity,
  type FirestoreUserRecord,
} from '../lib/demo/auth-certification';

const IDENTITY_TOOLKIT_SIGN_IN =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

/** Firebase's own maximum. Stated once so the pagination loop cannot silently shrink. */
const AUTH_PAGE_SIZE = 1000;

const findings: string[] = [];
const note = (message: string) => {
  findings.push(message);
  console.log(`  ${message}`);
};

/**
 * A named Admin app rather than `lib/firebaseAdmin`.
 *
 * That module reads `FIREBASE_ADMIN_KEY` at import time and applies the P0-01 deployment
 * contract to itself. This tool must be able to run against staging with the STAGING
 * credential in a different variable, so it builds its own app from the credential this
 * run verified, and shares nothing with the request-serving singleton.
 */
function initAdminApp(credentialEnv: string, projectId: string): admin.app.App {
  const serviceAccount = JSON.parse(String(process.env[credentialEnv] || '{}'));
  return admin.initializeApp(
    { credential: admin.credential.cert(serviceAccount), projectId },
    `p0-02-certify-${projectId}`,
  );
}

/**
 * EVERY Auth user, page by page.
 *
 * The page token loop is the substance of this function. Asking only for the ten canonical
 * emails — which is what the seeder does — answers "are the ten right?" and cannot answer
 * "what else can log in?", which is the question P0-02 was opened to answer. A run that
 * stops after the first page reports a subset of the project as if it were the project.
 */
async function inventoryAuthUsers(
  auth: admin.auth.Auth,
): Promise<{ users: AuthIdentity[]; pages: number }> {
  const users: AuthIdentity[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const page = await auth.listUsers(AUTH_PAGE_SIZE, pageToken);
    pages += 1;
    for (const user of page.users) {
      users.push({
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        disabled: user.disabled === true,
        emailVerified: user.emailVerified === true,
        customClaims: (user.customClaims as Record<string, unknown> | undefined) ?? null,
        tokensValidAfterTime: user.tokensValidAfterTime ?? null,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return { users, pages };
}

/** Every `users` document claiming the golden tenant, keyed by document id (the uid). */
async function readDemoFirestoreUsers(
  db: admin.firestore.Firestore,
): Promise<Map<string, FirestoreUserRecord>> {
  const byUid = new Map<string, FirestoreUserRecord>();
  const snapshot = await db.collection('users').where('tenantId', '==', DEMO_TENANT_ID).get();
  for (const doc of snapshot.docs) {
    byUid.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, unknown>) });
  }
  return byUid;
}

/** The Firestore document for a uid, whether or not it claims the demo tenant. */
async function readUserDoc(
  db: admin.firestore.Firestore,
  uid: string,
): Promise<FirestoreUserRecord | null> {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as Record<string, unknown>) };
}

/**
 * The ID token's claim set, without the token.
 *
 * Only the payload segment is base64-decoded, in memory. The token itself is never
 * returned, stored or logged, and the caller drops it with this function's argument.
 */
function readTokenClaims(idToken: string): Record<string, unknown> {
  const payload = idToken.split('.')[1] ?? '';
  const normalised = payload.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return JSON.parse(Buffer.from(normalised, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * The project's public Firebase Web API key.
 *
 * Password sign-in goes through Identity Platform's REST endpoint, which needs the WEB api
 * key — the Admin SDK cannot verify a password. That key is a PUBLIC identifier: it ships
 * in every browser's Firebase config and grants nothing on its own, because access is
 * decided by Security Rules and Auth. It is still not something to guess, so it is either
 * configured explicitly or read from the Firebase Management API using the Admin
 * credential this run already holds and already verified.
 *
 * Reading it removes the last reason a certification run would have to say "I could not
 * prove the ten identities authenticate". An operator does not have to add a secret whose
 * value the deployment already publishes.
 *
 * Returns null rather than throwing: the caller reports the failure to prove, and the
 * verdict refuses to certify a run that proved nothing. It is never printed.
 */
async function resolveWebApiKey(app: admin.app.App, projectId: string): Promise<string | null> {
  const configured = String(process.env.FIREBASE_WEB_API_KEY || '').trim();
  if (configured) return configured;

  try {
    const token = await app.options.credential?.getAccessToken();
    const accessToken = token?.access_token;
    if (!accessToken) return null;

    const response = await fetch(
      `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/webApps/-/config`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as { apiKey?: unknown };
    const apiKey = String(body.apiKey || '').trim();
    return apiKey || null;
  } catch {
    return null;
  }
}

type SignInOutcome =
  { ok: true; audience: string; role: unknown; tenantId: unknown } | { ok: false; code: string };

/**
 * One real Identity Platform password sign-in, against the project being certified.
 *
 * This is the browser SDK's own endpoint, so a pass establishes the authentication path
 * that actually serves users rather than a substitute for it. The returned tokens are read
 * for the claim set alone and discarded with the response.
 */
async function trySignIn(apiKey: string, email: string, password: string): Promise<SignInOutcome> {
  const response = await fetch(`${IDENTITY_TOOLKIT_SIGN_IN}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const raw = String(body?.error?.message || 'UNKNOWN_ERROR');
    return { ok: false, code: raw.split(/\s*[:.]\s*/)[0] || 'UNKNOWN_ERROR' };
  }

  const body = (await response.json()) as { idToken?: string };
  const claims = readTokenClaims(String(body.idToken || ''));
  return {
    ok: true,
    audience: String(claims.aud ?? ''),
    role: claims.role,
    tenantId: claims.tenantId,
  };
}

/**
 * The historical demo password, recovered from this repository's own history.
 *
 * It is NOT stored in the repository as a value — only its SHA-256 is, in
 * lib/demo/auth-certification.ts. Recovering it here means a certification run can prove
 * the published credential is refused without anyone having to paste that credential into
 * a secret store, a workflow input or this file. A candidate whose digest is not one of
 * the recorded ones is discarded unread.
 */
function recoverHistoricalCandidates(): Array<{ value: string; sha256: string }> {
  const recorded = new Set<string>(HISTORICAL_DEMO_PASSWORD_SHA256);
  const found = new Map<string, string>();

  // `rev-list --objects` lists commits and trees alongside the blobs, and asking
  // `cat-file blob` for a commit prints "bad file" to stderr for every one of them. The
  // type filter keeps that noise out of a certification log, where an operator reading
  // fatal: lines has to work out whether the proof actually ran.
  let blobs: string[] = [];
  try {
    const objects = execFileSync(
      'git',
      ['rev-list', '--objects', '--all', '--', 'lib/demo/seed.ts', 'app/super_admin/demo/page.tsx'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
      .split('\n')
      .map((line) => line.split(' ')[0])
      .filter(Boolean);

    if (!objects.length) return [];

    const types = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype)'], {
      input: `${objects.join('\n')}\n`,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

    blobs = types
      .split('\n')
      .filter((line) => line.endsWith(' blob'))
      .map((line) => line.split(' ')[0]);
  } catch {
    return [];
  }

  for (const oid of blobs) {
    let content = '';
    try {
      content = execFileSync('git', ['cat-file', 'blob', oid], {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch {
      continue;
    }
    for (const match of content.matchAll(/DEMO_PASSWORD\s*=\s*['"]([^'"\n]+)['"]/g)) {
      const value = match[1];
      const sha256 = createHash('sha256').update(value).digest('hex');
      if (recorded.has(sha256)) found.set(sha256, value);
    }
  }

  return [...found.entries()].map(([sha256, value]) => ({ value, sha256 }));
}

async function run(): Promise<void> {
  const args = parseCertificationArgs(process.argv.slice(2));

  // PROJECT ASSERTION — before any Firebase call, read or write.
  const projectId = assertCredentialProject({
    intendedProject: args.project,
    credentialEnv: args.credentialEnv,
    env: process.env,
  });

  console.log(`P0-02 demo Auth certification — mode=${args.mode}`);
  console.log(`  intended project : ${args.project}`);
  console.log(`  credential source: ${args.credentialEnv} (project_id verified)`);
  console.log(`  verified project : ${projectId}`);
  console.log('');

  const app = initAdminApp(args.credentialEnv, projectId);
  const auth = admin.auth(app);
  const db = admin.firestore(app);

  const counts = emptyCounts();
  let inventoryComplete = false;

  console.log('Auth inventory (all pages):');
  const { users, pages } = await inventoryAuthUsers(auth);
  counts.totalAuthUsersInspected = users.length;
  counts.authPagesInspected = pages;
  inventoryComplete = true;
  console.log(`  ${users.length} Auth identities across ${pages} page(s)`);

  const demoFirestoreUsers = await readDemoFirestoreUsers(db);

  const classified: ClassifiedIdentity[] = [];
  const disabledByUid = new Map<string, boolean>();
  for (const user of users) {
    const record =
      demoFirestoreUsers.get(user.uid) ??
      (isWorthAFirestoreLookup(user) ? await readUserDoc(db, user.uid) : null);
    classified.push(classifyIdentity(user, record));
    disabledByUid.set(user.uid, user.disabled);
  }

  Object.assign(counts, countInventory(classified, disabledByUid));

  // Firestore demo records with no surviving Auth identity behind them.
  const authUids = new Set(users.map((user) => user.uid));
  counts.orphanFirestoreDemoUsers = [...demoFirestoreUsers.keys()].filter(
    (uid) => !authUids.has(uid),
  ).length;

  reportPopulation(classified, disabledByUid, counts.orphanFirestoreDemoUsers);

  if (args.mode === 'remediate') {
    await remediate({ auth, classified, counts });
  } else {
    console.log('\nAudit mode: no write was performed.');
  }

  const signInProofAttempted = await proveSignIns({ app, args, projectId, counts });

  const report: CertificationReport = {
    mode: args.mode,
    projectId,
    inventoryComplete,
    signInProofAttempted,
    historicalProofRequested: args.proveHistoricalRejected,
    counts,
    findings,
  };

  // Last line of defence before anything is emitted.
  assertReportCarriesNoSecrets(report);

  const verdict = certificationVerdict(report);
  console.log('\n================ P0-02 RESULT ================');
  console.log(`project: ${projectId}   mode: ${args.mode}`);
  for (const [key, value] of Object.entries(report.counts)) {
    console.log(`  ${key}: ${value}`);
  }
  if (args.json) console.log(`\nJSON ${JSON.stringify(report)}`);

  if (!verdict.certified) {
    console.error('\nP0-02 NOT CERTIFIED for this project:');
    for (const reason of verdict.reasons) console.error(`  - ${reason}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nP0-02 CERTIFIED for this project.');
}

/**
 * Whether an identity is worth one extra Firestore read.
 *
 * The tenant query above already returned every `bizosto-demo` document in one round trip.
 * This adds a per-uid read only for identities that LOOK demo-shaped but were not in it —
 * the case where a record carries `isDemo: true` under a different tenant, or none at all.
 * Doing it for the whole population would be one Firestore read per Auth user.
 */
function isWorthAFirestoreLookup(user: AuthIdentity): boolean {
  const email = String(user.email ?? '').toLowerCase();
  if (!email) return false;
  if (String(user.customClaims?.tenantId ?? '') === DEMO_TENANT_ID) return true;
  return /^demo(?:[._-][a-z0-9._-]*)?@bizosto\.com$/i.test(email);
}

function reportPopulation(
  classified: readonly ClassifiedIdentity[],
  disabledByUid: ReadonlyMap<string, boolean>,
  orphans: number,
): void {
  const canonical = classified.filter((entry) => entry.kind === 'canonical');
  const legacy = classified.filter((entry) => entry.kind === 'legacy-demo');
  const suspected = classified.filter((entry) => entry.kind === 'suspected-demo');

  console.log(`\nCanonical demo identities: ${canonical.length} / ${DEMO_USERS.length}`);
  for (const entry of canonical) {
    const state = disabledByUid.get(entry.uid) ? 'DISABLED' : 'enabled';
    if (entry.drift.length) {
      note(`canonical ${entry.email} [${state}] drift: ${entry.drift.join('; ')}`);
    }
  }
  const missing = DEMO_USERS.map((user) => user.email).filter(
    (email) => !canonical.some((entry) => String(entry.email).toLowerCase() === email),
  );
  for (const email of missing) note(`canonical identity MISSING from this project: ${email}`);

  console.log(`\nNoncanonical demo-related identities: ${legacy.length}`);
  for (const entry of legacy) {
    const state = disabledByUid.get(entry.uid) ? 'disabled' : 'ENABLED';
    note(
      `legacy demo identity [${state}] ${entry.uidFingerprint} evidence=${entry.evidence.join(',')}`,
    );
  }

  console.log(`\nSuspected-demo identities (reported only, never mutated): ${suspected.length}`);
  for (const entry of suspected) {
    note(
      `suspected demo address ${entry.uidFingerprint} matches the demo naming pattern but ` +
        'carries no bizosto-demo claim and no bizosto-demo Firestore record. Owner review.',
    );
  }

  if (orphans) note(`${orphans} bizosto-demo Firestore user record(s) have no Auth identity.`);
}

async function remediate(input: {
  auth: admin.auth.Auth;
  classified: readonly ClassifiedIdentity[];
  counts: ReturnType<typeof emptyCounts>;
}): Promise<void> {
  const { auth, classified, counts } = input;
  const password = requireDemoPassword();
  const plan = planRemediation(classified);

  console.log('\nRemediation:');
  for (const action of plan) {
    if (action.kind === 'rotate-canonical') {
      await auth.updateUser(action.uid, {
        password,
        displayName: action.displayName,
        emailVerified: true,
        disabled: false,
      });
      counts.passwordRotations += 1;

      // EXACTLY the two intended claims. Passing the object whole, rather than spreading
      // what was there, is what removes a stale `super_admin` or module claim: anything
      // not named here stops existing on this identity.
      await auth.setCustomUserClaims(action.uid, {
        role: action.role,
        tenantId: DEMO_TENANT_ID,
      });

      // AFTER the password write, never before: a revocation issued first would leave a
      // window in which a session minted against the OLD password stayed valid.
      await auth.revokeRefreshTokens(action.uid);
      counts.refreshTokenRevocations += 1;
      console.log(`  rotated + revoked + claims reset: ${action.email}`);
      continue;
    }

    if (action.kind === 'disable-legacy') {
      await auth.updateUser(action.uid, { disabled: true });
      await auth.revokeRefreshTokens(action.uid);
      note(
        `DISABLED + refresh tokens revoked: legacy demo identity ${fingerprintUid(action.uid)} ` +
          `(evidence: ${action.evidence.join(',')}). Not deleted: disable is reversible and ` +
          'ends the authentication path immediately.',
      );
      continue;
    }

    note(`report-only: ${fingerprintUid(action.uid)} — ${action.reason}`);
  }
}

async function proveSignIns(input: {
  app: admin.app.App;
  args: ReturnType<typeof parseCertificationArgs>;
  projectId: string;
  counts: ReturnType<typeof emptyCounts>;
}): Promise<boolean> {
  const { app, args, projectId, counts } = input;
  const apiKey = await resolveWebApiKey(app, projectId);

  if (!apiKey) {
    note(
      'No Firebase Web API key could be resolved for this project, so NO SIGN-IN WAS ' +
        'ATTEMPTED. Set FIREBASE_WEB_API_KEY (a public identifier — it ships in every ' +
        "browser's Firebase config), or grant the service account read access to the " +
        'Firebase Management API. This run cannot prove the ten identities authenticate, ' +
        'cannot prove the published historical password is refused, and must not certify.',
    );
    return false;
  }

  const password = requireDemoPassword();
  console.log('\nSign-in proof (all ten roles, current credential):');

  for (const user of DEMO_USERS) {
    const outcome = await trySignIn(apiKey, user.email, password);
    if (!outcome.ok) {
      note(`sign-in FAILED for ${user.email}: ${outcome.code}`);
      continue;
    }
    if (outcome.audience !== projectId) {
      note(`sign-in for ${user.email} returned an identity for project "${outcome.audience}".`);
      continue;
    }
    if (outcome.role !== user.role || outcome.tenantId !== DEMO_TENANT_ID) {
      note(`sign-in for ${user.email} carried role/tenant claims that are not canonical.`);
      continue;
    }
    counts.currentPasswordSignIns += 1;
    console.log(`  ok ${user.email} (role=${user.role}, tenant=${DEMO_TENANT_ID})`);
  }

  if (!args.proveHistoricalRejected) return true;

  console.log('\nHistorical credential proof:');
  const candidates = recoverHistoricalCandidates();
  counts.historicalCandidatesTested = candidates.length;

  if (!candidates.length) {
    note(
      'No historical demo-password candidate could be recovered from git history in this ' +
        'checkout (a shallow clone cannot see it). Nothing was tested, and this run therefore ' +
        'does NOT prove the published credential is refused.',
    );
    return true;
  }

  for (const candidate of candidates) {
    const label = `sha256:${candidate.sha256.slice(0, 12)}`;
    for (const user of DEMO_USERS) {
      const outcome = await trySignIn(apiKey, user.email, candidate.value);
      if (outcome.ok) {
        counts.historicalPasswordAccepted += 1;
        note(`HISTORICAL CREDENTIAL STILL ACCEPTED by ${user.email} (${label}).`);
      }
    }
    console.log(
      `  tested published candidate ${label} against all ${DEMO_USERS.length} identities`,
    );
  }
  console.log(`  historical credentials accepted: ${counts.historicalPasswordAccepted}`);
  return true;
}

run().catch((error) => {
  // The message, never the object: an Admin SDK error can carry the request it failed on.
  console.error(
    `P0-02 certification failed: ${error instanceof Error ? error.message : 'unknown'}`,
  );
  process.exit(1);
});
