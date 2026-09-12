'use strict';

const { test, expect } = require('@playwright/test');
const { memoryForSite, isExampleSite } = require('../../../lib/sites');
const config = require('../site.config');

const mem = memoryForSite(config.name);

// Placeholder site: skip so CI passes until a real baseURL/selectors are set.
test.beforeEach(() => {
  test.skip(isExampleSite(config), 'Set a real baseURL in site.config.js to enable.');
});

test('globex: catalog records newly listed products', async ({ page }) => {
  await page.goto('/catalog');

  const products = await page.$$eval('.product', (nodes) =>
    nodes.map((n) => ({ sku: n.getAttribute('data-sku') }))
  );

  const fresh = mem.seen.filterNew('products', products, (p) => p.sku);
  for (const product of fresh) {
    expect(product.sku).toBeTruthy(); // ...handle each new product...
  }
  mem.seen.markAll('products', fresh, (p) => p.sku);
});
