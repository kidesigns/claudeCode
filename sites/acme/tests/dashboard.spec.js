'use strict';

const { test, expect } = require('@playwright/test');
const { memoryForSite, isExampleSite } = require('../../../lib/sites');
const config = require('../site.config');

const mem = memoryForSite(config.name);

// Placeholder site: skip so CI passes until a real baseURL/selectors are set.
test.beforeEach(() => {
  test.skip(isExampleSite(config), 'Set a real baseURL in site.config.js to enable.');
});

test('acme: dashboard lists new orders only once', async ({ page }) => {
  const runCount = mem.facts.get('runCount', 0) + 1;
  mem.facts.set('runCount', runCount);

  await page.goto('/dashboard');

  const orders = await page.$$eval('.order', (nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute('data-order-id'),
      total: n.querySelector('.total')?.textContent?.trim(),
    }))
  );

  const fresh = mem.seen.filterNew('orders', orders, (o) => o.id);
  for (const order of fresh) {
    expect(order.id).toBeTruthy(); // ...process each new order...
  }
  mem.seen.markAll('orders', fresh, (o) => o.id);
});
