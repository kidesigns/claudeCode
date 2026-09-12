'use strict';

/**
 * Configuration-driven, multi-site Playwright setup.
 *
 * Projects are generated automatically: one per (site × browser), plus a login
 * "setup" project per site when auth reuse is on. Sites live under `sites/` and
 * are auto-discovered (see lib/sites.js) — there is no central list to edit.
 *
 * Everything is controlled by env vars, so the same knobs work locally (.env)
 * and in CI (workflow inputs):
 *
 *   PW_SITES=acme,globex       # which sites to run (default: all discovered)
 *   PW_BROWSERS=chromium,firefox,webkit
 *   PW_HEADED=1  PW_WORKERS=4  PW_RETRIES=2  PW_REUSE_AUTH=1  ...
 *
 * Project names are "<site>-<browser>" (and "<site>:setup"), so you can also
 * target them directly:  npx playwright test --project=acme-chromium
 */

const { defineConfig, devices } = require('@playwright/test');
const { selectedSites } = require('./lib/sites');

try {
  require('dotenv').config();
} catch {
  /* dotenv optional */
}

const env = process.env;
const isCI = !!env.CI;

const bool = (v, dflt = false) =>
  v == null ? dflt : /^(1|true|yes|on)$/i.test(String(v).trim());
const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
const list = (v, dflt) =>
  v == null || v === '' ? dflt : String(v).split(',').map((s) => s.trim()).filter(Boolean);

const BROWSERS = list(env.PW_BROWSERS, ['chromium']);
const HEADED = bool(env.PW_HEADED, false);
const REUSE_AUTH = bool(env.PW_REUSE_AUTH, false);
const TRACE = env.PW_TRACE || (isCI ? 'on-first-retry' : 'retain-on-failure');
const TIMEOUT = num(env.PW_TIMEOUT, 30_000);
const FULLY_PARALLEL = bool(env.PW_FULLY_PARALLEL, true);
const GREP = env.PW_GREP ? new RegExp(env.PW_GREP) : undefined;
const REPORTERS = list(env.PW_REPORTER, isCI ? ['github', 'html'] : ['list']).map((name) =>
  name === 'html' ? ['html', { open: 'never' }] : [name]
);

const deviceFor = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
};
for (const b of BROWSERS) {
  if (!deviceFor[b]) throw new Error(`Unknown PW_BROWSERS entry: "${b}"`);
}

// Build projects for every selected site.
const sites = selectedSites();
const { memoryForSite } = require('./lib/sites');
const projects = [];

for (const site of sites) {
  const useAuth = REUSE_AUTH && site.auth && site.auth.enabled;
  const storageState = useAuth ? memoryForSite(site.name).auth.path('main') : undefined;

  if (useAuth) {
    projects.push({
      name: `${site.name}:setup`,
      testDir: site.dir,
      testMatch: /auth\.setup\.js$/,
      use: { baseURL: site.baseURL, headless: !HEADED },
    });
  }

  for (const b of BROWSERS) {
    projects.push({
      name: `${site.name}-${b}`,
      testDir: `${site.dir}/tests`,
      use: {
        ...devices[deviceFor[b]],
        baseURL: site.baseURL,
        ...(storageState ? { storageState } : {}),
      },
      ...(useAuth ? { dependencies: [`${site.name}:setup`] } : {}),
    });
  }
}

module.exports = defineConfig({
  fullyParallel: FULLY_PARALLEL,
  forbidOnly: isCI,
  retries: num(env.PW_RETRIES, isCI ? 2 : 0),
  workers: env.PW_WORKERS ? num(env.PW_WORKERS, undefined) : isCI ? 1 : undefined,
  timeout: TIMEOUT,
  grep: GREP,
  reporter: REPORTERS,
  use: {
    headless: !HEADED,
    trace: TRACE,
    screenshot: 'only-on-failure',
  },
  projects,
});
