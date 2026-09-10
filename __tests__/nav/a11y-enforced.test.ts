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
  it('the header no longer renders the in-app language selector (EN-only launch)', () => {
    // The translator UI was removed for launch: only ~60 keys were translated and only the
    // nav consumed them, so a switcher left 95% of the product in English. The i18n
    // infrastructure (I18nProvider, message catalogs) is retained for a later, complete
    // rollout; only the Header entry point is gone. This pins that the flag-button dropdown
    // and its locale wiring are not present, so it cannot be reintroduced by accident.
    const header = read('components/layout/Header.tsx');
    expect(header).not.toContain('common.language');
    expect(header).not.toContain('SUPPORTED_LOCALES');
    expect(header).not.toContain('setLocale');
    expect(header).not.toContain('{item.flag}');
  });

  it('the core jsx-a11y rules are enforced at error level, not warn', () => {
    const config = JSON.parse(read('.eslintrc.json')) as {
      rules: Record<string, unknown>;
      overrides?: Array<{ files: string[]; rules: Record<string, unknown> }>;
    };
    const severity = (rule: string) => {
      const value = config.rules[rule];
      return Array.isArray(value) ? value[0] : value;
    };

    for (const rule of [
      'jsx-a11y/alt-text',
      'jsx-a11y/aria-props',
      'jsx-a11y/aria-role',
      'jsx-a11y/role-has-required-aria-props',
    ]) {
      expect(severity(rule)).toBe('error');
    }

    // The lib/pdf override narrows which elements alt-text inspects, because `Image` there is
    // @react-pdf/renderer's PDF primitive and has no alt prop at all. It must never downgrade
    // the severity — real <img> elements in that tree still have to fail the build.
    for (const override of config.overrides ?? []) {
      const value = override.rules['jsx-a11y/alt-text'];
      if (value !== undefined) {
        expect(Array.isArray(value) ? value[0] : value).toBe('error');
      }
    }
  });

  it('no flat config can shadow the eslintrc gate', () => {
    // `next lint` probes eslint.config.* BEFORE .eslintrc.json and, on finding one, switches
    // to flat mode. A flat config that cannot load does not fall back — it takes the whole
    // lint gate down with it, which is exactly what an ESLint-9-only `eslint/config` import
    // did here while this repo pins ESLint 8. Worse, the rules above lived in that dead file,
    // so they were pinned by this test while enforcing nothing. Keep the live config the only
    // config until ESLint itself is upgraded.
    for (const candidate of [
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
      'eslint.config.mts',
      'eslint.config.cts',
    ]) {
      expect(fs.existsSync(path.join(process.cwd(), candidate))).toBe(false);
    }
  });
});
