import fs from 'fs';
import path from 'path';

/**
 * P0-07 — the storage certification reader is assumable only by this repository on
 * `refs/heads/main`, and that is enforced at the GOOGLE boundary, not by workflow source.
 *
 * `scripts/verify-storage-reader-trust.mjs` decides, from the owner's read-only inspection
 * output, whether the exact-subject binding is sound (subjects are pool-scoped, GitHub uses
 * the default `sub` template, nothing else can impersonate the reader). These tests pin its
 * truth table, and pin the workflow and runbook so neither can drift back to a
 * repository-only principal or to treating the ref check as the trust boundary.
 */

import * as t from '@/scripts/verify-storage-reader-trust.mjs';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const POOL = 'projects/111222333/locations/global/workloadIdentityPools/p007-storage-cert';
const PROVIDER = `${POOL}/providers/github-main`;
const MEMBER = `principal://iam.googleapis.com/${POOL}/subject/1087507601`;
const REPO = {
  id: 1087507601,
  full_name: 'lacreativodesign/nextjs-boilerplate',
  owner: { id: 240409176, login: 'lacreativodesign', type: 'User' },
};

const githubProvider = (extra: Record<string, unknown> = {}) => ({
  name: PROVIDER,
  state: 'ACTIVE',
  oidc: { issuerUri: 'https://token.actions.githubusercontent.com/' },
  attributeMapping: {
    'google.subject': 'assertion.repository_id',
    'attribute.repository_id': 'assertion.repository_id',
    'attribute.repository_owner_id': 'assertion.repository_owner_id',
    'attribute.ref': 'assertion.ref',
  },
  attributeCondition:
    "assertion.repository_id == '1087507601' && assertion.repository_owner_id == '240409176' && assertion.ref == 'refs/heads/main'",
  ...extra,
});

const pool = (overrides: Record<string, unknown> = {}) =>
  t.evaluatePool({
    workflowProvider: PROVIDER,
    providers: [githubProvider()],
    repositoryMetadata: REPO,
    ...overrides,
  });

describe('reader trust: the dedicated immutable-ID provider', () => {
  it('pins the immutable repository, owner and main-ref controls', () => {
    expect(t.REPOSITORY).toBe('lacreativodesign/nextjs-boilerplate');
    expect(t.REPOSITORY_ID).toBe('1087507601');
    expect(t.REPOSITORY_OWNER_ID).toBe('240409176');
    expect(t.MAIN_REF).toBe('refs/heads/main');
    expect(t.WIF_POOL_ID).toBe('p007-storage-cert');
    expect(t.WIF_PROVIDER_ID).toBe('github-main');
    expect(t.EXPECTED_PROVIDER_CONDITION).toContain("assertion.repository_id == '1087507601'");
    expect(t.EXPECTED_PROVIDER_CONDITION).toContain("assertion.repository_owner_id == '240409176'");
    expect(t.EXPECTED_PROVIDER_CONDITION).toContain("assertion.ref == 'refs/heads/main'");
  });

  it('binds one exact pool subject based on the immutable repository ID', () => {
    const parsed = t.parseProvider(PROVIDER);
    expect(parsed).toEqual({ projectNumber: '111222333', poolId: 'p007-storage-cert', providerId: 'github-main' });
    expect(t.exactSubjectMember(parsed)).toBe(MEMBER);
    expect(t.bindCommand(MEMBER)).toContain(`--member="${MEMBER}"`);
    expect(t.bindCommand(MEMBER)).not.toMatch(/principalSet|keys create/);
  });

  it.each([
    ['empty', ''],
    ['pool only', POOL],
    ['wrong location', PROVIDER.replace('/global/', '/us-central1/')],
    ['project id instead of number', PROVIDER.replace('111222333', 'la-creativo-erp')],
    ['trailing junk', `${PROVIDER}/extra`],
  ])('rejects a provider resource that is %s', (_label, resource) => {
    expect(t.parseProvider(resource)).toBeNull();
    expect(pool({ workflowProvider: resource }).ok).toBe(false);
  });
});

