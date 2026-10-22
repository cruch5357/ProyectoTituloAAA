import { defineConfig } from "@playwright/test";

// UI contract tests with an intercepted API: no database, seed or credentials.
export default defineConfig({
  testDir: "./tests/browser-ui",
  outputDir: `./node_modules/.cache/p3-ui-${Date.now()}`,
  workers: 1,
  use: { baseURL: "http://localhost:5176", browserName: "chromium" },
  webServer: {
    command:
      "npm run dev --prefix frontend -- --host localhost --port 5176 --strictPort",
    url: "http://localhost:5176",
    reuseExistingServer: false,
    env: { VITE_API_URL: "/api/v1" },
  },
});
