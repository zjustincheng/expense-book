import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./test",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: "npm exec -w backend tsx -- test/browser-server.ts",
      cwd: "..",
      url: "http://127.0.0.1:4002/health",
      env: { TEST_API_PORT: "4002" },
      timeout: 30_000,
    },
    {
      command: "npm run start -w frontend -- --port 3100 --hostname 127.0.0.1",
      cwd: "..",
      url: "http://localhost:3100",
      timeout: 30_000,
      env: {
        API_INTERNAL_URL: "http://127.0.0.1:4002",
        APP_URL: "http://localhost:3100",
        COGNITO_CLIENT_ID: "",
      },
    },
  ],
});
