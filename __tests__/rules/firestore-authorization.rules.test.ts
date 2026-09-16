import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  createRealm,
  initFirestoreRulesEnv,
  TENANT_A,
  TENANT_B,
  type Principal,
} from './helpers/emulator';

/**
 * P0-04 — Firestore Security Rules BEHAVIOURAL certification.
 *
 * The real firestore.rules from this commit is loaded into the real Firestore emulator
 * and evaluated by the real rules runtime. Every case below is an end-to-end
 * authorization decision made by Firebase, not by TypeScript: nothing here reimplements
 * isSuperAdmin(), belongsToTenant() or isClientRole(), and nothing is mocked.
 *
 * WHAT THE BROWSER ACTUALLY READS. Four client-SDK read paths exist in the product, and
 * the matrix below is built around them so that certification tracks the app rather than
 * an imagined API surface:
 *
 *   users/{uid}                          lib/firebaseClient.ts fetchUserRole(),
 *                                        app/sales/profile/page.tsx
 *   tenants/{tenantId}/activity_feed     components/activity/ActivityFeed.tsx,
 *                                        app/activity/page.tsx (onSnapshot)
 *   notifications (userId + tenantId)    components/notifications/NotificationBell.tsx
 *   tenants/{tenantId}                   allowed by the ruleset; no browser reader today
 *
 * Everything else — clients, projects, invoices, support_tickets, and every unlisted
 * collection — is served exclusively through Admin SDK API routes, which bypass these
 * rules. The cases proving those paths closed are therefore the load-bearing half of this
 * suite: they are what stops a future client-SDK call from quietly working.
 *
 * SUPER ADMIN IS PROVEN AS WRITTEN, NOT AS ASSUMED. firestore.rules opens with a
 * recursive `match /{document=**} { allow read, write: if isSuperAdmin(); }`, so the
 * platform operator really does hold global read AND write through the browser SDK. That
 * is executed here rather than described, including the exact-string fail-closed cases
 * ('super-admin', 'SUPER_ADMIN', ' super_admin ', absent, blank) that must NOT inherit it.
 */

const UID = {
  alphaAdmin: 'user-alpha-admin',
  alphaClient: 'user-alpha-client',
  alphaHr: 'user-alpha-hr',
  betaAdmin: 'user-beta-admin',
  superAdmin: 'platform-operator',
  claimless: 'user-claimless',
} as const;

const PRINCIPALS = {
  /** No ID token at all — a signed-out browser. */
  anonymous: null,

  /** Internal staff inside tenant A. */
  alphaAdmin: { uid: UID.alphaAdmin, claims: { role: 'admin', tenantId: TENANT_A } },
  alphaAm: { uid: 'user-alpha-am', claims: { role: 'am', tenantId: TENANT_A } },
  alphaProduction: {
    uid: 'user-alpha-production',
    claims: { role: 'production', tenantId: TENANT_A },
  },
  alphaProductionManager: {
    uid: 'user-alpha-pm',
    claims: { role: 'production_manager', tenantId: TENANT_A },
  },
  alphaHr: { uid: UID.alphaHr, claims: { role: 'hr', tenantId: TENANT_A } },
  alphaFinance: { uid: 'user-alpha-finance', claims: { role: 'finance', tenantId: TENANT_A } },
  alphaSales: { uid: 'user-alpha-sales', claims: { role: 'sales', tenantId: TENANT_A } },

  /** The tenant's EXTERNAL client, inside tenant A. */
  alphaClient: { uid: UID.alphaClient, claims: { role: 'client', tenantId: TENANT_A } },

  /** Internal staff of a DIFFERENT tenant. */
  betaAdmin: { uid: UID.betaAdmin, claims: { role: 'admin', tenantId: TENANT_B } },

  /** Platform operator, with and without a tenant claim of its own. */
  superAdmin: { uid: UID.superAdmin, claims: { role: 'super_admin' } },
  superAdminInBeta: {
    uid: 'platform-operator-beta',
    claims: { role: 'super_admin', tenantId: TENANT_B },
  },

  /** Malformed / missing claims. Each must fail closed. */
  noTenantClaim: { uid: UID.claimless, claims: { role: 'admin' } },
  blankTenantClaim: { uid: 'user-blank-tenant', claims: { role: 'admin', tenantId: '' } },
  noRoleClaim: { uid: 'user-no-role', claims: { tenantId: TENANT_A } },
  blankRoleClaim: { uid: 'user-blank-role', claims: { role: '', tenantId: TENANT_A } },
  numericRoleClaim: { uid: 'user-numeric-role', claims: { role: 7, tenantId: TENANT_A } },
  nullRoleClaim: { uid: 'user-null-role', claims: { role: null, tenantId: TENANT_A } },
  arrayRoleClaim: { uid: 'user-array-role', claims: { role: ['admin'], tenantId: TENANT_A } },
  /** A freshly signed-in user, before any custom claim has been minted. */
  noClaimsAtAll: { uid: 'user-fresh-signin', claims: {} },
  hyphenatedSuperAdmin: { uid: 'user-hyphen-super', claims: { role: 'super-admin' } },
  uppercaseSuperAdmin: { uid: 'user-upper-super', claims: { role: 'SUPER_ADMIN' } },
  paddedSuperAdmin: { uid: 'user-padded-super', claims: { role: ' super_admin ' } },
  numericTenantClaim: { uid: 'user-numeric-tenant', claims: { role: 'admin', tenantId: 7 } },
} satisfies Record<string, Principal | null>;

