import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ConfirmProvider, useConfirm } from '@/components/providers/ConfirmProvider';
import { TONE_CLASS, statusLabel, statusTone } from '@/lib/ui/status-tone';

/**
 * DS-3 — the two primitives the consolidation sessions depend on.
 *
 * Nothing adopts them yet; this pins their contract so S19–S21 (73 files of ad-hoc
 * pills) and S25–S26 (16 native confirm() calls) migrate onto something stable.
 */

describe('DS-3: statusTone', () => {
  it.each([
    ['paid', 'success'],
    ['completed', 'success'],
    ['awaiting_approval', 'warning'],
    ['pending', 'warning'],
    ['failed', 'danger'],
    ['overdue', 'danger'],
    ['in_progress', 'info'],
    ['draft', 'neutral'],
  ])('%s -> %s', (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });

  it('normalises casing, spaces and hyphens to one key', () => {
    for (const variant of ['in_progress', 'In Progress', 'IN-PROGRESS', '  in progress  ']) {
      expect({ variant, tone: statusTone(variant) }).toEqual({ variant, tone: 'info' });
    }
  });

  it('falls back to neutral instead of rendering an unstyled pill', () => {
    for (const value of ['banana', '', null, undefined]) {
      expect(statusTone(value)).toBe('neutral');
    }
  });

  it('every tone has a class mapping', () => {
    for (const tone of ['success', 'warning', 'danger', 'info', 'neutral'] as const) {
      expect(TONE_CLASS[tone]).toBeTruthy();
    }
  });

  it('tone classes use design tokens, never raw palette values', () => {
    // `bg-green-100 text-green-800` was the old pattern and stayed light-on-light
    // in dark mode. Token-backed utilities follow the theme.
    for (const className of Object.values(TONE_CLASS)) {
      expect(className).not.toMatch(/-(50|100|200|500|600|700|800|900)\b/);
    }
  });

  it('humanises the label', () => {
    expect(statusLabel('awaiting_approval')).toBe('Awaiting Approval');
    expect(statusLabel('paid')).toBe('Paid');
    expect(statusLabel(null)).toBe('Unknown');
  });
});

describe('DS-3: StatusBadge', () => {
  it('renders the humanised label and the tone class', () => {
    render(<StatusBadge status="awaiting_approval" />);
    const badge = screen.getByText('Awaiting Approval');
    expect(badge).toHaveClass('bg-warning-soft');
    expect(badge).toHaveClass('text-warning');
  });

  it('accepts a tone override when a module disagrees with the default', () => {
    render(<StatusBadge status="open" tone="danger" />);
    expect(screen.getByText('Open')).toHaveClass('text-danger');
  });

  it('accepts a label override without changing the colour', () => {
    render(<StatusBadge status="paid" label="Paid in full" />);
    const badge = screen.getByText('Paid in full');
    expect(badge).toHaveClass('text-success');
  });

  it('hides the decorative dot from assistive tech', () => {
    const { container } = render(<StatusBadge status="active" dot />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

describe('DS-3: ConfirmDialog', () => {
  const noop = () => {};

  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="Delete this invoice?" onConfirm={noop} onCancel={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is an alertdialog with an accessible name and description', () => {
    render(
      <ConfirmDialog
        open
        title="Delete this invoice?"
        description="This cannot be undone."
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Delete this invoice?');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
  });

  it('focuses Cancel, not Confirm, so a stray Enter is safe', async () => {
    render(<ConfirmDialog open title="Delete this lead?" onConfirm={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('Escape cancels', async () => {
    const onCancel = jest.fn();
    render(<ConfirmDialog open title="Delete this deal?" onConfirm={noop} onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while busy', () => {
    render(<ConfirmDialog open busy title="Delete this user?" onConfirm={noop} onCancel={noop} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  });
});

describe('DS-3: useConfirm', () => {
  function Subject({ onResult }: { onResult: (value: boolean) => void }) {
    const confirm = useConfirm();
    return (
      <button
        type="button"
        onClick={async () => onResult(await confirm({ title: 'Delete this document?' }))}
      >
        Delete
      </button>
    );
  }

  it('resolves true when confirmed', async () => {
    const onResult = jest.fn();
    render(
      <ConfirmProvider>
        <Subject onResult={onResult} />
      </ConfirmProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('resolves false when cancelled, and closes', async () => {
    const onResult = jest.fn();
    render(
      <ConfirmProvider>
        <Subject onResult={onResult} />
      </ConfirmProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('never leaves an awaited promise unsettled', async () => {
    // A second request while one is open resolves the first as cancelled.
    const onResult = jest.fn();
    render(
      <ConfirmProvider>
        <Subject onResult={onResult} />
      </ConfirmProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });
});

describe('DS-3: the provider is mounted', () => {
  it('app/layout.tsx wraps children in ConfirmProvider', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const layout = fs.readFileSync(`${process.cwd()}/app/layout.tsx`, 'utf8');
    expect(layout).toContain(
      "import { ConfirmProvider } from '@/components/providers/ConfirmProvider'",
    );
    expect(layout).toContain('<ConfirmProvider>{children}</ConfirmProvider>');
  });
});
