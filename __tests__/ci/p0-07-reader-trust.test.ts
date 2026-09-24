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

const POOL = 'projects/111222333/locations/global/workloadIdentityPools/github-pool';
const PROVIDER = `${POOL}/providers/github`;
const MEMBER = `principal://iam.googleapis.com/${POOL}/subject/repo:lacreativodesign/nextjs-boilerplate:ref:refs/heads/main`;

const githubProvider = (name = PROVIDER, extra: Record<string, unknown> = {}) => ({
  name,
  state: 'ACTIVE',
  oidc: { issuerUri: 'https://token.actions.githubusercontent.com' },
  attributeMapping: {
    'google.subject': 'assertion.sub',
    'attribute.repository': 'assertion.repository',
  },
  ...extra,
});

const pool = (overrides: Record<string, unknown> = {}) =>
  t.evaluatePool({
    workflowProvider: PROVIDER,
    providers: [githubProvider()],
    oidcSubjectCustomization: { use_default: true },
    ...overrides,
  });

describe('reader trust: the selected member', () => {
  it('is the exact GitHub OIDC subject for this repository on main', () => {
    expect(t.EXPECTED_SUBJECT).toBe('repo:lacreativodesign/nextjs-boilerplate:ref:refs/heads/main');
    expect(t.GITHUB_ISSUER).toBe('https://token.actions.githubusercontent.com');
    expect(t.READER_SA).toBe('storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com');
  });

  it('is a principal:// subject in the workflow provider pool, never a principalSet', () => {
    const parsed = t.parseProvider(PROVIDER);
    expect(parsed).toEqual({
      projectNumber: '111222333',
      poolId: 'github-pool',
      providerId: 'github',
    });
    expect(t.exactSubjectMember(parsed)).toBe(MEMBER);
    expect(t.exactSubjectMember(parsed)).not.toMatch(/principalSet|attribute\./);
  });

  it.each([
    ['empty', ''],
    ['pool only', POOL],
    ['wrong location', PROVIDER.replace('/global/', '/us-central1/')],
    ['project id instead of number', PROVIDER.replace('111222333', 'la-creativo-erp')],
    ['trailing junk', `${PROVIDER}/extra`],
  ])('rejects a provider resource that is %s', (_label, resource) => {
    expect(t.parseProvider(resource)).toBeNull();
    const result = pool({ workflowProvider: resource });
    expect(result.ok).toBe(false);
    expect(result.member).toBeUndefined();
  });

  it('prints only the exact-subject binding for the reader', () => {
    const cmd = t.bindCommand(MEMBER);
    expect(cmd).toContain('storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com');
    expect(cmd).toContain('--role="roles/iam.workloadIdentityUser"');
    expect(cmd).toContain(`--member="${MEMBER}"`);
    expect(cmd).not.toMatch(/principalSet|keys create/);
  });
});

