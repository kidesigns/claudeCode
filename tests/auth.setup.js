'use strict';

/**
 * Login "setup" project. Only runs when PW_REUSE_AUTH is enabled.
 * Logs in once and saves the session via the memory layer, so the real test
 * projects can reuse it through `storageState`.
 *
 * Credentials come from env vars (SITE_USER / SITE_PASS) — in CI these are
 * wired from repository secrets, never committed.
 */

const { test: setup } = require('@playwright/test');
const { createMemory } = require('../src/memory');

const mem = createMemory({ dir: '.memory' });
const AUTH_STATE = process.env.PW_AUTH_STATE || mem.auth.path('main');

setup('authenticate', async ({ page, context }) => {
  const baseURL = process.env.PW_BASE_URL || 'https://example.com';

  await page.goto(`${baseURL}/login`);
  await page.fill('#username', process.env.SITE_USER || '');
  await page.fill('#password', process.env.SITE_PASS || '');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');

  // Persist cookies + localStorage to the path the projects read from.
  await context.storageState({ path: AUTH_STATE });
});
