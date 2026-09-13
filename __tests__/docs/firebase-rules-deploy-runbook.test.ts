import fs from 'fs';
import path from 'path';

/**
 * The Security Rules deployment runbook carries the half of this pipeline that
 * cannot live in code: the Google Cloud IAM and GitHub environment configuration an
 * owner performs by hand. A workflow test cannot catch a runbook that tells the
 * owner to download a service-account key or to grant roles/owner "just to get CI
 * working" — and that instruction would undo the property the workflow exists to
 * establish. These assertions pin the parts that are load-bearing.
 */
const runbook = fs.readFileSync(
  path.join(process.cwd(), 'docs/runbooks/firebase-rules-deploy.md'),
  'utf8',
);

describe('Firebase Security Rules deployment runbook', () => {
  it('names the dedicated deployment identity and its repository variable', () => {
    expect(runbook).toContain('firebase-rules-deployer@la-creativo-erp.iam.gserviceaccount.com');
    expect(runbook).toContain('GCP_FIREBASE_RULES_DEPLOYER_SA');
    expect(runbook).toContain('GCP_WORKLOAD_IDENTITY_PROVIDER');
  });

  it('keeps the identity keyless', () => {
    expect(runbook).toContain('**Never create or download a JSON key for this account.**');
    expect(runbook).toContain('roles/iam.workloadIdentityUser');
    // A key file appearing in the setup steps would reintroduce the long-lived
    // credential that federation exists to remove.
    expect(runbook).not.toMatch(/iam service-accounts keys create/);
    expect(runbook).not.toMatch(/credentials_json/);
  });

  it('restricts trust to this repository and the main branch', () => {
    expect(runbook).toContain('attribute.repository/lacreativodesign/nextjs-boilerplate');
    expect(runbook).toContain('refs/heads/main');
  });

  it('requires the reviewed, branch-restricted environment', () => {
    expect(runbook).toContain('firebase-rules-production');
    expect(runbook).toContain('Required reviewers');
    expect(runbook).toContain('_Selected branches_ → `main`');
  });

  it('recommends no role broader than the deploy needs', () => {
    // Each of these appears in the runbook only inside the "deliberately not
    // granted" list, never as an instruction. Any line that both names one and
    // reads as a grant is the regression.
    const grantLines = runbook
      .split('\n')
      .filter((line) => /add-iam-policy-binding|--role=|roles\/ /.test(line));
    for (const broad of [
      'roles/owner',
      'roles/editor',
      'roles/firebase.admin',
      'roles/datastore.owner',
      'roles/storage.admin',
      'roles/firebasestorage.admin',
    ]) {
      expect(grantLines.join('\n')).not.toContain(broad);
    }
  });

  it('lists the traced minimum permissions, and no index write permission', () => {
    for (const permission of [
      'firebaserules.rulesets.create',
      'firebaserules.rulesets.test',
      'firebaserules.releases.update',
      'firebaserules.releases.create',
      'firebasestorage.defaultBucket.get',
      'serviceusage.services.get',
    ]) {
      expect(runbook).toContain(permission);
    }
    // The custom role definition is the thing an owner copies and runs, so the
    // index permissions must not appear inside it however they are discussed above.
    const roleCommand = runbook.slice(
      runbook.indexOf('gcloud iam roles create'),
      runbook.indexOf('```', runbook.indexOf('gcloud iam roles create')),
    );
    expect(roleCommand).toContain('--permissions=');
    expect(roleCommand).not.toContain('datastore.indexes');
    expect(roleCommand).not.toContain('firebaserules.rulesets.delete');
  });

  it('states that an undeployed ruleset is not the live ruleset', () => {
    expect(runbook).toContain(
      "**Until a deployment succeeds, the repository's rules are not the live rules.**",
    );
  });

  it('gives a rollback path that goes back through the reviewed pipeline', () => {
    expect(runbook).toContain('## Recovery and rollback');
    expect(runbook).toContain('revert the rules commit on `main`');
  });
});
