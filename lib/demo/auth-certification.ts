/**
 * P0-02 — the demo Firebase Auth certification contract.
 *
 * WHY THIS EXISTS
 *
 * `lib/demo/seed.ts` makes the ten canonical identities correct. It cannot make the demo
 * auth surface correct, because it only ever looks at the ten emails it already knows:
 * it calls `getUserByEmail` for each and stops. Anything ELSE in the project's Auth
 * population — an identity from an earlier roster, a renamed alias, an account carrying
 * `tenantId: bizosto-demo` under some other address — is invisible to it, and an invisible
 * enabled account is an authentication path nobody is watching.
 *
 * The git history says that is not hypothetical. A 16-character demo password was
 * hard-coded in `lib/demo/seed.ts` AND in `app/super_admin/demo/page.tsx` — the client
 * bundle, so it shipped to every browser — from 2026-02-27 until `ae1c63de` removed it on
 * 2026-09-06, in a PUBLIC repository. Its fingerprint is recorded below. Removing it from
 * HEAD did not un-publish it: every account that still carries it is reachable by anyone
 * who reads the history, which is why P0-02 rotates and revokes rather than tidies.
 *
 * WHAT IS PURE HERE, AND WHY
 *
 * Everything in this file is a pure function over plain data. The Admin SDK calls live in
 * `scripts/certify-demo-auth.ts`. That split is what lets the rules that decide "is this a
 * demo account?" and "may this account be disabled?" be tested exhaustively without a
 * Firebase project — including the cases that must NEVER happen, which are exactly the
 * ones a live run cannot be asked to demonstrate.
 *
 * NOTHING SECRET PASSES THROUGH HERE
 *
 * No function in this file accepts, returns, logs or derives a password, token or private
 * credential field. `assertCredentialProject` reads ONE field of the service account —
 * `project_id`, a public identifier that ships in `.env.example` — and returns only that.
 */

import { DEMO_TENANT_ID, DEMO_USERS } from './users';

/** The two claims a canonical demo identity is allowed to carry, and no others. */
export const CANONICAL_CLAIM_KEYS = ['role', 'tenantId'] as const;

/**
 * SHA-256 of the demo password that was hard-coded in source until 2026-09-06.
 *
 * The FINGERPRINT is recorded, never the value: the point of P0-02 is to stop that string
 * authenticating, not to republish it in the file that certifies it is dead. A 16-char
 * literal is trivially brute-forced from a hash only if you already know it, and anyone
 * who does can read it out of the history anyway — so this discloses nothing new while
 * still letting a run prove, by fingerprint, exactly WHICH credential it tested.
 *
 * `scripts/certify-demo-auth.ts --prove-historical-rejected` recovers the candidate from
 * the repository's own object database at run time, checks it against this fingerprint,
 * and asserts Identity Platform rejects it. The value never touches disk or a log.
 */
export const HISTORICAL_DEMO_PASSWORD_SHA256 = [
  '89f4400c532a98173ff81fcd399e5aeb45c7b4798e5ac584e6d0dca110574572',
] as const;

/** Canonical email -> canonical role, built from the one source of truth. */
export const CANONICAL_ROLE_BY_EMAIL: ReadonlyMap<string, string> = new Map(
  DEMO_USERS.map((user) => [user.email.toLowerCase(), user.role as string]),
);

/** Canonical email -> canonical displayName, from the same source of truth. */
export const CANONICAL_NAME_BY_EMAIL: ReadonlyMap<string, string> = new Map(
  DEMO_USERS.map((user) => [user.email.toLowerCase(), user.name as string]),
);

/**
 * Addresses that LOOK like demo fixtures.
 *
 * Deliberately narrow on the local part and anchored at both ends. It is evidence, not a
 * verdict: `classifyIdentity` never disables or deletes on a pattern match alone, because
 * a real person called Demopoulos would match one and a stale fixture at
 * `qa-fixture@bizosto.com` would not. The claim and the Firestore record decide; this only
 * decides what is worth LOOKING at.
 */
