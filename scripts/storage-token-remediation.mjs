#!/usr/bin/env node
/**
 * P0-07 — legacy Firebase download-token inventory and (owner-approved) revocation.
 *
 * DEFAULT: AUDIT. READ-ONLY.
 *
 *   node scripts/storage-token-remediation.mjs                  # objects, counts only
 *   node scripts/storage-token-remediation.mjs --firestore      # + record fields, counts only
 *
 * Audit mode issues GET requests only. It prints per-category COUNTS: never a token value,
 * never an object name, never a document id.
 *
 * APPLY: REVOKES TOKENS. Only when every one of these is present:
 *
 *   --mode=apply
 *   --confirm-project=la-creativo-erp
 *   --confirm-bucket=la-creativo-erp.firebasestorage.app
 *   P0_07_TOKEN_REMEDIATION_APPROVED_BY=<the approving owner's name>   (environment)
 *
 * Anything missing or mistyped is a refusal before a single request is made. This tool is
 * NOT wired into any workflow: it is run by the owner, with the owner's own short-lived
 * gcloud credentials, after the P0-07 PR is merged and deployed (see the runbook).
 *
 * What apply does to each tokenized object in scope, and nothing else:
 *
 *   PATCH .../o/{object}?ifGenerationMatch=G&ifMetagenerationMatch=M
 *         { "metadata": { "firebaseStorageDownloadTokens": null } }
 *
 *   - metadata only: the bytes, the generation, the ACL and the object's existence are
 *     untouched; nothing is deleted and nothing is made public;
 *   - bound to the generation AND metageneration the audit just read, so a concurrent
 *     overwrite or metadata change fails the precondition (412) and is skipped, not clobbered;
 *   - verified: the PATCH response must show the same generation and no token, or the object
 *     is counted as `unverified`.
 *
 * Scope: `--scope=protected` (default) revokes on every tenant prefix except the public logo
 * prefixes and on legacy objects outside tenants/; `--scope=all` includes logos too. Logo
 * URLs stored on tenant documents keep working either way — the public branding endpoint
 * recovers the object path from a legacy URL and serves it without the token.
 *
 * Firestore records are INVENTORIED, never rewritten, by this tool. Every reader now strips
 * the legacy URL fields before a record leaves the server, and the stored URLs stop working
 * the moment the object tokens are revoked (signed URLs expire on their own within 7 days).
 */

import { pathToFileURL } from 'node:url';
import {
  EXPECTED_BUCKET,
  EXPECTED_PROJECT_ID,
  PUBLIC_BRANDING_CATEGORIES,
  TOKEN_KEY,
  classifyObject,
  hasToken,
  readJson,
  resolveAccessToken,
} from './verify-storage-bucket.mjs';

const GCS = 'https://storage.googleapis.com/storage/v1';
const FIRESTORE = 'https://firestore.googleapis.com/v1';

/** Firestore fields that historically held a bearer or signed URL, by collection. */
export const RECORD_FIELDS = [
  { collection: 'files', field: 'downloadUrl' },
  { collection: 'employeeDocuments', field: 'downloadUrl' },
  { collection: 'platform_tickets', field: 'screenshotUrl' },
  { collection: 'tenants', field: 'brand.logoUrl' },
  { collection: 'tenants', field: 'whiteLabel.logoUrl' },
  { collection: 'erp_files', field: 'previewUrl' },
  { collection: 'erp_file_versions', field: 'previewUrl' },
  { collection: 'documents', field: 'storageUrl' },
  { collection: 'documents', field: 'previewUrl' },
  { collection: 'exportJobs', field: 'signedUrl' },
];

/** Classifies a stored URL WITHOUT keeping it. */
export function classifyStoredUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return 'empty';
  try {
    const url = new URL(value);
    if (url.hostname === 'firebasestorage.googleapis.com' && url.searchParams.has('token')) {
      return 'firebase_token_url';
    }
    if (
      url.searchParams.has('X-Goog-Signature') ||
      url.searchParams.has('Signature') ||
      url.searchParams.has('GoogleAccessId')
    ) {
      return 'signed_url';
    }
    return url.pathname.startsWith('/api/') ? 'bizosto_route' : 'other_url';
  } catch {
    return value.startsWith('/api/') ? 'bizosto_route' : 'other_value';
  }
}

