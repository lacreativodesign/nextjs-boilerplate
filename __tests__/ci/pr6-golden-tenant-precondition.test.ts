import * as fs from 'fs';
import * as path from 'path';

/**
 * PR6 — the Golden Tenant gate must establish its own precondition.
 *
 * The gate assumed something nothing checked: that the ten `bizosto-demo` Auth accounts
 * carry the password the Playwright run types. That password lived in two stores kept in
 * step by hand — the deployment's server environment, which the Super Admin reset button
 * read, and this repository's `E2E_DEMO_PASSWORD`, which the browser types. When they
 * drifted the gate spent twenty minutes failing all thirteen tests with "Incorrect
 * password", which is also exactly what Firebase says when the account does not exist.
 *
 * Two changes close that, and this suite pins both:
 *
 *  - the seed runs from the SAME secret store the suite reads, so there is one copy of
 *    the password that decides the outcome;
 *  - the gate signs one demo account in against the deployment before the suite starts,
 *    and reports what Identity Platform actually said rather than guessing.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const SMOKE_WORKFLOW = '.github/workflows/smoke.yml';
const SEED_WORKFLOW = '.github/workflows/seed-golden-tenant.yml';
const VERIFY_SCRIPT = 'scripts/verify-golden-tenant-signin.mjs';

type VerifyModule = typeof import('@/scripts/verify-golden-tenant-signin.mjs');

const loadVerifier = (): Promise<VerifyModule> =>
  import('@/scripts/verify-golden-tenant-signin.mjs') as Promise<VerifyModule>;

/** A password long enough to satisfy the seeder, used only to prove it never leaks. */
const TEST_PASSWORD = 'never-appears-in-output-0001';

function stubResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const DEPLOYED_COMMIT = '8c49841a106d841750b07bad5d2bb7ac25322392';

/** Records every call so the suite can assert where the bypass secret was sent. */
function stubFetch(handlers: {
  health?: ReturnType<typeof stubResponse>;
  config?: ReturnType<typeof stubResponse>;
  signIn?: ReturnType<typeof stubResponse>;
}) {
  const calls: Array<{ url: string; init?: Record<string, unknown> }> = [];
  const impl = async (url: string, init?: Record<string, unknown>) => {
    calls.push({ url, init });
    if (url.includes('/api/health')) {
      return handlers.health ?? stubResponse(200, { status: 'ok', commit: DEPLOYED_COMMIT });
    }
    if (url.includes('/api/public/firebase-config')) {
      return (
        handlers.config ??
        stubResponse(200, { apiKey: 'browser-api-key', projectId: 'la-creativo-erp' })
      );
    }
    return handlers.signIn ?? stubResponse(200, { idToken: 'discarded', localId: 'uid' });
  };
  return { impl, calls };
}

const call = (calls: Array<{ url: string; init?: Record<string, unknown> }>, fragment: string) =>
  calls.find((entry) => entry.url.includes(fragment));

const baseEnv = {
  BASE_URL: 'https://deployment.example/',
  E2E_DEMO_PASSWORD: TEST_PASSWORD,
};

