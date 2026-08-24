import React, { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '@/components/ui/Modal';
import TablePager from '@/components/ui/TablePager';
import { DEFAULT_PAGE_SIZE, getPageInfo, pageSlice } from '@/lib/ui/paginate';

/**
 * DS-4 — the modal shell and the table pager.
 *
 * Neither is adopted yet. These pin the behaviours the 18 hand-rolled `fixed inset-0`
 * dialogs were each missing, so the migration sessions have something to migrate onto.
 */

describe('DS-4: Modal', () => {
  const noop = () => {};

  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={noop} title="Create Project">
        <p>Body</p>
      </Modal>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is a dialog with an accessible name and description', () => {
    render(
      <Modal open onClose={noop} title="Create Project" description="Add a project to this client.">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Create Project');
    expect(dialog).toHaveAccessibleDescription('Add a project to this client.');
  });

  it('can present as an alertdialog', () => {
    render(<Modal open onClose={noop} title="Discard changes?" role="alertdialog" />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('Escape closes', async () => {
    const onClose = jest.fn();
    render(<Modal open onClose={onClose} title="Invite Team Member" />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on an overlay click but not on a click inside the panel', async () => {
    const onClose = jest.fn();
    render(
      <Modal open onClose={onClose} title="Export">
        <button type="button">Inside</button>
      </Modal>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('an undismissable dialog ignores the overlay and hides the X', async () => {
    const onClose = jest.fn();
    render(
      <Modal
        open
        onClose={onClose}
        title="Session expiring"
        showClose={false}
        closeOnOverlayClick={false}
      />,
    );
    await userEvent.click(screen.getByRole('presentation'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument();
  });

  it('the close button carries an accessible name', () => {
    render(<Modal open onClose={noop} title="Preview" />);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });

  it('honours initialFocusRef over the first focusable node', async () => {
    function Subject() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <Modal open onClose={noop} title="Create" initialFocusRef={ref}>
          <button type="button">First</button>
          <button type="button" ref={ref}>
            Preferred
          </button>
        </Modal>
      );
    }
    render(<Subject />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preferred' })).toHaveFocus());
  });

  it('locks body scroll while open and restores it on close', async () => {
    function Subject() {
      const [open, setOpen] = useState(true);
      return (
        <Modal open={open} onClose={() => setOpen(false)} title="Filters">
          <p>Body</p>
        </Modal>
      );
    }
    render(<Subject />);
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });

  it('keeps Tab inside the panel', async () => {
    render(
      <Modal open onClose={noop} title="Create" showClose={false}>
        <button type="button">One</button>
        <button type="button">Two</button>
      </Modal>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'One' })).toHaveFocus());
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Two' })).toHaveFocus();
    // Wrapping rather than escaping to the page behind is the whole point.
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'One' })).toHaveFocus();
  });

  it('stacks a top-layer dialog above a base-layer one', () => {
    const { container } = render(<Modal open onClose={noop} title="Confirm" layer="top" />);
    expect(container.firstElementChild).toHaveClass('z-[80]');
  });
});

describe('DS-4: getPageInfo', () => {
  it('reports one page for an empty result rather than zero', () => {
    const info = getPageInfo(0, 1, 25);
    expect(info).toMatchObject({ page: 1, totalPages: 1, firstRow: 0, lastRow: 0 });
    expect(info.hasPrevious).toBe(false);
    expect(info.hasNext).toBe(false);
  });

  it('computes 1-based display rows and 0-based slice bounds', () => {
    expect(getPageInfo(187, 3, 25)).toMatchObject({
      startIndex: 50,
      endIndex: 75,
      firstRow: 51,
      lastRow: 75,
      totalPages: 8,
    });
  });

  it('clamps a stale page index instead of blanking the table', () => {
    // Filtering down from 500 rows to 12 while on page 9 must not render nothing.
    expect(getPageInfo(12, 9, 25)).toMatchObject({ page: 1, firstRow: 1, lastRow: 12 });
  });

  it('does not overrun the last partial page', () => {
    expect(getPageInfo(52, 3, 25)).toMatchObject({ startIndex: 50, endIndex: 52, lastRow: 52 });
  });

  it('survives junk input', () => {
    expect(getPageInfo(-5, 0, 0).totalPages).toBe(1);
    expect(getPageInfo(10, Number.NaN, Number.NaN).page).toBe(1);
    expect(DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
  });

  it('pageSlice returns exactly the rows the info describes', () => {
    const items = Array.from({ length: 187 }, (_, i) => i);
    const slice = pageSlice(items, 3, 25);
    expect(slice).toHaveLength(25);
    expect(slice[0]).toBe(50);
    expect(slice[24]).toBe(74);
  });
});

describe('DS-4: TablePager', () => {
  it('shows the row range, not just the page number', () => {
    render(
      <TablePager
        page={3}
        pageSize={25}
        totalItems={187}
        onPageChange={jest.fn()}
        itemLabel="tenants"
      />,
    );
    expect(screen.getByText('51–75 of 187 tenants')).toBeInTheDocument();
    expect(screen.getByText('3 / 8')).toBeInTheDocument();
  });

  it('hides itself for a single page when there is no size control', () => {
    const { container } = render(
      <TablePager page={1} pageSize={25} totalItems={5} onPageChange={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(
      <TablePager page={1} pageSize={10} totalItems={30} onPageChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();

    rerender(<TablePager page={3} pageSize={10} totalItems={30} onPageChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('emits the next and previous page', async () => {
    const onPageChange = jest.fn();
    render(<TablePager page={2} pageSize={10} totalItems={100} onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('emits a new page size', async () => {
    const onPageSizeChange = jest.fn();
    render(
      <TablePager
        page={1}
        pageSize={25}
        totalItems={100}
        onPageChange={jest.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), '50');
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('is a labelled landmark and announces the range', () => {
    render(<TablePager page={1} pageSize={10} totalItems={30} onPageChange={jest.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByText('1–10 of 30 results')).toHaveAttribute('aria-live', 'polite');
  });

  it('reads sensibly with no rows at all', () => {
    render(
      <TablePager
        page={1}
        pageSize={25}
        totalItems={0}
        onPageChange={jest.fn()}
        onPageSizeChange={jest.fn()}
        itemLabel="invoices"
      />,
    );
    expect(screen.getByText('No invoices')).toBeInTheDocument();
  });
});