type PrincipalName = keyof typeof PRINCIPALS;

/** Seeded document paths. Reads below address these; no rules-context write may exist. */
const DOC = {
  tenantA: `tenants/${TENANT_A}`,
  tenantB: `tenants/${TENANT_B}`,
  activityA: `tenants/${TENANT_A}/activity_feed/act-1`,
  activityB: `tenants/${TENANT_B}/activity_feed/act-1`,
  supportTicketA: `tenants/${TENANT_A}/support_tickets/tkt-1`,
  supportTicketNoteA: `tenants/${TENANT_A}/support_tickets/tkt-1/notes/note-1`,
  supportMetaA: `tenants/${TENANT_A}/support_meta/counters`,
  tenantProjectsSubA: `tenants/${TENANT_A}/projects/prj-sub-1`,
  userAlphaAdmin: `users/${UID.alphaAdmin}`,
  userAlphaClient: `users/${UID.alphaClient}`,
  userBetaAdmin: `users/${UID.betaAdmin}`,
  client: 'clients/cli-1',
  project: 'projects/prj-1',
  invoice: 'invoices/inv-1',
  /** userId + tenantId both match alphaAdmin — the only readable shape. */
  notifOwn: 'notifications/notif-own',
  /** Right user, WRONG tenant. Proves the tenant half of the notifications rule. */
  notifOwnWrongTenant: 'notifications/notif-own-wrong-tenant',
  /** Right tenant, WRONG user. Proves the uid half. */
  notifOtherUser: 'notifications/notif-other-user',
  /** Neither matches. */
  notifForeign: 'notifications/notif-foreign',
  /** Fallback collections with no match block of their own. */
  auditLog: 'audit_logs/log-1',
  payment: 'payments/pay-1',
  email: 'emails/mail-1',
  unknown: 'unknown_collection/doc-1',
  deeplyNested: 'unknown_collection/doc-1/deeper/doc-2',
} as const;

let env: RulesTestEnvironment;
let realm: ReturnType<typeof createRealm>;

/** Firestore handle for a named principal. */
const db = (name: PrincipalName) => realm.firestore(name, PRINCIPALS[name]);

jest.setTimeout(120_000);

