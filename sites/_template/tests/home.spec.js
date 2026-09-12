'use strict';

/**
 * Starter spec for a site. Swap the selectors/URLs for the real ones.
 * `memoryForSite(name)` gives you this site's own auth/seen/facts namespace.
 */

const { test, expect } = require('@playwright/test');
const { memoryForSite, isExampleSite } = require('../../../lib/sites');
const config = require('../site.config');

const mem = memoryForSite(config.name);

// Placeholder site: skip so CI passes until a real baseURL/selectors are set.
test.beforeEach(() => {
  test.skip(isExampleSite(config), 'Set a real baseURL in site.config.js to enable.');
});

test(`${config.name}: loads and processes only new items`, async ({ page }) => {
  mem.facts.set('lastRunAt', new Date().toISOString());

  await page.goto('/'); // resolves against this site's baseURL

  const items = await page.$$eval('.item', (nodes) =>
    nodes.map((n) => ({ id: n.getAttribute('data-id') }))
  );

  const fresh = mem.seen.filterNew('items', items, (it) => it.id);
  for (const item of fresh) {
    expect(item.id).toBeTruthy(); // ...real per-item work here...
  }
  mem.seen.markAll('items', fresh, (it) => it.id);
});
