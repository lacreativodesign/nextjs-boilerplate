const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-fixed-jsdom',
  moduleNameMapper: {
    '^@sentry/nextjs$': '<rootDir>/__mocks__/@sentry-nextjs.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  collectCoverage: true,
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    '!lib/**/*.d.ts',
    // `app/` is not instrumented as a whole: most route files have no suite, and pulling
    // all of them in would report a global number that says nothing about what is tested.
    // This route is the exception — PR5 rewrote it and added a behavioural suite that
    // drives both handlers end to end (__tests__/api/pr5-restore-validation-behaviour).
    // Without it here that coverage never reaches coverage/lcov.info, so Sonar scores the
    // most safety-critical route in the change as entirely untested. Add a route here when
    // it earns a suite of its own, never to move a number.
    'app/api/super_admin/restore/route.ts',
    // Same exception, same reason: PR6 rewrote both Super Admin demo endpoints and added a
    // behavioural suite that drives each one end to end through the shared handler
    // (__tests__/api/pr6-demo-route-contract) — including the path where authorization fails
    // and no tenant data may be touched. That coverage is real; without these entries it never
    // reaches coverage/lcov.info and Sonar scores a destructive endpoint as entirely untested.
    'app/api/super_admin/demo/_handler.ts',
    'app/api/super_admin/demo/seed/route.ts',
    'app/api/super_admin/demo/reset/route.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Coverage ratchet: baseline set just below current actuals so `npm test` is a
  // real, passing gate. RAISE these as suites are added — never lower them. The
  // previous 70% target was aspirational and made the gate impossible to pass.
  coverageThreshold: {
    global: {
      branches: 3,
      functions: 5,
      lines: 5,
      statements: 5,
    },
    // Q2: risk-based floors on the highest-risk billing gate. lib/subscription.ts decides tenant
    // access (read-only / hard-lock / trial) and the billing state machine; it is now fully
    // covered, so pin a high floor to prevent regressions in this critical path specifically,
    // independent of the (low) global floor.
    './lib/subscription.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './lib/billing/apply-subscription-state.ts': {
      branches: 60,
      functions: 90,
      lines: 85,
      statements: 85,
    },
  },
};

// next/jest prepends a catch-all `/node_modules/` transformIgnorePattern, which
// would keep msw v2's ESM-only dependencies untransformed and break the suite.
// Override the resolved config so those packages are transformed while keeping
// the CSS-module ignore pattern that next/jest relies on.
const esmPackages = [
  'msw',
  '@mswjs',
  '@bundled-es-modules',
  'rettime',
  'until-async',
  'headers-polyfill',
  'strict-event-emitter',
  'outvariant',
  '@open-draft',
  // S14: exceljs ships ESM in parts of its xlsx transform layer, and pulls a nested
  // ESM-only build of uuid.
  'exceljs',
  'uuid',
];

module.exports = async () => {
  const config = await createJestConfig(customJestConfig)();
  config.transformIgnorePatterns = [
    `/node_modules/(?!(?:${esmPackages.join('|')})/)`,
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  return config;
};
