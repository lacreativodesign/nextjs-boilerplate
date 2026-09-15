import {
  PRODUCTION_FIREBASE_PROJECT_ID,
  PRODUCTION_FIREBASE_STORAGE_BUCKET,
  assertFirebaseEnvironment,
  describeFirebaseEnvironmentViolations,
  evaluateFirebaseEnvironment,
  firebaseEnvironmentReport,
  isNonRuntimePhase,
  isolationStatus,
  readAdminProjectId,
  readFirebaseIdentity,
  resolveDeploymentEnvironment,
} from '@/lib/firebase/environment.mjs';
import { assertServerEnv } from '@/lib/env';

/**
 * P0-01 — production and Preview/staging must never share a Firebase project.
 *
 * WHAT WAS WRONG
 *
 * Measured against main (da41e8d), the PR #1008 Vercel Preview answered
 * `/api/public/firebase-config` with
 *
 *   {"projectId":"la-creativo-erp","storageBucket":"la-creativo-erp.firebasestorage.app"}
 *
 * byte-identical to https://app.bizosto.com. Nothing in the codebase objected:
 * `lib/env.ts` accepted any service account with a non-empty `project_id`, and the config
 * route served whatever `NEXT_PUBLIC_FIREBASE_*` held. So a write-capable browser/E2E
 * certification run against a Preview wrote into the production project, and the golden
 * tenant `--reset` in smoke.yml deleted production documents.
 *
 * WHAT THIS SUITE PINS
 *
 * The full truth table of the contract, in both directions. It is deliberately behavioural
 * rather than source-text: the boundary must be decided by executing the rules, not by the
 * presence of a string in a file. The source-level tripwires that complement it live in
 * __tests__/ci/p0-01-staging-certification.test.ts.
 */

const PROD_KEY = JSON.stringify({
  type: 'service_account',
  project_id: PRODUCTION_FIREBASE_PROJECT_ID,
  private_key: '-----BEGIN PRIVATE KEY-----NEVER-IN-OUTPUT-----END PRIVATE KEY-----',
  client_email: 'prod-sa@la-creativo-erp.iam.gserviceaccount.com',
});

/**
 * A stand-in staging project id. It is a TEST FIXTURE, not a claim about cloud state: no
 * staging Firebase project existed when this was written, and the contract deliberately
 * hardcodes no staging identity — the owner names it through STAGING_FIREBASE_PROJECT_ID.
 */
const STAGING_PROJECT = 'example-staging-project';
const STAGING_BUCKET = 'example-staging-project.firebasestorage.app';
const STAGING_KEY = JSON.stringify({
  type: 'service_account',
  project_id: STAGING_PROJECT,
  private_key: '-----BEGIN PRIVATE KEY-----NEVER-IN-OUTPUT-----END PRIVATE KEY-----',
});

/** A correctly isolated Vercel Preview. */
const previewEnv = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  STAGING_FIREBASE_PROJECT_ID: STAGING_PROJECT,
  STAGING_FIREBASE_STORAGE_BUCKET: STAGING_BUCKET,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING_PROJECT,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: STAGING_BUCKET,
  FIREBASE_ADMIN_KEY: STAGING_KEY,
};

/** The canonical production runtime. */
const productionEnv = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: PRODUCTION_FIREBASE_STORAGE_BUCKET,
  FIREBASE_ADMIN_KEY: PROD_KEY,
};

const violations = (env: Record<string, string | undefined>) =>
  evaluateFirebaseEnvironment(env).violations.join('\n');

const accepted = (env: Record<string, string | undefined>) =>
  isolationStatus(evaluateFirebaseEnvironment(env)) === 'ok';

describe('P0-01: the canonical production identifiers are the ones in the repository', () => {
  it('names the project firebase.json and .env.example already name', () => {
    expect(PRODUCTION_FIREBASE_PROJECT_ID).toBe('la-creativo-erp');
    expect(PRODUCTION_FIREBASE_STORAGE_BUCKET).toBe('la-creativo-erp.firebasestorage.app');
  });
});

