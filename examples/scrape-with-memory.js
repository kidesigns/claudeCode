'use strict';

/**
 * Example: a Playwright automation that uses the memory layer to
 *   - stay logged in across runs (auth / storageState),
 *   - only process items it hasn't seen before (seen / dedupe),
 *   - remember preferences and run metadata (facts).
 *
 * Run with:  node examples/scrape-with-memory.js
 * (Requires `npm i playwright` and a real target site — the URLs below are
 *  placeholders. The memory wiring is the point, not the selectors.)
 */

const { chromium } = require('playwright');
const { createMemory } = require('../src/memory');

const mem = createMemory({ dir: '.memory' });

async function main() {
  const browser = await chromium.launch();

  // 1. AUTH — restore a saved session if we have one; otherwise log in once.
  const context = await browser.newContext({ ...mem.auth.restore('main') });
  const page = await context.newPage();

  if (!mem.auth.has('main')) {
    console.log('No saved session — logging in...');
    await page.goto('https://example.com/login');
    await page.fill('#username', process.env.SITE_USER || '');
    await page.fill('#password', process.env.SITE_PASS || '');
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard');
    await mem.auth.save(context, 'main'); // persist cookies + localStorage
    console.log('Session saved.');
  } else {
    console.log('Reusing saved session.');
    await page.goto('https://example.com/dashboard');
  }

  // 2. FACTS — remember/adjust preferences and run metadata.
  const runCount = (mem.facts.get('runCount', 0)) + 1;
  mem.facts.set('runCount', runCount);
  mem.facts.set('lastRunAt', new Date().toISOString());
  const category = mem.facts.get('preferredCategory', 'all');
  console.log(`Run #${runCount}, filtering category="${category}".`);

  // 3. SEEN — scrape the listing, then keep only items we haven't handled.
  const items = await page.$$eval('.item', (nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute('data-id'),
      title: n.querySelector('.title')?.textContent?.trim(),
    }))
  );

  const fresh = mem.seen.filterNew('items', items, (it) => it.id);
  console.log(`${items.length} on page, ${fresh.length} new.`);

  for (const item of fresh) {
    // ... do the real work for each new item here ...
    console.log('Processing:', item.id, item.title);
  }

  // Mark them seen only AFTER processing, so a crash mid-loop is retried.
  mem.seen.markAll('items', fresh, (it) => it.id);
  console.log(`Total items ever seen: ${mem.seen.count('items')}.`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
