import fs from 'fs';
import path from 'path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('release workflows', () => {
  it('aligns every Node workflow with the Vercel Node 22 runtime', () => {
    const workflows = fs
      .readdirSync(path.join(process.cwd(), '.github', 'workflows'))
      .filter((name) => name.endsWith('.yml'))
      .map((name) => read(`.github/workflows/${name}`));
    const nodeVersions = workflows.flatMap((workflow) =>
      [...workflow.matchAll(/node-version:\s*(\d+)/g)].map((match) => match[1]),
    );
    expect(nodeVersions.length).toBeGreaterThan(0);
    expect(new Set(nodeVersions)).toEqual(new Set(['22']));
  });

  it.each(['deploy-indexes.yml', 'deploy-rules.yml'])(
    'keeps %s manual, protected, explicit-targeted, and OIDC authenticated',
    (name) => {
      const workflow = read(`.github/workflows/${name}`);
      expect(workflow).toContain('workflow_dispatch:');
      expect(workflow).not.toMatch(/\n\s+push:/);
      expect(workflow).toContain('environment: firebase-production');
      expect(workflow).toContain('id-token: write');
      expect(workflow).toContain('google-github-actions/auth@v2');
      expect(workflow).toContain('EXPECTED_FIREBASE_PROJECT_ID');
      expect(workflow).not.toContain('FIREBASE_TOKEN');
      expect(workflow).not.toContain('la-creativo-erp');
    },
  );

  it('does not use secrets in the Sonar job-level condition', () => {
    const workflow = read('.github/workflows/test.yml');
    expect(workflow).not.toContain("if: ${{ secrets.SONAR_TOKEN != '' }}");
    expect(workflow).toContain("if: steps.sonar-config.outputs.enabled == 'true'");
  });

  it('requires owner-controlled isolated Firebase metadata for authenticated smoke tests', () => {
    const workflow = read('.github/workflows/smoke.yml');
    expect(workflow).toContain('E2E_ISOLATED_ENVIRONMENT: ${{ vars.E2E_ISOLATED_ENVIRONMENT }}');
    expect(workflow).toContain(
      'E2E_EXPECTED_FIREBASE_PROJECT_ID: ${{ secrets.E2E_EXPECTED_FIREBASE_PROJECT_ID }}',
    );
    expect(workflow).toContain(
      'FIREBASE_PRODUCTION_PROJECT_ID: ${{ vars.FIREBASE_PRODUCTION_PROJECT_ID }}',
    );
  });
});