describe('P0-01: which environment is this', () => {
  it('classifies the three Vercel environments', () => {
    expect(resolveDeploymentEnvironment({ VERCEL_ENV: 'production' })).toBe('production');
    expect(resolveDeploymentEnvironment({ VERCEL_ENV: 'preview' })).toBe('preview');
    expect(resolveDeploymentEnvironment({ VERCEL_ENV: 'development' })).toBe('development');
  });

  it('treats a developer machine or CI as having no environment boundary', () => {
    expect(resolveDeploymentEnvironment({})).toBe('local');
    expect(evaluateFirebaseEnvironment({}).enforced).toBe(false);
  });

  /**
   * Without this, deleting one variable would switch the whole contract off on a real
   * deployment — the cheapest possible bypass.
   */
  it('fails closed on a Vercel runtime that does not say which environment it is', () => {
    expect(resolveDeploymentEnvironment({ VERCEL: '1' })).toBe('unrecognised');
    expect(resolveDeploymentEnvironment({ VERCEL_ENV: 'staging' })).toBe('unrecognised');
    expect(violations({ ...productionEnv, VERCEL_ENV: undefined })).toMatch(
      /cannot state which Firebase environment/,
    );
  });
});

describe('P0-01: a Vercel Preview may never touch production Firebase', () => {
  it('accepts a correctly isolated staging tuple', () => {
    expect(accepted(previewEnv)).toBe(true);
    expect(evaluateFirebaseEnvironment(previewEnv).expectedProjectId).toBe(STAGING_PROJECT);
  });

  it('rejects the production browser project', () => {
    expect(
      violations({
        ...previewEnv,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
      }),
    ).toMatch(/must never serve the production Firebase project "la-creativo-erp"/);
  });

  it('rejects the production Storage bucket', () => {
    expect(
      violations({
        ...previewEnv,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: PRODUCTION_FIREBASE_STORAGE_BUCKET,
      }),
    ).toMatch(/must never serve the production Storage bucket/);
  });

  it('rejects the production bucket named through the server-side override', () => {
    // lib/storage/bucket.ts prefers FIREBASE_STORAGE_BUCKET over the public one, so it
    // decides where Admin SDK writes land and belongs inside the boundary.
    expect(
      violations({ ...previewEnv, FIREBASE_STORAGE_BUCKET: PRODUCTION_FIREBASE_STORAGE_BUCKET }),
    ).toMatch(/FIREBASE_STORAGE_BUCKET names the production bucket/);
  });

  it('rejects a production Admin service account', () => {
    expect(violations({ ...previewEnv, FIREBASE_ADMIN_KEY: PROD_KEY })).toMatch(
      /service account for the production Firebase project/,
    );
  });

  it('rejects an Admin project that disagrees with the browser project', () => {
    const mismatched = JSON.stringify({ project_id: 'some-other-project' });
    const reported = violations({ ...previewEnv, FIREBASE_ADMIN_KEY: mismatched });
    expect(reported).toMatch(/must read and write one project/);
    expect(reported).toMatch(/some-other-project/);
  });

  it('exact-matches the declared staging identity rather than merely differing from production', () => {
    // A Preview pointed at some OTHER tenant-bearing project passes a "not production"
    // test and is still wrong, which is why the staging identity stays explicit.
    expect(
      violations({ ...previewEnv, NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'a-third-project' }),
    ).toMatch(/must use "example-staging-project"/);
    expect(
      violations({ ...previewEnv, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'a-third-bucket.app' }),
    ).toMatch(/must use "example-staging-project.firebasestorage.app"/);
  });

  it('fails closed when the staging identity is not configured at all', () => {
    const unconfigured = violations({
      ...previewEnv,
      STAGING_FIREBASE_PROJECT_ID: undefined,
      STAGING_FIREBASE_STORAGE_BUCKET: undefined,
    });
    expect(unconfigured).toMatch(/STAGING_FIREBASE_PROJECT_ID must name/);
    expect(unconfigured).toMatch(/STAGING_FIREBASE_STORAGE_BUCKET must name/);
    expect(accepted({ ...previewEnv, STAGING_FIREBASE_PROJECT_ID: undefined })).toBe(false);
  });

  it('refuses a staging identity that is just production under another name', () => {
    expect(
      violations({
        ...previewEnv,
        STAGING_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
        STAGING_FIREBASE_STORAGE_BUCKET: PRODUCTION_FIREBASE_STORAGE_BUCKET,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: PRODUCTION_FIREBASE_STORAGE_BUCKET,
        FIREBASE_ADMIN_KEY: PROD_KEY,
      }),
    ).toMatch(/Staging must be a separate Firebase project/);
  });

  it('fails closed when the deployment cannot say which project it serves browsers', () => {
    expect(violations({ ...previewEnv, NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined })).toMatch(
      /NEXT_PUBLIC_FIREBASE_PROJECT_ID is not configured/,
    );
    expect(violations({ ...previewEnv, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: undefined })).toMatch(
      /NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not configured/,
    );
  });

  it('fails closed when the Admin credential cannot be read', () => {
    expect(violations({ ...previewEnv, FIREBASE_ADMIN_KEY: undefined })).toMatch(
      /FIREBASE_ADMIN_KEY is not set, so this deployment cannot prove/,
    );
    expect(violations({ ...previewEnv, FIREBASE_ADMIN_KEY: 'not json' })).toMatch(
      /is not valid JSON, so this deployment cannot prove/,
    );
    expect(violations({ ...previewEnv, FIREBASE_ADMIN_KEY: '{}' })).toMatch(
      /carries no project_id, so this deployment cannot prove/,
    );
  });
});

