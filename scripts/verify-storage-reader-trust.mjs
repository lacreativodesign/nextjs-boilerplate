#!/usr/bin/env node
/**
 * P0-07 — prove, at the GOOGLE side, that the storage certification reader can be assumed
 * only by `lacreativodesign/nextjs-boilerplate` running on `refs/heads/main`.
 *
 * WHY THIS EXISTS
 *
 * `storage-cert-reader` can list production object metadata. The first runbook bound it to
 * `principalSet://…/attribute.repository/lacreativodesign/nextjs-boilerplate`. That is
 * REPOSITORY scope only: any branch, any pull-request workflow edited on a branch, any
 * dispatch from a feature ref could federate as the reader, and the workflow's own
 * `github.ref` guard lives in branch-controlled source, so it is defence in depth, never
 * the trust boundary.
 *
 * Two principalSet bindings (one per attribute) do not fix it: IAM ORs bindings, so
 * `attribute.repository/X` + `attribute.ref/refs/heads/main` admits X on any branch AND
 * main of any repository the provider admits. P0-07 therefore uses a DEDICATED pool with
 * exactly one GitHub provider. `google.subject` is the immutable numeric repository ID, while
 * the provider condition independently requires the immutable owner ID and `refs/heads/main`.
 * GitHub's legacy-vs-immutable default `sub` format is irrelevant to this trust boundary.
 *
 * That binding is only as sound as three facts, and this script checks each from the
 * owner's read-only inspection output instead of assuming it:
 *
 *   1. SUBJECTS ARE POOL-SCOPED. A `principal://…/subject/S` member matches S from ANY
 *      provider in the pool. So every provider in the pool — disabled ones included, since
 *      re-enabling is one call — must be GitHub-issued
 *      (`https://token.actions.githubusercontent.com`) and map `google.subject` to the immutable
 *      GitHub repository ID. The dedicated provider must also
 *      enforce that repository ID, the immutable owner ID and `refs/heads/main` before token
 *      exchange. This deliberately does not depend on GitHub's mutable/immutable `sub` format.
 *   2. THE POOL IS DEDICATED: exactly one provider (`github-main`) exists in
 *      `p007-storage-cert`; no shared-provider subject collision can appear later unnoticed.
 *   3. NOTHING ELSE MAY IMPERSONATE THE READER: its own IAM policy must hold exactly one
 *      binding, workloadIdentityUser → that one principal; and no project-level binding may
 *      grant a FEDERATED principal the right to act as every service account.
 *
 * Any failed check is STOP: do not bind, do not widen, and never "fix" it by editing the
 * dedicated provider to weaken its repository/owner/ref boundary. The owner commands are in
 * docs/security/p0-07-firebase-storage-certification.md §9.
 *
 * READ-ONLY: this script makes no network call and changes nothing. It reads JSON files the
 * owner produced with `gcloud … list/get-iam-policy` and `gh api repos/...`.
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'lacreativodesign/nextjs-boilerplate';
export const REPOSITORY_ID = '1087507601';
export const REPOSITORY_OWNER_ID = '240409176';
export const MAIN_REF = 'refs/heads/main';
export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
export const WIF_POOL_ID = 'p007-storage-cert';
export const WIF_PROVIDER_ID = 'github-main';
export const READER_SA = 'storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com';
export const EXPECTED_PROVIDER_CONDITION =
  "assertion.repository_id == '1087507601' && " +
  "assertion.repository_owner_id == '240409176' && " +
  "assertion.ref == 'refs/heads/main'";

const PROVIDER_RE =
  /^projects\/(\d+)\/locations\/global\/workloadIdentityPools\/([a-z0-9-]+)\/providers\/([a-z0-9-]+)$/;

/** Parses the provider resource name the workflow authenticates through. */
export function parseProvider(resource) {
  const match = PROVIDER_RE.exec(String(resource ?? '').trim());
  if (!match) return null;
  return { projectNumber: match[1], poolId: match[2], providerId: match[3] };
}

export function poolResource({ projectNumber, poolId }) {
  return `projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}`;
}

/** The one member the reader may be bound to. The main-ref restriction is provider-side. */
export function exactSubjectMember(parsed) {
  return 'principal://iam.googleapis.com/' + poolResource(parsed) + '/subject/' + REPOSITORY_ID;
}

