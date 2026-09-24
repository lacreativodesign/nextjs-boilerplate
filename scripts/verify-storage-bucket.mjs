#!/usr/bin/env node
/**
 * P0-07 — READ-ONLY live certification of the production Cloud Storage bucket.
 *
 * WHAT THIS EXISTS TO PROVE
 *
 * The P0-04 suite proves what storage.rules DOES, and GitHub Actions run 34862537234
 * proves that ruleset was compiled, uploaded and released to
 * `la-creativo-erp.firebasestorage.app`. Neither says anything about the bucket itself:
 * who holds IAM on it, whether anything is public, whether uniform bucket-level access is
 * on, what CORS it answers with, whether a lifecycle rule could delete tenant files, and —
 * the P0-07 question — how many objects still carry a permanent Firebase download token.
 * Security Rules are not consulted for any of those. This script reads them.
 *
 * READ-ONLY BY CONSTRUCTION
 *
 *   - Every request is an HTTP GET (`readJson` below is the only request function, and it
 *     hard-codes the method). __tests__/ci/p0-07-storage-certification.test.ts pins that
 *     no other method, no metadata PATCH and no `gcloud ... update` appears here.
 *   - The identity the workflow uses holds read permissions only (see the runbook), so it
 *     could not mutate even if this file were wrong.
 *   - The project and bucket are constants. Nothing on the command line can retarget them.
 *
 * FAIL CLOSED
 *
 * A read that is refused, fails, or returns an unexpected shape is a FAIL for every
 * control that depended on it, with the permission that was missing — never a pass by
 * absence. An unfinished object listing certifies no token count.
 *
 * SECRETS
 *
 * Listing objects returns their custom metadata, which includes the VALUE of any
 * `firebaseStorageDownloadTokens`. Token values are reduced to a boolean the moment a page
 * arrives and are never stored, printed, returned or written to a report. Object NAMES are
 * not printed either (they can carry customer file names); only per-category counts are.
 * The access token is read from the environment, sent only in an Authorization header,
 * and never echoed.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const EXPECTED_PROJECT_ID = 'la-creativo-erp';
export const EXPECTED_BUCKET = 'la-creativo-erp.firebasestorage.app';
export const TOKEN_KEY = 'firebaseStorageDownloadTokens';

const GCS = 'https://storage.googleapis.com/storage/v1';
const CRM = 'https://cloudresourcemanager.googleapis.com/v1';

/** Tenant prefixes whose objects must never carry a bearer token. */
export const PROTECTED_CATEGORIES = [
  'projects',
  'client-files',
  'employees',
  'employee-documents',
  'support',
  'documents',
  'docusign',
  'files',
  'exports',
  'imports',
];

/** The deliberately public category (tenant logos). A token here is hygiene, not exposure. */
export const PUBLIC_BRANDING_CATEGORIES = ['branding', 'brand'];

/** Buckets objects by what they are, without ever returning the name. */
export function classifyObject(name) {
  const parts = String(name || '').split('/');
  if (parts[0] !== 'tenants' || parts.length < 3 || !parts[1]) return 'outside-tenants';
  const prefix = parts[2];
  if (PROTECTED_CATEGORIES.includes(prefix)) return prefix;
  if (PUBLIC_BRANDING_CATEGORIES.includes(prefix)) return prefix;
  return 'other-tenant-prefix';
}

export function hasToken(item) {
  const value = item?.metadata?.[TOKEN_KEY];
  return typeof value === 'string' && value.trim().length > 0;
}

const PUBLIC_ENTITIES = new Set(['allUsers', 'allAuthenticatedUsers']);
const isPublicMember = (member) => PUBLIC_ENTITIES.has(String(member));

