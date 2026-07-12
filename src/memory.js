'use strict';

/**
 * JSON-backed memory/state layer for Playwright automations.
 *
 * Persists three kinds of state across runs, all under a single directory:
 *
 *   1. auth   - Playwright storageState (cookies + localStorage) so the
 *               automation stays logged in between runs.
 *   2. seen   - a per-collection set of ids already processed, so each run
 *               only handles new items (dedupe / incremental scraping).
 *   3. facts  - a general key/value store for preferences and remembered facts.
 *
 * On-disk layout (default dir: ".memory"):
 *
 *   .memory/
 *     auth/<name>.storageState.json    (one file per named session)
 *     seen/<collection>.json           ({ "<id>": { firstSeen, ...meta } })
 *     facts.json                       ({ "<key>": <value> })
 *
 * Writes are atomic (temp file + rename) so an interrupted run cannot leave a
 * half-written JSON file behind.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Low-level JSON helpers (synchronous, atomic writes)
// ---------------------------------------------------------------------------

/**
 * Read and parse a JSON file, returning `fallback` if it does not exist.
 * A corrupt/unreadable file also falls back rather than throwing, so a single
 * bad write never wedges every future run.
 * @template T
 * @param {string} file
 * @param {T} fallback
 * @returns {T}
 */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    // Corrupt JSON: warn but keep going with the fallback.
    if (err instanceof SyntaxError) {
      console.warn(`[memory] ignoring corrupt JSON at ${file}: ${err.message}`);
      return fallback;
    }
    throw err;
  }
}

/**
 * Atomically write `value` as pretty JSON to `file`.
 * @param {string} file
 * @param {unknown} value
 */
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file); // rename is atomic on the same filesystem
}

// ---------------------------------------------------------------------------
// Memory factory
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} MemoryOptions
 * @property {string} [dir] Directory to store state in. Default: ".memory".
 */

/**
 * Create a memory instance rooted at a directory.
 * @param {MemoryOptions} [options]
 */
function createMemory(options = {}) {
  const root = path.resolve(options.dir || '.memory');
  const authDir = path.join(root, 'auth');
  const seenDir = path.join(root, 'seen');
  const factsFile = path.join(root, 'facts.json');

  const authFile = (name) =>
    path.join(authDir, `${sanitize(name)}.storageState.json`);
  const seenFile = (collection) =>
    path.join(seenDir, `${sanitize(collection)}.json`);

  // -------------------------------------------------------------------------
  // auth: Playwright storageState persistence
  // -------------------------------------------------------------------------
  const auth = {
    /** Absolute path to a named session's storageState file. */
    path(name = 'default') {
      return authFile(name);
    },

    /** Whether a saved session exists for `name`. */
    has(name = 'default') {
      return fs.existsSync(authFile(name));
    },

    /**
     * Options to spread into `browser.newContext(...)` to restore a session.
     * Returns `{}` when no session is saved yet, so it is always safe to spread:
     *
     *   const context = await browser.newContext({ ...mem.auth.restore('login') });
     *
     * @param {string} [name]
     */
    restore(name = 'default') {
      const file = authFile(name);
      return fs.existsSync(file) ? { storageState: file } : {};
    },

    /**
     * Save the current cookies + localStorage of a Playwright context.
     * @param {{ storageState: (opts: { path: string }) => Promise<unknown> }} context
     * @param {string} [name]
     */
    async save(context, name = 'default') {
      fs.mkdirSync(authDir, { recursive: true });
      await context.storageState({ path: authFile(name) });
      return authFile(name);
    },

    /** Forget a saved session. */
    clear(name = 'default') {
      fs.rmSync(authFile(name), { force: true });
    },
  };

  // -------------------------------------------------------------------------
  // seen: dedupe / incremental processing
  // -------------------------------------------------------------------------
  const seen = {
    /** Whether `id` has been recorded in `collection`. */
    has(collection, id) {
      const store = readJson(seenFile(collection), {});
      return Object.prototype.hasOwnProperty.call(store, String(id));
    },

    /**
     * Record `id` as seen (idempotent). Optional `meta` is stored alongside;
     * `firstSeen` is stamped on first insert and preserved afterwards.
     * @param {string} collection
     * @param {string|number} id
     * @param {Record<string, unknown>} [meta]
     */
    add(collection, id, meta = {}) {
      const file = seenFile(collection);
      const store = readJson(file, {});
      const key = String(id);
      if (!store[key]) {
        store[key] = { firstSeen: nowIso(), ...meta };
        writeJson(file, store);
      }
      return this;
    },

    /**
     * Given a list of items, return only the ones not yet seen.
     * Does NOT mark them — call `markAll` once you've processed them, so a
     * crash mid-run doesn't skip unprocessed items next time.
     * @template T
     * @param {string} collection
     * @param {T[]} items
     * @param {(item: T) => string|number} idFn extracts a stable id from an item
     * @returns {T[]}
     */
    filterNew(collection, items, idFn) {
      const store = readJson(seenFile(collection), {});
      return items.filter(
        (item) => !Object.prototype.hasOwnProperty.call(store, String(idFn(item)))
      );
    },

    /**
     * Mark every item in a list as seen in one write.
     * @template T
     * @param {string} collection
     * @param {T[]} items
     * @param {(item: T) => string|number} idFn
     */
    markAll(collection, items, idFn) {
      if (items.length === 0) return this;
      const file = seenFile(collection);
      const store = readJson(file, {});
      const ts = nowIso();
      for (const item of items) {
        const key = String(idFn(item));
        if (!store[key]) store[key] = { firstSeen: ts };
      }
      writeJson(file, store);
      return this;
    },

    /** Number of ids recorded in a collection. */
    count(collection) {
      return Object.keys(readJson(seenFile(collection), {})).length;
    },

    /** Forget an entire collection. */
    clear(collection) {
      fs.rmSync(seenFile(collection), { force: true });
    },
  };

  // -------------------------------------------------------------------------
  // facts: general key/value store
  // -------------------------------------------------------------------------
  const facts = {
    /**
     * @template T
     * @param {string} key
     * @param {T} [fallback]
     * @returns {T|undefined}
     */
    get(key, fallback) {
      const store = readJson(factsFile, {});
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : fallback;
    },

    has(key) {
      const store = readJson(factsFile, {});
      return Object.prototype.hasOwnProperty.call(store, key);
    },

    /** @param {string} key @param {unknown} value */
    set(key, value) {
      const store = readJson(factsFile, {});
      store[key] = value;
      writeJson(factsFile, store);
      return this;
    },

    delete(key) {
      const store = readJson(factsFile, {});
      if (Object.prototype.hasOwnProperty.call(store, key)) {
        delete store[key];
        writeJson(factsFile, store);
      }
      return this;
    },

    /** Snapshot of all facts. */
    all() {
      return readJson(factsFile, {});
    },
  };

  return {
    dir: root,
    auth,
    seen,
    facts,
    /** Delete ALL persisted memory. */
    reset() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------

/** Make a name safe to use as a filename. */
function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'default';
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { createMemory, readJson, writeJson };
