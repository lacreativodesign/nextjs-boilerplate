import fs from 'fs';
import path from 'path';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  createRealm,
  initStorageRulesEnv,
  TENANT_A,
  TENANT_B,
  type Principal,
} from './helpers/emulator';

/**
 * P0-04 — Firebase Storage Security Rules BEHAVIOURAL certification.
 *
 * The real storage.rules from this commit is loaded into the real Storage emulator and
 * evaluated by the real rules runtime. Every allow and deny below is Firebase's own
 * decision; no prefix helper is reimplemented in TypeScript and nothing is mocked.
 *
 * WHY A BEHAVIOURAL MATRIX AND NOT ONLY THE SOURCE GUARD.
 * __tests__/config/storage-rules-guard.test.ts pins the TEXT of the ruleset — which
 * helper gates which prefix, which role lists exist, that no `if true` appears. That
 * catches a dangerous edit, but Firebase Security Rules OR every matching allow, so the
 * question "does prefix X actually deny role Y" is a property of the whole ruleset, not
 * of any one line. Five match blocks overlap on every path in this product
 * (the prefix block, the tenant catch-all, and the global catch-all), so only execution
 * settles it. That is what this file does.
 *
 * THE POLICY BEING CERTIFIED, per the ruleset itself:
 *
 *   CREATE (READ is denied to EVERY browser principal on these four — P0-07):
 *   tenants/{t}/projects/**            admin, am, production, production_manager, +super_admin
 *   tenants/{t}/client-files/**        client ONLY — deliberately NOT super_admin
 *   tenants/{t}/employees/**           admin, +super_admin
 *   tenants/{t}/employee-documents/**  hr, admin, +super_admin
 *   tenants/{t}/brand/**               read: any member of the tenant, or super_admin
 *                                      create+update: super_admin only
 *   everything else                    Admin SDK only
 *
 * `+super_admin` is `isSuperAdmin()` OR'd in WITHOUT a tenancy test, so the operator is
 * cross-tenant on those three prefixes. client-files/** is the one prefix where
 * super_admin is absent; STOR-2 hid the upload control on /client/files for that role
 * precisely because the rules reject it. That is executed here rather than assumed.
 */

/** Five bytes. The size ceiling is exercised separately with real 50MB payloads. */
const TINY = new Uint8Array([0x50, 0x30, 0x2d, 0x30, 0x34, 0x0a]);

/** Rules-level backstop from storage.rules: `request.resource.size < 50 * 1024 * 1024`. */
const SIZE_CEILING_BYTES = 50 * 1024 * 1024;

