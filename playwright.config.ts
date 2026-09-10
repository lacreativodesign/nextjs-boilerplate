import { defineConfig, devices } from '@playwright/test';
import { BYPASS_STORAGE_STATE } from './e2e/global-setup';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Set when the deployment under test sits behind Vercel Deployment Protection.
 * See e2e/global-setup.ts for how it is exchanged for a scoped bypass cookie.
 */
const bypassSecret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // `html` alone buffers everything until the run ends, so an interrupted run
  // (a job timeout, for instance) leaves no record of which tests ran or why they
  // failed. `list` streams each result to stdout, which is what makes a
  // deployment-backed certification run diagnosable from the CI log alone.
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: bypassSecret ? './e2e/global-setup' : undefined,
  use: {
    baseURL: BASE_URL,
    // A trace records request headers and cookies. On a public repository the
    // uploaded report is publicly downloadable, so when a bypass cookie is in
    // play the trace is turned off rather than publishing a Vercel credential.
    trace: bypassSecret ? 'off' : 'on-first-retry',
    storageState: bypassSecret ? BYPASS_STORAGE_STATE : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