/**
 * Checks facts 1 and 2. Returns `{ ok, reasons, member }`; `member` only when ok.
 */
export function evaluatePool({ workflowProvider, providers, repositoryMetadata }) {
  const reasons = [];
  const parsed = parseProvider(workflowProvider);
  if (!parsed) {
    return {
      ok: false,
      reasons: [
        'The workflow provider is not a full resource name of the form ' +
          'projects/<N>/locations/global/workloadIdentityPools/<POOL>/providers/<ID>.',
      ],
    };
  }

  const pool = poolResource(parsed);
  if (parsed.poolId !== WIF_POOL_ID || parsed.providerId !== WIF_PROVIDER_ID) {
    reasons.push(
      'Storage certification must use the dedicated ' +
        WIF_POOL_ID +
        '/' +
        WIF_PROVIDER_ID +
        ' provider, not a shared provider.',
    );
  }

  const list = Array.isArray(providers) ? providers : [];
  if (list.length !== 1) {
    reasons.push(
      'The dedicated pool must contain exactly one provider; observed ' + list.length + '.',
    );
  }
  const provider = list[0];
  if (!provider || String(provider.name ?? '') !== String(workflowProvider).trim()) {
    reasons.push('The one provider in the dedicated pool must be the workflow provider.');
  } else {
    if (
      !provider.oidc ||
      String(provider.oidc.issuerUri ?? '').replace(/\/$/, '') !== GITHUB_ISSUER
    ) {
      reasons.push('The dedicated provider must trust only GitHub Actions OIDC.');
    }
    const mapping = provider.attributeMapping ?? {};
    const expected = {
      'google.subject': 'assertion.repository_id',
      'attribute.repository_id': 'assertion.repository_id',
      'attribute.repository_owner_id': 'assertion.repository_owner_id',
      'attribute.ref': 'assertion.ref',
    };
    const keys = Object.keys(mapping).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      reasons.push(
        'The dedicated provider attribute mapping must contain exactly the certified four mappings.',
      );
    }
    for (const [key, value] of Object.entries(expected)) {
      if (mapping[key] !== value) reasons.push(key + ' must map exactly to ' + value + '.');
    }
    const normalizedCondition = String(provider.attributeCondition ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    const expectedCondition = EXPECTED_PROVIDER_CONDITION.replace(/\s+/g, ' ').trim();
    if (normalizedCondition !== expectedCondition) {
      reasons.push(
        'The provider condition must exactly require the immutable repository ID, owner ID and main ref.',
      );
    }
  }

  const repo = repositoryMetadata ?? {};
  if (String(repo.full_name ?? '') !== REPOSITORY) {
    reasons.push('GitHub repository full_name does not match the certified repository.');
  }
  if (String(repo.id ?? '') !== REPOSITORY_ID) {
    reasons.push('GitHub repository ID does not match the certified immutable repository ID.');
  }
  if (String(repo.owner?.id ?? '') !== REPOSITORY_OWNER_ID) {
    reasons.push('GitHub owner ID does not match the certified immutable owner ID.');
  }

  return reasons.length
    ? { ok: false, reasons }
    : { ok: true, reasons: [], member: exactSubjectMember(parsed), pool };
}
const FEDERATED = /^principal(Set)?:\/\//;
/** Project-level roles that let a principal act as EVERY service account in the project. */
const IMPERSONATION_ROLES = new Set([
  'roles/iam.workloadIdentityUser',
  'roles/iam.serviceAccountTokenCreator',
  'roles/iam.serviceAccountOpenIdTokenCreator',
  'roles/iam.serviceAccountUser',
]);

/**
 * Checks fact 3 once the binding exists: the reader's policy is exactly the one binding,
 * and no project-level binding hands a federated principal every service account.
 * Reports roles and counts only — never member identities.
 */