beforeAll(async () => {
  env = await initFirestoreRulesEnv();
  realm = createRealm(env);
  await env.clearFirestore();

  // Seeded with rules DISABLED, which is the Admin SDK's real position: every write in
  // the product goes through firebase-admin, which bypasses these rules entirely. The
  // matrix below then asks only what the BROWSER may do with them.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const seed = ctx.firestore();
    await Promise.all([
      seed.doc(DOC.tenantA).set({ name: 'Alpha Agency', plan: 'growth' }),
      seed.doc(DOC.tenantB).set({ name: 'Beta Studio', plan: 'growth' }),
      seed.doc(DOC.activityA).set({ message: 'Invoice sent', timestamp: new Date() }),
      seed.doc(DOC.activityB).set({ message: 'Deal won', timestamp: new Date() }),
      seed.doc(DOC.supportTicketA).set({ isInternal: true, reporterEmail: 'a@example.test' }),
      seed.doc(DOC.supportTicketNoteA).set({ body: 'internal note' }),
      seed.doc(DOC.supportMetaA).set({ openCount: 2 }),
      seed.doc(DOC.tenantProjectsSubA).set({ name: 'Subcollection project' }),
      seed.doc(DOC.userAlphaAdmin).set({ role: 'admin', tenantId: TENANT_A }),
      seed.doc(DOC.userAlphaClient).set({ role: 'client', tenantId: TENANT_A }),
      seed.doc(DOC.userBetaAdmin).set({ role: 'admin', tenantId: TENANT_B }),
      seed.doc('users/user-fresh-signin').set({ role: 'sales', tenantId: TENANT_A }),
      seed.doc(`users/${UID.claimless}`).set({ role: 'admin' }),
      seed.doc(DOC.client).set({ tenantId: TENANT_A, name: 'Acme' }),
      seed.doc(DOC.project).set({ tenantId: TENANT_A, name: 'Rebrand', updatedAt: new Date() }),
      seed.doc(DOC.invoice).set({ tenantId: TENANT_A, total: 1000 }),
      seed.doc(DOC.notifOwn).set({
        userId: UID.alphaAdmin,
        tenantId: TENANT_A,
        isRead: false,
        createdAt: new Date(),
      }),
      seed.doc(DOC.notifOwnWrongTenant).set({
        userId: UID.alphaAdmin,
        tenantId: TENANT_B,
        isRead: false,
        createdAt: new Date(),
      }),
      seed.doc(DOC.notifOtherUser).set({
        userId: UID.alphaClient,
        tenantId: TENANT_A,
        isRead: false,
        createdAt: new Date(),
      }),
      seed.doc(DOC.notifForeign).set({
        userId: UID.betaAdmin,
        tenantId: TENANT_B,
        isRead: false,
        createdAt: new Date(),
      }),
      seed.doc(DOC.auditLog).set({ action: 'login' }),
      seed.doc(DOC.payment).set({ tenantId: TENANT_A, amount: 100 }),
      seed.doc(DOC.email).set({ to: 'a@example.test' }),
      seed.doc(DOC.unknown).set({ anything: true }),
      seed.doc(DOC.deeplyNested).set({ anything: true }),
    ]);
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('firestore.rules — unauthenticated browser client', () => {
  const PROTECTED = [
    DOC.tenantA,
    DOC.activityA,
    DOC.userAlphaAdmin,
    DOC.notifOwn,
    DOC.client,
    DOC.project,
    DOC.invoice,
    DOC.supportTicketA,
    DOC.auditLog,
    DOC.unknown,
  ];

  it.each(PROTECTED)('cannot read %s', async (docPath) => {
    await assertFails(db('anonymous').doc(docPath).get());
  });

  it.each(PROTECTED)('cannot write %s', async (docPath) => {
    await assertFails(db('anonymous').doc(docPath).set({ hijacked: true }));
  });

  it('cannot list any collection', async () => {
    await assertFails(db('anonymous').collection('notifications').get());
    await assertFails(db('anonymous').collection('projects').get());
    await assertFails(db('anonymous').collection(`tenants/${TENANT_A}/activity_feed`).get());
  });
});

describe('firestore.rules — super_admin, exactly as the global rule is written', () => {
  // `match /{document=**} { allow read, write: if isSuperAdmin(); }` is recursive and
  // unconditional beyond the role string, so the operator reads AND writes everything,
  // in every tenant, from the browser SDK. Proven, not assumed.
  const EVERYTHING = [
    DOC.tenantA,
    DOC.tenantB,
    DOC.activityA,
    DOC.activityB,
    DOC.supportTicketA,
    DOC.supportTicketNoteA,
    DOC.supportMetaA,
    DOC.userAlphaAdmin,
    DOC.userBetaAdmin,
    DOC.client,
    DOC.project,
    DOC.invoice,
    DOC.notifForeign,
    DOC.auditLog,
    DOC.payment,
    DOC.unknown,
    DOC.deeplyNested,
  ];

  it.each(EVERYTHING)('reads %s', async (docPath) => {
    await assertSucceeds(db('superAdmin').doc(docPath).get());
  });

  it.each(EVERYTHING)('writes %s', async (docPath) => {
    await assertSucceeds(
      db('superAdmin').doc(docPath).set({ certifiedBy: 'p0-04' }, { merge: true }),
    );
  });

  it('holds that access with a tenant claim for a DIFFERENT tenant', async () => {
    // isSuperAdmin() never consults tenantId, so a tenant-scoped operator token is still
    // global. This is the documented cross-tenant role (docs/SECURITY.md).
    await assertSucceeds(db('superAdminInBeta').doc(DOC.tenantA).get());
    await assertSucceeds(db('superAdminInBeta').doc(DOC.supportTicketA).get());
  });

  it('creates and deletes an arbitrary document', async () => {
    const ref = db('superAdmin').doc('unknown_collection/operator-scratch');
    await assertSucceeds(ref.set({ created: true }));
    await assertSucceeds(ref.delete());
  });

  describe('fails closed on anything that is not the exact string', () => {
    const IMPOSTORS: PrincipalName[] = [
      'hyphenatedSuperAdmin',
      'uppercaseSuperAdmin',
      'paddedSuperAdmin',
      'noRoleClaim',
      'blankRoleClaim',
      'numericRoleClaim',
      'nullRoleClaim',
      'arrayRoleClaim',
      'noClaimsAtAll',
    ];

    it.each(IMPOSTORS)('%s does not inherit the global grant', async (name) => {
      await assertFails(db(name).doc(DOC.supportTicketA).get());
      await assertFails(db(name).doc(DOC.client).get());
      await assertFails(db(name).doc(DOC.userAlphaAdmin).set({ role: 'super_admin' }));
    });
  });
});

describe('firestore.rules — tenants/{tenantId} document', () => {
  it('lets a same-tenant authenticated member read its own tenant document', async () => {
    await assertSucceeds(db('alphaAdmin').doc(DOC.tenantA).get());
  });

  it('lets the tenant EXTERNAL client read it too (the rule is tenancy-only)', async () => {
    // belongsToTenant() is the entire condition: no role narrowing is applied here.
    await assertSucceeds(db('alphaClient').doc(DOC.tenantA).get());
  });

  it('denies a cross-tenant member', async () => {
    await assertFails(db('betaAdmin').doc(DOC.tenantA).get());
    await assertFails(db('alphaAdmin').doc(DOC.tenantB).get());
  });

  it.each(['noTenantClaim', 'blankTenantClaim', 'numericTenantClaim'] as PrincipalName[])(
    'denies %s',
    async (name) => {
      await assertFails(db(name).doc(DOC.tenantA).get());
    },
  );

  it('denies every browser write, including by a same-tenant admin', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.tenantA).set({ plan: 'enterprise' }));
    await assertFails(db('alphaAdmin').doc(DOC.tenantA).update({ plan: 'enterprise' }));
    await assertFails(db('alphaAdmin').doc(DOC.tenantA).delete());
    await assertFails(db('alphaAdmin').doc(`tenants/${TENANT_A}-new`).set({ name: 'Forged' }));
  });
});