export function parseArgs(argv) {
  const get = (name) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  return {
    mode: get('mode') ?? 'audit',
    scope: get('scope') ?? 'protected',
    confirmProject: get('confirm-project'),
    confirmBucket: get('confirm-bucket'),
    firestore: argv.includes('--firestore'),
    json: argv.includes('--json'),
  };
}

/**
 * Every gate apply mode has to clear. Returns the reasons it may NOT run; empty means it may.
 * Pure, so the refusals are unit-tested without a network.
 */
export function applyRefusals(args, env) {
  const reasons = [];
  if (args.mode !== 'apply') return reasons;
  if (args.confirmProject !== EXPECTED_PROJECT_ID) {
    reasons.push(`--confirm-project must be exactly ${EXPECTED_PROJECT_ID}`);
  }
  if (args.confirmBucket !== EXPECTED_BUCKET) {
    reasons.push(`--confirm-bucket must be exactly ${EXPECTED_BUCKET}`);
  }
  if (!String(env.P0_07_TOKEN_REMEDIATION_APPROVED_BY || '').trim()) {
    reasons.push('P0_07_TOKEN_REMEDIATION_APPROVED_BY must name the approving owner');
  }
  if (!['protected', 'all'].includes(args.scope)) {
    reasons.push('--scope must be "protected" or "all"');
  }
  if (env.CI || env.GITHUB_ACTIONS) {
    reasons.push('apply mode is owner-run only and refuses to execute inside CI');
  }
  return reasons;
}

export function inScope(category, scope) {
  if (scope === 'all') return true;
  return !PUBLIC_BRANDING_CATEGORIES.includes(category);
}

/**
 * Walks the bucket and returns the tokenized objects in scope (name, generation,
 * metageneration — never the token) plus per-category counts.
 */
