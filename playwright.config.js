'use strict';

/**
 * Configuration-driven Playwright setup.
 *
 * Every knob is controlled by an environment variable, so you can run Playwright
 * "any way you choose" without editing this file:
 *
 *   - locally:  put values in a `.env` file (see .env.example) or prefix a command
 *               e.g.  PW_BROWSERS=firefox PW_HEADED=1 npx playwright test
 *   - in CI:    the GitHub Actions workflow maps workflow_dispatch inputs to the
 *               same variables (see .github/workflows/playwright.yml)
 *
 * Nothing here is required — every variable has a sensible default, and Playwright
 * still auto-detects CI (extra retries, single worker, forbidOnly).
 */

const { defineConfig, devices } = require('@playwright/test');

// Load .env if present (optional dependency; ignored if not installed).
try {
  require('dotenv').config();
} catch {
  /* dotenv is optional */
}

const env = process.env;
const isCI = !!env.CI;

// --- helpers ---------------------------------------------------------------
const bool = (v, dflt = false) =>
  v == null ? dflt : /^(1|true|yes|on)$/i.test(String(v).trim());
const num = (v, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};
const list = (v, dflt) =>
  v == null || v === ''
    ? dflt
    : String(v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

// --- resolved settings -----------------------------------------------------
const BROWSERS = list(env.PW_BROWSERS, ['chromium']); // chromium|firefox|webkit (comma list)
const HEADED = bool(env.PW_HEADED, false);
const REUSE_AUTH = bool(env.PW_REUSE_AUTH, false); // run the login setup + reuse storageState
const AUTH_STATE = env.PW_AUTH_STATE || '.memory/auth/main.storageState.json';
const BASE_URL = env.PW_BASE_URL || undefined;
const TRACE = env.PW_TRACE || (isCI ? 'on-first-retry' : 'retain-on-failure');
const TIMEOUT = num(env.PW_TIMEOUT, 30_000);
const FULLY_PARALLEL = bool(env.PW_FULLY_PARALLEL, true);
const GREP = env.PW_GREP ? new RegExp(env.PW_GREP) : undefined;

// Reporter: comma list of built-in reporters, or default per environment.
const REPORTERS = list(env.PW_REPORTER, isCI ? ['github', 'html'] : ['list']).map(
  (name) => (name === 'html' ? ['html', { open: 'never' }] : [name])
);

const deviceFor = { chromium: 'Desktop Chrome', firefox: 'Desktop Firefox', webkit: 'Desktop Safari' };

// Build one project per requested browser.
const browserProjects = BROWSERS.map((b) => {
  if (!deviceFor[b]) throw new Error(`Unknown PW_BROWSERS entry: "${b}"`);
  return {
    name: b,
    use: {
      ...devices[deviceFor[b]],
      ...(REUSE_AUTH ? { storageState: AUTH_STATE } : {}),
    },
    ...(REUSE_AUTH ? { dependencies: ['setup'] } : {}),
  };
});

// When reusing auth, prepend a setup project that logs in once and saves state.
const setupProject = {
  name: 'setup',
  testMatch: /.*\.setup\.js/,
};

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: FULLY_PARALLEL,
  forbidOnly: isCI, // fail CI if a stray test.only was committed
  retries: num(env.PW_RETRIES, isCI ? 2 : 0),
  workers: env.PW_WORKERS ? num(env.PW_WORKERS, undefined) : isCI ? 1 : undefined,
  timeout: TIMEOUT,
  grep: GREP,
  reporter: REPORTERS,
  use: {
    baseURL: BASE_URL,
    headless: !HEADED,
    trace: TRACE,
    screenshot: 'only-on-failure',
  },
  projects: REUSE_AUTH ? [setupProject, ...browserProjects] : browserProjects,
});