describe('firestore.rules — tenants/{tenantId}/activity_feed', () => {
  const INTERNAL: PrincipalName[] = [
    'alphaAdmin',
    'alphaAm',
    'alphaProduction',
    'alphaProductionManager',
    'alphaHr',
    'alphaFinance',
    'alphaSales',
  ];

  it.each(INTERNAL)('%s may read a same-tenant activity document', async (name) => {
    await assertSucceeds(db(name).doc(DOC.activityA).get());
  });

  it.each(INTERNAL)('%s may run the production onSnapshot query', async (name) => {
    // The exact shape in components/activity/ActivityFeed.tsx.
    await assertSucceeds(
      db(name)
        .collection(`tenants/${TENANT_A}/activity_feed`)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get(),
    );
  });

  it('denies the client role — both the document and the query', async () => {
    await assertFails(db('alphaClient').doc(DOC.activityA).get());
    await assertFails(
      db('alphaClient')
        .collection(`tenants/${TENANT_A}/activity_feed`)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get(),
    );
  });

  it('denies a cross-tenant identity even when it holds an internal role', async () => {
    await assertFails(db('betaAdmin').doc(DOC.activityA).get());
    await assertFails(db('betaAdmin').collection(`tenants/${TENANT_A}/activity_feed`).get());
    await assertFails(db('alphaAdmin').doc(DOC.activityB).get());
  });

  it('denies an unauthenticated reader', async () => {
    await assertFails(db('anonymous').doc(DOC.activityA).get());
  });

  it.each(['noTenantClaim', 'blankTenantClaim', 'numericTenantClaim'] as PrincipalName[])(
    'denies %s',
    async (name) => {
      await assertFails(db(name).doc(DOC.activityA).get());
    },
  );

  it('denies every browser write', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.activityA).set({ message: 'forged' }));
    await assertFails(db('alphaAdmin').doc(DOC.activityA).update({ message: 'forged' }));
    await assertFails(db('alphaAdmin').doc(DOC.activityA).delete());
    await assertFails(
      db('alphaAdmin').doc(`tenants/${TENANT_A}/activity_feed/forged`).set({ message: 'forged' }),
    );
  });

  /**
   * ROLE-CLAIM SHAPE, executed rather than assumed — see finding F-1 in the PR body.
   *
   * The rule is `belongsToTenant(tenantId) && !isClientRole()`: a DENY-LIST on the one
   * role that must never read the feed, not an allow-list of internal roles. That makes
   * the outcome depend on the SHAPE of the role claim, and the two shapes behave
   * differently — which is only visible by running the ruleset:
   *
   *   role claim ABSENT   -> DENIED. `request.auth.token.role` on a token with no such
   *                          property raises "Property role is undefined on object",
   *                          and a rule that errors cannot allow. Fails closed.
   *   role claim PRESENT
   *   but not 'client'    -> ALLOWED, whatever it contains. '' , 7, null and ['admin']
   *                          are all `!= 'client'`, so the deny-list lets them through.
   *
   * Neither is changed here. Tightening the feed to an allow-list of the nine internal
   * roles would be a POLICY change made inside a certification PR, and it would silently
   * revoke the feed from any role not on the list; P0-04 exists to prove the current
   * policy, not to rewrite it. Both shapes are therefore pinned so the deny-list stays a
   * deliberate decision and a future edit cannot drift it unnoticed.
   *
   * Exposure, for the record: claims are minted server-side from the user's role, so a
   * malformed role claim requires an already-broken minting path, and the blast radius is
   * one tenant's own activity feed (belongsToTenant still holds). The external client
   * role — the one principal this rule exists to exclude — is denied above.
   */
  it('denies a tenant member whose token carries NO role claim (fails closed)', async () => {
    await assertFails(db('noRoleClaim').doc(DOC.activityA).get());
    await assertFails(db('noClaimsAtAll').doc(DOC.activityA).get());
  });

  it.each(['blankRoleClaim', 'numericRoleClaim', 'nullRoleClaim', 'arrayRoleClaim'] as const)(
    'admits %s, because the rule denies only the exact string "client" (F-1)',
    async (name) => {
      await assertSucceeds(db(name).doc(DOC.activityA).get());
    },
  );

  it('still denies those same malformed-role tokens in another tenant', async () => {
    // Whatever the role claim contains, belongsToTenant() is unaffected: the tenant
    // boundary holds even where the role deny-list does not narrow anything.
    await assertFails(db('blankRoleClaim').doc(DOC.activityB).get());
    await assertFails(db('numericRoleClaim').doc(DOC.activityB).get());
  });
});

