import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';
import FirstRunHint from '@/components/onboarding/FirstRunHint';

/**
 * S28 — the first-run hint guides a brand-new tenant and never nags an established one.
 *
 * A new tenant lands on a worker dashboard and sees KPI cards all reading zero with no
 * guidance — which reads as "broken", not "new", and is where self-serve trials quietly die.
 * FirstRunHint appears only while the dashboard has no data, points at the first action, and
 * disappears the moment real data exists.
 */
describe('S28: FirstRunHint', () => {
  const action = { label: 'Add a lead', href: '/sales/leads' };

  it('renders guidance and the first action when show is true', () => {
    render(
      <FirstRunHint
        show
        title="Your pipeline is ready"
        description="Add your first lead to get started."
        action={action}
      />,
    );

    expect(screen.getByText('Your pipeline is ready')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Add a lead' });
    expect(link).toHaveAttribute('href', '/sales/leads');
  });

  it('renders NOTHING when show is false, so it never nags an established tenant', () => {
    const { container } = render(
      <FirstRunHint
        show={false}
        title="Your pipeline is ready"
        description="Add your first lead to get started."
        action={action}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('S28: the sales dashboard uses the hint, gated on empty data', () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), 'app/sales/page.tsx'),
    'utf8',
  );

  it('shows the hint only when every headline number is zero', () => {
    expect(page).toContain('const isFirstRun =');
    expect(page).toContain('(data?.totalLeads ?? 0) === 0');
    expect(page).toContain('(data?.activeDeals ?? 0) === 0');
    // Must be gated on load/error too, so it does not flash before data arrives.
    expect(page).toContain('!loading');
    expect(page).toContain('!error');
  });

  it('points the new user at a real, resolvable first action', () => {
    expect(page).toContain("action={{ label: 'Add a lead', href: '/sales/leads' }}");
    expect(fs.existsSync(path.join(process.cwd(), 'app/sales/leads/page.tsx'))).toBe(true);
  });
});

describe('S29: every worker dashboard has a gated first-run hint at a real action', () => {
  const cases: { file: string; action: string }[] = [
    { file: 'app/am/page.tsx', action: '/clients' },
    { file: 'app/production/page.tsx', action: '/production/queue' },
    { file: 'app/finance/page.tsx', action: '/finance/invoices' },
    { file: 'app/hr/page.tsx', action: '/hr/employees' },
  ];

  it.each(cases)('$file renders FirstRunHint gated on isFirstRun', ({ file }) => {
    const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(src).toContain("import FirstRunHint from '@/components/onboarding/FirstRunHint'");
    expect(src).toContain('const isFirstRun =');
    expect(src).toContain('show={isFirstRun}');
  });

  it.each(cases)('$file points at a first action that resolves', ({ file, action }) => {
    const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(src).toContain(`href: '${action}'`);
    const dir = action.replace(/^\//, '');
    expect(fs.existsSync(path.join(process.cwd(), 'app', dir, 'page.tsx'))).toBe(true);
  });
});
