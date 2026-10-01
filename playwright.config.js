import { defineConfig, devices } from "@playwright/test";

// The e2e suite drives the built bundle in a real browser. It covers the
// render-level behaviour the jest suite structurally cannot reach — see
// tests/e2e/zoom.spec.js for what each case pins.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "list" : "line",

  use: {
    baseURL: "http://127.0.0.1:8099",
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Plain static server over the repo root: the fixture loads both
  // ../../dist/TimeWidget.js and ../../node_modules/d3/dist/d3.js, so the
  // root has to be the one directory containing both.
  // Run `npm run build` first — the suite tests dist/, not src/.
  //
  // -a 127.0.0.1 is not optional. http-server binds 0.0.0.0 by default, and
  // the served root here is the whole repository — including .git and every
  // untracked file. Without it, running the suite on a shared network
  // publishes the repo's history and any local-only files to that network for
  // as long as the tests take. -d false additionally stops the tree from being
  // browsable, so the port only answers for paths a test actually requests.
  webServer: {
    command: "npx http-server . -p 8099 -c-1 -a 127.0.0.1 -d false --silent",
    url: "http://127.0.0.1:8099/tests/e2e/fixture.html",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