describe('firestore.rules — every other tenant subcollection is Admin-SDK only', () => {
  const SERVER_ONLY = [
    DOC.supportTicketA,
    DOC.supportTicketNoteA,
    DOC.supportMetaA,
    DOC.tenantProjectsSubA,
  ];

  it.each(SERVER_ONLY)('denies a same-tenant admin reading %s', async (docPath) => {
    await assertFails(db('alphaAdmin').doc(docPath).get());
  });

  it.each(SERVER_ONLY)('denies a same-tenant admin writing %s', async (docPath) => {
    await assertFails(db('alphaAdmin').doc(docPath).set({ forged: true }));
  });

  it('denies the client role and a cross-tenant identity alike', async () => {
    await assertFails(db('alphaClient').doc(DOC.supportTicketA).get());
    await assertFails(db('betaAdmin').doc(DOC.supportTicketA).get());
    await assertFails(db('anonymous').doc(DOC.supportTicketA).get());
  });

  it('denies listing them, which is how a leak would actually be harvested', async () => {
    await assertFails(db('alphaAdmin').collection(`tenants/${TENANT_A}/support_tickets`).get());
    await assertFails(db('alphaAdmin').collection(`tenants/${TENANT_A}/support_meta`).get());
  });
});

describe('firestore.rules — users/{uid}', () => {
  it('lets a user read their own document', async () => {
    // lib/firebaseClient.ts fetchUserRole() and app/sales/profile/page.tsx.
    await assertSucceeds(db('alphaAdmin').doc(DOC.userAlphaAdmin).get());
    await assertSucceeds(db('alphaClient').doc(DOC.userAlphaClient).get());
  });

  it('denies reading another user in the same tenant', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.userAlphaClient).get());
    await assertFails(db('alphaClient').doc(DOC.userAlphaAdmin).get());
  });

  it('denies reading a user in another tenant', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.userBetaAdmin).get());
  });

  it('denies an unauthenticated reader', async () => {
    await assertFails(db('anonymous').doc(DOC.userAlphaAdmin).get());
  });

  it('needs no tenant claim — the rule is uid identity only', async () => {
    // Deliberate: the login flow reads users/{uid} to discover the role BEFORE any
    // tenant claim is meaningful, so requiring one here would break sign-in.
    await assertSucceeds(db('noTenantClaim').doc(`users/${UID.claimless}`).get());
  });

  it('serves a freshly signed-in token that carries no custom claims at all', async () => {
    // This is the real first-login shape: lib/firebaseClient.ts fetchUserRole() reads
    // users/{uid} to DISCOVER the role, so the token cannot yet carry one. It also proves
    // something about rule composition that only execution can: the global super_admin
    // rule at L19 raises "Property role is undefined" for this token, and the request is
    // still ALLOWED by the users/{docId} rule. An erroring rule denies itself, it does
    // not poison the other match blocks — so sign-in is not one claim away from breaking.
    await assertSucceeds(db('noClaimsAtAll').doc('users/user-fresh-signin').get());
  });

  it('denies every browser write, including to the caller own document', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.userAlphaAdmin).set({ role: 'super_admin' }));
    await assertFails(db('alphaAdmin').doc(DOC.userAlphaAdmin).update({ role: 'super_admin' }));
    await assertFails(db('alphaAdmin').doc(DOC.userAlphaAdmin).delete());
    await assertFails(db('alphaAdmin').doc('users/forged-uid').set({ role: 'admin' }));
  });

  it('denies listing the collection', async () => {
    await assertFails(db('alphaAdmin').collection('users').get());
  });
});