/** Counts per category. Receives listing pages; keeps booleans and counts, nothing else. */
export function tallyObjects(pages, { checkObjectAcl = false } = {}) {
  const byCategory = {};
  let total = 0;
  let tokenized = 0;
  let publicAcl = 0;
  for (const page of pages) {
    for (const item of page?.items ?? []) {
      const category = classifyObject(item?.name);
      const row = (byCategory[category] ??= { objects: 0, tokenized: 0, publicAcl: 0 });
      row.objects += 1;
      total += 1;
      if (hasToken(item)) {
        row.tokenized += 1;
        tokenized += 1;
      }
      if (checkObjectAcl && (item?.acl ?? []).some((entry) => isPublicMember(entry?.entity))) {
        row.publicAcl += 1;
        publicAcl += 1;
      }
    }
  }
  return { total, tokenized, publicAcl, byCategory };
}

const control = (id, status, detail, observed = undefined) => ({
  id,
  status,
  detail,
  ...(observed === undefined ? {} : { observed }),
});

const unobservable = (id, read) =>
  control(
    id,
    'FAIL',
    `Could not be observed: ${read?.error ?? 'read failed'}.` +
      (read?.permission ? ` Grant the reader ${read.permission} (read-only).` : ''),
  );

const softDeleteLabel = (policy) =>
  policy?.retentionDurationSeconds ? `${policy.retentionDurationSeconds}s` : 'unreported';

/**
 * Evaluates the bucket's configuration. Pure: every input is an already-completed read of
 * the shape `{ ok, data, error, permission }`.
 */
