/** @type {import('tailwindcss').Config} */
module.exports = {
  // The app toggles dark mode by adding the `dark` class to <html> (see ThemeProvider and
  // the boot script in app/layout.tsx). Without this, Tailwind defaults to the `media`
  // strategy, so every `dark:` utility keyed off the OS setting instead of the in-app theme
  // toggle — a user on a light OS who chose Dark got no dark styling, and vice versa.
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    // DS-2: `extend` was empty, so no design token was reachable as a Tailwind utility.
    // Every token use cost an arbitrary-value bracket (`bg-[var(--surface-card)]`) while
    // `bg-gray-50` was one word — which is why 130 hardcoded colours accumulated across 79
    // files. These aliases make the token the shorter thing to type.
    //
    // Vocabulary: `surface` = backgrounds, `ink` = text, `line` = borders, plus the four
    // semantic hues. Each resolves to the CSS variable, so light/dark switching still happens
    // in one place (app/globals.css) and nothing here needs a `dark:` counterpart.
    //
    // Note: because these are `var()` and not raw channels, Tailwind's slash-opacity syntax
    // (`bg-surface/50`) does not apply. Use the `-soft` variants, which are pre-tinted.
    extend: {
      fontFamily: {
        sans: ['var(--brand-font)'],
        display: ['var(--brand-heading-font)'],
      },
      colors: {
        app: 'var(--app-bg)',
        surface: {
          DEFAULT: 'var(--surface-card)',
          muted: 'var(--surface-muted)',
          elevated: 'var(--surface-elevated)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          muted: 'var(--text-muted)',
          soft: 'var(--text-soft)',
        },
        brand: {
          DEFAULT: 'var(--erp-blue)',
          hover: 'var(--erp-blue-hover)',
          soft: 'var(--erp-blue-soft)',
        },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
      },
      borderColor: {
        line: 'var(--border-subtle)',
        'line-strong': 'var(--border-strong)',
      },
      // Named distinctly from Tailwind's shadow-sm/md/lg so existing utilities keep
      // their current meaning and nothing re-renders unexpectedly.
      boxShadow: {
        card: 'var(--shadow-sm)',
        'card-md': 'var(--shadow-md)',
        'card-lg': 'var(--shadow-lg)',
        lift: 'var(--shadow-lift)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        premium: 'var(--motion-ease)',
      },
      maxWidth: {
        page: 'var(--page-max-width)',
      },
    },
  },
  plugins: [],
};