describe('firestore.rules — notifications/{id}', () => {
  it('reads only a notification whose userId AND tenantId both match the caller', async () => {
    await assertSucceeds(db('alphaAdmin').doc(DOC.notifOwn).get());
  });

  it('denies the caller own notification when the tenantId does not match the claim', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.notifOwnWrongTenant).get());
  });

  it('denies another user notification inside the same tenant', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.notifOtherUser).get());
  });

  it('denies a notification belonging to another user in another tenant', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.notifForeign).get());
    await assertFails(db('betaAdmin').doc(DOC.notifOwn).get());
  });

  it('denies an unauthenticated reader', async () => {
    await assertFails(db('anonymous').doc(DOC.notifOwn).get());
  });

  it.each(['noTenantClaim', 'blankTenantClaim', 'numericTenantClaim'] as PrincipalName[])(
    'denies %s even for a document carrying its own uid',
    async (name) => {
      await assertFails(db(name).doc(DOC.notifOwn).get());
    },
  );

  it('denies a non-existent document, where resource.data cannot be evaluated', async () => {
    await assertFails(db('alphaAdmin').doc('notifications/does-not-exist').get());
  });

  it('runs the production NotificationBell query', async () => {
    // Exactly components/notifications/NotificationBell.tsx: both equality filters are
    // what make the query satisfy the rule for every document it can return.
    await assertSucceeds(
      db('alphaAdmin')
        .collection('notifications')
        .where('userId', '==', UID.alphaAdmin)
        .where('tenantId', '==', TENANT_A)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get(),
    );
  });

  it('denies the same query with the tenant filter dropped', async () => {
    await assertFails(
      db('alphaAdmin')
        .collection('notifications')
        .where('userId', '==', UID.alphaAdmin)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get(),
    );
  });

  it('denies the same query with the user filter dropped', async () => {
    await assertFails(
      db('alphaAdmin').collection('notifications').where('tenantId', '==', TENANT_A).get(),
    );
  });

  it('denies an unconstrained collection scan', async () => {
    await assertFails(db('alphaAdmin').collection('notifications').get());
  });

  it('denies a query filtered to ANOTHER user', async () => {
    await assertFails(
      db('alphaAdmin')
        .collection('notifications')
        .where('userId', '==', UID.alphaClient)
        .where('tenantId', '==', TENANT_A)
        .get(),
    );
  });

  it('denies every browser write, including marking a notification read', async () => {
    await assertFails(db('alphaAdmin').doc(DOC.notifOwn).update({ isRead: true }));
    await assertFails(db('alphaAdmin').doc(DOC.notifOwn).set({ isRead: true }, { merge: true }));
    await assertFails(db('alphaAdmin').doc(DOC.notifOwn).delete());
    await assertFails(
      db('alphaAdmin')
        .doc('notifications/forged')
        .set({ userId: UID.alphaAdmin, tenantId: TENANT_A }),
    );
  });
});