const PRINCIPALS = {
  anonymous: null,

  // The ten tenant-scoped roles from docs/SECURITY.md, all inside tenant A.
  alphaAdmin: { uid: 'u-alpha-admin', claims: { role: 'admin', tenantId: TENANT_A } },
  alphaAm: { uid: 'u-alpha-am', claims: { role: 'am', tenantId: TENANT_A } },
  alphaAmManager: { uid: 'u-alpha-am-mgr', claims: { role: 'am_manager', tenantId: TENANT_A } },
  alphaProduction: { uid: 'u-alpha-prod', claims: { role: 'production', tenantId: TENANT_A } },
  alphaProductionManager: {
    uid: 'u-alpha-prod-mgr',
    claims: { role: 'production_manager', tenantId: TENANT_A },
  },
  alphaHr: { uid: 'u-alpha-hr', claims: { role: 'hr', tenantId: TENANT_A } },
  alphaFinance: { uid: 'u-alpha-finance', claims: { role: 'finance', tenantId: TENANT_A } },
  alphaSales: { uid: 'u-alpha-sales', claims: { role: 'sales', tenantId: TENANT_A } },
  alphaSalesManager: {
    uid: 'u-alpha-sales-mgr',
    claims: { role: 'sales_manager', tenantId: TENANT_A },
  },
  alphaClient: { uid: 'u-alpha-client', claims: { role: 'client', tenantId: TENANT_A } },

  // The same roles in a DIFFERENT tenant: correct role, wrong workspace.
  betaAdmin: { uid: 'u-beta-admin', claims: { role: 'admin', tenantId: TENANT_B } },
  betaAm: { uid: 'u-beta-am', claims: { role: 'am', tenantId: TENANT_B } },
  betaHr: { uid: 'u-beta-hr', claims: { role: 'hr', tenantId: TENANT_B } },
  betaClient: { uid: 'u-beta-client', claims: { role: 'client', tenantId: TENANT_B } },

  // Platform operator, with no tenant claim and with each tenant claim.
  superAdmin: { uid: 'platform-operator', claims: { role: 'super_admin' } },
  superAdminInAlpha: {
    uid: 'platform-operator-a',
    claims: { role: 'super_admin', tenantId: TENANT_A },
  },
  superAdminInBeta: {
    uid: 'platform-operator-b',
    claims: { role: 'super_admin', tenantId: TENANT_B },
  },

  // Malformed / missing claims. inCallerTenant() and tenantRole() must fail closed on
  // every one of these: that is what the `is string` and `!= ''` guards are for.
  noTenantClaim: { uid: 'u-no-tenant', claims: { role: 'admin' } },
  blankTenantClaim: { uid: 'u-blank-tenant', claims: { role: 'admin', tenantId: '' } },
  numericTenantClaim: { uid: 'u-numeric-tenant', claims: { role: 'admin', tenantId: 7 } },
  nullTenantClaim: { uid: 'u-null-tenant', claims: { role: 'admin', tenantId: null } },
  arrayTenantClaim: { uid: 'u-array-tenant', claims: { role: 'admin', tenantId: [TENANT_A] } },
  noRoleClaim: { uid: 'u-no-role', claims: { tenantId: TENANT_A } },
  blankRoleClaim: { uid: 'u-blank-role', claims: { role: '', tenantId: TENANT_A } },
  numericRoleClaim: { uid: 'u-numeric-role', claims: { role: 7, tenantId: TENANT_A } },
  nullRoleClaim: { uid: 'u-null-role', claims: { role: null, tenantId: TENANT_A } },
  arrayRoleClaim: { uid: 'u-array-role', claims: { role: ['admin'], tenantId: TENANT_A } },
  uppercaseRoleClaim: { uid: 'u-upper-role', claims: { role: 'ADMIN', tenantId: TENANT_A } },
  paddedRoleClaim: { uid: 'u-padded-role', claims: { role: 'admin ', tenantId: TENANT_A } },
  noClaimsAtAll: { uid: 'u-bare-token', claims: {} },
} satisfies Record<string, Principal | null>;

type PrincipalName = keyof typeof PRINCIPALS;

/**
 * Every principal above. P0-07 denies browser READ on the four protected file prefixes
 * to all of them — including each prefix's own uploaders and the platform operator —
 * because a permitted READ is what lets the Firebase Storage API mint a permanent
 * download token (see storage-download-token.rules.test.ts).
 */
const ALL_PRINCIPALS = Object.keys(PRINCIPALS) as PrincipalName[];

/**
 * Principals whose TENANT claim is absent, blank or not a string. inCallerTenant() must
 * fail closed on every one — which is what `callerTenant() is string` and `!= ''` are for.
 */
const MALFORMED_TENANT_CLAIMS: PrincipalName[] = [
  'noTenantClaim',
  'blankTenantClaim',
  'numericTenantClaim',
  'nullTenantClaim',
  'arrayTenantClaim',
  'noClaimsAtAll',
];

/**
 * Principals holding a VALID tenant claim for tenant A but a role claim that is absent,
 * blank, of the wrong type, or the right word in the wrong shape. tenantRole() must fail
 * closed on all of them.
 *
 * These are kept separate from the tenant-claim group on purpose: the two sets do NOT
 * behave the same everywhere. The four role-gated prefixes deny both, but brand/** grants
 * READ on `inCallerTenant(tenantId) || isSuperAdmin()` — tenancy alone, no role test — so
 * every principal below reads the tenant logo. Collapsing the two lists would have
 * asserted a denial the ruleset does not make.
 */
