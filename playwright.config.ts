import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "examples/html-data-binding-basic/test",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:3039",
    headless: true,
    actionTimeout: 15_000,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    // Keep API Key writes and example data isolated from the developer's .env.
    command:
      "mkdir -p examples/html-data-binding-basic/.data/e2e && cd examples/html-data-binding-basic/.data/e2e && node --env-file-if-exists=.env ../../dist/server/main.js",
    url: "http://127.0.0.1:3039/api/files",
    env: {
      PORT: "3039",
      DATA_DIR: ".",
      DEEPSEEK_API_KEY: "test-only-key",
      DEEPSEEK_BASE_URL: "http://127.0.0.1:3040",
      DEEPSEEK_MODEL: "test-model",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
