'use strict';

/**
 * Per-site configuration. Copy this folder to `sites/<your-site>/`, rename the
 * `name`, and fill in the real URL / selectors. Anything you don't need can be
 * removed. The folder is auto-discovered by lib/sites.js — no central list to
 * edit.
 *
 * Folders starting with "_" (like this one) are ignored by the discovery.
 */

module.exports = {
  // Unique id — used for the memory namespace (.memory/<name>) and project names.
  name: 'template',

  // Base URL; page.goto('/path') in this site's specs resolves against it.
  // Read from an env var so CI/secrets can override it per environment.
  baseURL: process.env.TEMPLATE_BASE_URL || 'https://example.com',

  auth: {
    // Set false for a site with no login (memory still gives you seen/facts).
    enabled: true,

    // Credentials come from env vars (repo secrets in CI) — never hard-code.
    userEnv: 'TEMPLATE_USER',
    passEnv: 'TEMPLATE_PASS',

    // Selector recipe for a simple form login:
    loginPath: '/login',
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: 'button[type=submit]',
    successURL: '**/dashboard',

    // For SSO / multi-step / MFA, delete the selectors above and provide a
    // custom function instead:
    //
    // login: async ({ page, context, config }) => {
    //   await page.goto('/sso');
    //   ... whatever the flow needs ...
    // },
  },
};
