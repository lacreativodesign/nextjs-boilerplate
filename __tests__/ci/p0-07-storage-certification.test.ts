import fs from 'fs';
import path from 'path';

/**
 * P0-07 — the live bucket certification is read-only, fails closed, and never prints a
 * secret; the remediation tool refuses to mutate without explicit owner confirmation.
 *
 * Nothing here touches Google. Every network call goes through an injected fake `fetch`
 * that records the method, so "read-only" is asserted from the requests actually issued.
 */

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Static imports, like the P0-06 verifier's suite: the scripts keep their CLI inside
// `run().catch(...)` rather than top-level await so Jest's transform can load them.
import * as v from '@/scripts/verify-storage-bucket.mjs';
import * as r from '@/scripts/storage-token-remediation.mjs';

const SECRET = 'LIVE-TOKEN-VALUE-must-never-print';
const SECRET_NAME = 'tenants/t1/employee-documents/emp/passport-of-jane-doe.pdf';

/** A bucket that meets every control. */
const goodBucket = () => ({
  name: 'la-creativo-erp.firebasestorage.app',
  projectNumber: '123456789',
  location: 'US-CENTRAL1',
  locationType: 'region',
  iamConfiguration: {
    uniformBucketLevelAccess: { enabled: true },
    publicAccessPrevention: 'enforced',
  },
  versioning: { enabled: false },
  labels: {},
});

const ok = (data: unknown) => ({ ok: true, data });