describe('reader trust: evaluatePool (facts 1 and 2)', () => {
  it('is POOL SAFE only for an all-GitHub pool mapping google.subject to assertion.sub, with the default template', () => {
    const result = pool({
      providers: [githubProvider(), githubProvider(`${POOL}/providers/github-two`)],
    });
    expect(result).toEqual({ ok: true, reasons: [], member: MEMBER, pool: POOL });
  });

  it.each([
    [
      'another OIDC issuer in the pool',
      [
        githubProvider(),
        githubProvider(`${POOL}/providers/gitlab`, { oidc: { issuerUri: 'https://gitlab.com' } }),
      ],
      /trusts issuer https:\/\/gitlab\.com/,
    ],
    [
      'an AWS provider in the pool',
      [
        githubProvider(),
        {
          name: `${POOL}/providers/aws`,
          state: 'ACTIVE',
          aws: { accountId: '1' },
          attributeMapping: { 'google.subject': 'assertion.arn' },
        },
      ],
      /not an OIDC provider/,
    ],
    [
      'a SAML provider in the pool',
      [
        githubProvider(),
        {
          name: `${POOL}/providers/saml`,
          state: 'ACTIVE',
          saml: {},
          attributeMapping: { 'google.subject': 'assertion.subject' },
        },
      ],
      /not an OIDC provider/,
    ],
    [
      'a CEL google.subject mapping',
      [
        githubProvider(PROVIDER, {
          attributeMapping: { 'google.subject': "assertion.sub + ':x'" },
        }),
      ],
      /maps google\.subject to/,
    ],
    [
      'google.subject mapped to the repository',
      [
        githubProvider(PROVIDER, {
          attributeMapping: { 'google.subject': 'assertion.repository' },
        }),
      ],
      /maps google\.subject to "assertion\.repository"/,
    ],
    [
      'no google.subject mapping',
      [githubProvider(PROVIDER, { attributeMapping: {} })],
      /maps google\.subject to null/,
    ],
    [
      'a DISABLED non-GitHub provider (re-enabling is one call)',
      [
        githubProvider(),
        githubProvider(`${POOL}/providers/old`, {
          state: 'ACTIVE',
          disabled: true,
          oidc: { issuerUri: 'https://accounts.example.com' },
        }),
      ],
      /providers\/old trusts issuer/,
    ],
    [
      'a provider from another pool in the listing',
      [
        githubProvider(),
        githubProvider(
          'projects/111222333/locations/global/workloadIdentityPools/other/providers/github',
        ),
      ],
      /is not in pool/,
    ],
    [
      'the workflow provider missing from the listing',
      [githubProvider(`${POOL}/providers/github-two`)],
      /workflow provider does not appear/,
    ],
    ['an empty listing', [], /No providers were listed/],
    ['a listing that is not an array', { providers: [] }, /No providers were listed/],
  ])('STOPs for %s', (_label, providers, reason) => {
    const result = pool({ providers });
    expect(result.ok).toBe(false);
    expect(result.member).toBeUndefined();
    expect(result.reasons.join('\n')).toMatch(reason);
  });

  it.each([
    [
      'use_default false (custom claim keys)',
      { use_default: false, include_claim_keys: ['repo', 'context'] },
    ],
    ['use_default false (organisation template)', { use_default: false }],
    ['use_default missing', {}],
    ['use_default as a string', { use_default: 'true' }],
    ['no customization response', null],
  ])('STOPs when the GitHub subject template is not the default: %s', (_label, custom) => {
    const result = pool({ oidcSubjectCustomization: custom });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/use_default: true/);
  });

  it('reports every failed fact, not just the first', () => {
    const result = pool({
      providers: [
        githubProvider(PROVIDER, {
          oidc: { issuerUri: 'https://x.example' },
          attributeMapping: {},
        }),
      ],
      oidcSubjectCustomization: { use_default: false },
    });
    expect(result.reasons).toHaveLength(3);
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
      'a subject for another branch',
      [
        {
          role: 'roles/iam.workloadIdentityUser',
          members: [MEMBER.replace('refs/heads/main', 'refs/heads/dev')],
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

describe('reader trust: the workflow does not rely on itself for the boundary', () => {
  const wf = read('.github/workflows/storage-bucket-certification.yml');
  const job = wf.slice(wf.indexOf('\njobs:'));

  it('declares no environment (an environment changes the OIDC sub and IAM refuses it)', () => {
    expect(job).not.toMatch(/^\s+environment:/m);
  });

  it('runs only on main-ref events and never on pull_request', () => {
    const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'));
    expect(on).not.toMatch(/pull_request|workflow_run|repository_dispatch/);
    expect(on).toMatch(/branches: \[main\]/);
  });

  it('names the exact subject as the boundary and the ref check as defence in depth only', () => {
    expect(wf).toContain('subject/repo:lacreativodesign/nextjs-boilerplate:ref:refs/heads/main');
    expect(wf).toMatch(/defence in depth only/);
    expect(wf).toMatch(/cannot be the trust boundary/);
    expect(wf).toMatch(/repository-only principalSet binding is NOT branch-restricted/);
    expect(wf).not.toMatch(/matching the ref-restricted IAM binding/);
  });

  it('authenticates keylessly through the dedicated provider when set, else the shared one', () => {
    expect(wf).toContain(
      'workload_identity_provider: ${{ vars.GCP_STORAGE_CERT_WIF_PROVIDER || vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}',
    );
    expect(wf).not.toMatch(/credentials_json|GOOGLE_APPLICATION_CREDENTIALS|secrets\./);
  });
});

describe('reader trust: the owner runbook', () => {
  const doc = read('docs/security/p0-07-firebase-storage-certification.md');
  const s9 = doc.slice(doc.indexOf('## 9.'), doc.indexOf('## 10.'));
  const commands = [...s9.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');

  it('binds the reader to the exact subject, never to a repository or ref principalSet', () => {
    expect(commands).toContain(
      '--member="principal://iam.googleapis.com/projects/${POOL_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/subject/repo:lacreativodesign/nextjs-boilerplate:ref:refs/heads/main"',
    );
    expect(commands).not.toMatch(/principalSet:\/\//);
    expect(commands).not.toMatch(/attribute\.(repository|ref)\//);
  });

  it('inspects the provider pool and GitHub subject template before any binding', () => {
    const inspect = commands.indexOf('providers list');
    const oidc = commands.indexOf('actions/oidc/customization/sub');
    const evaluate = commands.indexOf('node scripts/verify-storage-reader-trust.mjs');
    const firstBind = commands.indexOf('add-iam-policy-binding');
    const create = commands.indexOf('service-accounts create');
    for (const i of [inspect, oidc, evaluate, firstBind, create]) expect(i).toBeGreaterThan(-1);
    expect(Math.max(inspect, oidc, evaluate)).toBeLessThan(Math.min(firstBind, create));
  });

  it('verifies the binding after it is made, with both policies', () => {
    expect(commands).toMatch(
      /--sa-policy=reader-policy\.json --project-policy=project-policy\.json/,
    );
    expect(s9).toMatch(/Must print `VERIFIED`/);
  });

  it('grants the reader the object-ACL read permission and nothing that writes', () => {
    expect(commands).toContain(
      '--permissions=storage.buckets.get,storage.buckets.getIamPolicy,storage.objects.list,storage.objects.getIamPolicy',
    );
    expect(commands).not.toMatch(/storage\.objects\.(get|create|update|delete)(,|\s|$)/);
    expect(commands).not.toMatch(/setIamPolicy|roles\/storage\./);
  });

  it('never creates a service-account key and leaves the shared provider alone', () => {
    expect(commands).not.toMatch(/keys create/);
    expect(commands).not.toMatch(/providers update-oidc|providers update/);
    expect(s9).toMatch(/The shared provider is not modified/);
    expect(s9).toMatch(/do not edit the shared provider/);
  });

  it('fails closed to a dedicated pool whose provider condition requires repository AND main', () => {
    expect(commands).toContain(
      `--attribute-condition="assertion.repository == 'lacreativodesign/nextjs-boilerplate' && assertion.ref == 'refs/heads/main'"`,
    );
    expect(commands).toMatch(/--attribute-mapping="google\.subject=assertion\.sub,/);
    expect(commands).toMatch(/workload-identity-pools create p007-storage-cert/);
  });
});
