import * as fs from 'fs';
import * as path from 'path';

import {
  PRODUCTION_FIREBASE_PROJECT_ID,
  PRODUCTION_FIREBASE_STORAGE_BUCKET,
  assertStagingCertificationTarget,
  evaluateStagingCertificationTarget,
} from '@/lib/firebase/environment.mjs';

/**
 * P0-01 — a mutable certification run must be technically incapable of writing production.
 *
 * `.github/workflows/smoke.yml` rebuilds the golden tenant with `--reset`, which deletes
 * every `bizosto-demo` document in nine collections. Two things used to decide where those
 * deletes landed, and neither was checked:
 *
 *   - whichever service account `FIREBASE_ADMIN_KEY` happened to hold. The one configured
 *     secret is the production account.
 *   - whichever Firebase project the deployment served, which on main (da41e8d) was
 *     `la-creativo-erp` for Previews as well as production.
 *
 * The workflow also carried an explicit "secret missing -> skip the reseed -> certify
 * anyway" branch, so a run could certify against a fixture nobody had rebuilt.
 *
 * This suite pins the replacement from both sides: the DECISION (the pure contract, driven
 * through every rejection) and the WIRING (the workflow that has to call it). The exact-SHA
 * protection from PR #1008 is asserted to survive alongside it, because the two now share
 * the same /api/health round trip.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const SMOKE_WORKFLOW = '.github/workflows/smoke.yml';
const VERIFY_SCRIPT = 'scripts/verify-golden-tenant-signin.mjs';

const STAGING_PROJECT = 'example-staging-project';
const STAGING_BUCKET = 'example-staging-project.firebasestorage.app';
const COMMIT = 'da41e8d1f223c1aa2ca6b1ccaa43167dab195519';

/** What a correctly isolated staging Preview answers on /api/health. */
const stagingHealth = {
  status: 'ok',
  commit: COMMIT,
  vercelEnv: 'preview',
  firebase: {
    browserProjectId: STAGING_PROJECT,
    browserStorageBucket: STAGING_BUCKET,
    adminProjectId: STAGING_PROJECT,
    isolation: 'ok',
    violations: [],
  },
};

/** What production answers today, and what the PR #1008 Preview also answered. */
const productionHealth = {
  status: 'ok',
  commit: COMMIT,
  vercelEnv: 'production',
  firebase: {
    browserProjectId: PRODUCTION_FIREBASE_PROJECT_ID,
    browserStorageBucket: PRODUCTION_FIREBASE_STORAGE_BUCKET,
    adminProjectId: PRODUCTION_FIREBASE_PROJECT_ID,
    isolation: 'ok',
    violations: [],
  },
};

const refusal = (input: Parameters<typeof evaluateStagingCertificationTarget>[0]) =>
  evaluateStagingCertificationTarget(input).violations.join('\n');