describe('PR6: the golden tenant credential is verified before the browser suite runs', () => {
  it('fails closed on missing or non-HTTPS configuration', async () => {
    const { readConfig } = await loadVerifier();

    expect(() => readConfig({})).toThrow(/BASE_URL and E2E_DEMO_PASSWORD/);
    expect(() => readConfig({ BASE_URL: 'https://x' })).toThrow(/E2E_DEMO_PASSWORD/);
    expect(() => readConfig({ BASE_URL: 'http://x', E2E_DEMO_PASSWORD: TEST_PASSWORD })).toThrow(
      /https/,
    );
    expect(readConfig(baseEnv).baseUrl).toBe('https://deployment.example');
  });

  it('takes the Firebase project from the deployment, not from local configuration', async () => {
    const { verifyGoldenTenantSignIn } = await loadVerifier();
    const fetchStub = stubFetch({});

    const result = await verifyGoldenTenantSignIn(
      baseEnv,
      fetchStub.impl as unknown as typeof fetch,
    );

    expect(result.projectId).toBe('la-creativo-erp');
    expect(call(fetchStub.calls, 'firebase-config')?.url).toBe(
      'https://deployment.example/api/public/firebase-config',
    );
    // The key used to sign in is the one the deployment serves to browsers, so a demo
    // tenant seeded into a different project cannot pass this check.
    expect(call(fetchStub.calls, 'signInWithPassword')?.url).toContain('key=browser-api-key');
  });

  it('sends the Vercel bypass secret to the deployment only, never to Identity Platform', async () => {
    const { verifyGoldenTenantSignIn } = await loadVerifier();
    const fetchStub = stubFetch({});

    await verifyGoldenTenantSignIn(
      { ...baseEnv, VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret' },
      fetchStub.impl as unknown as typeof fetch,
    );

    expect(call(fetchStub.calls, '/api/health')?.init).toMatchObject({
      headers: { 'x-vercel-protection-bypass': 'bypass-secret' },
    });
    expect(call(fetchStub.calls, 'firebase-config')?.init).toMatchObject({
      headers: { 'x-vercel-protection-bypass': 'bypass-secret' },
    });
    expect(JSON.stringify(call(fetchStub.calls, 'signInWithPassword')?.init)).not.toContain(
      'bypass-secret',
    );
  });

  it('reports a protected deployment as protection, not as a bad credential', async () => {
    const { verifyGoldenTenantSignIn } = await loadVerifier();
    const fetchStub = stubFetch({ config: stubResponse(401, {}) });

    await expect(
      verifyGoldenTenantSignIn(baseEnv, fetchStub.impl as unknown as typeof fetch),
    ).rejects.toThrow(/VERCEL_AUTOMATION_BYPASS_SECRET/);
  });

  it('refuses a deployment that cannot say which Firebase project it serves', async () => {
    const { verifyGoldenTenantSignIn } = await loadVerifier();
    // A deployment missing its NEXT_PUBLIC_FIREBASE_* configuration answers 200 with an
    // error body. Signing in against a half-known project would prove nothing.
    const fetchStub = stubFetch({ config: stubResponse(200, { error: 'incomplete' }) });

    await expect(
      verifyGoldenTenantSignIn(baseEnv, fetchStub.impl as unknown as typeof fetch),
    ).rejects.toThrow(/incomplete Firebase configuration/);
    expect(call(fetchStub.calls, 'signInWithPassword')).toBeUndefined();
  });

  /**
   * `E2E_BASE_URL` may hold a branch alias, which re-points at whichever deployment
   * landed most recently. Certification names an exact SHA, so the deployment says which
   * commit it serves rather than being assumed to be the one under test.
   */
  it('refuses a deployment serving a different commit than the one being certified', async () => {
    const { verifyGoldenTenantSignIn } = await loadVerifier();
    const fetchStub = stubFetch({});

    await expect(
      verifyGoldenTenantSignIn(
        { ...baseEnv, EXPECTED_COMMIT_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        fetchStub.impl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(new RegExp(`serving commit ${DEPLOYED_COMMIT}`));
    // It stops at the mismatch: no credential is sent to a deployment that is not the one
    // being certified.
    expect(call(fetchStub.calls, 'signInWithPassword')).toBeUndefined();
  });

  it('accepts the deployment built from the commit being certified', async () => {
    const { verifyGoldenTenantSignIn } = await loadVerifier();
    const fetchStub = stubFetch({});

    const result = await verifyGoldenTenantSignIn(
      { ...baseEnv, EXPECTED_COMMIT_SHA: DEPLOYED_COMMIT },
      fetchStub.impl as unknown as typeof fetch,
    );

    expect(result.commit).toBe(DEPLOYED_COMMIT);
  });

  it('refuses a deployment that cannot say which commit it serves', async () => {
    const { verifyGoldenTenantSignIn } = await loadVerifier();
    const fetchStub = stubFetch({ health: stubResponse(200, { status: 'ok', commit: null }) });

    await expect(
      verifyGoldenTenantSignIn(
        { ...baseEnv, EXPECTED_COMMIT_SHA: DEPLOYED_COMMIT },
        fetchStub.impl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/does not report the commit/);

    // With no SHA to certify against, an unreporting deployment is not an error.
    const permissive = stubFetch({ health: stubResponse(200, { status: 'ok' }) });
    await expect(
      verifyGoldenTenantSignIn(baseEnv, permissive.impl as unknown as typeof fetch),
    ).resolves.toMatchObject({ commit: '' });
  });

  it('names both causes of INVALID_LOGIN_CREDENTIALS instead of guessing one', async () => {
    const { describeSignInFailure } = await loadVerifier();

    const ambiguous = describeSignInFailure({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
    expect(ambiguous).toMatch(/do not carry this password/);
    expect(ambiguous).toMatch(/do not exist in this Firebase project/);

    expect(describeSignInFailure({ error: { message: 'EMAIL_NOT_FOUND' } })).toMatch(
      /no such account/,
    );
    expect(describeSignInFailure({ error: { message: 'USER_DISABLED' } })).toMatch(/disabled/);
    expect(
      describeSignInFailure({ error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER : try later' } }),
    ).toMatch(/throttled/);
    expect(describeSignInFailure({ error: { message: 'SOMETHING_NEW' } })).toMatch(/Unrecognised/);
    expect(describeSignInFailure(null)).toMatch(/UNKNOWN_ERROR/);
  });

  it('never puts the password in the failure it reports', async () => {
    const { verifyGoldenTenantSignIn } = await loadVerifier();
    const fetchStub = stubFetch({
      signIn: stubResponse(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }),
    });

    await expect(
      verifyGoldenTenantSignIn(baseEnv, fetchStub.impl as unknown as typeof fetch),
    ).rejects.toThrow(/INVALID_LOGIN_CREDENTIALS/);

    await verifyGoldenTenantSignIn(baseEnv, fetchStub.impl as unknown as typeof fetch).catch(
      (error: Error) => {
        expect(error.message).not.toContain(TEST_PASSWORD);
        // The project and account ARE named: identifying them is the whole point.
        expect(error.message).toContain('la-creativo-erp');
      },
    );
  });

  it('probes the same admin account the browser suite logs in as', async () => {
    const { DEFAULT_PROBE_EMAIL } = await loadVerifier();
    const helper = read('e2e/helpers/auth.ts');

    expect(helper).toContain(`admin: '${DEFAULT_PROBE_EMAIL}'`);
  });
});

describe('PR6: the certification workflows are wired to the same secret', () => {
  const smoke = read(SMOKE_WORKFLOW);
  const seed = read(SEED_WORKFLOW);
  const golden = read('.github/workflows/golden-e2e.yml');

  // Both workflows dispatch the same thirteen tests against the same deployment. Whichever
  // an operator reaches for has to carry the same guards, or the weaker one silently
  // becomes the twenty-minute failure the stronger one was written to prevent.
  it.each([
    ['smoke.yml', smoke],
    ['golden-e2e.yml', golden],
  ])('%s certifies the deployment against the dispatched commit', (_name, workflow) => {
    expect(workflow).toContain('EXPECTED_COMMIT_SHA: ${{ github.sha }}');
  });

  it.each([
    ['smoke.yml', smoke],
    ['golden-e2e.yml', golden],
  ])('%s runs the credential check before the Playwright suite', (_name, workflow) => {
    const check = workflow.indexOf(VERIFY_SCRIPT);
    const suite = workflow.indexOf('npx playwright test e2e/golden e2e/smoke');

    expect(check).toBeGreaterThan(-1);
    expect(suite).toBeGreaterThan(-1);
    expect(check).toBeLessThan(suite);
  });

  it('seeds from the same E2E_DEMO_PASSWORD secret the suite types', () => {
    expect(seed).toContain('E2E_DEMO_PASSWORD: ${{ secrets.E2E_DEMO_PASSWORD }}');
    expect(smoke).toContain('E2E_DEMO_PASSWORD: ${{ secrets.E2E_DEMO_PASSWORD }}');
  });

  it('makes the seed dispatch-only and forces the operator to name the project', () => {
    expect(seed).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(seed).not.toMatch(/on:[\s\S]*?\bpush:/);
    expect(seed).toContain('firebase_project_id');
    expect(seed).toContain('DEMO_FIREBASE_PROJECT_ID: ${{ inputs.firebase_project_id }}');
  });

  it('refuses to seed with a password the seeder would reject anyway', () => {
    expect(seed).toContain('test "${#E2E_DEMO_PASSWORD}" -ge 16');
  });

  it('never runs two rebuilds of the golden fixture at once', () => {
    expect(seed).toContain('group: seed-golden-tenant');
    expect(seed).toContain('cancel-in-progress: false');
  });
});