describe('firestore.rules — server-only root collections', () => {
  const SERVER_ONLY = [DOC.client, DOC.project, DOC.invoice];
  const CALLERS: PrincipalName[] = ['alphaAdmin', 'alphaClient', 'betaAdmin', 'anonymous'];

  it.each(SERVER_ONLY)('denies reading %s from the browser SDK', async (docPath) => {
    for (const caller of CALLERS) {
      await assertFails(db(caller).doc(docPath).get());
    }
  });

  it.each(SERVER_ONLY)('denies writing %s from the browser SDK', async (docPath) => {
    for (const caller of CALLERS) {
      await assertFails(db(caller).doc(docPath).set({ forged: true }));
    }
  });

  it('denies the projects listener that lib/data.ts watchProjects() would open', async () => {
    // watchProjects() is an unused export that still compiles; if it were ever wired up
    // it would fail at runtime rather than leak a cross-tenant project list.
    await assertFails(db('alphaAdmin').collection('projects').orderBy('updatedAt', 'desc').get());
  });

  it('denies listing clients and invoices', async () => {
    await assertFails(db('alphaAdmin').collection('clients').get());
    await assertFails(db('alphaAdmin').collection('invoices').get());
  });
});

describe('firestore.rules — unlisted collections hit the deny-all fallback', () => {
  const FALLBACK = [DOC.auditLog, DOC.payment, DOC.email, DOC.unknown, DOC.deeplyNested];
  const CALLERS: PrincipalName[] = ['alphaAdmin', 'alphaClient', 'betaAdmin', 'anonymous'];

  it.each(FALLBACK)('denies reading %s', async (docPath) => {
    for (const caller of CALLERS) {
      await assertFails(db(caller).doc(docPath).get());
    }
  });

  it.each(FALLBACK)('denies writing %s', async (docPath) => {
    for (const caller of CALLERS) {
      await assertFails(db(caller).doc(docPath).set({ forged: true }));
    }
  });

  it('denies a brand-new collection nobody has thought of yet', async () => {
    await assertFails(db('alphaAdmin').doc('collection_invented_in_2027/doc-1').get());
    await assertFails(db('alphaAdmin').doc('collection_invented_in_2027/doc-1').set({ a: 1 }));
  });

  it('denies a collectionGroup scan, which bypasses per-collection paths', async () => {
    await assertFails(db('alphaAdmin').collectionGroup('activity_feed').get());
    await assertFails(db('alphaAdmin').collectionGroup('support_tickets').get());
  });
});