describe('P0-01: the certification target contract', () => {
  it('accepts an isolated staging Preview whose credential matches', () => {
    expect(
      evaluateStagingCertificationTarget({
        reported: stagingHealth,
        credentialProjectId: STAGING_PROJECT,
      }),
    ).toEqual({ ok: true, violations: [], projectId: STAGING_PROJECT });
  });

  /**
   * The hard negative guard. This is the run that would have deleted production data.
   */
  it('refuses a deployment reporting the production project and bucket', () => {
    const reported = refusal({
      reported: productionHealth,
      credentialProjectId: PRODUCTION_FIREBASE_PROJECT_ID,
    });

    expect(reported).toMatch(/serves the production Firebase project "la-creativo-erp"/);
    expect(reported).toMatch(/serves the production Storage bucket/);
    expect(reported).toMatch(/may only target a Vercel Preview deployment/);
    expect(reported).toMatch(/Admin credential supplied to this run belongs to the production/);
  });

  it('refuses a Preview that still serves production Firebase', () => {
    // A Preview URL is not by itself evidence of isolation — this is exactly what main
    // (da41e8d) served, and the reason the project is checked rather than the environment.
    expect(
      refusal({
        reported: { ...productionHealth, vercelEnv: 'preview' },
        credentialProjectId: PRODUCTION_FIREBASE_PROJECT_ID,
      }),
    ).toMatch(/Refusing to reset the golden tenant against production/);
  });

  it('refuses a deployment whose server and browsers disagree', () => {
    expect(
      refusal({
        reported: {
          ...stagingHealth,
          firebase: { ...stagingHealth.firebase, adminProjectId: 'a-third-project' },
        },
        credentialProjectId: STAGING_PROJECT,
      }),
    ).toMatch(/server writes to Firebase project "a-third-project" while its browsers/);
  });

  it('refuses a deployment that reports its own isolation as broken', () => {
    expect(
      refusal({
        reported: {
          ...stagingHealth,
          firebase: { ...stagingHealth.firebase, isolation: 'violation' },
        },
        credentialProjectId: STAGING_PROJECT,
      }),
    ).toMatch(/reports its Firebase environment isolation as "violation"/);
  });

  it('refuses a deployment too old to report its Firebase environment', () => {
    // Certification must not read silence as a pass.
    expect(refusal({ reported: { status: 'ok', commit: COMMIT } })).toMatch(
      /does not report its Firebase environment/,
    );
    expect(refusal({ reported: null })).toMatch(/does not report its Firebase environment/);
  });

  it('refuses a production service account for a staging seed', () => {
    expect(
      refusal({ reported: stagingHealth, credentialProjectId: PRODUCTION_FIREBASE_PROJECT_ID }),
    ).toMatch(/must be given the staging service account and nothing else/);
  });

  it('refuses a credential belonging to neither the deployment nor production', () => {
    expect(refusal({ reported: stagingHealth, credentialProjectId: 'a-third-project' })).toMatch(
      /belongs to Firebase project "a-third-project", but the deployment serves/,
    );
  });

  it('refuses a run with no readable staging credential, rather than seeding blind', () => {
    expect(
      refusal({
        reported: stagingHealth,
        credentialProjectId: null,
        credentialReason: 'FIREBASE_ADMIN_KEY is not set',
      }),
    ).toMatch(/FIREBASE_ADMIN_KEY is not set, so this run cannot prove/);
  });

  it('refuses a deployment that names neither its browser nor its server project', () => {
    // An empty firebase block is present but says nothing. "Present" must not read as
    // "proven".
    const reported = refusal({
      reported: { vercelEnv: 'preview', firebase: { isolation: 'ok' } },
      credentialProjectId: STAGING_PROJECT,
    });
    expect(reported).toMatch(/does not name the Firebase project it serves to browsers/);
    expect(reported).toMatch(/does not name the Firebase project its server writes to/);
  });

  it('assertStagingCertificationTarget returns the project or throws naming every reason', () => {
    expect(
      assertStagingCertificationTarget({
        reported: stagingHealth,
        credentialProjectId: STAGING_PROJECT,
      }),
    ).toBe(STAGING_PROJECT);

    expect(() =>
      assertStagingCertificationTarget({
        reported: productionHealth,
        credentialProjectId: PRODUCTION_FIREBASE_PROJECT_ID,
      }),
    ).toThrow(/Refusing to run a mutable golden tenant certification/);
  });
});

