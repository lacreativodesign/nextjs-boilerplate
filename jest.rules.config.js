const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/**
 * P0-04 — Jest project for the Firebase Security Rules BEHAVIOURAL certification.
 *
 * Separate from jest.config.js for three reasons, each of which would otherwise break the
 * suite or the main one:
 *
 *  1. jest.setup.js starts MSW with `onUnhandledRequest: 'error'`. The rules suites talk
 *     to the Firestore and Storage emulators over plain HTTP through the Firebase JS SDK,
 *     so every single request would be intercepted and rejected. The three existing
 *     emulator suites in __tests__/integration are unaffected because they use
 *     firebase-admin, whose transport is gRPC.
 *  2. `testEnvironment: 'jest-fixed-jsdom'` would resolve the browser build of
 *     @firebase/storage and run its XHR transport inside jsdom. The Node build is both
 *     simpler and the one that works headlessly, and rules evaluation is identical either
 *     way — the decision is made by the emulator, not the SDK.
 *  3. These suites are the ONLY ones that require a live emulator and they refuse to skip
 *     without one (see __tests__/rules/helpers/emulator.ts). Keeping them out of the
 *     default `npm test` run is what lets that refusal stay absolute instead of being
 *     softened into a conditional skip. jest.config.js ignores <rootDir>/__tests__/rules/
 *     for the same reason, and __tests__/ci/firebase-rules-behavioral-gate.test.ts fails
 *     the ordinary suite if the CI step that runs this project ever disappears.
 *
 * Coverage is off: these tests assert on a ruleset, not on TypeScript, so they contribute
 * nothing to lcov and would only dilute the ratchet in jest.config.js.
 */
const rulesJestConfig = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/__tests__/rules/**/*.rules.test.ts'],
  collectCoverage: false,
  // Real emulator round trips, plus two 50MB uploads for the size-ceiling cases.
  testTimeout: 180000,
  // One worker: both suites publish a ruleset to the same emulator instance, so running
  // them in parallel would have each overwrite the other's ruleset mid-run.
  maxWorkers: 1,
};

module.exports = async () => {
  const config = await createJestConfig(rulesJestConfig)();
  config.transformIgnorePatterns = ['/node_modules/', '^.+\\.module\\.(css|sass|scss)$'];
  return config;
};
