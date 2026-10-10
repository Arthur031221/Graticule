import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4173", acceptDownloads: true },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.CHROME ? { executablePath: process.env.CHROME } : {},
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "node scripts/serve.mjs site 4173",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
