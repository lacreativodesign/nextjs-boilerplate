import {
  PRODUCTION_FIREBASE_PROJECT_ID,
  PRODUCTION_FIREBASE_STORAGE_BUCKET,
} from '@/lib/firebase/environment.mjs';
import { GET as firebaseConfig } from '@/app/api/public/firebase-config/route';
import { GET as health } from '@/app/api/health/route';

/**
 * P0-01 — the two endpoints that decide, and report, which Firebase environment a
 * deployment is wired to.
 *
 * `/api/public/firebase-config` is the browser's ONLY source of Firebase configuration
 * (lib/firebaseClient.ts), which makes it the last place a deployment can refuse to point
 * a write-capable browser at the wrong project. Measured on main (da41e8d) it did the
 * opposite: the PR #1008 Vercel Preview served `la-creativo-erp` and
 * `la-creativo-erp.firebasestorage.app`, the production pair, to every browser.
 *
 * `/api/health` is how CI learns the non-secret facts it must name in a certification:
 * the commit (PR #1008) and now the Firebase environment. A Preview cannot be taken at
 * its word that it is not production; it has to say, and be checked.
 */

const ORIGINAL_ENV = process.env;

const STAGING_PROJECT = 'example-staging-project';
const STAGING_BUCKET = 'example-staging-project.firebasestorage.app';
const key = (projectId: string) =>
  JSON.stringify({ project_id: projectId, private_key: 'NEVER-IN-A-RESPONSE' });

/** The six public variables the route requires before it considers anything else. */
const publicConfig = (projectId: string, storageBucket: string) => ({
  NEXT_PUBLIC_FIREBASE_API_KEY: 'browser-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: storageBucket,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1091518426177',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:1091518426177:web:test',
});

function setEnv(env: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...env } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  // The routes read process.env per request, so each case gets a clean deployment.
  process.env = { ...ORIGINAL_ENV } as NodeJS.ProcessEnv;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe('P0-01: the public Firebase config refuses an unsafe deployment', () => {
  it('serves the browser config for a correctly isolated Preview', async () => {
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      STAGING_FIREBASE_PROJECT_ID: STAGING_PROJECT,
      STAGING_FIREBASE_STORAGE_BUCKET: STAGING_BUCKET,
      FIREBASE_ADMIN_KEY: key(STAGING_PROJECT),
      ...publicConfig(STAGING_PROJECT, STAGING_BUCKET),
    });

    const response = await firebaseConfig();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      projectId: STAGING_PROJECT,
      storageBucket: STAGING_BUCKET,
    });
  });

  it('refuses a Preview serving the production project, and serves no config at all', async () => {
    // This is the exact configuration observed live on the PR #1008 Preview.
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      FIREBASE_ADMIN_KEY: key(PRODUCTION_FIREBASE_PROJECT_ID),
      ...publicConfig(PRODUCTION_FIREBASE_PROJECT_ID, PRODUCTION_FIREBASE_STORAGE_BUCKET),
    });

    const response = await firebaseConfig();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/must never serve the production Firebase project/);
    // No apiKey, no projectId: a browser cannot construct a Firebase app from a refusal,
    // so there is nothing for a write-capable E2E run to use.
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('projectId');
  });

  it('refuses a Preview whose server and browsers disagree about the project', async () => {
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      STAGING_FIREBASE_PROJECT_ID: STAGING_PROJECT,
      STAGING_FIREBASE_STORAGE_BUCKET: STAGING_BUCKET,
      FIREBASE_ADMIN_KEY: key('a-third-project'),
      ...publicConfig(STAGING_PROJECT, STAGING_BUCKET),
    });

    const response = await firebaseConfig();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/must read and write one project/),
    });
  });

  it('refuses a Preview with no staging identity configured', async () => {
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      FIREBASE_ADMIN_KEY: key(STAGING_PROJECT),
      ...publicConfig(STAGING_PROJECT, STAGING_BUCKET),
    });

    const response = await firebaseConfig();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/STAGING_FIREBASE_PROJECT_ID must name/),
    });
  });

  it('serves production from the canonical production tuple', async () => {
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      FIREBASE_ADMIN_KEY: key(PRODUCTION_FIREBASE_PROJECT_ID),
      ...publicConfig(PRODUCTION_FIREBASE_PROJECT_ID, PRODUCTION_FIREBASE_STORAGE_BUCKET),
    });

    const response = await firebaseConfig();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      projectId: PRODUCTION_FIREBASE_PROJECT_ID,
      storageBucket: PRODUCTION_FIREBASE_STORAGE_BUCKET,
    });
  });

  it('still reports incomplete public configuration the way it always did', async () => {
    setEnv({ VERCEL: '1', VERCEL_ENV: 'production' });
    const response = await firebaseConfig();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Firebase public config is incomplete'),
    });
  });

  it('never returns credential material in a refusal', async () => {
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      FIREBASE_ADMIN_KEY: key(PRODUCTION_FIREBASE_PROJECT_ID),
      ...publicConfig(PRODUCTION_FIREBASE_PROJECT_ID, PRODUCTION_FIREBASE_STORAGE_BUCKET),
    });

    const body = JSON.stringify(await (await firebaseConfig()).json());
    expect(body).not.toContain('NEVER-IN-A-RESPONSE');
    expect(body).not.toContain('private_key');
  });
});