const MALFORMED_ROLE_CLAIMS: PrincipalName[] = [
  'noRoleClaim',
  'blankRoleClaim',
  'numericRoleClaim',
  'nullRoleClaim',
  'arrayRoleClaim',
  'uppercaseRoleClaim',
  'paddedRoleClaim',
];

/** Everything that must be refused by a role-gated prefix. */
const MALFORMED_CLAIMS: PrincipalName[] = [...MALFORMED_TENANT_CLAIMS, ...MALFORMED_ROLE_CLAIMS];

/** Seeded objects. Reads, metadata updates and deletes all address these. */
const OBJ = {
  projectsA: `tenants/${TENANT_A}/projects/prj-1/creative-brief.pdf`,
  clientFilesA: `tenants/${TENANT_A}/client-files/prj-1/client-upload.pdf`,
  employeesA: `tenants/${TENANT_A}/employees/emp-1/contract.pdf`,
  employeeDocumentsA: `tenants/${TENANT_A}/employee-documents/emp-1/passport.pdf`,
  /** The fixed logo path written by app/super_admin/tenants/[tenantId]/page.tsx. */
  brandA: `tenants/${TENANT_A}/brand/logo.webp`,

  projectsB: `tenants/${TENANT_B}/projects/prj-9/creative-brief.pdf`,
  clientFilesB: `tenants/${TENANT_B}/client-files/prj-9/client-upload.pdf`,
  employeesB: `tenants/${TENANT_B}/employees/emp-9/contract.pdf`,
  employeeDocumentsB: `tenants/${TENANT_B}/employee-documents/emp-9/passport.pdf`,
  brandB: `tenants/${TENANT_B}/brand/logo.webp`,

  // Prefixes only the Admin SDK ever writes. Named in the ruleset's own comment.
  exportsA: `tenants/${TENANT_A}/exports/tenant-dump.csv`,
  importsA: `tenants/${TENANT_A}/imports/payload.csv`,
  supportA: `tenants/${TENANT_A}/support/tkt-1/screenshot.png`,
  documentsA: `tenants/${TENANT_A}/documents/doc-1/signed.pdf`,
  docusignA: `tenants/${TENANT_A}/docusign/env-1/envelope.pdf`,
  filesA: `tenants/${TENANT_A}/files/file-1/asset.pdf`,
  brandingA: `tenants/${TENANT_A}/branding/logo.png`,
  /** A prefix nobody has invented yet: the tenant catch-all must already deny it. */
  unknownPrefixA: `tenants/${TENANT_A}/invented-in-2027/thing.bin`,

  // Legacy flat paths from before S4/S5 moved everything under tenants/{tenantId}/.
  legacyProjects: 'projects/prj-1/creative-brief.pdf',
  legacyEmployees: 'employees/emp-1/contract.pdf',
  legacyEmployeeDocuments: 'employee-documents/emp-1/passport.pdf',
  legacyClientFiles: 'client-files/prj-1/client-upload.pdf',
  legacyBrand: 'brand/logo.webp',
  /** Outside every prefix, and a `tenants/x` with no tenant segment at all. */
  rootOrphan: 'orphan.txt',
  tenantsShallow: 'tenants/orphan.txt',
} as const;

const SEEDED_OBJECTS = Object.values(OBJ);

let env: RulesTestEnvironment;
let realm: ReturnType<typeof createRealm>;
let freshCounter = 0;

/** Storage handle for a named principal. */
const st = (name: PrincipalName) => realm.storage(name, PRINCIPALS[name]);

/**
 * A path that certainly does not exist yet, so a CREATE assertion is a create and can
 * never be mistaken for an overwrite.
 */
const freshPath = (prefix: string, tenantId: string = TENANT_A) =>
  `tenants/${tenantId}/${prefix}/p0-04/${(freshCounter += 1)}-${Date.now()}.bin`;

