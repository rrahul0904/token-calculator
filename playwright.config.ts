import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Browser projects exercise the same disposable tenant and mutate settings,
  // API keys, and audit data. Keep this release gate deterministic.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-tablet", use: { ...devices["iPad Pro 11"] } },
  ],
  webServer: {
    command: "npm start",
    url: `${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
