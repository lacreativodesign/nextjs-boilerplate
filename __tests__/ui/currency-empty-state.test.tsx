import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyState from '@/components/ui/EmptyState';
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatWholeCurrency,
} from '@/lib/format/currency';

/**
 * DS-5 — money formatting and the empty state.
 *
 * Nothing adopts these yet; S15–S18 and S24 do. This pins the contracts, and in
 * particular the grouping defect that made a five-figure invoice read `$1234.56`.
 */

describe('DS-5: formatCurrency', () => {
  it('groups thousands — the /finance/invoices defect', () => {
    // The page rendered `getCurrencySymbol(currency)` + `.toFixed(2)` on the amount
    // column and all three totals, so 1234.56 printed as $1234.56.
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(1234567.891)).toBe('$1,234,567.89');
  });

  it('defaults to the currency\u2019s own precision', () => {
    expect(formatCurrency(1234, { currency: 'JPY' })).toBe('\u00a51,234');
    expect(formatCurrency(1234, { currency: 'USD' })).toBe('$1,234.00');
  });

  it('honours a forced decimal count', () => {
    expect(formatCurrency(1234.56, { decimals: 0 })).toBe('$1,235');
    expect(formatCurrency(1234.5, { decimals: 2 })).toBe('$1,234.50');
  });

  it('renders zero rather than NaN for missing values', () => {
    // A money column is the worst place in the product to leak a bad value.
    for (const value of [null, undefined, Number.NaN, 'not a number']) {
      expect({ value, out: formatCurrency(value as never) }).toEqual({ value, out: '$0.00' });
    }
  });

  it('accepts a numeric string, as API payloads often supply', () => {
    expect(formatCurrency('1234.5')).toBe('$1,234.50');
  });

  it('supports an explicit fallback', () => {
    expect(formatCurrency(null, { fallback: '—' })).toBe('—');
  });

  it('does not throw on a malformed currency code', () => {
    expect(formatCurrency(12.5, { currency: 'NOTACODE' })).toContain('12.50');
  });

  it('handles negatives and zero', () => {
    expect(formatCurrency(-1234.5)).toBe('-$1,234.50');
    expect(formatCurrency(0)).toBe('$0.00');
  });
});

describe('DS-5: the other entry points', () => {
  it('formatCompactCurrency shortens large amounts', () => {
    expect(formatCompactCurrency(1234567)).toBe('$1.2M');
    expect(formatCompactCurrency(1200)).toBe('$1.2K');
  });

  it('formatWholeCurrency drops the cents', () => {
    // Matches what the six dashboards were each doing with maximumFractionDigits: 0.
    expect(formatWholeCurrency(1234.56)).toBe('$1,235');
  });

  it('formatNumber groups without a currency symbol', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(1234.567, 2)).toBe('1,234.57');
    expect(formatNumber(null)).toBe('0');
  });
});

describe('DS-5: EmptyState', () => {
  it('renders the title, description and hint', () => {
    render(
      <EmptyState title="No invoices found" description="Try adjusting filters." hint="Tip" />,
    );
    expect(screen.getByText('No invoices found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting filters.')).toBeInTheDocument();
    expect(screen.getByText('Tip')).toBeInTheDocument();
  });

  it('the card variant is a bordered panel', () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.firstElementChild).toHaveClass('border');
    expect(container.firstElementChild).toHaveClass('bg-surface');
  });

  it('the table variant drops the border so it can sit inside a table shell', () => {
    // Every current consumer wraps the card in a padded div inside `.table-shell`,
    // producing a bordered card nested inside a bordered card.
    const { container } = render(<EmptyState title="No rows" variant="table" />);
    expect(container.firstElementChild).not.toHaveClass('border');
    expect(container.firstElementChild).toHaveClass('bg-transparent');
  });

  it('fires the primary and secondary actions', async () => {
    const onClick = jest.fn();
    const onSecondary = jest.fn();
    render(
      <EmptyState
        title="No clients yet"
        action={{ label: 'Add client', onClick }}
        secondaryAction={{ label: 'Import CSV', onClick: onSecondary }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add client' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('renders no button when no action is given', () => {
    render(<EmptyState title="No results" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides the decorative icon from assistive tech', () => {
    const { container } = render(<EmptyState title="No data" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('uses design tokens, not raw palette values', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/ui/EmptyState.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/text-gray-|bg-gray-|border-gray-/);
    expect(source).toContain('text-ink-muted');
  });
});

describe('DS-5: one empty-state implementation', () => {
  it('the unreferenced .empty-state CSS block is gone', () => {
    // 38 lines defining .empty-state, __badge, __title, __description, __hint and
    // --compact, with zero consumers — the component was always Tailwind.
    const css = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
    expect(css).not.toContain('.empty-state');
  });
});