export const DEMO_EMAIL_PATTERN = /^demo(?:[._-][a-z0-9._-]*)?@bizosto\.com$/i;

export type ClaimRecord = Record<string, unknown>;

/** The subset of a Firebase Auth user record this contract reasons about. */
export type AuthIdentity = {
  uid: string;
  email: string | null;
  displayName?: string | null;
  disabled: boolean;
  emailVerified: boolean;
  customClaims?: ClaimRecord | null;
  tokensValidAfterTime?: string | null;
};

/** The subset of a Firestore `users` document this contract reasons about. */
export type FirestoreUserRecord = {
  id: string;
  email?: unknown;
  role?: unknown;
  tenantId?: unknown;
  status?: unknown;
  isDeleted?: unknown;
  isDemo?: unknown;
  emailVerified?: unknown;
};

export type EvidenceCode =
  | 'canonical-email'
  | 'demo-email-pattern'
  | 'claim-tenant'
  | 'firestore-tenant'
  | 'firestore-is-demo';

export type IdentityKind = 'canonical' | 'legacy-demo' | 'suspected-demo' | 'unrelated';

export type ClassifiedIdentity = {
  uid: string;
  uidFingerprint: string;
  email: string | null;
  kind: IdentityKind;
  evidence: EvidenceCode[];
  /** Canonical accounts only: every way this identity differs from its required state. */
  drift: string[];
  claimDrift: boolean;
  firestoreMismatch: boolean;
};

const text = (value: unknown): string => String(value ?? '').trim();

/**
 * A stable, non-reversible label for a UID.
 *
 * A Firebase UID is not a credential, but it is the handle an operator pastes into a
 * console, and a certification report is a public artefact. Reports name identities by
 * this; `--mode=remediate` prints the real UID only for an account it is about to change,
 * where an operator has to be able to check the work.
 *
 * FNV-1a rather than a crypto hash so this module stays pure, dependency-free and usable
 * from any runtime. Collision resistance is not a security property here — the fingerprint
 * labels a row in a table, it does not authorise anything.
 */
export function fingerprintUid(uid: string): string {
  let hash = 0x811c9dc5;
  const value = text(uid);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `uid:${hash.toString(16).padStart(8, '0')}`;
}

/** The claims a canonical identity must carry, and exactly those. */
export function expectedClaims(email: string): { role: string; tenantId: string } | null {
  const role = CANONICAL_ROLE_BY_EMAIL.get(text(email).toLowerCase());
  if (!role) return null;
  return { role, tenantId: DEMO_TENANT_ID };
}

/**
 * Does this identity carry EXACTLY the two intended claims, with the intended values?
 *
 * "Exactly" is the point. A demo account that has acquired `super_admin: true` from an old
 * repair job passes a check that only asserts `role` and `tenantId` are right, and that
 * extra key is precisely the kind of forgotten privilege P0-02 exists to find. Extra keys
 * are drift, not decoration.
 */
export function claimsAreExact(claims: ClaimRecord | null | undefined, email: string): boolean {
  const expected = expectedClaims(email);
  if (!expected) return false;
  const actual = claims ?? {};
  const keys = Object.keys(actual).sort();
  const wanted = [...CANONICAL_CLAIM_KEYS].sort();
  if (keys.length !== wanted.length) return false;
  if (keys.some((key, index) => key !== wanted[index])) return false;
  return actual.role === expected.role && actual.tenantId === expected.tenantId;
}

/** Every claim key a canonical identity carries that is not one of the two intended ones. */
export function unexpectedClaimKeys(claims: ClaimRecord | null | undefined): string[] {
  const allowed = new Set<string>(CANONICAL_CLAIM_KEYS);
  return Object.keys(claims ?? {})
    .filter((key) => !allowed.has(key))
    .sort();
}

/**
 * Why this identity is (or is not) considered part of the golden tenant.
 *
 * The rule that matters is the negative one: an address ending `@bizosto.com` is NOT
 * evidence. Staff and customers use that domain, and a classifier that treated the domain
 * as a demo signal would hand `--mode=remediate` a list of real people to disable. Only
 * the canonical roster, the demo-shaped local part, the tenant claim and the tenant's own
 * Firestore record count.
 */