/** The script the workflow actually invokes, driven against a stubbed deployment. */
describe('P0-01: --assert-staging-target, end to end against a stubbed deployment', () => {
  type VerifyModule = typeof import('@/scripts/verify-golden-tenant-signin.mjs');
  const loadVerifier = (): Promise<VerifyModule> =>
    import('@/scripts/verify-golden-tenant-signin.mjs') as Promise<VerifyModule>;

  const stub = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

  const stubDeployment = (health: unknown, config: unknown) => async (url: string) => {
    if (url.includes('/api/health')) return stub(200, health);
    if (url.includes('/api/public/firebase-config')) return stub(200, config);
    throw new Error(`unexpected request to ${url}`);
  };

  const stagingConfig = {
    apiKey: 'browser-api-key',
    projectId: STAGING_PROJECT,
    storageBucket: STAGING_BUCKET,
  };
  const productionConfig = {
    apiKey: 'browser-api-key',
    projectId: PRODUCTION_FIREBASE_PROJECT_ID,
    storageBucket: PRODUCTION_FIREBASE_STORAGE_BUCKET,
  };

  const env = {
    BASE_URL: 'https://preview.example/',
    E2E_DEMO_PASSWORD: 'never-appears-in-output-0001',
    EXPECTED_COMMIT_SHA: COMMIT,
    FIREBASE_ADMIN_KEY: JSON.stringify({ project_id: STAGING_PROJECT }),
  };

  it('returns the staging project for a proven staging deployment', async () => {
    const { assertStagingTarget } = await loadVerifier();

    await expect(
      assertStagingTarget(
        env,
        stubDeployment(stagingHealth, stagingConfig) as unknown as typeof fetch,
      ),
    ).resolves.toMatchObject({
      projectId: STAGING_PROJECT,
      storageBucket: STAGING_BUCKET,
      commit: COMMIT,
    });
  });

  it('refuses the production-reporting deployment the workflow used to seed', async () => {
    const { assertStagingTarget } = await loadVerifier();

    await expect(
      assertStagingTarget(
        {
          ...env,
          FIREBASE_ADMIN_KEY: JSON.stringify({ project_id: PRODUCTION_FIREBASE_PROJECT_ID }),
        },
        stubDeployment(productionHealth, productionConfig) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/Refusing to reset the golden tenant against production/);
  });

  /** PR #1008's protection, on the same round trip. */
  it('still refuses a deployment serving a different commit than the one certified', async () => {
    const { assertStagingTarget } = await loadVerifier();

    await expect(
      assertStagingTarget(
        { ...env, EXPECTED_COMMIT_SHA: 'a'.repeat(40) },
        stubDeployment(stagingHealth, stagingConfig) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(new RegExp(`serving commit ${COMMIT}`));
  });

  it('refuses a deployment whose two endpoints disagree with each other', async () => {
    const { assertStagingTarget } = await loadVerifier();

    await expect(
      assertStagingTarget(
        env,
        stubDeployment(stagingHealth, productionConfig) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/disagrees with itself/);
  });

  it('refuses a deployment whose two endpoints disagree about the bucket', async () => {
    const { assertStagingTarget } = await loadVerifier();

    await expect(
      assertStagingTarget(
        env,
        stubDeployment(stagingHealth, {
          ...stagingConfig,
          storageBucket: 'a-third-bucket.firebasestorage.app',
        }) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/reports Storage bucket .* but serves/);
  });

  it('refuses a deployment whose health endpoint is not reachable', async () => {
    const { assertStagingTarget } = await loadVerifier();
    const unreachable = async () => stub(503, {});

    await expect(assertStagingTarget(env, unreachable as unknown as typeof fetch)).rejects.toThrow(
      /\/api\/health returned HTTP 503/,
    );
  });

  it('summarises the proven target without printing anything secret', async () => {
    const { assertStagingTarget, describeStagingTarget } = await loadVerifier();
    const target = await assertStagingTarget(
      env,
      stubDeployment(stagingHealth, stagingConfig) as unknown as typeof fetch,
    );

    const summary = describeStagingTarget(target);
    expect(summary).toContain(STAGING_PROJECT);
    expect(summary).toContain(STAGING_BUCKET);
    expect(summary).toContain(COMMIT);
    expect(summary).not.toContain(env.E2E_DEMO_PASSWORD);
    expect(describeStagingTarget({ ...target, commit: '', storageBucket: null })).toContain(
      '(not reported)',
    );
  });

  it('never names the credential in a refusal', async () => {
    const { assertStagingTarget } = await loadVerifier();

    await assertStagingTarget(
      {
        ...env,
        FIREBASE_ADMIN_KEY: JSON.stringify({ project_id: 'x', private_key: 'SECRET-KEY' }),
      },
      stubDeployment(stagingHealth, stagingConfig) as unknown as typeof fetch,
    ).catch((error: Error) => {
      expect(error.message).not.toContain('SECRET-KEY');
      expect(error.message).toMatch(/belongs to Firebase project "x"/);
    });
    expect.hasAssertions();
  });
});

/**
 * Two new environment variables decide a security boundary, so what an operator is told
 * about them has to stay true. These are the documentation half of that: the contract's
 * own truth table is pinned behaviourally above and in
 * __tests__/lib/firebase-environment-isolation.test.ts.
 */
describe('P0-01: the new environment variables are documented where an operator looks', () => {
  const envExample = read('.env.example');
  const isolationRunbook = read('docs/runbooks/firebase-environment-isolation.md');
  const goldenRunbook = read('docs/runbooks/golden-tenant-e2e.md');
  const envSetup = read('docs/env-setup.md');

  it('names both variables in .env.example and in the environment reference', () => {
    for (const source of [envExample, envSetup]) {
      expect(source).toContain('STAGING_FIREBASE_PROJECT_ID');
      expect(source).toContain('STAGING_FIREBASE_STORAGE_BUCKET');
    }
  });

  it('keeps .env.example free of an invented staging project', () => {
    // No staging Firebase project existed when this shipped. A plausible-looking default
    // here would be configuration an operator could copy and believe.
    expect(envExample).toContain('# STAGING_FIREBASE_PROJECT_ID=<staging-firebase-project-id>');
    expect(envExample).toContain(
      '# STAGING_FIREBASE_STORAGE_BUCKET=<staging-firebase-project-id>.firebasestorage.app',
    );
  });

  it('gives the owner an explicit setup list rather than a warning', () => {
    expect(isolationRunbook).toContain('OWNER ACTION');
    for (const required of [
      'STAGING_FIREBASE_PROJECT_ID',
      'STAGING_FIREBASE_STORAGE_BUCKET',
      'FIREBASE_ADMIN_KEY_STAGING',
      'Email/Password',
      'Preview only',
    ]) {
      expect(isolationRunbook).toContain(required);
    }
  });

  it('tells the owner that a refusing Preview is the correct outcome, not a bypass', () => {
    // Prose wraps, so match across the line breaks rather than pinning a column width.
    expect(isolationRunbook).toMatch(/correct fail-closed\s+result, not a regression/);
    expect(isolationRunbook).toMatch(/Do not point Preview back at/);
    expect(goldenRunbook).toMatch(/do not point\s+Preview back at the production project/);
  });

  it('keeps the golden tenant runbook naming the staging secret the gate requires', () => {
    expect(goldenRunbook).toContain('FIREBASE_ADMIN_KEY_STAGING');
    expect(goldenRunbook).toContain('--assert-staging-target');
  });
});

describe('P0-01: the smoke gate is wired to staging and cannot fall back', () => {
  const source = read(SMOKE_WORKFLOW);
  /** Comments explain the production secret at length; assert on executable lines only. */
  const commands = source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  it('takes its Admin credential from a staging-only secret', () => {
    expect(commands).toContain('FIREBASE_ADMIN_KEY: ${{ secrets.FIREBASE_ADMIN_KEY_STAGING }}');
  });

  it('never reaches for the production Admin secret', () => {
    // `FIREBASE_ADMIN_KEY_STAGING` contains the production secret's name as a prefix, so
    // the match has to exclude it explicitly or it can never fail.
    expect(commands).not.toMatch(/secrets\.FIREBASE_ADMIN_KEY(?!_STAGING)/);
  });

  it('hard-fails when the staging secret is absent instead of certifying anyway', () => {
    expect(commands).toContain(
      "STAGING_ADMIN_KEY_CONFIGURED: ${{ secrets.FIREBASE_ADMIN_KEY_STAGING != '' }}",
    );
    expect(commands).toContain('if [ "$STAGING_ADMIN_KEY_CONFIGURED" != "true" ]; then');
    // The removed branch: "secret missing -> skip reseed -> certify anyway".
    expect(commands).not.toContain('exit 0');
  });

  it('proves the staging target before anything is written, and before the suite runs', () => {
    const assertTarget = commands.indexOf('--assert-staging-target');
    const seed = commands.indexOf('scripts/seedDemoTenant.ts --reset');
    const credential = commands.indexOf(VERIFY_SCRIPT);
    const suite = commands.indexOf('npx playwright test e2e/golden e2e/smoke');

    expect(assertTarget).toBeGreaterThan(-1);
    expect(assertTarget).toBeLessThan(seed);
    expect(seed).toBeLessThan(suite);
    expect(credential).toBeGreaterThan(-1);
    expect(credential).toBeLessThan(suite);
    expect(commands).toContain(
      'DEMO_FIREBASE_PROJECT_ID="$(node scripts/verify-golden-tenant-signin.mjs --assert-staging-target)"',
    );
  });

  it('makes the refusal end the job rather than be echoed past', () => {
    // Without `set -e` the failed command substitution would leave the variable empty and
    // the seeder would run with no declared project.
    const step = commands.slice(commands.indexOf('--assert-staging-target') - 400);
    expect(step).toContain('set -euo pipefail');
  });

  it('keeps the exact-SHA certification from PR #1008', () => {
    expect(commands).toContain('EXPECTED_COMMIT_SHA: ${{ github.sha }}');
  });

  it('keeps the secrets context out of every job-level if:, per DS-33', () => {
    for (const line of Array.from(source.matchAll(/^ {4}if:.*$/gm)).map((m) => m[0])) {
      expect(line).not.toContain('secrets.');
    }
  });

  it('prints no secret: the staging key reaches exactly one step', () => {
    const occurrences = commands.match(/FIREBASE_ADMIN_KEY_STAGING \}\}/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});
