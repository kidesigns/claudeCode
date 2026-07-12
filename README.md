# playwright-automation-memory

A small, dependency-free **memory / state layer** for Playwright automations.
Drop `src/memory.js` into your project and your automation gains persistent
memory across runs.

It remembers three things:

| Concern | What it does | API |
| --- | --- | --- |
| **Auth / sessions** | Persist login cookies + localStorage (Playwright `storageState`) so you stay logged in between runs. | `mem.auth` |
| **Seen data** | Track ids already processed so each run only handles new items (dedupe / incremental scraping). | `mem.seen` |
| **Facts / preferences** | A general key/value store for settings and remembered facts. | `mem.facts` |

Everything is stored as plain JSON under one directory (default `.memory/`),
with atomic writes so an interrupted run never corrupts state.

> **Note:** this was built as a reusable module. To add it to your existing
> "playwright automation" project, copy `src/memory.js` in and follow the
> wiring in `examples/scrape-with-memory.js`.

## Install

No dependencies for the memory layer itself. For the example/automation you
need Playwright:

```bash
npm install playwright
```

## Quick start

```js
const { createMemory } = require('./src/memory');
const mem = createMemory({ dir: '.memory' });

// AUTH — restore a saved session if present, else log in once and save it.
const context = await browser.newContext({ ...mem.auth.restore('main') });
if (!mem.auth.has('main')) {
  // ... perform login on a page ...
  await mem.auth.save(context, 'main');
}

// SEEN — process only items you haven't handled before.
const fresh = mem.seen.filterNew('items', items, (it) => it.id);
for (const item of fresh) { /* ...work... */ }
mem.seen.markAll('items', fresh, (it) => it.id); // mark AFTER processing

// FACTS — remember preferences / run metadata.
mem.facts.set('runCount', mem.facts.get('runCount', 0) + 1);
const category = mem.facts.get('preferredCategory', 'all');
```

See `examples/scrape-with-memory.js` for a complete, commented run.

## API

### `createMemory({ dir })`
Returns a memory instance. `dir` defaults to `.memory`. Also exposes
`mem.dir` and `mem.reset()` (wipes all persisted memory).

### `mem.auth`
- `restore(name='default')` → `{ storageState }` if a session exists, else `{}`
  (always safe to spread into `newContext`).
- `has(name)` → boolean.
- `save(context, name='default')` → saves cookies + localStorage; returns the path.
- `path(name)` → absolute path to the storageState file.
- `clear(name)` → forget a session.

### `mem.seen`
- `filterNew(collection, items, idFn)` → items not yet seen (does **not** mark).
- `markAll(collection, items, idFn)` → mark a batch as seen in one write.
- `add(collection, id, meta?)` → mark one id (idempotent; stamps `firstSeen`).
- `has(collection, id)` → boolean.
- `count(collection)` → number of ids recorded.
- `clear(collection)` → forget a collection.

> Mark items **after** processing them (`filterNew` then work then `markAll`),
> so a crash mid-run retries unprocessed items on the next run instead of
> silently skipping them.

### `mem.facts`
- `get(key, fallback?)`, `has(key)`, `set(key, value)`, `delete(key)`, `all()`.

## On-disk layout

```
.memory/
  auth/<name>.storageState.json    # one file per named session
  seen/<collection>.json           # { "<id>": { firstSeen, ...meta } }
  facts.json                       # { "<key>": <value> }
```

`.memory/` is git-ignored — it can hold cookies/tokens, so it should never be
committed.

## Running Playwright — configure it any way you like

Everything is driven by env vars, so the **same knobs work locally and in CI**
without editing code. Set them in a `.env` file (copy `.env.example`) or inline:

```bash
npx playwright test                                   # default: chromium, headless
PW_HEADED=1 npx playwright test                       # visible browser
PW_BROWSERS=chromium,firefox,webkit npx playwright test  # cross-browser
PW_REUSE_AUTH=1 npx playwright test                   # log in once, reuse session
PW_GREP='checkout' PW_RETRIES=3 npx playwright test   # filter + retries
```

Shortcuts are in `package.json` (`npm run pw`, `pw:headed`, `pw:all`, `pw:auth`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PW_BROWSERS` | `chromium` | comma list: chromium/firefox/webkit |
| `PW_HEADED` | `0` | show the browser window |
| `PW_WORKERS` | auto | parallel workers |
| `PW_RETRIES` | `0` (2 in CI) | retries per test |
| `PW_BASE_URL` | – | base for `page.goto('/x')` |
| `PW_TRACE` | `retain-on-failure` | trace mode |
| `PW_REPORTER` | `list` (`github,html` in CI) | reporters |
| `PW_GREP` | – | only run matching test titles |
| `PW_REUSE_AUTH` | `0` | run login setup + reuse `storageState` |
| `PW_AUTH_STATE` | `.memory/auth/main.storageState.json` | session file |

See `.env.example` for the full annotated list.

### In CI/CD (GitHub Actions)

`.github/workflows/playwright.yml` runs on push/PR with defaults, **and** can be
triggered manually from the Actions tab where you pick browsers, workers,
retries, auth reuse, etc. — each input maps to the env vars above, so CI behaves
exactly like your local runs. It also:

- installs only the browsers you requested,
- caches `.memory/` across runs (best-effort cross-run dedupe state),
- uploads the HTML report as an artifact.

Set `SITE_USER` / `SITE_PASS` as **repository secrets** for the login flow —
credentials are never committed.

## Tests

```bash
npm test        # Node's built-in test runner for the memory layer (no Playwright)
```
