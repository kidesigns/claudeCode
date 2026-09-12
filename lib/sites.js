'use strict';

/**
 * Site registry: discovers the per-site folders under `sites/` and loads each
 * one's `site.config.js`. Used by playwright.config.js to build one set of
 * projects per site, and by specs to get a site-scoped memory instance.
 *
 * A "site" is any directory under `sites/` (except those starting with "_",
 * e.g. the `_template`) that contains a `site.config.js`.
 */

const fs = require('fs');
const path = require('path');
const { createMemory } = require('../src/memory');

const SITES_DIR = path.join(__dirname, '..', 'sites');

/**
 * @typedef {Object} SiteAuth
 * @property {boolean} [enabled]
 * @property {string}  [userEnv]  env var holding the username
 * @property {string}  [passEnv]  env var holding the password
 * @property {string}  [loginPath]
 * @property {string}  [usernameSelector]
 * @property {string}  [passwordSelector]
 * @property {string}  [submitSelector]
 * @property {string}  [successURL]
 * @property {(ctx: { page: any, context: any, config: SiteConfig }) => Promise<void>} [login]
 *           optional custom login for sites the selector recipe can't express
 *
 * @typedef {Object} SiteConfig
 * @property {string}  name
 * @property {string}  baseURL
 * @property {SiteAuth} [auth]
 * @property {string}  dir   absolute path to the site folder (added on load)
 */

/** Load every site folder that has a site.config.js. */
function discoverSites() {
  if (!fs.existsSync(SITES_DIR)) return [];
  return fs
    .readdirSync(SITES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(SITES_DIR, name, 'site.config.js')))
    .sort()
    .map((name) => {
      const cfg = require(path.join(SITES_DIR, name, 'site.config.js'));
      return { ...cfg, name: cfg.name || name, dir: path.join(SITES_DIR, name) };
    });
}

/**
 * Sites selected for this run. `PW_SITES` (comma list) narrows to named sites;
 * unset means all discovered sites. Unknown names throw a clear error.
 * @param {string} [filter]
 * @returns {SiteConfig[]}
 */
function selectedSites(filter = process.env.PW_SITES) {
  const all = discoverSites();
  if (!filter) return all;
  const want = filter.split(',').map((s) => s.trim()).filter(Boolean);
  const known = new Set(all.map((s) => s.name));
  const missing = want.filter((w) => !known.has(w));
  if (missing.length) {
    throw new Error(
      `PW_SITES refers to unknown site(s): ${missing.join(', ')}. ` +
        `Known sites: ${all.map((s) => s.name).join(', ') || '(none)'}`
    );
  }
  const wanted = new Set(want);
  return all.filter((s) => wanted.has(s.name));
}

/** A memory instance scoped to one site (`.memory/<site>/...`). */
function memoryForSite(name) {
  return createMemory({ dir: path.join('.memory', name) });
}

module.exports = { discoverSites, selectedSites, memoryForSite, SITES_DIR };