export function evaluateBucket({ bucketRead, iamRead, projectRead }) {
  const results = [];

  if (!bucketRead?.ok) {
    for (const id of [
      'bucket.exists',
      'bucket.identity',
      'bucket.project_binding',
      'bucket.location',
      'iam.public_access_prevention',
      'iam.uniform_bucket_level_access',
      'acl.no_public_bucket_acl',
      'acl.no_public_default_object_acl',
      'cors.minimal',
      'lifecycle.no_unapproved_deletion',
      'versioning.state',
      'retention.policy',
      'holds.default_event_based',
      'website.none',
      'labels.recorded',
    ]) {
      results.push(unobservable(id, bucketRead));
    }
  } else {
    const b = bucketRead.data || {};

    results.push(control('bucket.exists', 'PASS', 'Bucket metadata was served.'));
    results.push(
      b.name === EXPECTED_BUCKET
        ? control('bucket.identity', 'PASS', `Bucket is ${EXPECTED_BUCKET}.`, b.name)
        : control('bucket.identity', 'FAIL', `Expected ${EXPECTED_BUCKET}.`, b.name ?? null),
    );

    if (!projectRead?.ok) {
      results.push(unobservable('bucket.project_binding', projectRead));
    } else {
      const expected = String(projectRead.data?.projectNumber ?? '');
      const actual = String(b.projectNumber ?? '');
      results.push(
        expected && actual === expected
          ? control(
              'bucket.project_binding',
              'PASS',
              `Bucket belongs to ${EXPECTED_PROJECT_ID} (project number ${expected}).`,
              actual,
            )
          : control(
              'bucket.project_binding',
              'FAIL',
              `Bucket project number ${actual || '(none)'} is not ${EXPECTED_PROJECT_ID}'s ` +
                `${expected || '(unknown)'}.`,
              actual || null,
            ),
      );
    }

    results.push(
      b.location
        ? control(
            'bucket.location',
            'INFO',
            `Location ${b.location} (${b.locationType ?? 'type unreported'}).`,
            { location: b.location, locationType: b.locationType ?? null },
          )
        : control('bucket.location', 'FAIL', 'Bucket reported no location.'),
    );

    const iamConfig = b.iamConfiguration || {};
    const pap = iamConfig.publicAccessPrevention ?? 'unreported';
    results.push(
      pap === 'enforced'
        ? control(
            'iam.public_access_prevention',
            'PASS',
            'Public access prevention is enforced.',
            pap,
          )
        : control(
            'iam.public_access_prevention',
            'OWNER_ACTION',
            `Public access prevention is "${pap}", so a future public grant would take effect. ` +
              'No product path needs public objects any more (logos are served by ' +
              '/api/public/branding/...). Owner to enforce it — see the P0-07 runbook.',
            pap,
          ),
    );

    const ubla = iamConfig.uniformBucketLevelAccess?.enabled === true;
    results.push(
      ubla
        ? control(
            'iam.uniform_bucket_level_access',
            'PASS',
            'Uniform bucket-level access is enabled; object ACLs cannot grant access.',
            true,
          )
        : control(
            'iam.uniform_bucket_level_access',
            'OWNER_ACTION',
            'Uniform bucket-level access is disabled, so per-object ACLs can grant access ' +
              'outside IAM. Every object ACL is scanned below; owner to decide on enabling it.',
            false,
          ),
    );

    const bucketAcl = Array.isArray(b.acl) ? b.acl : [];
    const defaultAcl = Array.isArray(b.defaultObjectAcl) ? b.defaultObjectAcl : [];
    results.push(
      bucketAcl.some((e) => isPublicMember(e?.entity))
        ? control('acl.no_public_bucket_acl', 'FAIL', 'The bucket ACL grants a public entity.')
        : control(
            'acl.no_public_bucket_acl',
            'PASS',
            ubla ? 'Not applicable under uniform access.' : 'No public entity in the bucket ACL.',
          ),
    );
    results.push(
      defaultAcl.some((e) => isPublicMember(e?.entity))
        ? control(
            'acl.no_public_default_object_acl',
            'FAIL',
            'The default object ACL makes NEW objects public.',
          )
        : control(
            'acl.no_public_default_object_acl',
            'PASS',
            ubla ? 'Not applicable under uniform access.' : 'Default object ACL is not public.',
          ),
    );

    results.push(evaluateCors(b.cors));
    results.push(evaluateLifecycle(b.lifecycle));

    results.push(
      control(
        'versioning.state',
        'INFO',
        `Object versioning is ${b.versioning?.enabled ? 'enabled' : 'disabled'}; soft delete ` +
          `retention is ${softDeleteLabel(b.softDeletePolicy)}. ` +
          'Recorded, not pinned: recovery of deleted tenant files is an owner decision.',
        {
          versioning: b.versioning?.enabled === true,
          softDeleteSeconds: b.softDeletePolicy?.retentionDurationSeconds ?? null,
        },
      ),
    );

    results.push(
      b.retentionPolicy
        ? control(
            'retention.policy',
            'OWNER_ACTION',
            `A bucket retention policy is set (${b.retentionPolicy.retentionPeriod}s, locked: ` +
              `${Boolean(b.retentionPolicy.isLocked)}). It blocks the generation-guarded ` +
              'deletes quota enforcement relies on; owner to confirm it is intended.',
            b.retentionPolicy,
          )
        : control('retention.policy', 'PASS', 'No bucket retention policy.', null),
    );

    results.push(
      b.defaultEventBasedHold
        ? control(
            'holds.default_event_based',
            'OWNER_ACTION',
            'New objects are created under an event-based hold, which blocks deletes.',
            true,
          )
        : control('holds.default_event_based', 'PASS', 'No default event-based hold.', false),
    );

    results.push(
      b.website && (b.website.mainPageSuffix || b.website.notFoundPage)
        ? control(
            'website.none',
            'OWNER_ACTION',
            'A static-website configuration is set on the tenant bucket.',
            b.website,
          )
        : control('website.none', 'PASS', 'No website configuration.', null),
    );

    results.push(control('labels.recorded', 'INFO', 'Bucket labels recorded.', b.labels ?? {}));
  }

  if (!iamRead?.ok) {
    results.push(unobservable('iam.no_public_members', iamRead));
  } else {
    const publicBindings = (iamRead.data?.bindings ?? [])
      .filter((binding) => (binding?.members ?? []).some(isPublicMember))
      .map((binding) => binding.role);
    results.push(
      publicBindings.length
        ? control(
            'iam.no_public_members',
            'FAIL',
            `allUsers/allAuthenticatedUsers hold: ${publicBindings.join(', ')}.`,
            publicBindings,
          )
        : control(
            'iam.no_public_members',
            'PASS',
            'No IAM binding grants allUsers or allAuthenticatedUsers.',
            [],
          ),
    );
  }

  return results;
}