export function collectEvidence(
  identity: AuthIdentity,
  firestoreUser: FirestoreUserRecord | null,
): EvidenceCode[] {
  const evidence: EvidenceCode[] = [];
  const email = text(identity.email).toLowerCase();

  if (email && CANONICAL_ROLE_BY_EMAIL.has(email)) evidence.push('canonical-email');
  else if (email && DEMO_EMAIL_PATTERN.test(email)) evidence.push('demo-email-pattern');

  if (text(identity.customClaims?.tenantId) === DEMO_TENANT_ID) evidence.push('claim-tenant');
  if (firestoreUser && text(firestoreUser.tenantId) === DEMO_TENANT_ID) {
    evidence.push('firestore-tenant');
  }
  if (firestoreUser && firestoreUser.isDemo === true) evidence.push('firestore-is-demo');

  return evidence;
}

/**
 * Evidence that ties an identity to the golden tenant by RECORDED STATE rather than by the
 * shape of its address. Only this justifies mutating an account.
 */
const STRONG_EVIDENCE: ReadonlySet<EvidenceCode> = new Set<EvidenceCode>([
  'claim-tenant',
  'firestore-tenant',
  'firestore-is-demo',
]);

export function hasStrongDemoEvidence(evidence: readonly EvidenceCode[]): boolean {
  return evidence.some((code) => STRONG_EVIDENCE.has(code));
}

/** Every way a canonical identity's Firestore document disagrees with its Auth identity. */
export function firestoreDrift(
  identity: AuthIdentity,
  record: FirestoreUserRecord | null,
  role: string,
): string[] {
  if (!record) return ['no matching users/{uid} document'];
  const drift: string[] = [];
  if (text(record.email).toLowerCase() !== text(identity.email).toLowerCase()) {
    drift.push('users.email does not match the Auth email');
  }
  if (text(record.role) !== role) drift.push(`users.role is not "${role}"`);
  if (text(record.tenantId) !== DEMO_TENANT_ID) {
    drift.push(`users.tenantId is not "${DEMO_TENANT_ID}"`);
  }
  if (text(record.status) !== 'active') drift.push('users.status is not "active"');
  if (record.isDeleted === true) drift.push('users.isDeleted is true');
  if (record.isDemo !== true) drift.push('users.isDemo is not true');
  if (record.emailVerified !== true) drift.push('users.emailVerified is not true');
  return drift;
}

/**
 * One Auth identity, judged against the contract.
 *
 * `suspected-demo` is its own outcome rather than being folded into `legacy-demo`, because
 * the two get different treatment and collapsing them is how a real account gets disabled:
 * a `legacy-demo` identity has recorded state tying it to `bizosto-demo` and may be
 * disabled; a `suspected-demo` one only LOOKS like a fixture and may only be reported.
 */
export function classifyIdentity(
  identity: AuthIdentity,
  firestoreUser: FirestoreUserRecord | null,
): ClassifiedIdentity {
  const evidence = collectEvidence(identity, firestoreUser);
  const email = text(identity.email).toLowerCase();
  const canonicalRole = CANONICAL_ROLE_BY_EMAIL.get(email);

  const base = {
    uid: identity.uid,
    uidFingerprint: fingerprintUid(identity.uid),
    email: identity.email ?? null,
    evidence,
  };

  if (canonicalRole) {
    const drift: string[] = [];
    if (identity.disabled) drift.push('account is disabled');
    if (!identity.emailVerified) drift.push('email is not verified');

    const expectedName = CANONICAL_NAME_BY_EMAIL.get(email);
    if (expectedName && text(identity.displayName) !== expectedName) {
      drift.push(`displayName is not "${expectedName}"`);
    }

    const claimDrift = !claimsAreExact(identity.customClaims, email);
    if (claimDrift) {
      const extra = unexpectedClaimKeys(identity.customClaims);
      drift.push(
        extra.length
          ? `claims carry unexpected key(s): ${extra.join(', ')}`
          : `claims are not exactly { role: "${canonicalRole}", tenantId: "${DEMO_TENANT_ID}" }`,
      );
    }

    const fsDrift = firestoreDrift(identity, firestoreUser, canonicalRole);
    drift.push(...fsDrift);

    return {
      ...base,
      kind: 'canonical',
      drift,
      claimDrift,
      firestoreMismatch: fsDrift.length > 0,
    };
  }

  if (hasStrongDemoEvidence(evidence)) {
    return { ...base, kind: 'legacy-demo', drift: [], claimDrift: false, firestoreMismatch: false };
  }

  if (evidence.includes('demo-email-pattern')) {
    return {
      ...base,
      kind: 'suspected-demo',
      drift: [],
      claimDrift: false,
      firestoreMismatch: false,
    };
  }

  return { ...base, kind: 'unrelated', drift: [], claimDrift: false, firestoreMismatch: false };
}

