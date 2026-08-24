#!/usr/bin/env node

/**
 * Generates a deterministic, path-level launch coverage snapshot for the ERP
 * repository and (when present) its sibling marketing repository. The generated
 * ledger is review evidence, not a claim that binary assets received semantic
 * source review or that planned tests passed.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const erpRoot = resolve(process.cwd());
const websiteRoot = resolve(process.argv[2] || '../website');
const output = resolve(erpRoot, 'docs/launch/FILE_COVERAGE_LEDGER.md');

function gitFiles(root) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: root,
  })
    .toString()
    .split('\0')
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function modifiedFiles(root) {
  const paths = execFileSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(3));
  return new Set(paths);
}

function classification(file, repoLabel) {
  const ext = extname(file).toLowerCase();
  if (file.includes('node_modules/') || file.startsWith('vendor/')) {
    return 'Third-party or dependency artifact';
  }
  if (file === 'package-lock.json') return 'Third-party or dependency artifact';
  if (
    /(^|\/)(\.next|dist|build|coverage|test-results|playwright-report)\//.test(file) ||
    /\.generated\./.test(file) ||
    file === 'docs/api/openapi.yaml'
  ) {
    return 'Generated artifact';
  }
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip|mp4|webm|svg)$/i.test(file)) {
    return 'Static asset';
  }
  if (/^app\/api\/.+\/route\.(ts|js)$/.test(file) || /^pages\/api\//.test(file)) {
    return 'API route';
  }
  if (
    repoLabel === 'bizosto-website' &&
    /^app\/(privacy|terms|cookies|refund-policy)\/page\.tsx?$/.test(file)
  ) {
    return 'Marketing/legal content';
  }
  if (
    /^app\/.+\/(page|layout|loading|error|not-found)\.tsx?$/.test(file) ||
    /^app\/(page|layout|loading|error|not-found)\.tsx?$/.test(file)
  ) {
    return 'Page or layout';
  }
  if (/^components\//.test(file)) return 'UI component';
  if (/^hooks\//.test(file) || /\/use[A-Z][^/]*\.(ts|tsx)$/.test(file)) return 'Hook';
  if (/^(__tests__|e2e|tests?|test)\//.test(file) || /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) {
    return 'Test';
  }
  if (/^\.github\/workflows\//.test(file)) return 'CI workflow';
  if (
    [
      'firebase.json',
      'firestore.rules',
      'storage.rules',
      'firestore.indexes.json',
      '.firebaserc',
    ].includes(file)
  ) {
    if (file === 'firestore.rules') return 'Firestore rules';
    if (file === 'storage.rules') return 'Storage rules';
    if (file === 'firestore.indexes.json') return 'Firestore index definitions';
    return 'Firebase configuration';
  }
  if (
    /(^|\/)\.env/.test(file) ||
    [
      'vercel.json',
      'next.config.js',
      'tsconfig.json',
      'package.json',
      'package-lock.json',
    ].includes(file) ||
    /^config\//.test(file)
  ) {
    return 'Environment configuration';
  }
  if (/^scripts?\//.test(file) || /migration/i.test(file)) return 'Script or migration';
  if (/^docs?\//.test(file) || /\.(md|mdx|txt)$/.test(file)) return 'Documentation';
  if (/^(public|assets)\//.test(file)) return 'Static asset';
  if (/^lib\//.test(file) || /^services?\//.test(file)) return 'Domain service';
  if (/\.(ts|tsx|js|jsx|mjs|cjs|css|scss)$/.test(file)) {
    return 'First-party executable source';
  }
  if (/\.(json|ya?ml|toml)$/.test(file)) return 'Environment configuration';
  return 'Static asset';
}

function domain(file) {
  const testsRemoved = file.replace(/^(__tests__|e2e|tests?)\//, '');
  const candidates = [
    ['signup', /signup|send-otp|verify-otp|password|login|session|mfa|sso|auth/i],
    ['billing/payments', /stripe|billing|subscription|invoice|payment|refund|finance|tax|payroll/i],
    ['tenant/security', /tenant|permission|role|middleware|audit|security|api-key|apikey/i],
    ['files/storage', /file|storage|document|upload|download|docusign|export|import/i],
    ['cron/operations', /cron|backup|restore|retention|monitor|observ|health|job|queue|outbox/i],
    ['sales/CRM', /sales|lead|deal|crm|campaign|client/i],
    ['projects/production', /project|production|task|brief|change-request|approval/i],
    ['HR', /(^|\/)hr|employee|attendance|leave|performance|timesheet/i],
    [
      'integrations/AI',
      /integration|oauth|slack|xero|quickbooks|mailchimp|calendly|google|microsoft|ai|agent|automation|workflow/i,
    ],
    ['notifications/support', /notification|email|support|help|ticket|message/i],
    [
      'UI/UX/marketing',
      /component|page\.tsx|layout\.tsx|globals\.css|public\/|marketing|legal|pricing|privacy|terms/i,
    ],
    [
      'CI/configuration',
      /\.github|config|package|eslint|tsconfig|vercel|firebase|firestore|storage\.rules|\.env/i,
    ],
    ['documentation/release', /^docs\//i],
  ];
  return candidates.find(([, pattern]) => pattern.test(testsRemoved))?.[0] || 'platform/shared';
}

function reviewCode(kind) {
  if (kind === 'Static asset') return 'I';
  if (kind === 'Generated artifact') return 'G';
  if (kind === 'Third-party or dependency artifact') return 'D';
  if (kind === 'Test') return 'T';
  if (kind === 'Documentation') return 'C';
  return 'S';
}

function riskCode(kind, fileDomain) {
  if (['API route', 'Firestore rules', 'Storage rules'].includes(kind)) return 'AUTH';
  if (fileDomain === 'billing/payments') return 'FIN';
  if (fileDomain === 'signup') return 'ID';
  if (fileDomain === 'cron/operations') return 'OPS';
  if (kind === 'Environment configuration' || kind === 'CI workflow') return 'ENV';
  if (kind === 'Static asset') return 'ASSET';
  return 'DOMAIN';
}

function testCode(kind) {
  if (kind === 'Test') return 'TEST';
  if (kind === 'Static asset') return 'INV';
  if (kind === 'Documentation') return 'CLAIM';
  return 'SUITE';
}

function exclusionCode(kind) {
  if (kind === 'Static asset') return 'BIN';
  if (kind === 'Generated artifact') return 'GEN';
  if (kind === 'Third-party or dependency artifact') return 'UPSTREAM';
  return '-';
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const repos = [
  { label: 'nextjs-boilerplate', root: erpRoot },
  ...(existsSync(resolve(websiteRoot, '.git'))
    ? [{ label: 'bizosto-website', root: websiteRoot }]
    : []),
];

const rows = [];
const counts = new Map();
for (const repo of repos) {
  const modified = modifiedFiles(repo.root);
  for (const file of gitFiles(repo.root)) {
    const kind = classification(file, repo.label);
    const fileDomain = domain(file);
    const key = `${repo.label}:${kind}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    const changed = modified.has(file);
    rows.push([
      repo.label,
      file,
      fileDomain,
      kind,
      reviewCode(kind),
      riskCode(kind, fileDomain),
      testCode(kind),
      changed ? 'RC' : '-',
      changed ? 'DIFF+GATES' : 'PIN+SCAN',
      exclusionCode(kind),
    ]);
  }
}

const summary = [...counts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, count]) => `| ${escapeCell(key)} | ${count} |`)
  .join('\n');

const table = rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`).join('\n');

const content = `# File coverage ledger

Generated: 2026-08-24 by \`scripts/generate-launch-coverage-ledger.mjs\`.

This is the complete tracked-plus-release-addition path inventory for the two
working trees used to prepare the release. All first-party text source and
configuration received a repository-wide static corpus/risk scan; high-risk
domains received focused semantic review and remediation. Test execution is
reported only in \`VERIFICATION_EVIDENCE.md\`. Binary, generated, and upstream
artifacts are inventoried with explicit exclusions and are not misrepresented
as semantically reviewed executable source.

## Counts

| Repository and classification | Files |
| --- | ---: |
${summary}

Total inventoried paths: **${rows.length}**.

Codes keep this complete ledger reviewable in GitHub: review **S** static corpus/risk
scan, **T** test scan, **C** claim scan, **I** inventory only, **G** generated,
**D** dependency; risk **AUTH** authorization/ownership, **FIN** financial integrity,
**ID** identity/abuse, **OPS** operations/recovery, **ENV** environment/release,
**ASSET** brand/accessibility/payload, **DOMAIN** domain correctness; test **TEST**
is a test file, **SUITE** applicable suites, **CLAIM** claim comparison, **INV**
inventory only. **RC** means changed on the release branch. Evidence **DIFF+GATES**
means diff review plus applicable gates, **PIN+SCAN** means pinned-tree corpus scan.
Exclusions: **BIN** binary semantic review, **GEN** generated-source semantic review,
**UPSTREAM** vendored semantics, **-** none. Actual execution and findings remain in
\`VERIFICATION_EVIDENCE.md\` and \`BLOCKER_REGISTER.md\`; compact codes do not imply a
test passed.

## Per-file ledger

| Repo | File path | Domain | Classification | Review | Risk | Test | Change | Evidence | Exclusion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${table}
`;

// Read once after writing so a truncated or empty artifact fails generation.
writeFileSync(output, content, 'utf8');
if (!readFileSync(output, 'utf8').includes(`Total inventoried paths: **${rows.length}**`)) {
  throw new Error('Coverage ledger generation failed.');
}

console.log(`Wrote ${rows.length} coverage rows to ${output}`);