/**
 * The application's real browser CORS requirement is NONE on this bucket:
 *
 *   - browser uploads use the Firebase SDK, which talks to firebasestorage.googleapis.com;
 *     that endpoint's CORS is Firebase's, not the bucket's;
 *   - protected downloads are top-level navigations to a signed URL (a 302 from a Bizosto
 *     route), and previews are <img>/<iframe>/<video> src loads — neither is a CORS request;
 *   - no client code fetch()es storage.googleapis.com.
 *
 * So absent CORS passes; a wildcard origin fails; anything else is surfaced for the owner.
 */
export function evaluateCors(cors) {
  const entries = Array.isArray(cors) ? cors : [];
  if (entries.length === 0) {
    return control(
      'cors.minimal',
      'PASS',
      'No CORS configuration — the minimum the app needs.',
      [],
    );
  }
  const summary = entries.map((entry) => ({
    origin: entry?.origin ?? [],
    method: entry?.method ?? [],
    responseHeader: entry?.responseHeader ?? [],
    maxAgeSeconds: entry?.maxAgeSeconds ?? null,
  }));
  if (summary.some((entry) => entry.origin.includes('*'))) {
    return control(
      'cors.minimal',
      'FAIL',
      'CORS allows origin "*". Nothing in the app needs cross-origin bucket access.',
      summary,
    );
  }
  return control(
    'cors.minimal',
    'OWNER_ACTION',
    'CORS is configured although the app needs none; owner to remove it or record why it exists.',
    summary,
  );
}

/**
 * A Delete rule with no prefix condition applies to PRIMARY tenant files, which must never
 * disappear because of an age threshold. Anything else that deletes needs owner review.
 */
export function evaluateLifecycle(lifecycle) {
  const rules = Array.isArray(lifecycle?.rule) ? lifecycle.rule : [];
  if (rules.length === 0) {
    return control(
      'lifecycle.no_unapproved_deletion',
      'PASS',
      'No lifecycle rules. Correct for primary tenant files; the export/import retention gap ' +
        'is documented in the P0-07 runbook for an owner decision.',
      [],
    );
  }
  const summary = rules.map((rule) => ({
    action: rule?.action?.type ?? null,
    condition: rule?.condition ?? {},
  }));
  const deletes = summary.filter((rule) => rule.action === 'Delete');
  const unscoped = deletes.filter(
    (rule) => !(Array.isArray(rule.condition.matchesPrefix) && rule.condition.matchesPrefix.length),
  );
  if (unscoped.length) {
    return control(
      'lifecycle.no_unapproved_deletion',
      'FAIL',
      'A lifecycle Delete rule has no prefix condition, so it can delete primary tenant files.',
      summary,
    );
  }
  if (deletes.length) {
    return control(
      'lifecycle.no_unapproved_deletion',
      'OWNER_ACTION',
      'Prefix-scoped lifecycle Delete rules exist; owner to confirm each prefix is disposable.',
      summary,
    );
  }
  return control('lifecycle.no_unapproved_deletion', 'PASS', 'No lifecycle rule deletes.', summary);
}