export type RemediationAction =
  | { kind: 'rotate-canonical'; uid: string; email: string; role: string; displayName: string }
  | { kind: 'disable-legacy'; uid: string; email: string | null; evidence: EvidenceCode[] }
  | { kind: 'report-only'; uid: string; email: string | null; reason: string };

/**
 * What `--mode=remediate` is allowed to do to this population, and nothing more.
 *
 * Returning a PLAN rather than performing the work is what makes the dangerous half of
 * this tool testable: a test can assert that a real staff account produces no action at
 * all, which is not a thing you can safely demonstrate against a live project.
 *
 * Deletion is absent by construction. Phase 5 permits it only when the run can also prove
 * no real tenant data depends on the account, and a script cannot prove that about a
 * project it is meeting for the first time. Disable + revoke ends the authentication path
 * immediately and is reversible; a delete is neither better nor undoable.
 */
export function planRemediation(identities: readonly ClassifiedIdentity[]): RemediationAction[] {
  const actions: RemediationAction[] = [];

  for (const identity of identities) {
    if (identity.kind === 'canonical') {
      const email = text(identity.email).toLowerCase();
      const role = CANONICAL_ROLE_BY_EMAIL.get(email);
      const displayName = CANONICAL_NAME_BY_EMAIL.get(email);
      if (!role || !displayName) continue;
      actions.push({ kind: 'rotate-canonical', uid: identity.uid, email, role, displayName });
      continue;
    }

    if (identity.kind === 'legacy-demo') {
      actions.push({
        kind: 'disable-legacy',
        uid: identity.uid,
        email: identity.email,
        evidence: identity.evidence,
      });
      continue;
    }

    if (identity.kind === 'suspected-demo') {
      actions.push({
        kind: 'report-only',
        uid: identity.uid,
        email: identity.email,
        reason:
          'Looks like a demo address but carries no bizosto-demo claim and no bizosto-demo ' +
          'Firestore record. Reported for owner review; not mutated.',
      });
    }
  }

  return actions;
}

/* ------------------------------------------------------------------------- *
 * Invocation contract
 * ------------------------------------------------------------------------- */

export type CertificationMode = 'audit' | 'remediate';

export type CertificationArgs = {
  mode: CertificationMode;
  /** The project the operator STATES this run is for. Never inferred. */
  project: string;
  /** Which environment variable carries the service account for that project. */
  credentialEnv: string;
  proveHistoricalRejected: boolean;
  json: boolean;
};

/** The production project, restated from the P0-01 contract so the rules below can cite it. */
export const PRODUCTION_FIREBASE_PROJECT_ID = 'la-creativo-erp';
/** The isolated staging project, and the credential that is the ONLY way to reach it. */
export const STAGING_FIREBASE_PROJECT_ID = 'bizosto-staging';
export const STAGING_CREDENTIAL_ENV = 'FIREBASE_ADMIN_KEY_STAGING';

/** The default credential variable. Staging runs must name their own; see PROJECT ASSERTION. */
export const DEFAULT_CREDENTIAL_ENV = 'FIREBASE_ADMIN_KEY';

