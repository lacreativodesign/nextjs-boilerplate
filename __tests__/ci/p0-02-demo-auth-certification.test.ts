import * as fs from 'fs';
import * as path from 'path';

import { DEMO_TENANT_ID, DEMO_USERS } from '@/lib/demo/users';
import { requireDemoPassword, MIN_DEMO_PASSWORD_LENGTH } from '@/lib/demo/password-policy.mjs';
import {
  CANONICAL_CLAIM_KEYS,
  DEMO_EMAIL_PATTERN,
  HISTORICAL_DEMO_PASSWORD_SHA256,
  PRODUCTION_FIREBASE_PROJECT_ID,
  STAGING_CREDENTIAL_ENV,
  STAGING_FIREBASE_PROJECT_ID,
  assertCredentialProject,
  assertReportCarriesNoSecrets,
  certificationVerdict,
  claimsAreExact,
  classifyIdentity,
  countInventory,
  emptyCounts,
  parseCertificationArgs,
  planRemediation,
  unexpectedClaimKeys,
  type AuthIdentity,
  type CertificationReport,
  type FirestoreUserRecord,
} from '@/lib/demo/auth-certification';

/**
 * P0-02 — the demo Firebase Auth surface must stay explicitly known and controlled.
 *
 * WHAT THIS SUITE IS FOR
 *
 * A live certification run proves the state of one project on one day. It cannot prove
 * that the NEXT change keeps the rules that made the state safe, and the rules here are
 * exactly the kind that look like tidy-ups when you meet them out of context: the reason
 * `--project` has no default, the reason claims are written whole rather than spread, the
 * reason an unreachable Firebase is a failure rather than an empty table.
 *
 * So this suite drives the decisions rather than reading the source for them, and spends
 * most of its length on the cases that must NEVER happen — a staff account being disabled,
 * a staging run reaching for the production key, a clean-looking report from a run that
 * inspected nothing. Those are the ones a live run cannot be asked to demonstrate.
 *
 * THE HISTORY THIS EXISTS BECAUSE OF
 *
 * A 16-character demo password was hard-coded in `lib/demo/seed.ts` and in
 * `app/super_admin/demo/page.tsx` — the client bundle — from 2026-02-27 until `ae1c63de`
 * removed it on 2026-09-06, in a PUBLIC repository. Deleting it from HEAD did not
 * un-publish it. Test 5 below is what stops it, or anything like it, coming back.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const ROSTER_SOURCE = 'lib/demo/users.ts';
const SEED_SOURCE = 'lib/demo/seed.ts';
const CERT_SCRIPT = 'scripts/certify-demo-auth.ts';
const CERT_LIB = 'lib/demo/auth-certification.ts';

/**
 * A service account shaped like the real thing, carrying nothing that resembles one.
 *
 * The sentinel fields deliberately avoid a PEM header and any other realistic credential
 * prefix: a fixture that looks like a key to a scanner costs every future secret sweep a
 * finding to adjudicate, and this repository is public. They are still unique strings, so
 * the leak assertions below remain meaningful — if either reaches an error message, the
 * test fails on the sentinel rather than on a pattern.
 */
const KEY_SENTINEL = 'fixture-private-key-must-never-be-emitted';
const EMAIL_SENTINEL = 'fixture-client-email-must-never-be-emitted';

const serviceAccount = (projectId: string) =>
  JSON.stringify({
    type: 'service_account',
    project_id: projectId,
    private_key: KEY_SENTINEL,
    client_email: `${EMAIL_SENTINEL}.${projectId}`,
  });

const authUser = (over: Partial<AuthIdentity> & { uid: string }): AuthIdentity => ({
  email: null,
  displayName: null,
  disabled: false,
  emailVerified: true,
  customClaims: null,
  tokensValidAfterTime: null,
  ...over,
});

/** A canonical identity in the state the contract requires, so drift can be injected. */
const healthyCanonical = (index = 0) => {
  const user = DEMO_USERS[index];
  const identity = authUser({
    uid: `uid-${user.role}`,
    email: user.email,
    displayName: user.name,
    customClaims: { role: user.role, tenantId: DEMO_TENANT_ID },
  });
  const record: FirestoreUserRecord = {
    id: identity.uid,
    email: user.email,
    role: user.role,
    tenantId: DEMO_TENANT_ID,
    status: 'active',
    isDeleted: false,
    isDemo: true,
    emailVerified: true,
  };
  return { user, identity, record };
};

