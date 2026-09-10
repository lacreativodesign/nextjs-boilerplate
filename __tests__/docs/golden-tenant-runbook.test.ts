import fs from 'fs';
import path from 'path';

const runbook = fs.readFileSync(
  path.join(process.cwd(), 'docs/runbooks/golden-tenant-e2e.md'),
  'utf8',
);

describe('Golden tenant E2E runbook', () => {
  it('requires secure deployment and Actions credentials', () => {
    expect(runbook).toContain('E2E_DEMO_PASSWORD');
    expect(runbook).toContain('E2E_BASE_URL');
    expect(runbook).toContain('Never commit or print the password');
  });

  it('requires exact-SHA browser evidence and rejects skipped auth suites', () => {
    expect(runbook).toContain('A skipped authenticated suite is not a pass');
    expect(runbook).toContain('exact PR head SHA');
    expect(runbook).toContain('same SHA being certified');
  });
});
