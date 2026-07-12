'use strict';

/**
 * Example spec showing the memory layer inside @playwright/test.
 *
 * - If PW_REUSE_AUTH is on, this runs already-authenticated (storageState was
 *   restored by the setup project).
 * - Uses `seen` to process only new items and `facts` to remember run metadata.
 *
 * The selectors/URL are placeholders — swap in your real automation's flow.
 */

const { test, expect } = require('@playwright/test');
const { createMemory } = require('../src/memory');

const mem = createMemory({ dir: '.memory' });

test('process only new items and remember the run', async ({ page }) => {
  const runCount = mem.facts.get('runCount', 0) + 1;
  mem.facts.set('runCount', runCount);
  mem.facts.set('lastRunAt', new Date().toISOString());

  await page.goto('/dashboard');

  const items = await page.$$eval('.item', (nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute('data-id'),
      title: n.querySelector('.title')?.textContent?.trim(),
    }))
  );

  const fresh = mem.seen.filterNew('items', items, (it) => it.id);
  for (const item of fresh) {
    // ... do the real per-item work here ...
    expect(item.id).toBeTruthy();
  }

  // Mark seen only after processing, so a crash retries unprocessed items.
  mem.seen.markAll('items', fresh, (it) => it.id);
});
