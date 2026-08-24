import fs from 'fs';
import path from 'path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('workflow mutations are stored-run/action bound', () => {
  it('does not self-fetch through NEXT_PUBLIC_APP_URL or transmit an internal root secret', () => {
    const engine = read('lib/automation/workflow-engine.ts');
    expect(engine).not.toContain('/api/internal/workflow-mutation');
    expect(engine).not.toContain('INTERNAL_REQUEST_SIGNING_SECRET');
    expect(engine).toContain('executeWorkflowMutation');
  });

  it('binds tenant, workflow, run status, action, entity, field, and target record', () => {
    const service = read('lib/automation/workflow-mutation.ts');
    for (const evidence of [
      'run.tenantId',
      'workflow.tenantId',
      'run.workflowId',
      "run.status || '') !== 'running'",
      'candidate.id === input.action.id',
      'Workflow entity binding mismatch',
      'Workflow field binding mismatch',
      'run.recordId',
      'snap.data()?.tenantId',
    ]) {
      expect(service).toContain(evidence);
    }
  });

  it('makes UI test runs explicitly write-free', () => {
    const engine = read('lib/automation/workflow-engine.ts');
    expect(engine).toContain("if (context.triggerSource === 'test') return {}");
    expect(read('components/automation/WorkflowAutomationPage.tsx')).toContain(
      'Dry run (no writes)',
    );
  });
});
