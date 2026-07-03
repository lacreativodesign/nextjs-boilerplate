// Jest stub for @sentry/nextjs. The real package's export map fails to resolve
// under jest-fixed-jsdom, breaking every suite that transitively imports
// lib/monitoring/sentry.ts. Unit tests never need live telemetry.
module.exports = {
  setUser: () => {},
  setTag: () => {},
  withScope: (fn) =>
    fn({
      setTag: () => {},
      setUser: () => {},
      setLevel: () => {},
      setContext: () => {},
      setExtra: () => {},
    }),
  captureException: () => {},
  captureMessage: () => {},
  startSpan: (_opts, fn) => fn(),
  addBreadcrumb: () => {},
  init: () => {},
};