export async function auditObjects({ accessToken, scope, fetchImpl }) {
  const targets = [];
  const byCategory = {};
  let pageToken = '';
  for (let guard = 0; guard < 100000; guard += 1) {
    const params = new URLSearchParams({
      maxResults: '1000',
      fields: 'items(name,generation,metageneration,metadata),nextPageToken',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const read = await readJson(
      `${GCS}/b/${encodeURIComponent(EXPECTED_BUCKET)}/o?${params}`,
      accessToken,
      fetchImpl,
    );
    if (!read.ok) return { ok: false, error: read.error, permission: read.permission };
    for (const item of read.data?.items ?? []) {
      const category = classifyObject(item?.name);
      const row = (byCategory[category] ??= { objects: 0, tokenized: 0 });
      row.objects += 1;
      if (!hasToken(item)) continue;
      row.tokenized += 1;
      if (inScope(category, scope)) {
        targets.push({
          name: item.name,
          category,
          generation: String(item.generation ?? ''),
          metageneration: String(item.metageneration ?? ''),
        });
      }
    }
    pageToken = read.data?.nextPageToken ?? '';
    if (!pageToken) return { ok: true, targets, byCategory };
  }
  return { ok: false, error: 'listing did not terminate' };
}

/** Revokes ONE object's token under generation + metageneration preconditions. */
export async function revokeToken(target, accessToken, fetchImpl = globalThis.fetch) {
  if (!target.generation || !target.metageneration) return 'unverified';
  const params = new URLSearchParams({
    ifGenerationMatch: target.generation,
    ifMetagenerationMatch: target.metageneration,
    fields: 'generation,metadata',
  });
  let res;
  try {
    res = await fetchImpl(
      `${GCS}/b/${encodeURIComponent(EXPECTED_BUCKET)}/o/${encodeURIComponent(target.name)}?${params}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { [TOKEN_KEY]: null } }),
      },
    );
  } catch {
    return 'error';
  }
  if (res.status === 412) return 'skipped_changed';
  if (res.status === 404) return 'skipped_missing';
  if (!res.ok) return 'error';
  const body = await res.json().catch(() => null);
  if (String(body?.generation ?? '') !== target.generation || hasToken(body)) return 'unverified';
  return 'revoked';
}

/** Reads a dotted string field out of a Firestore REST `fields` map. */
export function readStringField(fields, path) {
  let node = { mapValue: { fields: fields ?? {} } };
  for (const key of String(path).split('.')) {
    node = node?.mapValue?.fields?.[key];
    if (!node) return undefined;
  }
  return node.stringValue;
}

/** Counts, per collection field, what kind of URL records still hold. GET only. */
export async function auditRecords({ accessToken, fetchImpl }) {
  const out = [];
  for (const { collection, field } of RECORD_FIELDS) {
    const counts = { documents: 0 };
    let pageToken = '';
    let failed = null;
    for (let guard = 0; guard < 100000; guard += 1) {
      const params = new URLSearchParams({ pageSize: '300', 'mask.fieldPaths': field });
      if (pageToken) params.set('pageToken', pageToken);
      const read = await readJson(
        `${FIRESTORE}/projects/${EXPECTED_PROJECT_ID}/databases/(default)/documents/${collection}?${params}`,
        accessToken,
        fetchImpl,
      );
      if (!read.ok) {
        failed = read.error;
        break;
      }
      for (const doc of read.data?.documents ?? []) {
        counts.documents += 1;
        const kind = classifyStoredUrl(readStringField(doc.fields, field));
        counts[kind] = (counts[kind] ?? 0) + 1;
      }
      pageToken = read.data?.nextPageToken ?? '';
      if (!pageToken) break;
    }
    out.push({ collection, field, ...(failed ? { error: failed } : counts) });
  }
  return out;
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  const run = async () => {
    const args = parseArgs(process.argv.slice(2));
    if (!['audit', 'apply'].includes(args.mode)) {
      console.error('--mode must be "audit" (default) or "apply".');
      process.exitCode = 2;
      return;
    }
    const refusals = applyRefusals(args, process.env);
    if (refusals.length) {
      console.error(`Refusing apply mode:\n  - ${refusals.join('\n  - ')}`);
      process.exitCode = 2;
      return;
    }
    const accessToken = resolveAccessToken();
    if (!accessToken) {
      console.error('No Google access token (GCS_ACCESS_TOKEN or `gcloud auth login`).');
      process.exitCode = 2;
      return;
    }

    const audit = await auditObjects({ accessToken, scope: args.scope });
    if (!audit.ok) {
      console.error(
        `Object audit failed closed: ${audit.error}` +
          (audit.permission ? ` (needs ${audit.permission})` : ''),
      );
      process.exitCode = 1;
      return;
    }
    const report = {
      project: EXPECTED_PROJECT_ID,
      bucket: EXPECTED_BUCKET,
      mode: args.mode,
      scope: args.scope,
      objectsByCategory: audit.byCategory,
      tokenizedInScope: audit.targets.length,
    };

    if (args.mode === 'apply') {
      const outcomes = {};
      for (const target of audit.targets) {
        const outcome = await revokeToken(target, accessToken);
        const row = (outcomes[target.category] ??= {});
        row[outcome] = (row[outcome] ?? 0) + 1;
      }
      report.approvedBy = String(process.env.P0_07_TOKEN_REMEDIATION_APPROVED_BY).trim();
      report.outcomesByCategory = outcomes;
    }

    if (args.firestore) report.records = await auditRecords({ accessToken });

    console.log(JSON.stringify(report, null, 2));
    const unresolved =
      args.mode === 'apply'
        ? Object.values(report.outcomesByCategory ?? {}).some(
            (row) => (row.unverified ?? 0) + (row.error ?? 0) + (row.skipped_changed ?? 0) > 0,
          )
        : false;
    process.exitCode = unresolved ? 1 : 0;
  };
  run().catch((error) => {
    console.error(`P0-07 remediation failed closed: ${error?.name ?? 'Error'}`);
    process.exitCode = 1;
  });
}
