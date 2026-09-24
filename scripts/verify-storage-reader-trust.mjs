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
 * main of any repository the provider admits. What proves BOTH facts at once is a single
 * principal that encodes both: the exact subject
 *
 *   principal://iam.googleapis.com/projects/<N>/locations/global/workloadIdentityPools/<POOL>
 *     /subject/repo:lacreativodesign/nextjs-boilerplate:ref:refs/heads/main
 *
 * which is GitHub's default OIDC `sub` for a push/schedule/dispatch job on main of this
 * repository (a job with an `environment:` or a pull_request event gets a different `sub`
 * and is refused by IAM itself).
 *
 * That binding is only as sound as three facts, and this script checks each from the
 * owner's read-only inspection output instead of assuming it:
 *
 *   1. SUBJECTS ARE POOL-SCOPED. A `principal://…/subject/S` member matches S from ANY
 *      provider in the pool. So every provider in the pool — disabled ones included, since
 *      re-enabling is one call — must be GitHub-issued
 *      (`https://token.actions.githubusercontent.com`) and map `google.subject` to exactly
 *      `assertion.sub` — otherwise another issuer, or a CEL mapping, could present the same
 *      string.
 *   2. GITHUB MUST USE THE DEFAULT SUBJECT TEMPLATE for this repository
 *      (`use_default: true`); a customised template changes what `sub` contains.
 *   3. NOTHING ELSE MAY IMPERSONATE THE READER: its own IAM policy must hold exactly one
 *      binding, workloadIdentityUser → that one principal; and no project-level binding may
 *      grant a FEDERATED principal the right to act as every service account.
 *
 * Any failed check is STOP: do not bind, do not widen, and never "fix" it by editing the
 * shared provider other production workflows depend on. The safe alternative (a dedicated
 * pool for this reader) is in docs/security/p0-07-firebase-storage-certification.md §9.
 *
 * READ-ONLY: this script makes no network call and changes nothing. It reads JSON files the
 * owner produced with `gcloud … describe/list/get-iam-policy` and `gh api … oidc`.
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'lacreativodesign/nextjs-boilerplate';
export const MAIN_REF = 'refs/heads/main';
export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
export const READER_SA = 'storage-cert-reader@la-creativo-erp.iam.gserviceaccount.com';
/** GitHub's default `sub` for a non-environment job on main of this repository. */
export const EXPECTED_SUBJECT = `repo:${REPOSITORY}:ref:${MAIN_REF}`;

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

/** The one member the reader may be bound to. */
export function exactSubjectMember(parsed) {
  return `principal://iam.googleapis.com/${poolResource(parsed)}/subject/${EXPECTED_SUBJECT}`;
}

/**
 * Checks facts 1 and 2. Returns `{ ok, reasons, member }`; `member` only when ok.
 */
export function evaluatePool({ workflowProvider, providers, oidcSubjectCustomization }) {
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
  const list = Array.isArray(providers) ? providers : [];
  if (list.length === 0) reasons.push(`No providers were listed for pool ${pool}.`);

  const names = list.map((p) => String(p?.name ?? ''));
  if (!names.includes(String(workflowProvider).trim())) {
    reasons.push('The workflow provider does not appear in the listed pool.');
  }
  for (const provider of list) {
    const name = String(provider?.name ?? '(unnamed)');
    if (!name.startsWith(`${pool}/providers/`)) {
      reasons.push(`${name} is not in pool ${pool}; list exactly one pool.`);
      continue;
    }
    // Disabled providers are judged too: re-enabling one is a single call, and the
    // exact-subject binding would silently start trusting it again.
    if (!provider?.oidc) {
      reasons.push(`${name} is not an OIDC provider (AWS/SAML subjects share the pool namespace).`);
      continue;
    }
    if (String(provider.oidc.issuerUri ?? '') !== GITHUB_ISSUER) {
      reasons.push(`${name} trusts issuer ${provider.oidc.issuerUri}, not GitHub Actions.`);
    }
    const subjectMapping = provider?.attributeMapping?.['google.subject'];
    if (subjectMapping !== 'assertion.sub') {
      reasons.push(
        `${name} maps google.subject to ${JSON.stringify(subjectMapping ?? null)}, not ` +
          'exactly "assertion.sub", so a subject string would not prove repository + ref.',
      );
    }
  }

  const custom = oidcSubjectCustomization ?? null;
  if (!custom || custom.use_default !== true) {
    reasons.push(
      "GitHub does not report use_default: true for this repository's OIDC subject template " +
        `(saw ${JSON.stringify(custom)}); the job's sub would not be "${EXPECTED_SUBJECT}".`,
    );
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
    const oidcFile = arg('oidc-sub');
    if (!workflowProvider || !providersFile || !oidcFile) {
      console.error(
        'Usage: node scripts/verify-storage-reader-trust.mjs --workflow-provider=<resource> ' +
          '--providers=providers.json --oidc-sub=oidc-sub.json ' +
          '[--sa-policy=reader-policy.json --project-policy=project-policy.json]',
      );
      process.exitCode = 2;
      return;
    }
    const pool = evaluatePool({
      workflowProvider,
      providers: readJsonFile(providersFile),
      oidcSubjectCustomization: readJsonFile(oidcFile),
    });
    if (!pool.ok) {
      console.log('STOP — do not bind the reader. Reasons:');
      for (const reason of pool.reasons) console.log(`  - ${reason}`);
      console.log('Do not edit the shared provider. See §9 "If the evaluator says STOP".');
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
      `VERIFIED — ${READER_SA} is assumable only as ${EXPECTED_SUBJECT} through pool ${pool.pool}.`,
    );
  };
  try {
    run();
  } catch (error) {
    console.error(`P0-07 reader trust check failed closed: ${error?.name ?? 'Error'}`);
    process.exitCode = 1;
  }
}