function fakeFetch(routes: Record<string, unknown>, calls: Array<{ url: string; method: string }>) {
  return async (url: string, init: { method?: string } = {}) => {
    calls.push({ url, method: init.method ?? 'GET' });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const body = key ? routes[key] : undefined;
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
}

function liveRoutes(overrides: Record<string, unknown> = {}) {
  return {
    '/b/la-creativo-erp.firebasestorage.app/iam': {
      bindings: [{ role: 'roles/storage.admin', members: ['serviceAccount:x@y'] }],
    },
    '/b/la-creativo-erp.firebasestorage.app/o?': {
      items: [
        { name: SECRET_NAME, metadata: { firebaseStorageDownloadTokens: SECRET } },
        { name: 'tenants/t1/projects/p/brief.pdf', metadata: {} },
        {
          name: 'tenants/t1/branding/logo.png',
          metadata: { firebaseStorageDownloadTokens: SECRET },
        },
      ],
    },
    '/b/la-creativo-erp.firebasestorage.app?projection=full': goodBucket(),
    'cloudresourcemanager.googleapis.com/v1/projects/la-creativo-erp': {
      projectNumber: '123456789',
    },
    ...overrides,
  };
}

describe('verifier: evaluateBucket', () => {
  const results = (
    bucket: unknown,
    iam: unknown = { bindings: [] },
    project = { projectNumber: '123456789' },
  ) =>
    Object.fromEntries(
      v
        .evaluateBucket({ bucketRead: ok(bucket), iamRead: ok(iam), projectRead: ok(project) })
        .map((c) => [c.id, c.status]),
    );

  it('passes a correctly locked-down bucket on every enforced control', () => {
    const out = results(goodBucket());
    for (const id of [
      'bucket.exists',
      'bucket.identity',
      'bucket.project_binding',
      'iam.public_access_prevention',
      'iam.uniform_bucket_level_access',
      'iam.no_public_members',
      'cors.minimal',
      'lifecycle.no_unapproved_deletion',
      'retention.policy',
      'holds.default_event_based',
      'website.none',
    ]) {
      expect([id, out[id]]).toEqual([id, 'PASS']);
    }
  });

  it.each([
    ['a different bucket name', { name: 'someone-else' }, 'bucket.identity', 'FAIL'],
    ['a bucket in another project', { projectNumber: '999' }, 'bucket.project_binding', 'FAIL'],
    ['no location', { location: undefined }, 'bucket.location', 'FAIL'],
    [
      'PAP inherited',
      {
        iamConfiguration: {
          uniformBucketLevelAccess: { enabled: true },
          publicAccessPrevention: 'inherited',
        },
      },
      'iam.public_access_prevention',
      'OWNER_ACTION',
    ],
    [
      'UBLA off',
      {
        iamConfiguration: {
          uniformBucketLevelAccess: { enabled: false },
          publicAccessPrevention: 'enforced',
        },
      },
      'iam.uniform_bucket_level_access',
      'OWNER_ACTION',
    ],
    ['wildcard CORS', { cors: [{ origin: ['*'], method: ['GET'] }] }, 'cors.minimal', 'FAIL'],
    [
      'unneeded CORS',
      { cors: [{ origin: ['https://app.bizosto.com'], method: ['GET'] }] },
      'cors.minimal',
      'OWNER_ACTION',
    ],
    [
      'an unscoped delete rule',
      { lifecycle: { rule: [{ action: { type: 'Delete' }, condition: { age: 30 } }] } },
      'lifecycle.no_unapproved_deletion',
      'FAIL',
    ],
    [
      'a scoped delete rule',
      {
        lifecycle: {
          rule: [
            {
              action: { type: 'Delete' },
              condition: { age: 30, matchesPrefix: ['tenants/x/exports/'] },
            },
          ],
        },
      },
      'lifecycle.no_unapproved_deletion',
      'OWNER_ACTION',
    ],
    [
      'a retention policy',
      { retentionPolicy: { retentionPeriod: '86400', isLocked: false } },
      'retention.policy',
      'OWNER_ACTION',
    ],
    [
      'a default event-based hold',
      { defaultEventBasedHold: true },
      'holds.default_event_based',
      'OWNER_ACTION',
    ],
    [
      'a website config',
      { website: { mainPageSuffix: 'index.html' } },
      'website.none',
      'OWNER_ACTION',
    ],
  ])('flags %s', (_label, patch, id, status) => {
    expect(results({ ...goodBucket(), ...(patch as object) })[id]).toBe(status);
  });

  it.each(['allUsers', 'allAuthenticatedUsers'])('fails an IAM grant to %s', (member) => {
    expect(
      results(goodBucket(), {
        bindings: [{ role: 'roles/storage.objectViewer', members: [member] }],
      })['iam.no_public_members'],
    ).toBe('FAIL');
  });

  it('fails closed on every bucket control when metadata cannot be read', () => {
    const out = v.evaluateBucket({
      bucketRead: { ok: false, error: 'HTTP 403', permission: 'storage.buckets.get' },
      iamRead: { ok: false, error: 'HTTP 403', permission: 'storage.buckets.getIamPolicy' },
      projectRead: ok({ projectNumber: '1' }),
    });
    expect(out.length).toBeGreaterThan(10);
    expect(out.every((c) => c.status === 'FAIL')).toBe(true);
    expect(out.find((c) => c.id === 'bucket.identity')?.detail).toContain('storage.buckets.get');
    expect(out.find((c) => c.id === 'iam.no_public_members')?.detail).toContain(
      'storage.buckets.getIamPolicy',
    );
  });

  it('fails the project binding when the project cannot be read, rather than skipping it', () => {
    const out = v.evaluateBucket({
      bucketRead: ok(goodBucket()),
      iamRead: ok({ bindings: [] }),
      projectRead: { ok: false, error: 'HTTP 403', permission: 'resourcemanager.projects.get' },
    });
    expect(out.find((c) => c.id === 'bucket.project_binding')?.status).toBe('FAIL');
  });
});

describe('verifier: certify() against a fake Google', () => {
  it('issues GET requests only, against exactly the certified project and bucket', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const report = await v.certify({
      accessToken: 'tok',
      fetchImpl: fakeFetch(liveRoutes(), calls) as never,
    });
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    for (const { url } of calls) {
      expect(
        url.includes('/b/la-creativo-erp.firebasestorage.app') ||
          url.endsWith('/projects/la-creativo-erp'),
      ).toBe(true);
    }
    expect(report.project).toBe('la-creativo-erp');
    expect(report.bucket).toBe('la-creativo-erp.firebasestorage.app');
  });

  it('counts tokenized protected objects per category and does not certify', async () => {
    const report = await v.certify({
      accessToken: 'tok',
      fetchImpl: fakeFetch(liveRoutes(), []) as never,
    });
    const tokens = report.results.find((c) => c.id === 'tokens.protected_prefixes');
    expect(tokens?.status).toBe('FAIL');
    expect(tokens?.observed).toMatchObject({
      'employee-documents': { objects: 1, tokenized: 1 },
      projects: { objects: 1, tokenized: 0 },
    });
    expect(report.results.find((c) => c.id === 'tokens.branding')?.status).toBe('OWNER_ACTION');
    expect(report.verdict.certified).toBe(false);
  });

  it('never prints a token value or an object name, in JSON or text', async () => {
    const accessToken = 'ya29.ACCESS-TOKEN-must-never-print';
    const report = await v.certify({
      accessToken,
      fetchImpl: fakeFetch(liveRoutes(), []) as never,
    });
    for (const out of [JSON.stringify(report), v.formatReport(report)]) {
      expect(out).not.toContain(SECRET);
      expect(out).not.toContain('jane-doe');
      expect(out).not.toContain(accessToken);
    }
  });

  it('certifies a clean bucket with no tokens', async () => {
    const report = await v.certify({
      accessToken: 'tok',
      fetchImpl: fakeFetch(
        liveRoutes({
          '/b/la-creativo-erp.firebasestorage.app/o?': {
            items: [{ name: 'tenants/t/projects/p/x', metadata: {} }],
          },
          '/b/la-creativo-erp.firebasestorage.app/iam': { bindings: [] },
        }),
        [],
      ) as never,
    });
    expect(report.verdict).toEqual({ certified: true, failures: 0, ownerActions: 0 });
  });

  it('fails closed when the bucket cannot be observed, and lists nothing', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const report = await v.certify({
      accessToken: 'tok',
      fetchImpl: fakeFetch(
        liveRoutes({ '/b/la-creativo-erp.firebasestorage.app?projection=full': 403 }),
        calls,
      ) as never,
    });
    expect(report.verdict.certified).toBe(false);
    expect(report.objectCount).toBeNull();
    expect(report.results.find((c) => c.id === 'tokens.protected_prefixes')?.status).toBe('FAIL');
    expect(calls.some((c) => c.url.includes('/o?'))).toBe(false);
  });

  it('fails closed when the object listing is refused part-way', async () => {
    let page = 0;
    const fetchImpl = async (url: string) => {
      if (url.includes('/o?')) {
        page += 1;
        return page === 1
          ? { ok: true, status: 200, json: async () => ({ items: [], nextPageToken: 'p2' }) }
          : { ok: false, status: 403, json: async () => ({}) };
      }
      return fakeFetch(liveRoutes(), [])(url);
    };
    const report = await v.certify({ accessToken: 'tok', fetchImpl: fetchImpl as never });
    const tokens = report.results.find((c) => c.id === 'tokens.protected_prefixes');
    expect(tokens?.status).toBe('FAIL');
    expect(tokens?.detail).toContain('storage.objects.list');
  });

  it('scans object ACLs when uniform access is off, and fails a public object', async () => {
    const report = await v.certify({
      accessToken: 'tok',
      fetchImpl: fakeFetch(
        liveRoutes({
          '/b/la-creativo-erp.firebasestorage.app?projection=full': {
            ...goodBucket(),
            iamConfiguration: {
              uniformBucketLevelAccess: { enabled: false },
              publicAccessPrevention: 'enforced',
            },
          },
          '/b/la-creativo-erp.firebasestorage.app/o?': {
            items: [
              { name: 'tenants/t/projects/p/x', metadata: {}, acl: [{ entity: 'allUsers' }] },
            ],
          },
        }),
        [],
      ) as never,
    });
    expect(report.results.find((c) => c.id === 'acl.no_public_object_acl')?.status).toBe('FAIL');
  });
});

