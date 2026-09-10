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
    // The demo password policy is `.mjs` so that plain `node scripts/verify-golden-tenant-
    // signin.mjs` and the two TypeScript consumers can all import the SAME rule; the glob
    // above only takes .ts/.tsx, and Sonar analyses `lib/` either way, so without this the
    // one file that decides how a credential is read would report as untested.
    'lib/**/*.mjs',
    // `app/` is not instrumented as a whole: most route files have no suite, and pulling
    // all of them in would report a global number that says nothing about what is tested.
    // This route is the exception — PR5 rewrote it and added a behavioural suite that
    // drives both handlers end to end (__tests__/api/pr5-restore-validation-behaviour).
    // Without it here that coverage never reaches coverage/lcov.info, so Sonar scores the
    // most safety-critical route in the change as entirely untested. Add a route here when
    // it earns a suite of its own, never to move a number.
    'app/api/super_admin/restore/route.ts',
    // STOR-2 rendered this page under the same rule: __tests__/components/
    // client-files-upload-role.test.tsx renders ClientFilesPage itself and drives it
    // through MSW for both roles, so the role gate, the notice, the file list and the
    // drawer-open path all execute here. Without it the coverage those tests genuinely
    // produce never reaches coverage/lcov.info, and Sonar scores the one file the change
    // touches as 0% on new code.
    'app/client/files/page.tsx',

    // Added for the Next 15 async-params migration, on that same rule and no other. Each
    // of these already had a behavioural or security suite that drives its handlers before
    // this PR existed; the migration changed their request-handling signature, so their
    // coverage is now evidence about changed production lines and belongs in lcov.info.
    // Measured statement coverage when this list was written: mfa 83%, crm deals 87%,
    // sessions/[id] 68%, sessions 83%, notifications read 77%, projects/[id] 87%,
    // sales-write 48%, invalidate-all 75%. Nothing was added here that lacks a suite, and
    // no suite was written to make a file eligible.
    'app/api/admin/users/[uid]/mfa/route.ts',
    'app/api/auth/sessions/route.ts',
    'app/api/auth/sessions/[id]/route.ts',
    'app/api/auth/sessions/invalidate-all/route.ts',
    'app/api/crm/deals/[id]/route.ts',
    'app/api/notifications/[id]/read/route.ts',
    'app/api/projects/[id]/route.ts',
    'app/api/ai/tools/sales-write/route.ts',
    // The app/api/files/[id] family, covered by __tests__/api/files-routes-tenant-isolation.
    // Each resolves a file from a URL id, so the tenant scoping of that lookup is the only
    // thing between a caller and another tenant's file; the suite asserts that scoping, the
    // 404-not-leak behaviour, and that the awaited param id reaches the service layer.
    'app/api/files/[id]/route.ts',
    'app/api/files/[id]/download/route.ts',
    'app/api/files/[id]/versions/route.ts',
    'app/api/files/[id]/restore/route.ts',
    'app/api/files/[id]/tags/route.ts',
    // The app/api/documents/[id] family, covered by
    // __tests__/api/documents-routes-tenant-isolation. These read the document with an
    // unscoped doc(id), so the tenant comparison inside the handler is the whole isolation
    // boundary; the suite pins that, the per-document access rules, and the download-time
    // virus-scan gate.
    'app/api/documents/[id]/download/route.ts',
    'app/api/documents/[id]/version/route.ts',
    // Dashboard widgets and saved searches, covered by
    // __tests__/api/dashboard-saved-search-routes-isolation. The widget routes push the
    // ownership check into the service and are pinned on forwarding the session's own
    // tenant and uid; saved searches check tenant then owner-or-admin in the handler, and
    // both refusals are covered.
    'app/api/dashboard/widgets/[id]/route.ts',
    'app/api/dashboard/widgets/[id]/data/route.ts',
    'app/api/saved-searches/[id]/route.ts',
    // ai/agent-tasks, covered by __tests__/api/ai-agent-task-routes-isolation. These four
    // share a near-identical auth -> role-set -> plan-gate -> tenant preamble, which is why
    // they must not be collapsed into a helper: the role sets differ per route. The suite
    // pins that difference (run-finance admits finance and refuses sales; run-sales the
    // reverse) so an accidental copy-paste between the two files fails the build.
    'app/api/ai/agent-tasks/route.ts',
    'app/api/ai/agent-tasks/[taskId]/route.ts',
    'app/api/ai/agent-tasks/[taskId]/run-finance/route.ts',
    'app/api/ai/agent-tasks/[taskId]/run-sales/route.ts',
    // import jobs, webhook subscriptions and platform tickets, covered by
    // __tests__/api/bulk-webhook-ticket-routes-isolation. The import-errors route can
    // stream a job's rows out as a CSV attachment, so its tenant check is a bulk-export
    // boundary; the tickets route is deliberately cross-tenant and gated by
    // requireSuperAdmin instead, which the suite pins so that stays a decision.
    'app/api/import/jobs/[id]/status/route.ts',
    'app/api/import/jobs/[id]/errors/route.ts',
    'app/api/webhooks/subscriptions/[id]/route.ts',
    'app/api/super_admin/tickets/[ticketId]/route.ts',
    // Production planning and per-user locale, covered by
    // __tests__/api/production-users-routes-isolation. The production routes are pinned on
    // refusing another tenant's project BEFORE any follow-up task/dependency/milestone
    // query runs; the locale route on self-or-ManageUsers plus its own tenant check.
    'app/api/production/projects/[id]/gantt-data/route.ts',
    'app/api/production/projects/[id]/critical-path/route.ts',
    'app/api/users/[id]/locale/route.ts',
    // automation/workflows, covered by __tests__/api/automation-workflow-routes-isolation.
    // PUT merges an arbitrary request body into the workflow document, so the tenant check
    // is the only thing between a caller and overwriting another tenant's automation. The
    // suite pins that a body-supplied tenantId cannot re-home the record, and that a
    // foreign workflow is reported 404 rather than 403 so the id is not confirmed.
    'app/api/automation/workflows/[id]/route.ts',
    'app/api/automation/workflows/[id]/toggle/route.ts',
    'app/api/automation/workflows/[id]/runs/route.ts',
    // admin user read and the HR leave transitions, covered by
    // __tests__/api/admin-user-hr-leave-routes-isolation. The user read layers role and
    // tenant checks and answers 404 (not 403) cross-tenant so a uid is never confirmed;
    // the leave routes are pinned on the HR module gate running BEFORE any state
    // transition, since approving or rejecting moves someone's leave balance.
    'app/api/admin/users/[uid]/route.ts',
    'app/api/hr/leave/requests/[id]/approve/route.ts',
    'app/api/hr/leave/requests/[id]/reject/route.ts',
    // SSO and export download, covered by __tests__/api/sso-export-routes-isolation. The
    // SSO routes take the provider from the path, so it is pinned against a fixed
    // allow-list, and authorize's two modes are pinned apart: login is open by design,
    // link binds an identity to the current user and must refuse anonymously. The export
    // route hands back a signed URL to a whole data export, so both its gates — tenant and
    // completion — are asserted, including that no URL appears on the refusal paths.
    'app/api/auth/sso/[provider]/authorize/route.ts',
    'app/api/auth/sso/[provider]/link/route.ts',
    'app/api/export/jobs/[id]/download/route.ts',
    // Public invoice and reports, covered by
    // __tests__/api/public-invoice-reports-routes-isolation. The public invoice route has
    // no session at all — a token is the only thing in front of a customer's invoice — so
    // it is pinned on passing that token to the validator and leaking nothing when it is
    // refused. The reports route stacks module, tenant, category and sharing checks, and
    // the tenant one is pinned to refuse before the category rules are consulted.
    'app/api/public/invoice/[invoiceId]/route.ts',
    'app/api/reports/[id]/route.ts',
    // super_admin tenant administration, covered by
    // __tests__/api/super-admin-tenant-routes. Cross-tenant by design, so requireSuperAdmin
    // is the only gate and is pinned to stop the handler entirely. Two further properties
    // are locked in because the tenantId comes from the URL: set(merge) would CREATE a
    // document, so the existence check is what stops a phantom tenant being minted; and
    // logoUrl is rendered into an img src, so javascript:/data: must not survive validation.
    'app/api/super_admin/tenants/[tenantId]/branding/route.ts',
    'app/api/super_admin/tenants/[tenantId]/roles/route.ts',
    'app/api/super_admin/tenants/[tenantId]/route.ts',
    // impersonate hands back a custom token for a tenant admin — full account access — so
    // the suite pins that every refusal path mints nothing, and that the admin is selected
    // by a query scoped to both the awaited tenant and the admin role.
    'app/api/super_admin/tenants/[tenantId]/impersonate/route.ts',
    // reports/custom, covered by __tests__/api/custom-report-routes-isolation. All four
    // resolve through getCustomReportOrThrow(tenantId, id); the tenant comes from the
    // session and only the id from the URL, and every route asserts that call shape.
    'app/api/reports/custom/[id]/results/route.ts',
    'app/api/reports/custom/[id]/run/route.ts',
    'app/api/reports/custom/[id]/schedule/route.ts',
    // email/templates, covered by __tests__/api/email-template-routes-isolation. The tenant
    // comparison here runs through normalizeTenantId on both sides, so the suite exercises
    // that helper rather than mocking it away. Preview renders the template body and
    // variables discloses the merge fields, so each refusal path is pinned separately.
    'app/api/email/templates/[id]/route.ts',
    'app/api/email/templates/[id]/preview/route.ts',
    'app/api/email/templates/[id]/variables/route.ts',
    // modulesEnabled feeds resolveTenantModules and is cached by the plan layer, so a
    // malformed value becomes a stale entitlement decision that outlives the request; the
    // suite pins the key and value constraints and the no-phantom-tenant rule.
    'app/api/super_admin/tenants/[tenantId]/modules/route.ts',
    // Reactivation restores login access — an IAM action, not a profile edit — so HR is
    // refused despite holding ManageUsers. That distinction is what the suite pins.
    'app/api/users/[id]/reactivate/route.ts',
    // The two API-version catch-alls are the only routes the codemod could not migrate —
    // their handler is one shared function assigned to seven method exports — so the
    // async-params rewrite there was done by hand and every method export is driven
    // through a real Promise in __tests__/api/versioning-activity-routes.
    'app/api/v1/[[...path]]/route.ts',
    'app/api/v2/[[...path]]/route.ts',
    'app/api/activities/[id]/read/route.ts',
    // tax rates collapse "another tenant's", "soft-deleted" and "never existed" into one
    // 404 on purpose; each condition is asserted separately so neither can be dropped.
    'app/api/finance/tax-rates/[taxRateId]/route.ts',
    // support messages put the tenant in the DOCUMENT PATH rather than in a comparison —
    // the property the P0-1 exemption for this route claims — and the suite asserts the
    // path is built from the session tenant ahead of the awaited ticket id.
    'app/api/support/tickets/[id]/messages/route.ts',
    // The task-status route is the ONLY two-parameter route in the change, so it is the one
    // place a partially-awaited params object would resolve one value and silently leave
    // the other undefined. Both are pinned, along with the rule that a task must be in the
    // caller's tenant AND in the project the URL names.
    'app/api/projects/[id]/tasks/[taskId]/status/route.ts',
    'app/api/projects/[id]/tasks/route.ts',
    'app/api/users/[id]/route.ts',
    // The Zapier routes are the only API-key-authenticated surface in the change, so the
    // tenant comes from the key rather than a session. Every test sends a body claiming a
    // DIFFERENT tenant and asserts the key's tenant is what reaches the service.
    'app/api/zapier/actions/[action]/route.ts',
    'app/api/zapier/searches/[search]/route.ts',
    'app/api/zapier/hooks/[id]/unsubscribe/route.ts',
    // The CRM discount pair is a separation of duties: raising a discount and approving one
    // must stay distinct roles, or the same person could do both. The suite uses the real
    // canManageOwnDeals/canApproveDiscount predicates and exercises each route with the
    // role the OTHER one admits.
    'app/api/crm/deals/[id]/discount-request/route.ts',
    'app/api/crm/discount-requests/[id]/review/route.ts',
    // The users/[uid]/update adapter forwards to the ONE canonical implementation and
    // injects the path uid. The suite pins that the path uid wins over a body-supplied one,
    // otherwise the legacy URL could aim the canonical update at a different user.
    'app/api/admin/users/[uid]/update/route.ts',
    'app/api/automation/approvals/[id]/respond/route.ts',
    // The permissions routes read and write the permission model itself, so a caller who
    // slipped past requireAdminOrSuperAdmin would be editing what decides everyone else's
    // access; the user-permission snapshot is additionally pinned to the caller's tenant.
    'app/api/permissions/roles/[id]/route.ts',
    'app/api/permissions/user/[userId]/route.ts',
    // performance targets layer a manager-role check ahead of a tenant check; both are
    // covered, so the role check is never mistaken for sufficient authority. Its PATCH and
    // DELETE gate on deliberately different role sets, and the suite drives one manager role
    // through both so the narrower destructive gate cannot quietly widen to match the edit one.
    'app/api/performance/targets/[targetId]/route.ts',
    'app/api/search/saved/[id]/route.ts',
    'app/api/admin/jobs/[id]/retry/route.ts',

    // Same exception, same reason: PR6 rewrote both Super Admin demo endpoints and added a
    // behavioural suite that drives each one end to end through the shared handler
    // (__tests__/api/pr6-demo-route-contract) — including the path where authorization fails
    // and no tenant data may be touched. That coverage is real; without these entries it never
    // reaches coverage/lcov.info and Sonar scores a destructive endpoint as entirely untested.
    'app/api/super_admin/demo/_handler.ts',
    'app/api/super_admin/demo/seed/route.ts',
    'app/api/super_admin/demo/reset/route.ts',
    // `scripts/` is likewise not instrumented as a whole. This one is the exception
    // because it decides whether a certification run may proceed, and it has a
    // behavioural suite of its own (__tests__/ci/pr6-golden-tenant-precondition) that
    // drives every branch including the ones that must not print the password. Unlike
    // the routes above this is for the local gate only: `scripts/` is outside
    // sonar.sources, so Sonar neither sees the file nor scores it.
    'scripts/verify-golden-tenant-signin.mjs',
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