/**
 * Parses argv, failing closed on anything it does not fully understand.
 *
 * `--project` has no default and is never derived from the credential. That is the whole
 * point: `lib/demo/seed.ts` already proved that a run which asks the service account where
 * it is pointed can only ever agree with itself. The operator states the intent, the
 * credential states the fact, and `assertCredentialProject` refuses when they differ —
 * which is the only arrangement in which a wrong secret is caught rather than obeyed.
 */
export function parseCertificationArgs(argv: readonly string[]): CertificationArgs {
  let mode: CertificationMode | null = null;
  let project = '';
  let credentialEnv = DEFAULT_CREDENTIAL_ENV;
  let proveHistoricalRejected = false;
  let json = false;

  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
    } else if (arg === '--prove-historical-rejected') {
      proveHistoricalRejected = true;
    } else if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length).trim();
      if (value !== 'audit' && value !== 'remediate') {
        throw new Error(`--mode must be "audit" or "remediate", not "${value}".`);
      }
      mode = value;
    } else if (arg.startsWith('--project=')) {
      project = arg.slice('--project='.length).trim();
    } else if (arg.startsWith('--credential-env=')) {
      credentialEnv = arg.slice('--credential-env='.length).trim();
    } else {
      throw new Error(`Unrecognised argument "${arg}".`);
    }
  }

  if (!mode) {
    throw new Error('--mode=audit or --mode=remediate is required.');
  }
  if (!project) {
    throw new Error(
      '--project=<firebase-project-id> is required. The intended project is stated by the ' +
        'operator and verified against the credential; it is never inferred from whichever ' +
        'service account happens to be in the environment.',
    );
  }
  if (!credentialEnv) {
    throw new Error('--credential-env must name the variable carrying the service account.');
  }

  return { mode, project, credentialEnv, proveHistoricalRejected, json };
}

/**
 * PROJECT ASSERTION — the gate every live action passes before it happens.
 *
 * Returns the verified project id, or throws. It reads exactly one field of the service
 * account and no other; nothing it returns or throws contains any part of the credential.
 *
 * The production/staging rule is enforced here rather than left to the caller: a run that
 * names the staging project may not be handed the production variable, and a run that
 * names production may not be handed the staging one. Without that, "staging certification
 * failed, let me give it the key that works" is a two-minute fix that silently points a
 * remediating run at production.
 */