/**
 * P0-07 Blocker 2 — ACLs are evidence only when Cloud Storage RETURNED them.
 *
 * With uniform bucket-level access OFF, object ACLs can grant access, and Objects.list only
 * includes them (projection=full) for a caller holding storage.objects.getIamPolicy. A
 * listing without that permission is a partial projection: the `acl` field is simply
 * absent. Absent is UNKNOWN. These cases pin that the verifier never turns "not shown"
 * into "not public".
 */
describe('verifier: ACL observability (UBLA off must be positively observed)', () => {
  const ublaOff = () => ({
    ...goodBucket(),
    iamConfiguration: {
      uniformBucketLevelAccess: { enabled: false },
      publicAccessPrevention: 'enforced',
    },
    acl: [{ entity: 'project-owners-123', role: 'OWNER' }],
    defaultObjectAcl: [{ entity: 'project-owners-123', role: 'OWNER' }],
  });
  const EMAIL_ENTITY = 'user-jane.doe@customer.example';

  async function run(
    bucket: unknown,
    items: unknown[],
    calls: Array<{ url: string; method: string }> = [],
  ) {
    const report = await v.certify({
      accessToken: 'tok',
      fetchImpl: fakeFetch(
        liveRoutes({
          '/b/la-creativo-erp.firebasestorage.app?projection=full': bucket,
          '/b/la-creativo-erp.firebasestorage.app/o?': { items },
          '/b/la-creativo-erp.firebasestorage.app/iam': { bindings: [] },
        }),
        calls,
      ) as never,
    });
    const status = (id: string) => report.results.find((c) => c.id === id);
    return { report, status };
  }

  it('UBLA on: object ACL inspection is unnecessary — no ACL projection is requested', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const { status } = await run(
      goodBucket(),
      // Even a listing with no ACL field at all is fine: ACLs cannot grant access here.
      [{ name: 'tenants/t/projects/p/x', metadata: {} }],
      calls,
    );
    expect(status('acl.no_public_object_acl')?.status).toBe('PASS');
    expect(status('acl.no_public_object_acl')?.detail).toMatch(/Uniform bucket-level access is on/);
    const listing = calls.find((c) => c.url.includes('/o?'))!;
    expect(listing.url).not.toContain('projection=full');
  });

  it('UBLA off: requests the full projection, and an observed non-public ACL passes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const { status } = await run(
      ublaOff(),
      [
        { name: 'tenants/t/projects/p/x', metadata: {}, acl: [{ entity: 'project-owners-123' }] },
        { name: 'tenants/t/projects/p/y', metadata: {}, acl: [] },
      ],
      calls,
    );
    expect(status('acl.no_public_object_acl')?.status).toBe('PASS');
    expect(status('acl.no_public_object_acl')?.detail).toMatch(
      /Every listed object ACL was observed/,
    );
    const listing = calls.find((c) => c.url.includes('/o?'))!;
    expect(listing.url).toContain('projection=full');
    expect(decodeURIComponent(listing.url)).toContain('acl(entity)');
  });

  it.each(['allUsers', 'allAuthenticatedUsers'])(
    'UBLA off: an observed %s ACL fails',
    async (entity) => {
      const { status } = await run(ublaOff(), [
        { name: 'tenants/t/projects/p/x', metadata: {}, acl: [{ entity }] },
      ]);
      expect(status('acl.no_public_object_acl')?.status).toBe('FAIL');
      expect(status('acl.no_public_object_acl')?.detail).toMatch(/public ACL entry/);
    },
  );

  it('UBLA off: a partial projection (ACL omitted) is FAIL/UNOBSERVABLE, never PASS', async () => {
    const { status, report } = await run(ublaOff(), [
      { name: 'tenants/t/projects/p/x', metadata: {} },
      { name: 'tenants/t/projects/p/y', metadata: {} },
    ]);
    const control = status('acl.no_public_object_acl')!;
    expect(control.status).toBe('FAIL');
    expect(control.detail).toMatch(/^Unobservable: 2 listed object\(s\)/);
    expect(control.detail).toContain('storage.objects.getIamPolicy');
    expect(report.verdict.certified).toBe(false);
  });

  it('UBLA off: ONE object without an ACL fails the control even if the rest are clean', async () => {
    const { status } = await run(ublaOff(), [
      { name: 'tenants/t/projects/p/x', metadata: {}, acl: [{ entity: 'project-owners-123' }] },
      { name: 'tenants/t/projects/p/y', metadata: {} },
    ]);
    expect(status('acl.no_public_object_acl')?.status).toBe('FAIL');
    expect(status('acl.no_public_object_acl')?.detail).toMatch(/^Unobservable: 1 listed/);
  });

  it('UBLA off: a public entry still wins over unobserved ones (the worse finding is reported)', async () => {
    const { status } = await run(ublaOff(), [
      { name: 'tenants/t/projects/p/x', metadata: {}, acl: [{ entity: 'allUsers' }] },
      { name: 'tenants/t/projects/p/y', metadata: {} },
    ]);
    expect(status('acl.no_public_object_acl')?.detail).toMatch(/public ACL entry/);
  });

  it('UBLA off: bucket and default-object ACLs omitted from the bucket read are FAIL, not PASS', async () => {
    const bucket = ublaOff() as Record<string, unknown>;
    delete bucket.acl;
    delete bucket.defaultObjectAcl;
    const { status } = await run(bucket, [
      { name: 'tenants/t/projects/p/x', metadata: {}, acl: [{ entity: 'project-owners-123' }] },
    ]);
    for (const id of ['acl.no_public_bucket_acl', 'acl.no_public_default_object_acl']) {
      expect(status(id)?.status).toBe('FAIL');
      expect(status(id)?.detail).toMatch(/^Unobservable/);
      expect(status(id)?.detail).toContain('storage.buckets.getIamPolicy');
    }
  });

  it('UBLA off: observed public bucket / default-object ACLs fail', async () => {
    const { status } = await run(
      {
        ...ublaOff(),
        acl: [{ entity: 'allUsers', role: 'READER' }],
        defaultObjectAcl: [{ entity: 'allAuthenticatedUsers', role: 'READER' }],
      },
      [{ name: 'tenants/t/projects/p/x', metadata: {}, acl: [] }],
    );
    expect(status('acl.no_public_bucket_acl')?.status).toBe('FAIL');
    expect(status('acl.no_public_default_object_acl')?.status).toBe('FAIL');
  });

  it('UBLA on: bucket ACL fields are not applicable (they cannot grant access)', async () => {
    const { status } = await run(
      {
        ...goodBucket(),
        acl: [{ entity: 'allUsers' }],
        defaultObjectAcl: [{ entity: 'allUsers' }],
      },
      [{ name: 'tenants/t/projects/p/x', metadata: {} }],
    );
    expect(status('acl.no_public_bucket_acl')?.status).toBe('PASS');
    expect(status('acl.no_public_bucket_acl')?.detail).toMatch(
      /Not applicable under uniform access/,
    );
  });

  it('UBLA off: a listing refused mid-pagination fails, naming both read permissions', async () => {
    let page = 0;
    const fetchImpl = async (url: string) => {
      if (url.includes('/o?')) {
        page += 1;
        return page === 1
          ? {
              ok: true,
              status: 200,
              json: async () => ({
                items: [{ name: 'tenants/t/projects/p/x', metadata: {}, acl: [] }],
                nextPageToken: 'p2',
              }),
            }
          : { ok: false, status: 403, json: async () => ({}) };
      }
      return fakeFetch(
        liveRoutes({ '/b/la-creativo-erp.firebasestorage.app?projection=full': ublaOff() }),
        [],
      )(url);
    };
    const report = await v.certify({ accessToken: 'tok', fetchImpl: fetchImpl as never });
    const acl = report.results.find((c) => c.id === 'acl.no_public_object_acl')!;
    expect(acl.status).toBe('FAIL');
    expect(acl.detail).toContain('storage.objects.getIamPolicy');
    expect(report.objectCount).toBeNull();
  });

  it('never leaks object names, ACL entities (emails) or token values into the report', async () => {
    const accessToken = 'ya29.ACCESS-TOKEN-must-never-print';
    const report = await v.certify({
      accessToken,
      fetchImpl: fakeFetch(
        liveRoutes({
          '/b/la-creativo-erp.firebasestorage.app?projection=full': ublaOff(),
          '/b/la-creativo-erp.firebasestorage.app/o?': {
            items: [
              {
                name: SECRET_NAME,
                metadata: { firebaseStorageDownloadTokens: SECRET },
                acl: [{ entity: EMAIL_ENTITY, email: 'jane.doe@customer.example' }],
              },
              { name: 'tenants/t1/projects/p/secret-merger-plan.pdf', metadata: {} },
            ],
          },
        }),
        [],
      ) as never,
    });
    for (const out of [JSON.stringify(report), v.formatReport(report)]) {
      expect(out).not.toContain(SECRET);
      expect(out).not.toContain('jane');
      expect(out).not.toContain('customer.example');
      expect(out).not.toContain('secret-merger-plan');
      expect(out).not.toContain(accessToken);
    }
  });
});

