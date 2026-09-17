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

describe('P0-02 (17): audit mode is read-only', () => {
  const script = read(CERT_SCRIPT);

  it('performs every mutation inside the remediate branch only', () => {
    const remediateFn = script.slice(script.indexOf('async function remediate('));
    for (const mutation of ['updateUser(', 'setCustomUserClaims(', 'revokeRefreshTokens(']) {
      const everywhere = script.split(mutation).length - 1;
      const inRemediate = remediateFn.split(mutation).length - 1;
      expect(everywhere).toBe(inRemediate);
    }
  });

  it('gates the remediate call on the mode, and says so when it writes nothing', () => {
    expect(script).toMatch(/if \(args\.mode === 'remediate'\)/);
    expect(script).toMatch(/Audit mode: no write was performed/);
  });

  it('never deletes anything, in either mode', () => {
    expect(script).not.toMatch(/\.delete\(\)/);
    expect(script).not.toMatch(/deleteUser/);
  });
});

describe('P0-02 (18-19): a run that could not look cannot pass', () => {
  const baseReport = (over: Partial<CertificationReport> = {}): CertificationReport => ({
    mode: 'audit',
    projectId: PRODUCTION_FIREBASE_PROJECT_ID,
    inventoryComplete: true,
    counts: {
      ...emptyCounts(),
      totalAuthUsersInspected: 1200,
      authPagesInspected: 2,
      canonicalFound: 10,
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
    const remediated = baseReport({ mode: 'remediate' });
    expect(certificationVerdict(remediated).certified).toBe(false);

    remediated.counts.passwordRotations = 10;
    remediated.counts.refreshTokenRevocations = 10;
    remediated.counts.currentPasswordSignIns = 10;
    expect(certificationVerdict(remediated).certified).toBe(true);

    remediated.counts.refreshTokenRevocations = 9;
    expect(certificationVerdict(remediated).reasons.join(' ')).toMatch(
      /Revoked refresh tokens for 9 canonical identities/,
    );
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

  const parse = (rel: string) =>
    yaml.load(read(rel)) as {
      on?: Record<string, unknown>;
      true?: Record<string, unknown>;
      permissions?: Record<string, string>;
      concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
      jobs: Record<string, { if?: string; 'timeout-minutes'?: number; steps?: unknown[] }>;
    };

  // YAML 1.1 folds a bare `on:` key to the boolean true, which is why this is not `.on`.
  const triggersOf = (doc: ReturnType<typeof parse>) => doc.true ?? doc.on ?? {};

  const WORKFLOWS = [
    '.github/workflows/demo-auth-certification.yml',
    '.github/workflows/seed-golden-tenant.yml',
  ];

  it.each(WORKFLOWS)('%s is valid YAML with at least one job', (rel) => {
    const doc = parse(rel);
    expect(Object.keys(doc.jobs).length).toBeGreaterThan(0);
  });

  it.each(WORKFLOWS)('%s is workflow_dispatch only — no PR or push can reach a secret', (rel) => {
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

  it('routes production and staging credentials so only one is ever in scope', () => {
    for (const rel of WORKFLOWS) {
      const source = read(rel);
      expect(source).toContain(
        "FIREBASE_ADMIN_KEY: ${{ inputs.credential == 'production' && secrets.FIREBASE_ADMIN_KEY || '' }}",
      );
      expect(source).toContain(
        "FIREBASE_ADMIN_KEY_STAGING: ${{ inputs.credential == 'staging' && " +
          "secrets.FIREBASE_ADMIN_KEY_STAGING || '' }}",
      );
      // The pairing is also refused up front, before a checkout costs anything.
      expect(source).toContain('la-creativo-erp:production|bizosto-staging:staging');
      expect(source).toMatch(/There is no fallback/);
    }
  });

  it('fails closed when the credential it needs is absent', () => {
    for (const rel of WORKFLOWS) {
      const source = read(rel);
      expect(source).toContain(
        "PRODUCTION_KEY_CONFIGURED: ${{ secrets.FIREBASE_ADMIN_KEY != '' }}",
      );
      expect(source).toContain(
        "STAGING_KEY_CONFIGURED: ${{ secrets.FIREBASE_ADMIN_KEY_STAGING != '' }}",
      );
      expect(source).toMatch(/fails closed/);
      // Each guard exits rather than continuing without the credential.
      expect(source).not.toMatch(/continue-on-error/);
    }
  });

  it('states the project on every certification invocation', () => {
    for (const rel of WORKFLOWS) {
      const source = read(rel);
      expect(source).toContain('scripts/certify-demo-auth.ts');
      expect(source).toContain('--project="$PROJECT"');
      expect(source).toContain('--credential-env="$CREDENTIAL_ENV"');
    }
  });
});