export function assertCredentialProject(input: {
  intendedProject: string;
  credentialEnv: string;
  env: Record<string, string | undefined>;
}): string {
  const { intendedProject, credentialEnv, env } = input;
  const intended = text(intendedProject);

  if (!intended) {
    throw new Error('No intended Firebase project was stated, so no credential can be verified.');
  }

  if (intended === STAGING_FIREBASE_PROJECT_ID && credentialEnv === DEFAULT_CREDENTIAL_ENV) {
    throw new Error(
      `Refusing to certify "${STAGING_FIREBASE_PROJECT_ID}" with ${DEFAULT_CREDENTIAL_ENV}. ` +
        `Staging has its own service account (${STAGING_CREDENTIAL_ENV}) and there is no ` +
        'fallback to the production credential, by design.',
    );
  }
  if (intended === PRODUCTION_FIREBASE_PROJECT_ID && credentialEnv === STAGING_CREDENTIAL_ENV) {
    throw new Error(
      `Refusing to certify "${PRODUCTION_FIREBASE_PROJECT_ID}" with ${STAGING_CREDENTIAL_ENV}. ` +
        'A staging service account cannot reach production, and a run that asked it to would ' +
        'report an empty project as a clean one.',
    );
  }

  const raw = text(env[credentialEnv]);
  if (!raw) {
    throw new Error(
      `${credentialEnv} is not set, so this run cannot reach Firebase Auth. P0-02 fails ` +
        'closed: an inventory nobody could take is NOT an inventory of zero legacy accounts.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${credentialEnv} is not valid JSON, so its project cannot be verified.`);
  }

  const actual = text((parsed as { project_id?: unknown })?.project_id);
  if (!actual) {
    throw new Error(`${credentialEnv} carries no project_id, so its project cannot be verified.`);
  }
  if (actual !== intended) {
    throw new Error(
      `Refusing to act: ${credentialEnv} targets Firebase project "${actual}", but this run ` +
        `was told to certify "${intended}".`,
    );
  }

  return actual;
}

/* ------------------------------------------------------------------------- *
 * Reporting, and the fail-closed verdict
 * ------------------------------------------------------------------------- */

export type CertificationCounts = {
  totalAuthUsersInspected: number;
  authPagesInspected: number;
  canonicalFound: number;
  canonicalDisabled: number;
  canonicalUnverifiedEmail: number;
  canonicalClaimDrift: number;
  canonicalFirestoreMismatch: number;
  enabledLegacyDemo: number;
  disabledLegacyDemo: number;
  suspectedDemoReported: number;
  orphanFirestoreDemoUsers: number;
  passwordRotations: number;
  refreshTokenRevocations: number;
  currentPasswordSignIns: number;
  historicalPasswordAccepted: number;
  historicalCandidatesTested: number;
};

export type CertificationReport = {
  mode: CertificationMode;
  projectId: string;
  /** False whenever the run could not complete a full inventory, for ANY reason. */
  inventoryComplete: boolean;
  counts: CertificationCounts;
  findings: string[];
};

export function emptyCounts(): CertificationCounts {
  return {
    totalAuthUsersInspected: 0,
    authPagesInspected: 0,
    canonicalFound: 0,
    canonicalDisabled: 0,
    canonicalUnverifiedEmail: 0,
    canonicalClaimDrift: 0,
    canonicalFirestoreMismatch: 0,
    enabledLegacyDemo: 0,
    disabledLegacyDemo: 0,
    suspectedDemoReported: 0,
    orphanFirestoreDemoUsers: 0,
    passwordRotations: 0,
    refreshTokenRevocations: 0,
    currentPasswordSignIns: 0,
    historicalPasswordAccepted: 0,
    historicalCandidatesTested: 0,
  };
}

/** Rolls a classified population up into the counts a report states. */
export function countInventory(
  identities: readonly ClassifiedIdentity[],
  disabledByUid: ReadonlyMap<string, boolean>,
): Pick<
  CertificationCounts,
  | 'canonicalFound'
  | 'canonicalDisabled'
  | 'canonicalUnverifiedEmail'
  | 'canonicalClaimDrift'
  | 'canonicalFirestoreMismatch'
  | 'enabledLegacyDemo'
  | 'disabledLegacyDemo'
  | 'suspectedDemoReported'
> {
  let canonicalFound = 0;
  let canonicalDisabled = 0;
  let canonicalUnverifiedEmail = 0;
  let canonicalClaimDrift = 0;
  let canonicalFirestoreMismatch = 0;
  let enabledLegacyDemo = 0;
  let disabledLegacyDemo = 0;
  let suspectedDemoReported = 0;

  for (const identity of identities) {
    const disabled = disabledByUid.get(identity.uid) === true;
    if (identity.kind === 'canonical') {
      canonicalFound += 1;
      if (disabled) canonicalDisabled += 1;
      if (identity.drift.includes('email is not verified')) canonicalUnverifiedEmail += 1;
      if (identity.claimDrift) canonicalClaimDrift += 1;
      if (identity.firestoreMismatch) canonicalFirestoreMismatch += 1;
    } else if (identity.kind === 'legacy-demo') {
      if (disabled) disabledLegacyDemo += 1;
      else enabledLegacyDemo += 1;
    } else if (identity.kind === 'suspected-demo') {
      suspectedDemoReported += 1;
    }
  }

  return {
    canonicalFound,
    canonicalDisabled,
    canonicalUnverifiedEmail,
    canonicalClaimDrift,
    canonicalFirestoreMismatch,
    enabledLegacyDemo,
    disabledLegacyDemo,
    suspectedDemoReported,
  };
}

/**
 * CERTIFIED, or every reason it is not.
 *
 * The first rule is the one the whole P0 turns on: a run that did not complete its
 * inventory cannot pass, no matter how clean the numbers it did collect look. "Firebase
 * was unreachable" and "there are no legacy demo accounts" produce identical empty tables,
 * and a gate that cannot tell them apart reports the most dangerous state in the system as
 * its healthiest. So `inventoryComplete` is checked before anything is counted, and an
 * audit that never reached a page fails with zero findings of its own.
 *
 * `--mode=audit` is read-only, so it is never asked to have rotated anything; it certifies
 * the STATE. Only `--mode=remediate` must also show ten rotations, ten revocations, ten
 * sign-ins and zero historical-password acceptances.
 */
export function certificationVerdict(report: CertificationReport): {
  certified: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const c = report.counts;
  const expected = DEMO_USERS.length;

  if (!report.inventoryComplete) {
    reasons.push(
      'The Auth inventory did not complete, so this run proves nothing about legacy demo ' +
        'identities. No access to Firebase is not the same as zero legacy users.',
    );
  }
  if (c.authPagesInspected < 1) {
    reasons.push('No Auth page was inspected.');
  }
  if (c.canonicalFound !== expected) {
    reasons.push(`Found ${c.canonicalFound} canonical demo identities; expected ${expected}.`);
  }
  if (c.enabledLegacyDemo !== 0) {
    reasons.push(`${c.enabledLegacyDemo} noncanonical demo identities are still enabled.`);
  }
  if (c.canonicalDisabled !== 0)
    reasons.push(`${c.canonicalDisabled} canonical identities are disabled.`);
  if (c.canonicalUnverifiedEmail !== 0) {
    reasons.push(`${c.canonicalUnverifiedEmail} canonical identities have an unverified email.`);
  }
  if (c.canonicalClaimDrift !== 0) {
    reasons.push(`${c.canonicalClaimDrift} canonical identities carry drifted custom claims.`);
  }
  if (c.canonicalFirestoreMismatch !== 0) {
    reasons.push(`${c.canonicalFirestoreMismatch} canonical identities disagree with Firestore.`);
  }
  if (c.orphanFirestoreDemoUsers !== 0) {
    reasons.push(`${c.orphanFirestoreDemoUsers} orphan bizosto-demo Firestore user records.`);
  }
  if (c.historicalPasswordAccepted !== 0) {
    reasons.push(
      `${c.historicalPasswordAccepted} canonical identities still accept a demo password ` +
        'that was published in git history.',
    );
  }

  if (report.mode === 'remediate') {
    if (c.passwordRotations !== expected) {
      reasons.push(`Rotated ${c.passwordRotations} canonical passwords; expected ${expected}.`);
    }
    if (c.refreshTokenRevocations !== expected) {
      reasons.push(
        `Revoked refresh tokens for ${c.refreshTokenRevocations} canonical identities; ` +
          `expected ${expected}.`,
      );
    }
    if (c.currentPasswordSignIns !== expected) {
      reasons.push(
        `${c.currentPasswordSignIns} of ${expected} canonical identities signed in with the ` +
          'configured password.',
      );
    }
  }

  return { certified: reasons.length === 0, reasons };
}

/**
 * Keys whose values must never appear in a report, checked rather than trusted.
 *
 * A report is written to a workflow log, and a workflow log is readable by anyone who can
 * read the repository. This is the last thing between a future field being added to the
 * summary and that field being a password.
 */
export const FORBIDDEN_REPORT_KEYS = [
  'password',
  'privateKey',
  'private_key',
  'idToken',
  'refreshToken',
  'accessToken',
  'apiKey',
  'clientEmail',
  'client_email',
  'credential',
  'serviceAccount',
] as const;

/**
 * Throws if a report carries a forbidden key at any depth.
 *
 * Deliberately a runtime assertion and not only a type: the report is assembled from live
 * Firebase records, and the types say what the code MEANT to put there.
 */
export function assertReportCarriesNoSecrets(value: unknown, path = 'report'): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertReportCarriesNoSecrets(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if ((FORBIDDEN_REPORT_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `Refusing to emit ${path}.${key}: reports must carry no credential material.`,
      );
    }
    assertReportCarriesNoSecrets(entry, `${path}.${key}`);
  }
}