describe('verifier: objectAclControl truth table', () => {
  it.each([
    [{ objectAclChecked: false, publicObjects: 0, unobservedAcls: 5 }, 'PASS'],
    [{ objectAclChecked: true, publicObjects: 0, unobservedAcls: 0 }, 'PASS'],
    [{ objectAclChecked: true, publicObjects: 1, unobservedAcls: 0 }, 'FAIL'],
    [{ objectAclChecked: true, publicObjects: 0, unobservedAcls: 1 }, 'FAIL'],
    [{ objectAclChecked: true, publicObjects: 2, unobservedAcls: 3 }, 'FAIL'],
  ])('%j -> %s', (input, status) => {
    expect(v.objectAclControl(input).status).toBe(status);
  });

  it('observedAcl distinguishes "not returned" from "returned empty"', () => {
    expect(v.observedAcl({})).toBeNull();
    expect(v.observedAcl({ acl: undefined })).toBeNull();
    expect(v.observedAcl({ acl: null })).toBeNull();
    expect(v.observedAcl({ acl: [] })).toEqual([]);
  });
});

describe('verifier: object classification', () => {
  it.each([
    ['tenants/t/projects/p/x', 'projects'],
    ['tenants/t/client-files/p/x', 'client-files'],
    ['tenants/t/employees/e/x', 'employees'],
    ['tenants/t/employee-documents/e/x', 'employee-documents'],
    ['tenants/t/support/x.png', 'support'],
    ['tenants/t/branding/logo.png', 'branding'],
    ['tenants/t/brand/logo.webp', 'brand'],
    ['tenants/t/new-thing/x', 'other-tenant-prefix'],
    ['projects/p/x', 'outside-tenants'],
    ['tenants/x', 'outside-tenants'],
  ])('%s -> %s', (name, category) => {
    expect(v.classifyObject(name)).toBe(category);
  });
});