const READ = (name: PrincipalName, objectPath: string) => st(name).ref(objectPath).getDownloadURL();
/**
 * `ref.put()` hands back an UploadTask, which is thenable but not a Promise, so it cannot
 * be passed straight to assertSucceeds/assertFails under `strict`. Awaiting it inside an
 * async wrapper produces a real Promise and preserves the rejection reason, which is what
 * assertFails inspects to confirm the refusal was PERMISSION_DENIED rather than a 404.
 */
const CREATE = async (name: PrincipalName, objectPath: string, bytes: Uint8Array = TINY) => {
  await st(name).ref(objectPath).put(bytes);
};
/**
 * The UPDATE method. Firebase Storage routes a metadata change through `update`, so this
 * is what actually exercises `allow update:` — see the emulator-semantics note at the
 * bottom of this file for why a byte overwrite does not.
 */
const UPDATE = (name: PrincipalName, objectPath: string) =>
  st(name)
    .ref(objectPath)
    .updateMetadata({ customMetadata: { certification: 'p0-04' } });
const DELETE = (name: PrincipalName, objectPath: string) => st(name).ref(objectPath).delete();

jest.setTimeout(180_000);

beforeAll(async () => {
  env = await initStorageRulesEnv();
  realm = createRealm(env);
  await env.clearStorage();

  // Seeded with rules DISABLED, mirroring the Admin SDK, which bypasses these rules.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const seed = ctx.storage();
    await Promise.all(SEEDED_OBJECTS.map((objectPath) => seed.ref(objectPath).put(TINY)));
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/**
 * One prefix of the ruleset: who may read and create, and who must not. `deniedCreate`
 * defaults to `denied` — they differ only for brand/**, which is readable by the whole
 * tenant but writable by the operator alone.
 */
type PrefixMatrix = {
  prefix: string;
  seeded: string;
  allowedRead: PrincipalName[];
  deniedRead: PrincipalName[];
  allowedCreate: PrincipalName[];
  deniedCreate: PrincipalName[];
};

const ALPHA_NON_DELIVERY: PrincipalName[] = [
  'alphaAmManager',
  'alphaHr',
  'alphaFinance',
  'alphaSales',
  'alphaSalesManager',
  'alphaClient',
];

const CROSS_TENANT: PrincipalName[] = ['betaAdmin', 'betaAm', 'betaHr', 'betaClient'];

const PREFIXES: PrefixMatrix[] = [
  {
    prefix: 'projects',
    seeded: OBJ.projectsA,
    // canProjectFiles(): tenantRole(t, [admin, am, production, production_manager])
    //                    || isSuperAdmin()
    // P0-07: READ is denied to everyone. CREATE below keeps the role grant.
    allowedRead: [],
    deniedRead: ALL_PRINCIPALS,
    allowedCreate: [
      'alphaAdmin',
      'alphaAm',
      'alphaProduction',
      'alphaProductionManager',
      'superAdmin',
      'superAdminInAlpha',
      'superAdminInBeta',
    ],
    deniedCreate: ['anonymous', ...ALPHA_NON_DELIVERY, ...CROSS_TENANT, ...MALFORMED_CLAIMS],
  },
  {
    prefix: 'client-files',
    seeded: OBJ.clientFilesA,
    // canClientFiles(): tenantRole(t, ['client']) and NOTHING else. The absence of
    // isSuperAdmin() here is the policy, executed below rather than trusted.
    // P0-07: READ is denied to everyone. CREATE below keeps the role grant.
    allowedRead: [],
    deniedRead: ALL_PRINCIPALS,
    allowedCreate: ['alphaClient'],
    deniedCreate: [
      'anonymous',
      'alphaAdmin',
      'alphaAm',
      'alphaAmManager',
      'alphaProduction',
      'alphaProductionManager',
      'alphaHr',
      'alphaFinance',
      'alphaSales',
      'alphaSalesManager',
      'superAdmin',
      'superAdminInAlpha',
      'superAdminInBeta',
      ...CROSS_TENANT,
      ...MALFORMED_CLAIMS,
    ],
  },
  {
    prefix: 'employees',
    seeded: OBJ.employeesA,
    // canEmployeeFiles(): tenantRole(t, ['admin']) || isSuperAdmin()
    // P0-07: READ is denied to everyone. CREATE below keeps the role grant.
    allowedRead: [],
    deniedRead: ALL_PRINCIPALS,
    allowedCreate: ['alphaAdmin', 'superAdmin', 'superAdminInAlpha', 'superAdminInBeta'],
    deniedCreate: [
      'anonymous',
      'alphaAm',
      'alphaAmManager',
      'alphaProduction',
      'alphaProductionManager',
      'alphaHr',
      'alphaFinance',
      'alphaSales',
      'alphaSalesManager',
      'alphaClient',
      ...CROSS_TENANT,
      ...MALFORMED_CLAIMS,
    ],
  },
  {
    prefix: 'employee-documents',
    seeded: OBJ.employeeDocumentsA,
    // canEmployeeDocuments(): tenantRole(t, ['hr', 'admin']) || isSuperAdmin()
    // P0-07: READ is denied to everyone. CREATE below keeps the role grant.
    allowedRead: [],
    deniedRead: ALL_PRINCIPALS,
    allowedCreate: ['alphaHr', 'alphaAdmin', 'superAdmin', 'superAdminInAlpha', 'superAdminInBeta'],
    deniedCreate: [
      'anonymous',
      'alphaAm',
      'alphaAmManager',
      'alphaProduction',
      'alphaProductionManager',
      'alphaFinance',
      'alphaSales',
      'alphaSalesManager',
      'alphaClient',
      ...CROSS_TENANT,
      ...MALFORMED_CLAIMS,
    ],
  },
  {
    prefix: 'brand',
    seeded: OBJ.brandA,
    // read: inCallerTenant(t) || isSuperAdmin() — tenancy only, so EVERY role in the
    // tenant reads the logo, including the external client (it is rendered in their UI).
    // create, update: isSuperAdmin() only.
    allowedRead: [
      'alphaAdmin',
      'alphaAm',
      'alphaAmManager',
      'alphaProduction',
      'alphaProductionManager',
      'alphaHr',
      'alphaFinance',
      'alphaSales',
      'alphaSalesManager',
      'alphaClient',
      'superAdmin',
      'superAdminInAlpha',
      'superAdminInBeta',
      // Tenancy alone opens the READ, so a member of tenant A whose ROLE claim is
      // missing, blank, numeric, null, an array or wrongly cased still reads the logo.
      ...MALFORMED_ROLE_CLAIMS,
    ],
    deniedRead: ['anonymous', ...CROSS_TENANT, ...MALFORMED_TENANT_CLAIMS],
    allowedCreate: ['superAdmin', 'superAdminInAlpha', 'superAdminInBeta'],
    deniedCreate: [
      'anonymous',
      'alphaAdmin',
      'alphaAm',
      'alphaAmManager',
      'alphaProduction',
      'alphaProductionManager',
      'alphaHr',
      'alphaFinance',
      'alphaSales',
      'alphaSalesManager',
      'alphaClient',
      ...CROSS_TENANT,
      ...MALFORMED_CLAIMS,
    ],
  },
];

describe.each(PREFIXES)('storage.rules — tenants/{tenantId}/$prefix/**', (matrix) => {
  // `it.each([])` is an error in Jest, and four of the five prefixes now grant no READ.
  if (matrix.allowedRead.length > 0) {
    it.each(matrix.allowedRead)('READ succeeds for %s', async (name) => {
      await assertSucceeds(READ(name, matrix.seeded));
    });
  }

  it.each(matrix.deniedRead)('READ is denied for %s', async (name) => {
    await assertFails(READ(name, matrix.seeded));
  });

  it.each(matrix.allowedCreate)('CREATE succeeds for %s', async (name) => {
    await assertSucceeds(CREATE(name, freshPath(matrix.prefix)));
  });

  it.each(matrix.deniedCreate)('CREATE is denied for %s', async (name) => {
    await assertFails(CREATE(name, freshPath(matrix.prefix)));
  });

  it('DELETE is denied even for a principal that may create', async () => {
    for (const name of [...matrix.allowedRead, ...matrix.allowedCreate]) {
      await assertFails(DELETE(name, matrix.seeded));
    }
  });

  it('CREATE is denied above the size ceiling for an otherwise permitted principal', async () => {
    const name = matrix.allowedCreate[0];
    await assertFails(CREATE(name, freshPath(matrix.prefix), new Uint8Array(SIZE_CEILING_BYTES)));
  });
});

describe('storage.rules — brand/** read is tenancy-scoped, not role-scoped', () => {
  /**
   * `allow read: if inCallerTenant(tenantId) || isSuperAdmin();` — deliberately the only
   * prefix with no role test on READ, because the tenant logo is rendered in every
   * signed-in surface including the external client's. Stated explicitly here rather than
   * left implicit in the prefix table, because it is the one place where the role claim
   * genuinely does not matter and a reader could otherwise mistake that for an omission.
   */
  it('admits the tenant EXTERNAL client, who is denied on every other prefix', async () => {
    await assertSucceeds(READ('alphaClient', OBJ.brandA));
    await assertFails(READ('alphaClient', OBJ.projectsA));
    await assertFails(READ('alphaClient', OBJ.employeesA));
    await assertFails(READ('alphaClient', OBJ.employeeDocumentsA));
  });

  it.each(MALFORMED_ROLE_CLAIMS)('admits %s, whose role claim is unusable', async (name) => {
    await assertSucceeds(READ(name, OBJ.brandA));
  });

  it.each(MALFORMED_TENANT_CLAIMS)('still denies %s, whose tenant claim is not', async (name) => {
    await assertFails(READ(name, OBJ.brandA));
  });

  it('never lets that read become a write', async () => {
    await assertFails(CREATE('alphaClient', freshPath('brand')));
    await assertFails(UPDATE('alphaClient', OBJ.brandA));
    await assertFails(DELETE('alphaClient', OBJ.brandA));
    for (const name of MALFORMED_ROLE_CLAIMS) {
      await assertFails(CREATE(name, freshPath('brand')));
    }
  });
});

describe('storage.rules — cross-tenant isolation, both directions', () => {
  const CASES: Array<{ label: string; caller: PrincipalName; objectPath: string }> = [
    { label: 'alpha admin -> beta projects', caller: 'alphaAdmin', objectPath: OBJ.projectsB },
    { label: 'beta admin -> alpha projects', caller: 'betaAdmin', objectPath: OBJ.projectsA },
    {
      label: 'alpha client -> beta client-files',
      caller: 'alphaClient',
      objectPath: OBJ.clientFilesB,
    },
    {
      label: 'beta client -> alpha client-files',
      caller: 'betaClient',
      objectPath: OBJ.clientFilesA,
    },
    { label: 'alpha admin -> beta employees', caller: 'alphaAdmin', objectPath: OBJ.employeesB },
    {
      label: 'beta hr -> alpha employee-documents',
      caller: 'betaHr',
      objectPath: OBJ.employeeDocumentsA,
    },
    { label: 'alpha admin -> beta brand', caller: 'alphaAdmin', objectPath: OBJ.brandB },
    { label: 'beta admin -> alpha brand', caller: 'betaAdmin', objectPath: OBJ.brandA },
  ];

  it.each(CASES)('$label is denied on READ', async ({ caller, objectPath }) => {
    await assertFails(READ(caller, objectPath));
  });

  it.each(CASES)('$label is denied on CREATE', async ({ caller, objectPath }) => {
    const prefix = objectPath.split('/')[2];
    const foreignTenant = objectPath.split('/')[1];
    await assertFails(CREATE(caller, freshPath(prefix, foreignTenant)));
  });

  it('is not defeated by a forged tenant segment in the path', async () => {
    await assertFails(CREATE('alphaAdmin', `tenants/${TENANT_B}/projects/forged/x.bin`));
    await assertFails(CREATE('alphaAdmin', `tenants//projects/forged/x.bin`));
  });
});

describe('storage.rules — the UPDATE method is denied on the four paid file prefixes', () => {
  /**
   * PR4 narrowed projects/**, client-files/**, employees/** and employee-documents/** to
   * CREATE only: every browser upload site mints a fresh id, so an approved upload never
   * addresses an existing object, and denying UPDATE is what makes the quota figure the
   * server measured stay true for the lifetime of the object.
   *
   * These four cases use the principal that IS allowed to create on the prefix, so the
   * only thing being tested is the operation.
   */
  const CASES: Array<{ prefix: string; caller: PrincipalName; objectPath: string }> = [
    { prefix: 'projects', caller: 'alphaAdmin', objectPath: OBJ.projectsA },
    { prefix: 'client-files', caller: 'alphaClient', objectPath: OBJ.clientFilesA },
    { prefix: 'employees', caller: 'alphaAdmin', objectPath: OBJ.employeesA },
    { prefix: 'employee-documents', caller: 'alphaHr', objectPath: OBJ.employeeDocumentsA },
  ];

  it.each(CASES)('$prefix/** denies UPDATE for $caller', async ({ caller, objectPath }) => {
    await assertFails(UPDATE(caller, objectPath));
  });

  it('denies UPDATE to super_admin too, on the prefixes it may otherwise create on', async () => {
    await assertFails(UPDATE('superAdmin', OBJ.projectsA));
    await assertFails(UPDATE('superAdmin', OBJ.employeesA));
    await assertFails(UPDATE('superAdmin', OBJ.employeeDocumentsA));
  });

  it('allows UPDATE on brand/** for super_admin, which is the deliberate exception', async () => {
    // The tenant logo lives at a FIXED path (brand/logo.webp), so replacing it IS an
    // overwrite. This case is what proves the four denials above are not vacuous: the
    // same operation, the same mechanism, a different prefix, and it is allowed.
    await assertSucceeds(UPDATE('superAdmin', OBJ.brandA));
  });

  it('denies UPDATE on brand/** to every tenant role, including admin', async () => {
    await assertFails(UPDATE('alphaAdmin', OBJ.brandA));
    await assertFails(UPDATE('alphaClient', OBJ.brandA));
    await assertFails(UPDATE('betaAdmin', OBJ.brandA));
    await assertFails(UPDATE('anonymous', OBJ.brandA));
  });

  /**
   * EMULATOR FIDELITY NOTE, recorded so the evidence in this file is not overstated.
   *
   * Characterised against the pinned firebase-tools Storage emulator with a synthetic
   * ruleset (`allow create: if true; allow update: if false`): re-uploading BYTES to an
   * existing object is classified as `create` and therefore allowed, while
   * updateMetadata() on the same object is classified as `update` and denied. The
   * emulator does populate `resource` correctly (a rule of `allow write: if resource ==
   * null` denies the second upload), so the gap is in method classification, not in the
   * evaluation context.
   *
   * Consequence: the behavioural evidence for `allow update: if false` is the metadata
   * path above. The byte-overwrite clause of that same rule is covered by the source
   * guard in __tests__/config/storage-rules-guard.test.ts ("grants no update on the four
   * browser file prefixes"), which is exactly the complementary-tripwire role a static
   * guard should keep. No claim is made here about the emulator denying a byte overwrite,
   * because it does not.
   */
  it('keeps the source guard that covers the byte-overwrite clause', () => {
    // Fails loudly if the complementary static evidence is ever deleted, which would
    // leave the overwrite clause with no coverage at all.
    const guard = fs.readFileSync(
      path.join(process.cwd(), '__tests__/config/storage-rules-guard.test.ts'),
      'utf8',
    );
    expect(guard).toContain('grants no update on the four browser file prefixes');
  });
});

describe('storage.rules — DELETE is denied to the browser SDK everywhere', () => {
  const CASES: Array<{ label: string; caller: PrincipalName; objectPath: string }> = [
    { label: 'projects by admin', caller: 'alphaAdmin', objectPath: OBJ.projectsA },
    { label: 'client-files by client', caller: 'alphaClient', objectPath: OBJ.clientFilesA },
    { label: 'employees by admin', caller: 'alphaAdmin', objectPath: OBJ.employeesA },
    {
      label: 'employee-documents by hr',
      caller: 'alphaHr',
      objectPath: OBJ.employeeDocumentsA,
    },
    { label: 'brand by super_admin', caller: 'superAdmin', objectPath: OBJ.brandA },
    { label: 'projects by super_admin', caller: 'superAdmin', objectPath: OBJ.projectsA },
  ];

  it.each(CASES)('$label is denied', async ({ caller, objectPath }) => {
    await assertFails(DELETE(caller, objectPath));
  });
});

describe('storage.rules — Admin-SDK-only tenant prefixes are closed to the browser', () => {
  const ADMIN_ONLY = [
    OBJ.exportsA,
    OBJ.importsA,
    OBJ.supportA,
    OBJ.documentsA,
    OBJ.docusignA,
    OBJ.filesA,
    OBJ.brandingA,
    OBJ.unknownPrefixA,
  ];

  // Including super_admin: storage.rules has no global operator grant, unlike
  // firestore.rules. The operator reaches these prefixes only through the Admin SDK.
  const CALLERS: PrincipalName[] = [
    'anonymous',
    'alphaAdmin',
    'alphaHr',
    'alphaClient',
    'alphaFinance',
    'betaAdmin',
    'superAdmin',
    'superAdminInAlpha',
  ];

  it.each(ADMIN_ONLY)('READ %s is denied to every browser principal', async (objectPath) => {
    for (const caller of CALLERS) {
      await assertFails(READ(caller, objectPath));
    }
  });

  it.each(ADMIN_ONLY)('CREATE under %s is denied to every browser principal', async (seeded) => {
    const prefix = seeded.split('/')[2];
    for (const caller of CALLERS) {
      await assertFails(CREATE(caller, freshPath(prefix)));
    }
  });

  it.each(ADMIN_ONLY)('DELETE %s is denied to every browser principal', async (objectPath) => {
    for (const caller of CALLERS) {
      await assertFails(DELETE(caller, objectPath));
    }
  });
});

describe('storage.rules — legacy flat and out-of-tenant paths are closed', () => {
  const OUTSIDE = [
    OBJ.legacyProjects,
    OBJ.legacyEmployees,
    OBJ.legacyEmployeeDocuments,
    OBJ.legacyClientFiles,
    OBJ.legacyBrand,
    OBJ.rootOrphan,
    OBJ.tenantsShallow,
  ];

  const CALLERS: PrincipalName[] = [
    'anonymous',
    'alphaAdmin',
    'alphaClient',
    'alphaHr',
    'betaAdmin',
    'superAdmin',
    'superAdminInAlpha',
  ];

  it.each(OUTSIDE)('READ %s is denied to every browser principal', async (objectPath) => {
    for (const caller of CALLERS) {
      await assertFails(READ(caller, objectPath));
    }
  });

  it.each(OUTSIDE)('CREATE at %s is denied to every browser principal', async (objectPath) => {
    for (const caller of CALLERS) {
      await assertFails(CREATE(caller, `${objectPath}.p0-04-${(freshCounter += 1)}`));
    }
  });
});

describe('storage.rules — the 50MB size ceiling', () => {
  it('denies a payload exactly at the ceiling (the rule is strictly less-than)', async () => {
    await assertFails(
      CREATE('alphaAdmin', freshPath('projects'), new Uint8Array(SIZE_CEILING_BYTES)),
    );
  });

  it('allows a payload one byte under the ceiling', async () => {
    await assertSucceeds(
      CREATE('alphaAdmin', freshPath('projects'), new Uint8Array(SIZE_CEILING_BYTES - 1)),
    );
  });

  it('applies the ceiling to brand/** as well, where super_admin writes', async () => {
    await assertFails(CREATE('superAdmin', freshPath('brand'), new Uint8Array(SIZE_CEILING_BYTES)));
  });

  it('still denies an oversized payload from a role that has no grant anyway', async () => {
    await assertFails(
      CREATE('alphaClient', freshPath('projects'), new Uint8Array(SIZE_CEILING_BYTES)),
    );
  });
});
