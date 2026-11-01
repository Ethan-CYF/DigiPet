import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 400, height: 700 },
    launchOptions: process.env.DIGIPET_CHROMIUM
      ? { executablePath: process.env.DIGIPET_CHROMIUM }
      : {},
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
});