describe('remediation tool: audit by default, mutation only with every confirmation', () => {
  const approved = {
    mode: 'apply',
    scope: 'protected',
    confirmProject: 'la-creativo-erp',
    confirmBucket: 'la-creativo-erp.firebasestorage.app',
    firestore: false,
    json: false,
  };

  it('defaults to audit mode', () => {
    expect(r.parseArgs([]).mode).toBe('audit');
    expect(r.applyRefusals(r.parseArgs([]), {})).toEqual([]);
  });

  it('allows apply only when project, bucket and approver are all given, outside CI', () => {
    expect(r.applyRefusals(approved, { P0_07_TOKEN_REMEDIATION_APPROVED_BY: 'Owner' })).toEqual([]);
  });

  it.each([
    ['a wrong project', { confirmProject: 'la-creativo-erp-staging' }, {}],
    ['a missing bucket confirmation', { confirmBucket: null }, {}],
    ['a wrong bucket', { confirmBucket: 'gs://la-creativo-erp.firebasestorage.app' }, {}],
    ['no named approver', {}, { P0_07_TOKEN_REMEDIATION_APPROVED_BY: '' }],
    ['a CI runner', {}, { CI: 'true' }],
    ['GitHub Actions', {}, { GITHUB_ACTIONS: 'true' }],
    ['an unknown scope', { scope: 'everything' }, {}],
  ])('refuses apply with %s', (_label, argPatch, envPatch) => {
    const env = { P0_07_TOKEN_REMEDIATION_APPROVED_BY: 'Owner', ...envPatch };
    expect(r.applyRefusals({ ...approved, ...argPatch } as never, env).length).toBeGreaterThan(0);
  });

  it('audit issues GET only and returns targets without token values', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const audit = await r.auditObjects({
      accessToken: 'tok',
      scope: 'protected',
      fetchImpl: fakeFetch(
        {
          '/o?': {
            items: [
              {
                name: SECRET_NAME,
                generation: '5',
                metageneration: '2',
                metadata: { firebaseStorageDownloadTokens: SECRET },
              },
              {
                name: 'tenants/t1/branding/logo.png',
                generation: '6',
                metageneration: '1',
                metadata: { firebaseStorageDownloadTokens: SECRET },
              },
            ],
          },
        },
        calls,
      ) as never,
    });
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(audit.ok).toBe(true);
    // protected scope excludes the public logo
    expect(audit.targets).toEqual([
      { name: SECRET_NAME, category: 'employee-documents', generation: '5', metageneration: '2' },
    ]);
    expect(JSON.stringify(audit)).not.toContain(SECRET);
  });

  it('revokes with generation AND metageneration preconditions, metadata only', async () => {
    const calls: Array<{ url: string; init: { method?: string; body?: string } }> = [];
    const fetchImpl = async (url: string, init: { method?: string; body?: string }) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ generation: '5', metadata: {} }) };
    };
    const outcome = await r.revokeToken(
      { name: SECRET_NAME, category: 'employee-documents', generation: '5', metageneration: '2' },
      'tok',
      fetchImpl as never,
    );
    expect(outcome).toBe('revoked');
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[0].url).toContain('ifGenerationMatch=5');
    expect(calls[0].url).toContain('ifMetagenerationMatch=2');
    expect(JSON.parse(calls[0].init.body!)).toEqual({
      metadata: { firebaseStorageDownloadTokens: null },
    });
  });

  it.each([
    [412, 'skipped_changed'],
    [404, 'skipped_missing'],
    [500, 'error'],
  ])('maps HTTP %s to %s without retrying or deleting', async (status, outcome) => {
    const fetchImpl = async () => ({ ok: false, status, json: async () => ({}) });
    await expect(
      r.revokeToken(
        { name: 'x', category: 'projects', generation: '1', metageneration: '1' },
        'tok',
        fetchImpl as never,
      ),
    ).resolves.toBe(outcome);
  });

  it('reports unverified when the response still carries a token or a new generation', async () => {
    for (const body of [
      { generation: '5', metadata: { firebaseStorageDownloadTokens: 'still' } },
      { generation: '6', metadata: {} },
    ]) {
      const fetchImpl = async () => ({ ok: true, status: 200, json: async () => body });
      await expect(
        r.revokeToken(
          { name: 'x', category: 'projects', generation: '5', metageneration: '1' },
          'tok',
          fetchImpl as never,
        ),
      ).resolves.toBe('unverified');
    }
  });

  it('classifies stored record URLs without keeping them', () => {
    expect(
      r.classifyStoredUrl('https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=abc'),
    ).toBe('firebase_token_url');
    expect(r.classifyStoredUrl('https://storage.googleapis.com/b/o?X-Goog-Signature=a')).toBe(
      'signed_url',
    );
    expect(r.classifyStoredUrl('/api/public/branding/t/logo')).toBe('bizosto_route');
    expect(r.classifyStoredUrl(null)).toBe('empty');
  });

  it('record audit is GET-only and field-masked', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const out = await r.auditRecords({
      accessToken: 'tok',
      fetchImpl: fakeFetch(
        {
          '/documents/files?': {
            documents: [
              {
                fields: {
                  downloadUrl: {
                    stringValue: `https://firebasestorage.googleapis.com/v0/b/x/o/y?token=${SECRET}`,
                  },
                },
              },
              { fields: { downloadUrl: { nullValue: null } } },
            ],
          },
        },
        calls,
      ) as never,
    });
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls.every((c) => c.url.includes('mask.fieldPaths='))).toBe(true);
    expect(out.find((row) => row.collection === 'files')).toMatchObject({
      documents: 2,
      firebase_token_url: 1,
      empty: 1,
    });
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });
});

