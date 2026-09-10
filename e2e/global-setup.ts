import { request } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** Where the exchanged bypass cookie is stored for the run. Never uploaded. */
export const BYPASS_STORAGE_STATE = path.join(process.cwd(), 'e2e', '.auth', 'vercel-bypass.json');

/**
 * Gets the suite past Vercel Deployment Protection.
 *
 * The project protects every deployment except custom domains, so an
 * unauthenticated browser opening a preview URL is served Vercel's SSO wall
 * rather than the Bizosto login page. That wall has an email field and no
 * password field, which is exactly how the first golden tenant run failed: all
 * thirteen tests timed out waiting for `input[type="password"]`.
 *
 * Protection Bypass for Automation is Vercel's supported way through it. The
 * secret is sent once, to the deployment origin only, and exchanged for a
 * scoped bypass cookie the suite reuses.
 *
 * It is deliberately NOT set as `extraHTTPHeaders`: that would attach the secret
 * to every request the page makes, including the app's cross-origin calls to
 * Firebase, Google and Stripe, and hand a Vercel credential to third parties.
 *
 * Missing secret is not treated as success — nothing is bypassed, and a
 * protected deployment still fails the suite.
 */
export default async function globalSetup(): Promise<void> {
  const secret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
  const baseURL = String(process.env.BASE_URL || '').replace(/\/$/, '');
  if (!secret || !baseURL) return;

  const context = await request.newContext({ baseURL });
  try {
    const response = await context.get('/', {
      headers: {
        'x-vercel-protection-bypass': secret,
        // Ask Vercel to return the bypass as a cookie scoped to this deployment,
        // so no later request has to carry the secret itself.
        'x-vercel-set-bypass-cookie': 'true',
      },
      failOnStatusCode: false,
    });

    if (!response.ok()) {
      // The secret itself is never included in the message.
      throw new Error(
        `Vercel protection bypass rejected with HTTP ${response.status()}. ` +
          'VERCEL_AUTOMATION_BYPASS_SECRET must match the value in Vercel > Project > ' +
          'Deployment Protection > Protection Bypass for Automation.',
      );
    }

    fs.mkdirSync(path.dirname(BYPASS_STORAGE_STATE), { recursive: true });
    await context.storageState({ path: BYPASS_STORAGE_STATE });
  } finally {
    await context.dispose();
  }
}
