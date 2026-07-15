import * as fs from 'fs';
import * as path from 'path';

/**
 * S31 — accessibility is enforced at build time, and the one real gap on the high-traffic
 * surfaces is closed.
 *
 * An objective lint pass (eslint-plugin-jsx-a11y, recommended AND strict) found the primary
 * pages already clean — the app uses semantic HTML, so it did not need aria attributes bolted
 * on. The genuine exception was the language-selector buttons in the header, whose only
 * content was a flag emoji: a screen reader announced them with no usable name. Those now
 * carry an aria-label built from the language name, with the decorative flag hidden.
 *
 * More importantly, the jsx-a11y rules were running at 'warn', so any future regression (an
 * unlabeled icon button, an <img> with no alt) would ship silently. They are now 'error', so
 * the build fails instead. This test pins both facts.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('S31: accessibility', () => {
  it('the language buttons have an accessible name, not just a flag emoji', () => {
    const header = read('components/layout/Header.tsx');
    expect(header).toContain('aria-label={`${item.language} (${item.nativeName})`}');
    // The decorative flag is hidden from assistive tech.
    expect(header).toContain('<span aria-hidden="true">{item.flag}</span>');
  });

  it('the core jsx-a11y rules are enforced at error level, not warn', () => {
    const config = read('eslint.config.mjs');
    for (const rule of [
      'jsx-a11y/alt-text',
      'jsx-a11y/aria-props',
      'jsx-a11y/aria-role',
      'jsx-a11y/role-has-required-aria-props',
    ]) {
      const re = new RegExp(`'${rule.replace('/', '\\/')}':\\s*'error'`);
      expect(config).toMatch(re);
    }
    expect(config).not.toMatch(/'jsx-a11y\/alt-text':\s*'warn'/);
  });
});