describe('reader trust: evaluatePool', () => {
  it('is safe only for the one dedicated provider with the certified immutable-ID mapping and condition', () => {
    expect(pool()).toEqual({ ok: true, reasons: [], member: MEMBER, pool: POOL });
  });

  it.each([
    ['shared/different pool', PROVIDER.replace('p007-storage-cert', 'github-pool'), [githubProvider()], REPO, /dedicated/],
    ['different provider id', PROVIDER.replace('github-main', 'github'), [githubProvider()], REPO, /dedicated/],
    ['no provider', PROVIDER, [], REPO, /exactly one provider/],
    ['two providers', PROVIDER, [githubProvider(), { ...githubProvider(), name: `${POOL}/providers/extra` }], REPO, /exactly one provider/],
  ])('STOPs for %s', (_label, workflowProvider, providers, repositoryMetadata, reason) => {
    const result = pool({ workflowProvider, providers, repositoryMetadata });
    expect(result.ok).toBe(false);
    expect(result.member).toBeUndefined();
    expect(result.reasons.join('\n')).toMatch(reason);
  });

  it.each([
    ['non-GitHub issuer', { oidc: { issuerUri: 'https://gitlab.com' } }, /GitHub Actions OIDC/],
    ['subject uses mutable sub', { attributeMapping: { 'google.subject': 'assertion.sub' } }, /certified four mappings|google.subject/],
    ['missing owner-id mapping', { attributeMapping: {
      'google.subject': 'assertion.repository_id',
      'attribute.repository_id': 'assertion.repository_id',
      'attribute.ref': 'assertion.ref',
    } }, /certified four mappings|attribute.repository_owner_id/],
    ['weakened branch condition', { attributeCondition: "assertion.repository_id == '1087507601'" }, /condition must exactly require/],
    ['wrong repository id in condition', { attributeCondition: "assertion.repository_id == '999' && assertion.repository_owner_id == '240409176' && assertion.ref == 'refs/heads/main'" }, /condition must exactly require/],
    ['wrong owner id in condition', { attributeCondition: "assertion.repository_id == '1087507601' && assertion.repository_owner_id == '999' && assertion.ref == 'refs/heads/main'" }, /condition must exactly require/],
  ])('STOPs for %s', (_label, extra, reason) => {
    const result = pool({ providers: [githubProvider(extra)] });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(reason);
  });

  it.each([
    ['wrong repository full_name', { ...REPO, full_name: 'attacker/repo' }, /full_name/],
    ['wrong immutable repository id', { ...REPO, id: 999 }, /repository ID/],
    ['missing repository id', { ...REPO, id: undefined }, /repository ID/],
    ['wrong immutable owner id', { ...REPO, owner: { ...REPO.owner, id: 999 } }, /owner ID/],
    ['missing owner id', { ...REPO, owner: { ...REPO.owner, id: undefined } }, /owner ID/],
  ])('STOPs when GitHub repository metadata is %s', (_label, repositoryMetadata, reason) => {
    const result = pool({ repositoryMetadata });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(reason);
  });

  it('does not depend on GitHub legacy-vs-immutable default sub formatting', () => {
    const provider = githubProvider();
    expect(provider.attributeMapping['google.subject']).toBe('assertion.repository_id');
    expect(JSON.stringify(provider)).not.toMatch(/use_immutable_subject|use_default|assertion\.sub/);
  });
});
describe('reader trust: evaluateReaderPolicies (fact 3)', () => {
  const saPolicy = (bindings: unknown[]) => ({ bindings, etag: 'x' });
  const exact = () => ({ role: 'roles/iam.workloadIdentityUser', members: [MEMBER] });
  const cleanProject = () => ({
    bindings: [
      { role: 'roles/owner', members: ['user:owner@example.com'] },
      {
        role: 'roles/iam.serviceAccountTokenCreator',
        members: ['serviceAccount:ci@example.iam.gserviceaccount.com'],
      },
    ],
  });

  it('VERIFIES exactly one unconditional binding to the exact subject and a clean project', () => {
    expect(
      t.evaluateReaderPolicies({
        member: MEMBER,
        serviceAccountPolicy: saPolicy([exact()]),
        projectPolicy: cleanProject(),
      }),
    ).toEqual({ ok: true, reasons: [] });
  });

  it.each([
    [
      'the repository-only principalSet',
      [
        {
          role: 'roles/iam.workloadIdentityUser',
          members: [
            `principalSet://iam.googleapis.com/${POOL}/attribute.repository/lacreativodesign/nextjs-boilerplate`,
          ],
        },
      ],
      /1 of them principalSet/,
    ],
    [
      'the exact subject PLUS a repository principalSet (IAM ORs them)',
      [
        {
          role: 'roles/iam.workloadIdentityUser',
          members: [
            MEMBER,
            `principalSet://iam.googleapis.com/${POOL}/attribute.repository/lacreativodesign/nextjs-boilerplate`,
          ],
        },
      ],
      /has 2 member\(s\), 1 of them principalSet/,
    ],
    [
      'a second binding carrying a ref principalSet',
      [
        exact(),
        {
          role: 'roles/iam.workloadIdentityUser',
          members: [`principalSet://iam.googleapis.com/${POOL}/attribute.ref/refs/heads/main`],
        },
      ],
      /has 2 member\(s\)/,
    ],
    [
      'a subject for another repository id',
      [
        {
          role: 'roles/iam.workloadIdentityUser',
          members: [MEMBER.replace('1087507601', '999999999')],
        },
      ],
      /exactly one member, the exact subject/,
    ],
    [
      'the same subject in another pool',
      [
        {
          role: 'roles/iam.workloadIdentityUser',
          members: [MEMBER.replace('github-pool', 'other-pool')],
        },
      ],
      /exactly one member, the exact subject/,
    ],
    ['no workloadIdentityUser binding', [], /has 0 member\(s\)/],
    [
      'an extra token-creator grant on the reader',
      [
        exact(),
        { role: 'roles/iam.serviceAccountTokenCreator', members: ['user:someone@example.com'] },
      ],
      /also grants roles\/iam\.serviceAccountTokenCreator/,
    ],
    [
      'a conditional binding',
      [
        {
          ...exact(),
          condition: { expression: 'request.time < timestamp("2099-01-01T00:00:00Z")', title: 't' },
        },
      ],
      /carries an IAM condition/,
    ],
  ])('is NOT VERIFIED with %s', (_label, bindings, reason) => {
    const result = t.evaluateReaderPolicies({
      member: MEMBER,
      serviceAccountPolicy: saPolicy(bindings),
      projectPolicy: cleanProject(),
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(reason);
  });

  it('is NOT VERIFIED without the reader policy', () => {
    expect(
      t.evaluateReaderPolicies({
        member: MEMBER,
        serviceAccountPolicy: undefined,
        projectPolicy: cleanProject(),
      }).ok,
    ).toBe(false);
    expect(
      t.evaluateReaderPolicies({
        member: MEMBER,
        serviceAccountPolicy: {},
        projectPolicy: cleanProject(),
      }).ok,
    ).toBe(false);
  });

  it.each([
    'roles/iam.workloadIdentityUser',
    'roles/iam.serviceAccountTokenCreator',
    'roles/iam.serviceAccountOpenIdTokenCreator',
    'roles/iam.serviceAccountUser',
  ])('is NOT VERIFIED when project-level %s is granted to a federated principal', (role) => {
    for (const member of [
      `principalSet://iam.googleapis.com/${POOL}/*`,
      `principal://iam.googleapis.com/${POOL}/subject/anything`,
    ]) {
      const projectPolicy = {
        bindings: [...cleanProject().bindings, { role, members: ['user:a@example.com', member] }],
      };
      const result = t.evaluateReaderPolicies({
        member: MEMBER,
        serviceAccountPolicy: saPolicy([exact()]),
        projectPolicy,
      });
      expect(result.ok).toBe(false);
      expect(result.reasons.join('\n')).toContain(
        `Project-level ${role} is granted to a federated principal`,
      );
    }
  });

  it('never echoes a member identity into its reasons', () => {
    const secretish = `principalSet://iam.googleapis.com/${POOL}/attribute.repository/someone-else/private-repo`;
    const result = t.evaluateReaderPolicies({
      member: MEMBER,
      serviceAccountPolicy: saPolicy([
        {
          role: 'roles/iam.workloadIdentityUser',
          members: [secretish, 'user:jane.doe@example.com'],
        },
        { role: 'roles/viewer', members: ['user:jane.doe@example.com'] },
      ]),
      projectPolicy: { bindings: [{ role: 'roles/iam.serviceAccountUser', members: [secretish] }] },
    });
    const text = result.reasons.join('\n');
    expect(result.ok).toBe(false);
    expect(text).not.toMatch(/jane\.doe|someone-else|private-repo|principalSet:\/\//);
  });
});

describe('reader trust: workflow boundary', () => {
  const wf = read('.github/workflows/storage-bucket-certification.yml');
  const job = wf.slice(wf.indexOf('\njobs:'));

  it('declares no environment and never runs on pull_request', () => {
    expect(job).not.toMatch(/^\s+environment:/m);
    const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'));
    expect(on).not.toMatch(/pull_request|workflow_run|repository_dispatch/);
    expect(on).toMatch(/branches: \[main\]/);
  });

  it('requires the dedicated provider variable and never falls back to the shared provider', () => {
    expect(wf).toContain('workload_identity_provider: ${{ vars.GCP_STORAGE_CERT_WIF_PROVIDER }}');
    expect(wf).not.toContain('GCP_WORKLOAD_IDENTITY_PROVIDER');
    expect(wf).not.toMatch(/credentials_json|GOOGLE_APPLICATION_CREDENTIALS|secrets\./);
  });

  it('documents the immutable repository-id plus provider-condition boundary', () => {
    expect(wf).toContain('repository ID 1087507601');
    expect(wf).toContain('owner ID 240409176');
    expect(wf).toContain('refs/heads/main');
    expect(wf).toMatch(/defence in depth only/);
    expect(wf).toMatch(/does not depend on GitHub.*sub/i);
  });
});
describe('reader trust: owner runbook', () => {
  const doc = read('docs/security/p0-07-firebase-storage-certification.md');
  const s9 = doc.slice(doc.indexOf('## 9.'), doc.indexOf('## 10.'));
  const commands = [...s9.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');

  it('creates one dedicated provider using immutable GitHub IDs plus main ref', () => {
    expect(commands).toMatch(/workload-identity-pools create p007-storage-cert/);
    expect(commands).toMatch(/providers create-oidc github-main/);
    expect(commands).toContain('google.subject=assertion.repository_id');
    expect(commands).toContain('attribute.repository_owner_id=assertion.repository_owner_id');
    expect(commands).toContain("assertion.repository_id == '1087507601'");
    expect(commands).toContain("assertion.repository_owner_id == '240409176'");
    expect(commands).toContain("assertion.ref == 'refs/heads/main'");
    expect(s9).toMatch(/does not depend on GitHub.*sub/i);
  });

  it('checks current GitHub repository metadata and the provider before binding', () => {
    expect(commands).toMatch(/gh api .*repos\/lacreativodesign\/nextjs-boilerplate.*> repo\.json/);
    expect(commands).toMatch(/providers list[\s\S]*> providers\.json/);
    expect(commands).toMatch(/--providers=providers\.json --repo=repo\.json/);
  });

  it('binds only the immutable repository-id subject in the dedicated pool', () => {
    expect(commands).toContain('/workloadIdentityPools/p007-storage-cert/subject/1087507601');
    expect(commands).not.toMatch(/attribute\.repository\/lacreativodesign/);
    expect(commands).not.toMatch(/subject\/repo:lacreativodesign/);
  });

  it('verifies the reader binding with both service-account and project policies', () => {
    expect(commands).toMatch(/--sa-policy=reader-policy\.json --project-policy=project-policy\.json/);
    expect(s9).toMatch(/Must print `VERIFIED`/);
  });

  it('grants only the certified read permissions and never creates a key', () => {
    expect(commands).toContain(
      '--permissions=storage.buckets.get,storage.buckets.getIamPolicy,storage.objects.list,storage.objects.getIamPolicy',
    );
    expect(commands).not.toMatch(/storage\.objects\.(get|create|update|delete)(,|\s|$)/);
    expect(commands).not.toMatch(/setIamPolicy|roles\/storage\.|keys create/);
  });

  it('sets only the dedicated provider and reader repository variables', () => {
    expect(commands).toContain('GCP_STORAGE_CERT_WIF_PROVIDER');
    expect(commands).toContain('GCP_STORAGE_CERT_READER_SA');
    expect(commands).not.toContain('GCP_WORKLOAD_IDENTITY_PROVIDER');
  });
});