/** Token and ACL exposure across the whole object inventory. */
export function evaluateInventory(listing, { objectAclChecked }) {
  if (!listing?.ok) {
    return [
      unobservable('tokens.protected_prefixes', listing),
      unobservable('tokens.outside_tenants', listing),
      unobservable('tokens.branding', listing),
      unobservable('acl.no_public_object_acl', listing),
    ];
  }
  const { byCategory } = listing.tally;
  const count = (categories, field) =>
    categories.reduce((sum, category) => sum + (byCategory[category]?.[field] ?? 0), 0);
  const perCategory = (categories) =>
    Object.fromEntries(
      categories
        .filter((category) => byCategory[category])
        .map((category) => [category, { ...byCategory[category] }]),
    );

  const protectedTokens = count([...PROTECTED_CATEGORIES, 'other-tenant-prefix'], 'tokenized');
  const outsideTokens = count(['outside-tenants'], 'tokenized');
  const brandingTokens = count(PUBLIC_BRANDING_CATEGORIES, 'tokenized');
  const publicObjects = listing.tally.publicAcl;

  return [
    protectedTokens
      ? control(
          'tokens.protected_prefixes',
          'FAIL',
          `${protectedTokens} protected tenant object(s) still carry a permanent Firebase ` +
            'download token. Post-merge remediation: scripts/storage-token-remediation.mjs.',
          perCategory([...PROTECTED_CATEGORIES, 'other-tenant-prefix']),
        )
      : control(
          'tokens.protected_prefixes',
          'PASS',
          'No protected tenant object carries a Firebase download token.',
          perCategory([...PROTECTED_CATEGORIES, 'other-tenant-prefix']),
        ),
    outsideTokens
      ? control(
          'tokens.outside_tenants',
          'FAIL',
          `${outsideTokens} legacy object(s) outside tenants/ carry a download token.`,
          perCategory(['outside-tenants']),
        )
      : control(
          'tokens.outside_tenants',
          'PASS',
          'No object outside tenants/ carries a download token.',
          perCategory(['outside-tenants']),
        ),
    brandingTokens
      ? control(
          'tokens.branding',
          'OWNER_ACTION',
          `${brandingTokens} logo object(s) carry a legacy token. Logos are public by design, ` +
            'so this is hygiene rather than exposure; remediate with --scope=all.',
          perCategory(PUBLIC_BRANDING_CATEGORIES),
        )
      : control(
          'tokens.branding',
          'PASS',
          'No logo object carries a download token.',
          perCategory(PUBLIC_BRANDING_CATEGORIES),
        ),
    !objectAclChecked
      ? control(
          'acl.no_public_object_acl',
          'PASS',
          'Uniform bucket-level access is on, so object ACLs cannot grant access.',
        )
      : publicObjects
        ? control(
            'acl.no_public_object_acl',
            'FAIL',
            `${publicObjects} object(s) have a public ACL entry.`,
            publicObjects,
          )
        : control('acl.no_public_object_acl', 'PASS', 'No object ACL grants a public entity.', 0),
  ];
}

export function verdict(results) {
  const failures = results.filter((r) => r.status === 'FAIL');
  const ownerActions = results.filter((r) => r.status === 'OWNER_ACTION');
  return {
    certified: failures.length === 0 && ownerActions.length === 0,
    failures: failures.length,
    ownerActions: ownerActions.length,
  };
}

// --------------------------------------------------------------------------------------
// I/O. The only network function is readJson, and it only ever issues GET.
// --------------------------------------------------------------------------------------

const PERMISSION_HINTS = [
  [/\/b\/[^/]+\/iam$/, 'storage.buckets.getIamPolicy'],
  [/\/b\/[^/]+\/o(\?|$)/, 'storage.objects.list'],
  [/\/b\/[^/]+(\?|$)/, 'storage.buckets.get'],
  [/cloudresourcemanager/, 'resourcemanager.projects.get'],
];

function permissionFor(url) {
  for (const [re, permission] of PERMISSION_HINTS) if (re.test(url)) return permission;
  return null;
}

export async function readJson(url, accessToken, fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
  } catch (error) {
    return { ok: false, error: `network error (${error?.name ?? 'Error'})` };
  }
  if (!res.ok) {
    const permission = res.status === 403 || res.status === 401 ? permissionFor(url) : null;
    return { ok: false, status: res.status, error: `HTTP ${res.status}`, permission };
  }
  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: 'unparseable response' };
  }
}

