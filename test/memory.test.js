'use strict';

/**
 * Dependency-free tests for the memory layer. Run with: npm test
 * Uses Node's built-in test runner + assert — no Playwright needed.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createMemory } = require('../src/memory');

function tmpMemory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-test-'));
  return { mem: createMemory({ dir }), dir };
}

test('facts: get/set/has/delete/all with fallback', () => {
  const { mem } = tmpMemory();
  assert.equal(mem.facts.get('missing', 'fb'), 'fb');
  assert.equal(mem.facts.has('missing'), false);

  mem.facts.set('runCount', 1);
  assert.equal(mem.facts.get('runCount'), 1);
  assert.equal(mem.facts.has('runCount'), true);

  mem.facts.set('runCount', mem.facts.get('runCount') + 1);
  assert.equal(mem.facts.get('runCount'), 2);

  mem.facts.set('nested', { a: [1, 2] });
  assert.deepEqual(mem.facts.all(), { runCount: 2, nested: { a: [1, 2] } });

  mem.facts.delete('runCount');
  assert.equal(mem.facts.has('runCount'), false);
});

test('facts: persists across instances (same dir)', () => {
  const { mem, dir } = tmpMemory();
  mem.facts.set('preferredCategory', 'books');
  const reopened = createMemory({ dir });
  assert.equal(reopened.facts.get('preferredCategory'), 'books');
});

test('seen: filterNew returns only unseen, markAll records them', () => {
  const { mem } = tmpMemory();
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  let fresh = mem.seen.filterNew('items', items, (i) => i.id);
  assert.deepEqual(fresh.map((i) => i.id), ['a', 'b', 'c']);

  mem.seen.markAll('items', [{ id: 'a' }, { id: 'b' }], (i) => i.id);
  assert.equal(mem.seen.count('items'), 2);

  fresh = mem.seen.filterNew('items', items, (i) => i.id);
  assert.deepEqual(fresh.map((i) => i.id), ['c']);
});

test('seen: add is idempotent and preserves firstSeen + meta', () => {
  const { mem, dir } = tmpMemory();
  mem.seen.add('jobs', 42, { title: 'first' });
  const store = JSON.parse(
    fs.readFileSync(path.join(dir, 'seen', 'jobs.json'), 'utf8')
  );
  const firstSeen = store['42'].firstSeen;
  assert.equal(store['42'].title, 'first');

  mem.seen.add('jobs', 42, { title: 'second' }); // should not overwrite
  const store2 = JSON.parse(
    fs.readFileSync(path.join(dir, 'seen', 'jobs.json'), 'utf8')
  );
  assert.equal(store2['42'].firstSeen, firstSeen);
  assert.equal(store2['42'].title, 'first');
  assert.equal(mem.seen.has('jobs', 42), true);
  assert.equal(mem.seen.has('jobs', 99), false);
});

test('seen: collections are independent; clear removes one', () => {
  const { mem } = tmpMemory();
  mem.seen.add('a', 1);
  mem.seen.add('b', 1);
  assert.equal(mem.seen.count('a'), 1);
  mem.seen.clear('a');
  assert.equal(mem.seen.count('a'), 0);
  assert.equal(mem.seen.count('b'), 1);
});

test('auth: restore is safe to spread when empty, save persists, clear forgets', async () => {
  const { mem, dir } = tmpMemory();
  assert.deepEqual(mem.auth.restore('main'), {}); // safe to spread
  assert.equal(mem.auth.has('main'), false);

  // Fake Playwright context: storageState writes a file at the given path.
  const fakeContext = {
    async storageState({ path: p }) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ cookies: [], origins: [] }));
    },
  };

  await mem.auth.save(fakeContext, 'main');
  assert.equal(mem.auth.has('main'), true);
  assert.deepEqual(mem.auth.restore('main'), {
    storageState: path.join(dir, 'auth', 'main.storageState.json'),
  });

  mem.auth.clear('main');
  assert.equal(mem.auth.has('main'), false);
});

test('reset wipes everything', () => {
  const { mem } = tmpMemory();
  mem.facts.set('k', 'v');
  mem.seen.add('c', 1);
  mem.reset();
  assert.deepEqual(mem.facts.all(), {});
  assert.equal(mem.seen.count('c'), 0);
});

test('corrupt JSON falls back instead of throwing', () => {
  const { mem, dir } = tmpMemory();
  fs.writeFileSync(path.join(dir, 'facts.json'), '{ not valid json');
  assert.deepEqual(mem.facts.all(), {}); // recovered
  mem.facts.set('ok', true);
  assert.equal(mem.facts.get('ok'), true);
});

test('names with unsafe characters are sanitized to a single file', () => {
  const { mem } = tmpMemory();
  mem.seen.add('a/../b c', 1);
  assert.equal(mem.seen.count('a/../b c'), 1);
});