export function evaluateReaderPolicies({ member, serviceAccountPolicy, projectPolicy }) {
  const reasons = [];
  const bindings = Array.isArray(serviceAccountPolicy?.bindings)
    ? serviceAccountPolicy.bindings
    : null;
  if (!bindings) {
    reasons.push('The reader service account policy was not provided or has no bindings.');
  } else {
    const wiu = bindings.filter((b) => b?.role === 'roles/iam.workloadIdentityUser');
    const others = bindings.filter((b) => b?.role !== 'roles/iam.workloadIdentityUser');
    if (others.length) {
      reasons.push(
        `The reader policy also grants ${others.map((b) => b.role).join(', ')}; it must hold ` +
          'only roles/iam.workloadIdentityUser.',
      );
    }
    const members = wiu.flatMap((b) => (Array.isArray(b?.members) ? b.members : []));
    if (wiu.some((b) => b?.condition)) {
      reasons.push(
        'The workloadIdentityUser binding carries an IAM condition; bind it unconditionally to the exact subject.',
      );
    }
    if (members.length !== 1 || members[0] !== member) {
      const principalSets = members.filter((m) => String(m).startsWith('principalSet://')).length;
      reasons.push(
        `roles/iam.workloadIdentityUser must have exactly one member, the exact subject; it has ` +
          `${members.length} member(s)` +
          (principalSets
            ? `, ${principalSets} of them principalSet (repository/attribute scope)`
            : '') +
          '.',
      );
    }
  }

  if (projectPolicy !== undefined) {
    const risky = (Array.isArray(projectPolicy?.bindings) ? projectPolicy.bindings : []).filter(
      (b) =>
        IMPERSONATION_ROLES.has(b?.role) &&
        (Array.isArray(b?.members) ? b.members : []).some((m) => FEDERATED.test(String(m))),
    );
    for (const b of risky) {
      reasons.push(
        `Project-level ${b.role} is granted to a federated principal, which can act as EVERY ` +
          'service account in the project — the reader included — regardless of its own binding.',
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function bindCommand(member) {
  return [
    'gcloud iam service-accounts add-iam-policy-binding \\',
    `  ${READER_SA} \\`,
    '  --project=la-creativo-erp \\',
    '  --role="roles/iam.workloadIdentityUser" \\',
    `  --member="${member}"`,
  ].join('\n');
}

const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  const run = () => {
    const arg = (name) => {
      const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
      return hit ? hit.slice(name.length + 3) : null;
    };
    const workflowProvider = arg('workflow-provider');
    const providersFile = arg('providers');
    const repoFile = arg('repo');
    if (!workflowProvider || !providersFile || !repoFile) {
      console.error(
        'Usage: node scripts/verify-storage-reader-trust.mjs --workflow-provider=<resource> ' +
          '--providers=providers.json --repo=repo.json ' +
          '[--sa-policy=reader-policy.json --project-policy=project-policy.json]',
      );
      process.exitCode = 2;
      return;
    }
    const pool = evaluatePool({
      workflowProvider,
      providers: readJsonFile(providersFile),
      repositoryMetadata: readJsonFile(repoFile),
    });
    if (!pool.ok) {
      console.log('STOP — do not bind the reader. Reasons:');
      for (const reason of pool.reasons) console.log(`  - ${reason}`);
      console.log(
        'Do not weaken or reuse another provider. Reconcile the dedicated provider with §9.',
      );
      process.exitCode = 1;
      return;
    }
    const saFile = arg('sa-policy');
    if (!saFile) {
      console.log('POOL SAFE — the only binding to create is:\n');
      console.log(bindCommand(pool.member));
      console.log('\nThen re-run with --sa-policy and --project-policy to verify it.');
      return;
    }
    const projectFile = arg('project-policy');
    const policies = evaluateReaderPolicies({
      member: pool.member,
      serviceAccountPolicy: readJsonFile(saFile),
      projectPolicy: projectFile ? readJsonFile(projectFile) : undefined,
    });
    if (!policies.ok) {
      console.log('NOT VERIFIED — reasons:');
      for (const reason of policies.reasons) console.log(`  - ${reason}`);
      process.exitCode = 1;
      return;
    }
    if (!projectFile) {
      console.log('NOT VERIFIED — --project-policy is required for the final check.');
      process.exitCode = 1;
      return;
    }
    console.log(
      `VERIFIED — ${READER_SA} is restricted to repository ${REPOSITORY_ID}, owner ${REPOSITORY_OWNER_ID}, refs/heads/main through ${pool.pool}.`,
    );
  };
  try {
    run();
  } catch (error) {
    console.error(`P0-07 reader trust check failed closed: ${error?.name ?? 'Error'}`);
    process.exitCode = 1;
  }
}