describe('P0-01: production must be production', () => {
  it('accepts the canonical production tuple', () => {
    expect(accepted(productionEnv)).toBe(true);
    expect(evaluateFirebaseEnvironment(productionEnv).expectedStorageBucket).toBe(
      PRODUCTION_FIREBASE_STORAGE_BUCKET,
    );
  });

  it('rejects a production runtime pointed at the staging project', () => {
    expect(
      violations({
        ...productionEnv,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: STAGING_PROJECT,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: STAGING_BUCKET,
        FIREBASE_ADMIN_KEY: STAGING_KEY,
      }),
    ).toMatch(/this production deployment must use "la-creativo-erp"/);
  });

  it('rejects a production Admin/browser mismatch', () => {
    const reported = violations({ ...productionEnv, FIREBASE_ADMIN_KEY: STAGING_KEY });
    expect(reported).toMatch(/Admin service account belongs to Firebase project/);
    expect(reported).toMatch(/must read and write one project/);
  });

  it('rejects a production runtime whose Storage bucket is not the production bucket', () => {
    expect(
      violations({ ...productionEnv, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: STAGING_BUCKET }),
    ).toMatch(/must use "la-creativo-erp.firebasestorage.app"/);
    expect(violations({ ...productionEnv, FIREBASE_STORAGE_BUCKET: STAGING_BUCKET })).toMatch(
      /FIREBASE_STORAGE_BUCKET is "example-staging-project.firebasestorage.app"/,
    );
  });
});

describe('P0-01: build, test and local development keep working without live credentials', () => {
  it('enforces nothing where there is no environment boundary', () => {
    expect(evaluateFirebaseEnvironment({ VERCEL_ENV: 'development' }).enforced).toBe(false);
    expect(isolationStatus(evaluateFirebaseEnvironment({}))).toBe('not-enforced');
    expect(describeFirebaseEnvironmentViolations(evaluateFirebaseEnvironment({}))).toBeNull();
    // Even the exact configuration that is fatal on a Preview is inert on a laptop.
    expect(
      describeFirebaseEnvironmentViolations(
        evaluateFirebaseEnvironment({
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
          FIREBASE_ADMIN_KEY: STAGING_KEY,
        }),
      ),
    ).toBeNull();
  });

  it('recognises the two phases where boot-critical secrets are legitimately absent', () => {
    expect(isNonRuntimePhase({ NEXT_PHASE: 'phase-production-build' })).toBe(true);
    expect(isNonRuntimePhase({ NODE_ENV: 'test' })).toBe(true);
    expect(isNonRuntimePhase({ NODE_ENV: 'production' })).toBe(false);
  });

  it('does not let a deployed Preview claim to be a build phase', () => {
    // The phase exemption belongs to the two BOOT surfaces only. The contract itself has
    // no idea what NEXT_PHASE is, so a Preview that sets it is still evaluated.
    expect(
      violations({
        ...previewEnv,
        NEXT_PHASE: 'phase-production-build',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
      }),
    ).toMatch(/must never serve the production Firebase project/);
  });
});

