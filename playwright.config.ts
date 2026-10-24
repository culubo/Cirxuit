import { defineConfig, devices } from "@playwright/test";

const port = process.env["PLAYWRIGHT_PORT"] ?? "5173";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // The scene is WebGL + bloom heavy. Running multiple browser contexts against
  // one dev server concurrently causes GPU-context contention and flaky timeouts,
  // so this suite runs serially (matching CI) rather than fully parallel.
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 1,
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env["CI"],
  },
});
