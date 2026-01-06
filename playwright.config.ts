import { defineConfig } from "@playwright/test";

const baseURL = process.env.QA_BASE_URL || "http://localhost:3000";
const shouldStartServer = process.env.QA_START_SERVER === "1";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: shouldStartServer
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});
