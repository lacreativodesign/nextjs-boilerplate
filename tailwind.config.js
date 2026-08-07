/** @type {import('tailwindcss').Config} */
module.exports = {
  // The app toggles dark mode by adding the `dark` class to <html> (see ThemeProvider and
  // the boot script in app/layout.tsx). Without this, Tailwind defaults to the `media`
  // strategy, so every `dark:` utility keyed off the OS setting instead of the in-app theme
  // toggle — a user on a light OS who chose Dark got no dark styling, and vice versa.
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