describe('P0-01: the boot gate refuses to start a mis-wired runtime', () => {
  const validSecrets = { RESEND_API_KEY: 're_test_123', CRON_SECRET: 'a-real-cron-secret' };

  it('throws on a Preview serving production Firebase', () => {
    expect(() =>
      assertServerEnv({
        ...validSecrets,
        ...previewEnv,
        NODE_ENV: 'production',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
        FIREBASE_ADMIN_KEY: PROD_KEY,
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/must never serve the production Firebase project/);
  });

  it('starts a correctly isolated Preview', () => {
    expect(() =>
      assertServerEnv({
        ...validSecrets,
        ...previewEnv,
        NODE_ENV: 'production',
      } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('reports the schema failures and the isolation failures together', () => {
    // One boot, one aggregated message: an operator fixing a Preview should not have to
    // discover the second class of problem by redeploying.
    let message = '';
    try {
      assertServerEnv({
        NODE_ENV: 'production',
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
      } as unknown as NodeJS.ProcessEnv);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/RESEND_API_KEY/);
    expect(message).toMatch(/must never serve the production Firebase project/);
  });

  it('still warns instead of throwing during the build phase and under jest', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = {
      ...validSecrets,
      ...previewEnv,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: PRODUCTION_FIREBASE_PROJECT_ID,
    };
    expect(() =>
      assertServerEnv({
        ...broken,
        NODE_ENV: 'production',
        NEXT_PHASE: 'phase-production-build',
      } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(() =>
      assertServerEnv({ ...broken, NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('P0-01: nothing secret leaves this module', () => {
  it('reads the Admin key for its project_id and nothing else', () => {
    expect(readAdminProjectId({ FIREBASE_ADMIN_KEY: PROD_KEY })).toEqual({
      projectId: PRODUCTION_FIREBASE_PROJECT_ID,
      reason: null,
    });
    expect(readAdminProjectId({})).toEqual({
      projectId: null,
      reason: 'FIREBASE_ADMIN_KEY is not set',
    });
  });

  it('readFirebaseIdentity defaults to the ambient environment', () => {
    // The default parameter is what the route handlers and the Admin bootstrap rely on.
    const previous = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'ambient-project';
    try {
      expect(readFirebaseIdentity().browserProjectId).toBe('ambient-project');
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      else process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = previous;
    }
  });

  it('never puts credential material in a diagnostic or a report', () => {
    const env = { ...previewEnv, FIREBASE_ADMIN_KEY: PROD_KEY, E2E_DEMO_PASSWORD: 'super-secret' };
    const rendered =
      String(describeFirebaseEnvironmentViolations(evaluateFirebaseEnvironment(env))) +
      JSON.stringify(firebaseEnvironmentReport(env));

    expect(rendered).not.toContain('PRIVATE KEY');
    expect(rendered).not.toContain('iam.gserviceaccount.com');
    expect(rendered).not.toContain('super-secret');
    expect(rendered).not.toContain(PROD_KEY);
    // The project id IS named: identifying the wrong project is the entire point.
    expect(rendered).toContain(PRODUCTION_FIREBASE_PROJECT_ID);
  });

  it('publishes exactly the non-secret facts certification needs', () => {
    const report = firebaseEnvironmentReport(previewEnv);
    expect(report).toEqual({
      vercelEnv: 'preview',
      firebase: {
        environment: 'preview',
        browserProjectId: STAGING_PROJECT,
        browserStorageBucket: STAGING_BUCKET,
        adminProjectId: STAGING_PROJECT,
        expectedProjectId: STAGING_PROJECT,
        expectedStorageBucket: STAGING_BUCKET,
        isolation: 'ok',
        violations: [],
      },
    });
  });

  it('does not collide with the NODE_ENV `environment` field /api/health already has', () => {
    // The report is spread into the health body. A top-level `environment` key here would
    // overwrite NODE_ENV silently, changing what an existing consumer reads.
    expect(Object.keys(firebaseEnvironmentReport(previewEnv)).sort()).toEqual([
      'firebase',
      'vercelEnv',
    ]);
  });

  it('assertFirebaseEnvironment throws only when the contract is broken', () => {
    expect(() => assertFirebaseEnvironment(previewEnv)).not.toThrow();
    expect(() =>
      assertFirebaseEnvironment({ ...previewEnv, FIREBASE_ADMIN_KEY: PROD_KEY }),
    ).toThrow(/P0-01/);
  });
});