describe('P0-02 (1-4): the canonical roster is exactly the approved ten', () => {
  it('contains exactly ten identities', () => {
    expect(DEMO_USERS).toHaveLength(10);
  });

  it('has no duplicate emails', () => {
    const emails = DEMO_USERS.map((user) => user.email.toLowerCase());
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('has no duplicate roles', () => {
    const roles = DEMO_USERS.map((user) => user.role);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('grants no demo identity super_admin, under any spelling', () => {
    for (const user of DEMO_USERS) {
      expect(user.role).not.toBe('super_admin');
      expect(user.role).not.toMatch(/super/i);
    }
    // And the roster source itself names no such role, so one cannot arrive by a
    // constant that happens not to be in DEMO_USERS yet.
    expect(read(ROSTER_SOURCE)).not.toMatch(/super_admin/);
  });

  it('pins every canonical email to the golden tenant and nothing else', () => {
    expect(DEMO_TENANT_ID).toBe('bizosto-demo');
    for (const user of DEMO_USERS) {
      expect(user.email).toMatch(/^demo_[a-z_]+@bizosto\.com$/);
      expect(DEMO_EMAIL_PATTERN.test(user.email)).toBe(true);
    }
  });
});

describe('P0-02 (5-8): the password is configuration, never source', () => {
  it('has no password literal in the roster or the seeder', () => {
    for (const rel of [ROSTER_SOURCE, SEED_SOURCE, CERT_LIB, CERT_SCRIPT]) {
      const source = read(rel);
      expect(source).not.toMatch(/DEMO_PASSWORD\s*=\s*['"][^'"\n]+['"]/);
      expect(source).not.toMatch(/password\s*[:=]\s*['"][A-Za-z0-9!@#$%^&*_-]{8,}['"]/);
    }
  });

  it('records the published historical credential by digest, never by value', () => {
    // A SHA-256 is 64 hex characters. Anything else in this list would be the thing the
    // list exists to avoid.
    expect(HISTORICAL_DEMO_PASSWORD_SHA256.length).toBeGreaterThan(0);
    for (const digest of HISTORICAL_DEMO_PASSWORD_SHA256) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('requires E2E_DEMO_PASSWORD rather than defaulting', () => {
    expect(() => requireDemoPassword({})).toThrow(/E2E_DEMO_PASSWORD is required/);
    expect(() => requireDemoPassword({ E2E_DEMO_PASSWORD: '' })).toThrow(/required/);
  });

  it('still enforces the minimum length', () => {
    expect(MIN_DEMO_PASSWORD_LENGTH).toBe(16);
    expect(() => requireDemoPassword({ E2E_DEMO_PASSWORD: 'a'.repeat(15) })).toThrow(/at least 16/);
    expect(requireDemoPassword({ E2E_DEMO_PASSWORD: 'a'.repeat(16) })).toHaveLength(16);
  });

  it('rejects surrounding whitespace instead of silently trimming it', () => {
    const padded = ` ${'a'.repeat(16)}\n`;
    expect(() => requireDemoPassword({ E2E_DEMO_PASSWORD: padded })).toThrow(/whitespace/);
  });
});

describe('P0-02 (9-12): the seeder keeps the canonical ten correct', () => {
  const seed = read(SEED_SOURCE);

  it('updates an EXISTING account rather than skipping it', () => {
    // The `email-already-exists` branch is the one that runs on every re-seed after the
    // first, so it is the branch that decides whether a rotation actually happens.
    expect(seed).toMatch(/auth\/email-already-exists/);
    expect(seed).toMatch(/updateUser\(/);
  });

  it('re-enables, verifies and renames the account it updates', () => {
    const update = seed.slice(seed.indexOf('updateUser('), seed.indexOf('updateUser(') + 400);
    // Each property must be LIVE code, not a commented-out line. A plain substring match
    // accepts `// disabled: false,` and so cannot see the re-enable being removed — which
    // is exactly what a mutation run demonstrated.
    const live = (property: string) =>
      update
        .split('\n')
        .some((line) => !line.trimStart().startsWith('//') && new RegExp(property).test(line));

    expect(live('password,')).toBe(true);
    expect(live('emailVerified:\\s*true')).toBe(true);
    expect(live('disabled:\\s*false')).toBe(true);
    expect(live('displayName:')).toBe(true);
  });

  it('writes exactly the role and tenant claims', () => {
    expect(seed).toMatch(/setCustomUserClaims\(uid,\s*\{\s*role:\s*user\.role,\s*tenantId\s*\}\)/);
  });
});

describe('P0-02 (13-14): a live action states its project, and cannot cross environments', () => {
  it('requires --project and never infers it from the credential', () => {
    expect(() => parseCertificationArgs(['--mode=audit'])).toThrow(/--project/);
    expect(() => parseCertificationArgs(['--project=x'])).toThrow(/--mode/);
    expect(() => parseCertificationArgs(['--mode=wipe', '--project=x'])).toThrow(
      /audit.*remediate/,
    );
    expect(() => parseCertificationArgs(['--mode=audit', '--project=x', '--rm-rf'])).toThrow(
      /Unrecognised/,
    );
  });

  it('accepts a credential whose project_id matches the stated project', () => {
    expect(
      assertCredentialProject({
        intendedProject: PRODUCTION_FIREBASE_PROJECT_ID,
        credentialEnv: 'FIREBASE_ADMIN_KEY',
        env: { FIREBASE_ADMIN_KEY: serviceAccount(PRODUCTION_FIREBASE_PROJECT_ID) },
      }),
    ).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
  });

  it('aborts when the credential points somewhere other than the stated project', () => {
    expect(() =>
      assertCredentialProject({
        intendedProject: STAGING_FIREBASE_PROJECT_ID,
        credentialEnv: STAGING_CREDENTIAL_ENV,
        env: { [STAGING_CREDENTIAL_ENV]: serviceAccount(PRODUCTION_FIREBASE_PROJECT_ID) },
      }),
    ).toThrow(new RegExp(`targets Firebase project "${PRODUCTION_FIREBASE_PROJECT_ID}"`));
  });

  it('forbids certifying staging with the production credential — there is no fallback', () => {
    expect(() =>
      assertCredentialProject({
        intendedProject: STAGING_FIREBASE_PROJECT_ID,
        credentialEnv: 'FIREBASE_ADMIN_KEY',
        env: { FIREBASE_ADMIN_KEY: serviceAccount(STAGING_FIREBASE_PROJECT_ID) },
      }),
    ).toThrow(/no fallback to the production credential/);
  });

  it('forbids certifying production with the staging credential', () => {
    expect(() =>
      assertCredentialProject({
        intendedProject: PRODUCTION_FIREBASE_PROJECT_ID,
        credentialEnv: STAGING_CREDENTIAL_ENV,
        env: { [STAGING_CREDENTIAL_ENV]: serviceAccount(PRODUCTION_FIREBASE_PROJECT_ID) },
      }),
    ).toThrow(/cannot reach production/);
  });

  it('aborts on a missing, malformed or project-less credential', () => {
    const base = {
      intendedProject: PRODUCTION_FIREBASE_PROJECT_ID,
      credentialEnv: 'FIREBASE_ADMIN_KEY',
    };
    expect(() => assertCredentialProject({ ...base, env: {} })).toThrow(/is not set/);
    expect(() =>
      assertCredentialProject({ ...base, env: { FIREBASE_ADMIN_KEY: 'not json' } }),
    ).toThrow(/not valid JSON/);
    expect(() =>
      assertCredentialProject({
        ...base,
        env: { FIREBASE_ADMIN_KEY: '{"type":"service_account"}' },
      }),
    ).toThrow(/carries no project_id/);
  });

  it('never puts any part of the credential into the refusal it throws', () => {
    const key = serviceAccount('some-other-project');
    let message = '';
    try {
      assertCredentialProject({
        intendedProject: PRODUCTION_FIREBASE_PROJECT_ID,
        credentialEnv: 'FIREBASE_ADMIN_KEY',
        env: { FIREBASE_ADMIN_KEY: key },
      });
    } catch (error) {
      message = (error as Error).message;
    }
    // The project id is named on purpose — it is public, and it is the whole diagnostic.
    expect(message).toContain('some-other-project');
    // Nothing else from the credential is.
    expect(message).not.toContain(KEY_SENTINEL);
    expect(message).not.toContain(EMAIL_SENTINEL);
    expect(key).toContain(KEY_SENTINEL);
  });
});

describe('P0-02 (15): legacy demo identities are disabled, and real accounts are not touched', () => {
  const legacyByClaim = authUser({
    uid: 'uid-legacy-claim',
    email: 'demo_old_role@bizosto.com',
    customClaims: { role: 'admin', tenantId: DEMO_TENANT_ID },
  });

  it('classifies a noncanonical identity carrying the demo tenant claim as legacy', () => {
    const classified = classifyIdentity(legacyByClaim, null);
    expect(classified.kind).toBe('legacy-demo');
    expect(classified.evidence).toContain('claim-tenant');
  });

  it('classifies a noncanonical identity with a demo Firestore record as legacy', () => {
    const identity = authUser({ uid: 'uid-legacy-fs', email: 'someone@bizosto.com' });
    const record: FirestoreUserRecord = { id: identity.uid, tenantId: DEMO_TENANT_ID };
    expect(classifyIdentity(identity, record).kind).toBe('legacy-demo');
  });

  it('DISABLES and revokes rather than deleting', () => {
    const plan = planRemediation([classifyIdentity(legacyByClaim, null)]);
    expect(plan).toEqual([
      expect.objectContaining({ kind: 'disable-legacy', uid: 'uid-legacy-claim' }),
    ]);
    // Deletion is absent by construction, not merely unused today.
    expect(plan.some((action) => String(action.kind).includes('delete'))).toBe(false);
    expect(read(CERT_SCRIPT)).not.toMatch(/deleteUser\(/);
  });

  it('never treats an @bizosto.com staff account as demo', () => {
    const staff = authUser({
      uid: 'uid-staff',
      email: 'mansoor@bizosto.com',
      customClaims: { role: 'admin', tenantId: 'la-creativo' },
    });
    const classified = classifyIdentity(staff, {
      id: 'uid-staff',
      tenantId: 'la-creativo',
      isDemo: false,
    });
    expect(classified.kind).toBe('unrelated');
    expect(planRemediation([classified])).toEqual([]);
  });

  it('reports but never mutates an address that only LOOKS like a fixture', () => {
    // A real person whose local part starts "demo" must survive a remediating run.
    const lookalike = authUser({
      uid: 'uid-lookalike',
      email: 'demo-demopoulos@bizosto.com',
      customClaims: { role: 'finance', tenantId: 'la-creativo' },
    });
    const classified = classifyIdentity(lookalike, null);
    expect(classified.kind).toBe('suspected-demo');
    expect(planRemediation([classified])).toEqual([
      expect.objectContaining({ kind: 'report-only' }),
    ]);
  });

  it('does not treat the @bizosto.com domain alone as evidence', () => {
    const plain = authUser({ uid: 'uid-plain', email: 'accounts@bizosto.com' });
    expect(classifyIdentity(plain, null).evidence).toEqual([]);
  });
});

describe('P0-02 (12, 16): canonical claims are exact, and rotation revokes', () => {
  it('accepts exactly { role, tenantId } and nothing else', () => {
    const { user } = healthyCanonical();
    expect(claimsAreExact({ role: user.role, tenantId: DEMO_TENANT_ID }, user.email)).toBe(true);
    expect(CANONICAL_CLAIM_KEYS).toEqual(['role', 'tenantId']);
  });

  it('rejects a stale privileged claim riding alongside the correct two', () => {
    const { user, identity, record } = healthyCanonical();
    const drifted = {
      ...identity,
      customClaims: { role: user.role, tenantId: DEMO_TENANT_ID, super_admin: true },
    };
    expect(claimsAreExact(drifted.customClaims, user.email)).toBe(false);
    expect(unexpectedClaimKeys(drifted.customClaims)).toEqual(['super_admin']);
    const classified = classifyIdentity(drifted, record);
    expect(classified.claimDrift).toBe(true);
    expect(classified.drift.join(' ')).toMatch(/unexpected key\(s\): super_admin/);
  });

  it('rejects a wrong tenant and a wrong role', () => {
    const { user } = healthyCanonical();
    expect(claimsAreExact({ role: user.role, tenantId: 'other-tenant' }, user.email)).toBe(false);
    expect(claimsAreExact({ role: 'super_admin', tenantId: DEMO_TENANT_ID }, user.email)).toBe(
      false,
    );
    expect(claimsAreExact({}, user.email)).toBe(false);
    expect(claimsAreExact(null, user.email)).toBe(false);
  });

  it('rotates password, resets claims AND revokes refresh tokens for all ten', () => {
    const plan = planRemediation(
      DEMO_USERS.map((_, index) => {
        const { identity, record } = healthyCanonical(index);
        return classifyIdentity(identity, record);
      }),
    );
    expect(plan).toHaveLength(10);
    expect(plan.every((action) => action.kind === 'rotate-canonical')).toBe(true);

    const script = read(CERT_SCRIPT);

    // Anchored to the ROTATION branch, not to the file. Asserting only that the string
    // appears somewhere passes while rotation silently stops revoking, because the
    // disable-legacy branch below revokes too — a mutation run caught exactly that.
    const rotation = script.slice(
      script.indexOf("if (action.kind === 'rotate-canonical')"),
      script.indexOf("if (action.kind === 'disable-legacy')"),
    );
    expect(rotation).toContain('revokeRefreshTokens(action.uid)');
    expect(rotation).toContain('counts.refreshTokenRevocations += 1');

    // Both branches revoke: the canonical ten on rotation, and every legacy account on
    // disable. Neither may quietly lose it.
    expect(script.split('revokeRefreshTokens(action.uid)').length - 1).toBe(2);

    // Claims are written WHOLE, not spread over what was there — that is what removes a
    // stale key rather than preserving it.
    expect(rotation).toMatch(/setCustomUserClaims\(action\.uid,\s*\{\s*\n?\s*role:/);
    expect(script).not.toMatch(/setCustomUserClaims\([^)]*\.\.\.existing/);

    // And the revocation happens AFTER the password write, never before: revoking first
    // leaves a window in which a session minted on the OLD password stays valid.
    expect(rotation.indexOf('counts.passwordRotations += 1')).toBeLessThan(
      rotation.indexOf('revokeRefreshTokens(action.uid)'),
    );
  });

  it('flags Firestore/Auth disagreement on a canonical identity', () => {
    const { identity, record } = healthyCanonical();
    const classified = classifyIdentity(identity, {
      ...record,
      status: 'suspended',
      isDemo: false,
    });
    expect(classified.firestoreMismatch).toBe(true);
    expect(classified.drift.join(' ')).toMatch(/status is not "active"/);
    expect(classifyIdentity(identity, null).drift).toContain('no matching users/{uid} document');
  });

  it('flags a disabled or unverified canonical identity', () => {
    const { identity, record } = healthyCanonical();
    const bad = classifyIdentity({ ...identity, disabled: true, emailVerified: false }, record);
    expect(bad.drift).toEqual(
      expect.arrayContaining(['account is disabled', 'email is not verified']),
    );
  });
});

describe('P0-02 (11-13, 17): audit is read-only in the literal sense, and cannot certify', () => {
  const script = read(CERT_SCRIPT);
  const lib = read(CERT_LIB);

  /**
   * The independent audit's second finding, and it was correct.
   *
   * The tool printed "Audit mode: no write was performed" and then, four lines later, ran
   * `accounts:signInWithPassword` ten times — plus ten more with the published historical
   * credential when that flag was passed. A successful sign-in updates the account's
   * sign-in metadata, and a failed one counts toward Identity Platform's throttle. Twenty
   * authentication attempts against live production accounts is not a read by any
   * reasonable definition, and calling it one in the log made it invisible.
   *
   * The fix is structural, not editorial: audit returns before the sign-in block exists.
   */
  it('returns from the audit path before any sign-in can happen', () => {
    const auditBranch = script.slice(
      script.indexOf("if (args.mode === 'audit') {"),
      script.indexOf('await remediate({'),
    );
    expect(auditBranch).toBeTruthy();
    expect(auditBranch).toContain('return;');
    // The sign-in proof is invoked once, and it is after the audit branch has returned.
    expect(script.indexOf('await proveSignIns(')).toBeGreaterThan(
      script.indexOf("if (args.mode === 'audit') {"),
    );
    expect(script.split('await proveSignIns(').length - 1).toBe(1);
  });

  it('never calls trySignIn outside the sign-in proof, which audit never reaches', () => {
    // trySignIn is defined once and called only from proveSignIns.
    const proof = script.slice(script.indexOf('async function proveSignIns('));
    const calls = script.split('trySignIn(').length - 1;
    const definition = 1;
    const inProof = proof.split('trySignIn(').length - 1;
    expect(calls - definition).toBe(inProof);
    expect(inProof).toBeGreaterThan(0);
  });

  it('performs every mutation inside the remediate function only', () => {
    const remediateFn = script.slice(script.indexOf('async function remediate('));
    for (const mutation of ['updateUser(', 'setCustomUserClaims(', 'revokeRefreshTokens(']) {
      expect(script.split(mutation).length - 1).toBe(remediateFn.split(mutation).length - 1);
    }
  });

  it('says plainly that an audit is not a certification', () => {
    expect(script).toContain('AUDIT COMPLETE — THIS IS NOT P0-02 LIVE CERTIFICATION');
    expect(script).toContain('No Admin write and no sign-in was performed.');
  });

  it('CANNOT print P0-02 CERTIFIED from the audit path', () => {
    const auditBranch = script.slice(
      script.indexOf("if (args.mode === 'audit') {"),
      script.indexOf('await remediate({'),
    );
    expect(auditBranch).not.toContain('P0-02 CERTIFIED');
  });

  it('refuses to certify an audit report, before it counts anything', () => {
    // Structural, not arithmetic: a perfect audit report is still not certified.
    const perfect: CertificationReport = {
      mode: 'audit',
      projectId: PRODUCTION_FIREBASE_PROJECT_ID,
      inventoryComplete: true,
      signInProofAttempted: true,
      historicalProofRequested: true,
      counts: {
        ...emptyCounts(),
        authPagesInspected: 2,
        canonicalFound: 10,
        passwordRotations: 10,
        refreshTokenRevocations: 10,
        currentPasswordSignIns: 10,
        historicalCandidatesTested: 1,
      },
      findings: [],
    };
    const verdict = certificationVerdict(perfect);
    expect(verdict.certified).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/Audit mode does not certify/);
  });

  it('refuses --prove-historical-rejected in audit mode', () => {
    expect(() =>
      parseCertificationArgs(['--mode=audit', '--project=x', '--prove-historical-rejected']),
    ).toThrow(/Audit reads; remediate proves/);
    expect(parseCertificationArgs(['--mode=audit', '--project=x']).proveHistoricalRejected).toBe(
      false,
    );
  });

  it('no longer claims anywhere that a sign-in is a read', () => {
    for (const source of [script, lib]) {
      expect(source).not.toMatch(/audit[^\n]*performs no write of any kind/i);
      expect(source).not.toMatch(/Audit mode: no write was performed/);
    }
  });

  it('never deletes anything, in either mode', () => {
    expect(script).not.toMatch(/\.delete\(\)/);
    expect(script).not.toMatch(/deleteUser/);
  });
});

describe('P0-02 (18-19): a run that could not look cannot pass', () => {
  const baseReport = (over: Partial<CertificationReport> = {}): CertificationReport => ({
    // Remediate, because audit cannot certify at all any more — see the audit block below.
    mode: 'remediate',
    projectId: PRODUCTION_FIREBASE_PROJECT_ID,
    inventoryComplete: true,
    signInProofAttempted: true,
    historicalProofRequested: true,
    counts: {
      ...emptyCounts(),
      totalAuthUsersInspected: 1200,
      authPagesInspected: 2,
      canonicalFound: 10,
      passwordRotations: 10,
      refreshTokenRevocations: 10,
      currentPasswordSignIns: 10,
      historicalCandidatesTested: 1,
    },
    findings: [],
    ...over,
  });

  it('certifies a project whose state is actually correct', () => {
    expect(certificationVerdict(baseReport()).certified).toBe(true);
  });

  it('FAILS when the inventory did not complete, however clean the numbers look', () => {
    const verdict = certificationVerdict(baseReport({ inventoryComplete: false }));
    expect(verdict.certified).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/not the same as zero legacy users/);
  });

  it('FAILS when no Auth page was inspected', () => {
    const report = baseReport();
    report.counts.authPagesInspected = 0;
    expect(certificationVerdict(report).certified).toBe(false);
  });

  it('FAILS on anything less than the full canonical ten', () => {
    const report = baseReport();
    report.counts.canonicalFound = 9;
    expect(certificationVerdict(report).reasons.join(' ')).toMatch(/expected 10/);
  });

  it('FAILS on an enabled legacy identity, claim drift, or Firestore drift', () => {
    for (const key of [
      'enabledLegacyDemo',
      'canonicalClaimDrift',
      'canonicalFirestoreMismatch',
      'canonicalDisabled',
      'canonicalUnverifiedEmail',
      'orphanFirestoreDemoUsers',
      'historicalPasswordAccepted',
    ] as const) {
      const report = baseReport();
      report.counts[key] = 1;
      expect(certificationVerdict(report).certified).toBe(false);
    }
  });

  it('requires ten rotations, ten revocations and ten sign-ins in remediate mode', () => {
    const remediated = baseReport();
    expect(certificationVerdict(remediated).certified).toBe(true);

    remediated.counts.passwordRotations = 9;
    expect(certificationVerdict(remediated).reasons.join(' ')).toMatch(
      /Rotated 9 canonical passwords/,
    );

    const short = baseReport();
    short.counts.refreshTokenRevocations = 9;
    expect(certificationVerdict(short).reasons.join(' ')).toMatch(
      /Revoked refresh tokens for 9 canonical identities/,
    );
  });

  /**
   * The bug the FIRST live run of this tool actually had.
   *
   * It inventoried both projects correctly — ten canonical identities, zero legacy ones in
   * each — and printed "P0-02 CERTIFIED" while `currentPasswordSignIns` was 0 and
   * `historicalCandidatesTested` was 0, because no Web API key had been resolved and the
   * sign-in block returned early. Both counters read zero, and zero is what a perfect run
   * reports too.
   *
   * That is the same fail-open as "no access to Firebase is not zero legacy users", one
   * level down: a proof that was never attempted is not a proof that passed. The report now
   * states separately that it TRIED, and these keep it stating it.
   */
  it('FAILS when no sign-in was attempted, however clean the inventory is', () => {
    const verdict = certificationVerdict(baseReport({ signInProofAttempted: false }));
    expect(verdict.certified).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/No sign-in was attempted/);
  });

  it('distinguishes "nobody signed in" from "sign-in is broken"', () => {
    // Attempted, only nine passed -> reported as a sign-in failure.
    const partial = baseReport();
    partial.counts.currentPasswordSignIns = 9;
    expect(certificationVerdict(partial).reasons.join(' ')).toMatch(
      /9 of 10 canonical identities signed in/,
    );

    // Never attempted -> NOT reported as a sign-in failure, because it is not one.
    const unattempted = baseReport({ signInProofAttempted: false });
    unattempted.counts.currentPasswordSignIns = 0;
    expect(certificationVerdict(unattempted).reasons.join(' ')).not.toMatch(
      /0 of 10 canonical identities signed in/,
    );
  });

  it('FAILS when the published historical password was asked for but never tested', () => {
    const report = baseReport();
    report.counts.historicalCandidatesTested = 0;
    const verdict = certificationVerdict(report);
    expect(verdict.certified).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/certifies nothing that matters/);
  });

  /**
   * Reversed by the independent audit. It used to be legitimate to remediate without
   * testing the published credential, because the proof was an opt-in flag.
   *
   * It is not legitimate. Rotating away from a credential and never checking that the old
   * one stopped working is the half of the job that produces the certificate without the
   * half that earns it — and as a FLAG it could be forgotten after the ten accounts had
   * already been mutated. Remediate now always proves, and a report claiming otherwise is
   * refused.
   */
  it('refuses a remediation that skipped the historical proof', () => {
    const report = baseReport({ historicalProofRequested: false });
    report.counts.historicalCandidatesTested = 0;
    const verdict = certificationVerdict(report);
    expect(verdict.certified).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/that is the whole point of rotating away from it/);
  });

  it('cannot be asked to skip the proof from the command line either', () => {
    // The flag is accepted so an existing invocation is not an error, but remediate always
    // proves regardless of whether it was passed.
    expect(
      parseCertificationArgs(['--mode=remediate', '--project=x']).proveHistoricalRejected,
    ).toBe(true);
    expect(
      parseCertificationArgs(['--mode=remediate', '--project=x', '--prove-historical-rejected'])
        .proveHistoricalRejected,
    ).toBe(true);
  });

  it('resolves the Web API key rather than requiring a new secret, and never prints it', () => {
    const script = read(CERT_SCRIPT);
    expect(script).toContain('async function resolveWebApiKey');
    // Explicit configuration wins; otherwise it is read with the credential already held.
    expect(script).toContain('process.env.FIREBASE_WEB_API_KEY');
    expect(script).toContain('firebase.googleapis.com/v1beta1/projects/');
    expect(script).toContain('credential?.getAccessToken()');
    // Returns null rather than throwing: the verdict refuses the run instead.
    expect(script).toContain('Promise<string | null>');
    expect(script).not.toMatch(/console\.(log|error)\([^)]*apiKey/);
    expect(script).not.toMatch(/console\.(log|error)\([^)]*accessToken/);
  });

  it('pages through the whole Auth population rather than reading the first page', () => {
    const script = read(CERT_SCRIPT);
    // A do/while over pageToken, not a single listUsers call.
    expect(script).toMatch(
      /do \{[\s\S]*listUsers\(AUTH_PAGE_SIZE, pageToken\)[\s\S]*\} while \(pageToken\)/,
    );
    expect(script).toMatch(/pageToken = page\.pageToken/);
    expect(script).toMatch(/const AUTH_PAGE_SIZE = 1000/);
    expect(script.split('listUsers(').length - 1).toBe(1);
  });

  it('counts a paginated population from every page, not just the last', () => {
    const identities = [
      classifyIdentity(healthyCanonical(0).identity, healthyCanonical(0).record),
      classifyIdentity(
        authUser({
          uid: 'uid-legacy',
          email: 'demo_legacy@bizosto.com',
          customClaims: { tenantId: DEMO_TENANT_ID },
        }),
        null,
      ),
    ];
    const counted = countInventory(
      identities,
      new Map([
        ['uid-admin', false],
        ['uid-legacy', false],
      ]),
    );
    expect(counted.canonicalFound).toBe(1);
    expect(counted.enabledLegacyDemo).toBe(1);
    expect(counted.disabledLegacyDemo).toBe(0);
  });
});

describe('P0-02 (20): no report can emit secret material', () => {
  it('passes a report that carries only counts and findings', () => {
    expect(() =>
      assertReportCarriesNoSecrets({
        mode: 'audit',
        projectId: PRODUCTION_FIREBASE_PROJECT_ID,
        counts: emptyCounts(),
        findings: ['legacy demo identity [ENABLED] uid:deadbeef'],
      }),
    ).not.toThrow();
  });

  it('refuses a report that grew a credential-shaped field, at any depth', () => {
    for (const key of ['password', 'idToken', 'refreshToken', 'private_key', 'apiKey']) {
      expect(() => assertReportCarriesNoSecrets({ counts: { nested: { [key]: 'x' } } })).toThrow(
        /no credential material/,
      );
    }
  });

  it('keeps the certification sources free of any print of a secret', () => {
    for (const rel of [CERT_SCRIPT, CERT_LIB]) {
      const source = read(rel);
      expect(source).not.toMatch(/console\.(log|error)\([^)]*\bpassword\b/);
      expect(source).not.toMatch(/console\.(log|error)\([^)]*idToken/);
      expect(source).not.toMatch(/console\.(log|error)\([^)]*FIREBASE_ADMIN_KEY/);
    }
  });

  it('reads the service account for project_id and nothing else', () => {
    const lib = read(CERT_LIB);
    expect(lib).toMatch(/project_id/);
    for (const field of ['private_key', 'client_email', 'private_key_id']) {
      // Named only in the forbidden-key list, never read off the parsed credential.
      expect(lib).not.toMatch(new RegExp(`parsed[^\\n]*${field}`));
    }
  });
});

/**
 * P0-02 (Phase 10-11) — the live workflows, parsed rather than grepped.
 *
 * Every assertion below runs against the structure a real YAML parser produced, not
 * against the file's text. DS-33 is why: `.github/workflows/test.yml` once carried a
 * job-level `if:` reading the `secrets` context, GitHub rejected the whole file at
 * validation time, and every run completed with zero jobs for three days. A text match
 * cannot see that; a parse plus a structural check can.
 */
describe('P0-02 (Phase 10-11): the certification workflows are safe and dispatchable', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const yaml = require('js-yaml') as { load: (input: string) => unknown };

  /** The shape of a workflow step this suite reasons about. */
  type WorkflowStep = {
    name?: string;
    uses?: string;
    run?: string;
    env?: Record<string, unknown>;
  };

  type WorkflowJob = {
    if?: string;
    'timeout-minutes'?: number;
    environment?: string;
    env?: Record<string, unknown>;
    steps?: WorkflowStep[];
  };

  const parse = (rel: string) =>
    yaml.load(read(rel)) as {
      on?: Record<string, unknown>;
      true?: Record<string, unknown>;
      permissions?: Record<string, string>;
      concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
      jobs: Record<string, WorkflowJob>;
    };

  // YAML 1.1 folds a bare `on:` key to the boolean true, which is why this is not `.on`.
  const triggersOf = (doc: ReturnType<typeof parse>) => doc.true ?? doc.on ?? {};

  const CERT_WORKFLOW = '.github/workflows/demo-auth-certification.yml';
  const SEED_WORKFLOW = '.github/workflows/seed-golden-tenant.yml';
  const WORKFLOWS = [CERT_WORKFLOW, SEED_WORKFLOW];

  it.each(WORKFLOWS)('%s is valid YAML with at least one job', (rel) => {
    const doc = parse(rel);
    expect(Object.keys(doc.jobs).length).toBeGreaterThan(0);
  });

  it.each(WORKFLOWS)('%s is workflow_dispatch only — necessary, not sufficient', (rel) => {
    const triggers = Object.keys(triggersOf(parse(rel)));
    expect(triggers).toEqual(['workflow_dispatch']);
    expect(triggers).not.toContain('pull_request');
    expect(triggers).not.toContain('pull_request_target');
    expect(triggers).not.toContain('push');
    expect(triggers).not.toContain('schedule');
  });

  it.each(WORKFLOWS)('%s takes contents: read and nothing more', (rel) => {
    expect(parse(rel).permissions).toEqual({ contents: 'read' });
  });

  it.each(WORKFLOWS)('%s serialises destructive runs and bounds their runtime', (rel) => {
    const doc = parse(rel);
    expect(doc.concurrency?.group).toBeTruthy();
    // Cancelling a half-finished rotation would leave accounts on mixed passwords.
    expect(doc.concurrency?.['cancel-in-progress']).toBe(false);
    for (const job of Object.values(doc.jobs)) {
      expect(typeof job['timeout-minutes']).toBe('number');
    }
  });

  it.each(WORKFLOWS)('%s never reads the secrets context from a job-level if: (DS-33)', (rel) => {
    for (const job of Object.values(parse(rel).jobs)) {
      if (job.if) expect(job.if).not.toContain('secrets.');
    }
  });

  it.each(WORKFLOWS)('%s never echoes a secret or uploads one as an artefact', (rel) => {
    const source = read(rel);
    // A `secrets.` expression may only ever be assigned to an env var or compared to ''.
    for (const match of source.matchAll(/^.*secrets\.[A-Z_]+.*$/gm)) {
      const line = match[0];
      const assigns = /^\s*[A-Z0-9_]+:\s*\$\{\{/.test(line);
      const existenceCheck = line.includes("!= ''");
      expect({ line, ok: assigns || existenceCheck }).toEqual({ line, ok: true });
    }
    expect(source).not.toMatch(/echo\s+"?\$\{\{\s*secrets\./);
    expect(source).not.toMatch(/upload-artifact[\s\S]*secrets\./);
    // No credential is ever written to a file in the workspace.
    expect(source).not.toMatch(/>\s*[\w./-]*(service-account|admin-key|credentials)[\w.]*\.json/);
  });

  /**
   * DEFECT 1, the merge-blocker the independent audit found.
   *
   * `workflow_dispatch` lets anyone with write access choose the ref. For that event the
   * checked-out code AND the workflow file itself come from the chosen ref. So the previous
   * design — repository-level secrets, `actions/checkout` with no environment gate — meant a
   * future collaborator could push a branch carrying an altered `certify-demo-auth.ts`,
   * dispatch at it, and receive a Firebase Admin service account. "Only the owner has write
   * access today" is not an architecture, and P0-06 exists specifically to add a second
   * collaborator.
   *
   * A guard written inside the workflow cannot fix it, because the branch edits the guard.
   * The boundary has to sit outside branch-controlled source: a GitHub Environment whose
   * deployment branches are restricted to `main`, holding the secrets itself.
   *
   * These tests pin the half that lives in the repository. The environments, their branch
   * rules and the secret migration are EXTERNAL configuration that no test here can prove —
   * they are owner actions, and the documentation says so.
   */
  it('routes each credential through its own main-only environment', () => {
    const doc = parse(CERT_WORKFLOW);
    expect(doc.jobs['certify-production']?.environment).toBe('firebase-production');
    expect(doc.jobs['certify-staging']?.environment).toBe('firebase-staging');

    const seedDoc = parse(SEED_WORKFLOW);
    expect(seedDoc.jobs['seed']?.environment).toBe('firebase-production');
  });

  it('gives each environment job only its own credential, with no fallback expression', () => {
    const source = read(CERT_WORKFLOW);
    const prod = source.slice(
      source.indexOf('  certify-production:'),
      source.indexOf('  certify-staging:'),
    );
    const staging = source.slice(source.indexOf('  certify-staging:'));

    expect(prod).toContain('FIREBASE_ADMIN_KEY: ${{ secrets.FIREBASE_ADMIN_KEY }}');
    expect(prod).not.toContain('FIREBASE_ADMIN_KEY_STAGING');

    expect(staging).toContain(
      'FIREBASE_ADMIN_KEY_STAGING: ${{ secrets.FIREBASE_ADMIN_KEY_STAGING }}',
    );
    expect(staging).not.toContain('secrets.FIREBASE_ADMIN_KEY }}');

    // No `a && b || c` credential expression anywhere: that shape is what let an empty
    // production value fall through to the staging one.
    expect(source).not.toMatch(/secrets\.[A-Z_]+\s*\|\|\s*secrets\./);
  });

  /**
   * DEFECT 3. The Web API key carried exactly the fallback the contract forbids:
   * `inputs.credential == 'production' && secrets.FIREBASE_WEB_API_KEY || secrets.FIREBASE_WEB_API_KEY_STAGING`.
   * An unset production key makes the `&&` falsy, so a production run took the STAGING key.
   *
   * Neither key was ever configured — the live runs resolved it from the Firebase Management
   * API using the already-verified Admin credential — so the simplest safe design is not to
   * carry it in the workflow at all.
   */
  it('carries no Web API key, in either direction', () => {
    for (const rel of WORKFLOWS) {
      expect(read(rel)).not.toContain('FIREBASE_WEB_API_KEY');
    }
    // The tool still resolves one, from the credential whose project it has already verified.
    expect(read(CERT_SCRIPT)).toContain('async function resolveWebApiKey');
  });

  it('keeps every Admin credential off job scope and away from checkout and npm ci', () => {
    for (const rel of WORKFLOWS) {
      const doc = parse(rel);
      const source = read(rel);

      for (const [name, job] of Object.entries(doc.jobs)) {
        // A job-level env may name a secret only to test whether it EXISTS.
        for (const [key, value] of Object.entries(job.env ?? {})) {
          const text = String(value);
          if (!text.includes('secrets.')) continue;
          expect({ job: name, key, existenceCheckOnly: text.includes("!= ''") }).toEqual({
            job: name,
            key,
            existenceCheckOnly: true,
          });
        }

        // And no step that installs or fetches may carry one.
        for (const step of job.steps ?? []) {
          const uses = String(step.uses ?? '');
          const run = String(step.run ?? '');
          const installing =
            uses.includes('actions/checkout') ||
            uses.includes('actions/setup-node') ||
            run.trim().startsWith('npm ci');
          if (!installing) continue;
          const env = Object.keys(step.env ?? {});
          expect({ job: name, step: uses || run.slice(0, 20), env }).toEqual({
            job: name,
            step: uses || run.slice(0, 20),
            env: [],
          });
        }
      }

      // The credential-consuming step comes last, after the install steps.
      const firstSecret = source.search(/^\s+FIREBASE_ADMIN_KEY(_STAGING)?: \$\{\{ secrets\./m);
      if (firstSecret > -1) {
        expect(source.indexOf('npm ci')).toBeLessThan(firstSecret);
        expect(source.indexOf('actions/checkout')).toBeLessThan(firstSecret);
      }
    }
  });

  /**
   * A standing guard against the defect class that produced two of the three audit findings:
   * a claim that was true when written, surviving the change that made it false.
   *
   * Prose does not fail a build, so the withdrawn claims are asserted ABSENT from the live
   * files by name. The evidence document is deliberately in scope too — it is where a stale
   * claim is most likely to survive, and it is the artefact a reviewer trusts most. Where it
   * QUOTES a withdrawn claim it does so inside the findings section that exists to record it,
   * which is why the assertions below target the workflows and the tool rather than every
   * occurrence of the words.
   */
  it('cannot quietly re-acquire a claim the audit withdrew', () => {
    const live = [...WORKFLOWS, CERT_SCRIPT, CERT_LIB].map(read).join('\n');

    // Defect 1: dispatch-only was never the protection.
    expect(live).not.toMatch(/no branch and no fork can reach an Admin credential/i);
    // Defect 2: a sign-in is not a read.
    expect(live).not.toMatch(/audit[^\n]*performs no write of any kind/i);
    expect(live).not.toMatch(/Audit mode: no write was performed/);
    // Defect 3: no cross-environment credential selection.
    expect(live).not.toMatch(/secrets\.[A-Z_]+\s*\|\|\s*secrets\./);

    // And the documentation must still carry the record of all three, so a future reader
    // meets the reasoning rather than only the result.
    const doc = read('docs/security/p0-02-demo-auth-certification.md');
    expect(doc).toMatch(/DEFECT 1 —/);
    expect(doc).toMatch(/DEFECT 2 —/);
    expect(doc).toMatch(/DEFECT 3 —/);
    expect(doc).toMatch(/POST-MERGE LIVE RECERTIFICATION REQUIRED/);
    expect(doc).toMatch(/OWNER CONFIGURATION — MUST BE VERIFIED LIVE/);
  });

  it('does not present workflow_dispatch as the protection', () => {
    const source = read(CERT_WORKFLOW);
    // The file must say where the boundary actually is, and that the in-file ref check is not it.
    expect(source).toMatch(/DEFENCE IN DEPTH, NOT THE BOUNDARY/);
    expect(source).toMatch(/OWNER CONFIGURATION — MUST BE VERIFIED LIVE/);
    // Comment prose wraps, so compare the sentence rather than the line it happens to sit on.
    const prose = source
      .split('\n')
      .map((line) => line.replace(/^\s*#\s?/, ''))
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(prose).toMatch(/the workflow file that runs is the one on the CHOSEN ref/i);
    // And it must not repeat the claim the audit rejected.
    expect(source).not.toMatch(/no branch and no fork can reach an Admin credential/i);
  });

  it('refuses a non-main ref in code as well, as defence in depth', () => {
    for (const rel of WORKFLOWS) {
      expect(read(rel)).toContain('refs/heads/main');
    }
  });

  it('fails closed when the credential it needs is absent', () => {
    for (const rel of WORKFLOWS) {
      const source = read(rel);
      expect(source).toMatch(/is not present in the firebase-(production|staging)/);
      expect(source).not.toMatch(/continue-on-error/);
    }
  });

  it('states the project on every certification invocation', () => {
    const source = read(CERT_WORKFLOW);
    expect(source).toContain('scripts/certify-demo-auth.ts');
    expect(source).toContain('--project="$PROJECT"');
    expect(source).toContain('--credential-env=FIREBASE_ADMIN_KEY');
    expect(source).toContain('--credential-env=FIREBASE_ADMIN_KEY_STAGING');
  });
});