describe('the live certification workflow is read-only and fails closed', () => {
  const workflow = read('.github/workflows/storage-bucket-certification.yml');
  const commands = workflow
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  it('authenticates only as the dedicated reader identity, never a deploy identity', () => {
    expect(commands).toContain('service_account: ${{ vars.GCP_STORAGE_CERT_READER_SA }}');
    expect(commands).not.toMatch(
      /GCP_FIREBASE_RULES_DEPLOYER_SA|GCP_FIRESTORE_INDEX_(READER|DEPLOYER)_SA/,
    );
  });

  it('uses keyless federation: no JSON key, no stored Google secret', () => {
    expect(commands).toContain(
      'workload_identity_provider: ${{ vars.GCP_STORAGE_CERT_WIF_PROVIDER }}',
    );
    expect(commands).not.toMatch(/credentials_json|GOOGLE_APPLICATION_CREDENTIALS|secrets\./);
  });

  it('refuses any ref but main, and missing dedicated provider/reader variables, before minting a credential', () => {
    const guard = commands.indexOf('Refuse anything but main');
    const auth = commands.indexOf('google-github-actions/auth');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(auth);
    expect(commands).toContain('if [ "$REF" != "refs/heads/main" ]; then');
    expect(commands).toContain('if [ -z "$WIF_PROVIDER" ]; then');
    expect(commands).toContain('if [ -z "$READER_SA" ]; then');
    expect(commands).not.toContain('GCP_WORKLOAD_IDENTITY_PROVIDER');
  });

  it('never mutates the bucket or runs the remediation tool', () => {
    expect(commands).not.toMatch(/storage-token-remediation|--mode=apply/);
    expect(commands).not.toMatch(
      /gcloud\s+storage\s+(buckets|objects)\s+update|gsutil|setMetadata|PATCH/,
    );
    expect(commands).toContain('node scripts/verify-storage-bucket.mjs --json');
  });

  it('never hides a failure', () => {
    expect(commands).not.toMatch(/continue-on-error/);
    expect(commands).toContain('exit $status');
  });

  it('holds only read permission on the repository and an OIDC token', () => {
    expect(commands).toMatch(
      /permissions:\s*\n\s*contents: read\s*\n(?:\s*#.*\n)*\s*id-token: write/,
    );
    expect(commands).not.toMatch(/(contents|pull-requests|actions|packages|deployments): write/);
  });

  it('masks the short-lived access token', () => {
    expect(commands).toContain('echo "::add-mask::$GCS_ACCESS_TOKEN"');
  });
});

describe('the verifier source is GET-only', () => {
  const src = read('scripts/verify-storage-bucket.mjs')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('has exactly one request site and it hard-codes GET', () => {
    expect((src.match(/fetchImpl\(/g) || []).length).toBe(1);
    expect(src).toMatch(/method: 'GET'/);
    expect(src).not.toMatch(/method:\s*'(PATCH|POST|PUT|DELETE)'/);
  });

  it('pins the project and bucket as constants', () => {
    expect(src).toContain("export const EXPECTED_PROJECT_ID = 'la-creativo-erp';");
    expect(src).toContain("export const EXPECTED_BUCKET = 'la-creativo-erp.firebasestorage.app';");
  });
});
