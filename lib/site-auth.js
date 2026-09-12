'use strict';

/**
 * Shared login "setup" registration. Each site's `auth.setup.js` is one line:
 *
 *   require('../../lib/site-auth').registerAuthSetup(require('./site.config'));
 *
 * It logs in using the site's `auth` config (a selector recipe, or a custom
 * `login` function for trickier flows) and saves the session via the site's
 * own memory namespace, so each site stays logged in independently.
 */

const { test: setup } = require('@playwright/test');
const { memoryForSite } = require('./sites');

/** @param {import('./sites').SiteConfig} config */
function registerAuthSetup(config) {
  setup(`authenticate (${config.name})`, async ({ page, context }) => {
    const auth = config.auth || {};
    const authStatePath = memoryForSite(config.name).auth.path('main');

    if (typeof auth.login === 'function') {
      // Site provided a custom flow (SSO, multi-step, MFA handling, etc.).
      await auth.login({ page, context, config });
    } else {
      const user = auth.userEnv ? process.env[auth.userEnv] || '' : '';
      const pass = auth.passEnv ? process.env[auth.passEnv] || '' : '';
      await page.goto(auth.loginPath || '/login'); // resolves against project baseURL
      if (auth.usernameSelector) await page.fill(auth.usernameSelector, user);
      if (auth.passwordSelector) await page.fill(auth.passwordSelector, pass);
      if (auth.submitSelector) await page.click(auth.submitSelector);
      if (auth.successURL) await page.waitForURL(auth.successURL);
    }

    await context.storageState({ path: authStatePath });
  });
}

module.exports = { registerAuthSetup };