describe('P0-01: /api/health states the deployment identity certification needs', () => {
  it('reports the commit, the Vercel environment and the Firebase identity', async () => {
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_SHA: 'da41e8d1f223c1aa2ca6b1ccaa43167dab195519',
      STAGING_FIREBASE_PROJECT_ID: STAGING_PROJECT,
      STAGING_FIREBASE_STORAGE_BUCKET: STAGING_BUCKET,
      FIREBASE_ADMIN_KEY: key(STAGING_PROJECT),
      ...publicConfig(STAGING_PROJECT, STAGING_BUCKET),
    });

    const body = await (await health()).json();

    expect(body).toMatchObject({
      status: 'ok',
      commit: 'da41e8d1f223c1aa2ca6b1ccaa43167dab195519',
      vercelEnv: 'preview',
      firebase: {
        browserProjectId: STAGING_PROJECT,
        browserStorageBucket: STAGING_BUCKET,
        adminProjectId: STAGING_PROJECT,
        isolation: 'ok',
        violations: [],
      },
    });
  });

  it('reports a violation rather than hiding it, while staying a liveness probe', async () => {
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      FIREBASE_ADMIN_KEY: key(PRODUCTION_FIREBASE_PROJECT_ID),
      ...publicConfig(PRODUCTION_FIREBASE_PROJECT_ID, PRODUCTION_FIREBASE_STORAGE_BUCKET),
    });

    const response = await health();
    const body = await response.json();

    // Liveness answers "is the process up", so it stays 200 `ok` — /api/health/ready and
    // the config route are where a wrong answer has consequences. What it must not do is
    // let CI infer safety from silence.
    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.firebase.isolation).toBe('violation');
    expect(body.firebase.violations.join('\n')).toMatch(/must never serve the production/);
    expect(body.firebase.adminProjectId).toBe(PRODUCTION_FIREBASE_PROJECT_ID);
  });

  it('exposes no credential material', async () => {
    setEnv({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      FIREBASE_ADMIN_KEY: key(PRODUCTION_FIREBASE_PROJECT_ID),
      E2E_DEMO_PASSWORD: 'super-secret-password',
      ...publicConfig(PRODUCTION_FIREBASE_PROJECT_ID, PRODUCTION_FIREBASE_STORAGE_BUCKET),
    });

    const body = JSON.stringify(await (await health()).json());
    expect(body).not.toContain('NEVER-IN-A-RESPONSE');
    expect(body).not.toContain('super-secret-password');
    expect(body).not.toContain('private_key');
  });

  it('says the boundary is not enforced off Vercel, rather than claiming it passed', async () => {
    setEnv({ NODE_ENV: 'production' });
    const body = await (await health()).json();
    expect(body.vercelEnv).toBeNull();
    expect(body.firebase.isolation).toBe('not-enforced');
  });
});
