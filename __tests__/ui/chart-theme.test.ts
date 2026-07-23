import fs from 'fs';
import path from 'path';

/**
 * Q11 — theme-aware charts guard.
 *
 * Recharts renders its legend, axis ticks, grid and default tooltip with
 * hardcoded light-theme colours. On the dark card surface (--surface-card
 * #15171b) that text is effectively invisible. globals.css drives those chart
 * chrome elements from the design tokens instead, which fixes every recharts
 * chart in the app at once.
 */

const read = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const GLOBALS = 'app/globals.css';

describe('recharts chrome is driven by design tokens', () => {
  const css = read(GLOBALS);

  it('styles the legend text with a token', () => {
    expect(css).toMatch(/\.recharts-legend-item-text\s*\{[^}]*var\(--text-primary\)/);
  });

  it('styles axis tick values with a token', () => {
    expect(css).toMatch(/\.recharts-cartesian-axis-tick-value/);
    expect(css).toMatch(/\.recharts-text[\s,]/);
  });

  it('styles the default tooltip surface and text with tokens', () => {
    const tooltip = css.slice(css.indexOf('.recharts-default-tooltip'));
    expect(tooltip).toMatch(/var\(--surface-card\)/);
    expect(tooltip).toMatch(/var\(--border-strong\)/);
    expect(tooltip).toMatch(/var\(--text-primary\)/);
  });

  it('styles grid lines with a token', () => {
    expect(css).toMatch(/\.recharts-cartesian-grid line/);
    const grid = css.slice(css.indexOf('.recharts-cartesian-grid line'));
    expect(grid.slice(0, 260)).toMatch(/var\(--border-subtle\)/);
  });

  it('uses !important on the tooltip (recharts sets it inline)', () => {
    const tooltip = css.slice(
      css.indexOf('.recharts-default-tooltip'),
      css.indexOf('.recharts-tooltip-cursor'),
    );
    expect(tooltip).toContain('!important');
  });
});

describe('chart components do not hardcode chrome colours', () => {
  it('ExpenseBreakdownChart defines only data-series colours', () => {
    const src = read('components/finance/ExpenseBreakdownChart.tsx');
    expect(src).toContain('const COLORS = [');
    expect(src).not.toMatch(/legend[A-Za-z]*Style|itemStyle|labelStyle/i);
  });
});