/** Lists every object, page by page, keeping only what tallyObjects() needs. */
export async function listAllObjects(bucket, accessToken, { withAcl }, fetchImpl) {
  const fields = withAcl
    ? 'items(name,metadata,acl(entity)),nextPageToken'
    : 'items(name,metadata),nextPageToken';
  const pages = [];
  let pageToken = '';
  for (let guard = 0; guard < 100000; guard += 1) {
    const params = new URLSearchParams({ maxResults: '1000', fields });
    if (withAcl) params.set('projection', 'full');
    if (pageToken) params.set('pageToken', pageToken);
    const read = await readJson(
      `${GCS}/b/${encodeURIComponent(bucket)}/o?${params}`,
      accessToken,
      fetchImpl,
    );
    if (!read.ok) return { ok: false, error: read.error, permission: read.permission };
    // Reduce immediately: token VALUES do not outlive this line.
    pages.push({
      items: (read.data?.items ?? []).map((item) => ({
        name: item?.name,
        metadata: hasToken(item) ? { [TOKEN_KEY]: 'present' } : {},
        acl: (item?.acl ?? []).map((entry) => ({ entity: entry?.entity })),
      })),
    });
    pageToken = read.data?.nextPageToken ?? '';
    if (!pageToken) return { ok: true, tally: tallyObjects(pages, { checkObjectAcl: withAcl }) };
  }
  return { ok: false, error: 'listing did not terminate' };
}

export async function certify({ accessToken, fetchImpl = globalThis.fetch }) {
  const bucketRead = await readJson(
    `${GCS}/b/${encodeURIComponent(EXPECTED_BUCKET)}?projection=full`,
    accessToken,
    fetchImpl,
  );
  const iamRead = await readJson(
    `${GCS}/b/${encodeURIComponent(EXPECTED_BUCKET)}/iam`,
    accessToken,
    fetchImpl,
  );
  const projectRead = await readJson(
    `${CRM}/projects/${EXPECTED_PROJECT_ID}`,
    accessToken,
    fetchImpl,
  );

  const ubla =
    bucketRead.ok && bucketRead.data?.iamConfiguration?.uniformBucketLevelAccess?.enabled;
  const listing = bucketRead.ok
    ? await listAllObjects(EXPECTED_BUCKET, accessToken, { withAcl: !ubla }, fetchImpl)
    : { ok: false, error: 'bucket metadata unavailable' };

  const results = [
    ...evaluateBucket({ bucketRead, iamRead, projectRead }),
    ...evaluateInventory(listing, { objectAclChecked: bucketRead.ok && !ubla }),
  ];
  return {
    project: EXPECTED_PROJECT_ID,
    bucket: EXPECTED_BUCKET,
    observedAt: new Date().toISOString(),
    objectCount: listing.ok ? listing.tally.total : null,
    results,
    verdict: verdict(results),
  };
}

export function resolveAccessToken(env = process.env) {
  const fromEnv = String(env.GCS_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    // Owner-run fallback: the operator's own gcloud login. Nothing is stored.
    return execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function formatReport(report) {
  const lines = [
    `P0-07 live bucket certification — ${report.bucket} (${report.project})`,
    `observed: ${report.observedAt}; objects inventoried: ${report.objectCount ?? 'UNOBSERVED'}`,
    '',
  ];
  for (const r of report.results) {
    lines.push(`${r.status.padEnd(12)} ${r.id}: ${r.detail}`);
  }
  lines.push('');
  lines.push(
    report.verdict.certified
      ? 'VERDICT: CERTIFIED'
      : `VERDICT: NOT CERTIFIED (${report.verdict.failures} fail, ` +
          `${report.verdict.ownerActions} owner action)`,
  );
  return lines.join('\n');
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  const run = async () => {
    const json = process.argv.includes('--json');
    const accessToken = resolveAccessToken();
    if (!accessToken) {
      console.error(
        'P0-07: no Google access token (GCS_ACCESS_TOKEN unset and `gcloud auth ' +
          'print-access-token` unavailable). Refusing to report anything: nothing was observed.',
      );
      process.exitCode = 2;
      return;
    }
    const report = await certify({ accessToken });
    console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exitCode = report.verdict.certified ? 0 : 1;
  };
  run().catch((error) => {
    // Never the error object: a transport error could carry request details.
    console.error(`P0-07 verifier failed closed: ${error?.name ?? 'Error'}`);
    process.exitCode = 1;
  });
}
