# Getting Started

A grounded orientation for this repo: what it is, what's already done, what's
missing, and the concrete steps to get productive.

## What am I trying to accomplish?

This repo is **`playwright-automation-memory`** — a small, dependency-free
**memory / state layer** you drop into a Playwright automation so it *remembers
things across runs*.

It is a **reusable module**, not a runnable app. The whole library is one file:
[`src/memory.js`](src/memory.js). Your goal with this repo is one of:

1. **Use it** — wire `src/memory.js` into a real Playwright automation so that
   automation stays logged in, skips already-seen items, and remembers settings.
2. **Ship/maintain it** — treat it as a standalone package (tests, license,
   maybe publish).

It solves three recurring pain points in automation scripts:

| Concern | What it gives you | API |
| --- | --- | --- |
| **Auth / sessions** | Persist login cookies + localStorage (Playwright `storageState`) so you stay logged in between runs. | `mem.auth` |
| **Seen data** | Track ids already processed so each run only handles *new* items. | `mem.seen` |
| **Facts / preferences** | A general key/value store for settings + run metadata. | `mem.facts` |

Everything persists as plain JSON under one directory (default `.memory/`), with
atomic writes so an interrupted run never corrupts state.

## What's already here (and working)

- ✅ Core library — [`src/memory.js`](src/memory.js) (`createMemory`, `auth`, `seen`, `facts`)
- ✅ Tests — [`test/memory.test.js`](test/memory.test.js), **9 passing** via Node's built-in runner (no Playwright needed)
- ✅ Worked example — [`examples/scrape-with-memory.js`](examples/scrape-with-memory.js)
- ✅ Docs — [`README.md`](README.md) with full API reference
- ✅ `.gitignore` correctly excludes `.memory/` (it can hold cookies/tokens)
- ✅ Node v24 + npm 11 confirmed installed

**Verified baseline:** `npm test` → `tests 9 / pass 9 / fail 0`.

## What's missing / gaps to close

| Gap | Impact | Priority |
| --- | --- | --- |
| Playwright not installed | The example (`npm run example`) can't run yet. Library + tests don't need it. | Only if you run the example |
| Example uses placeholder URLs (`example.com`) | It's a wiring template, not a working scraper — point it at a real site. | When you build a real automation |
| No `LICENSE` file | `package.json` says `"license": "MIT"` but there's no `LICENSE` file to back it. | Low (before publishing) |
| No CI / lint config | Fine for a personal module; add if collaborating. | Optional |
| Not published to npm | Currently used by copy/paste or local path. | Only if you want to `npm install` it elsewhere |

## Step-by-step

### Step 1 — Confirm the baseline (2 min)

```bash
npm test
```

Expect 9 passing tests. This proves the core library works with **zero**
dependencies. If this passes, `src/memory.js` is good to use as-is.

### Step 2 — Decide your path

- **Just want to use the memory layer in your own script?** → copy
  [`src/memory.js`](src/memory.js) into your project and follow the wiring in
  [`examples/scrape-with-memory.js`](examples/scrape-with-memory.js). You're done.
- **Want to run the bundled example / develop here?** → continue below.

### Step 3 — Install Playwright (only needed for the example)

```bash
npm install playwright
npx playwright install chromium   # downloads the browser binary
```

### Step 4 — Run the example

```bash
npm run example
```

As written it targets placeholder URLs (`example.com/login`, `/dashboard`) and
will not scrape anything real — it exists to show the **memory wiring**, not the
selectors. To make it real, edit
[`examples/scrape-with-memory.js`](examples/scrape-with-memory.js):

1. Replace the login URL, selectors, and the post-login `waitForURL(...)`.
2. Set credentials via env vars (never hardcode):
   ```bash
   SITE_USER="you@example.com" SITE_PASS="secret" npm run example
   ```
3. Replace the `.item` listing selector with your target's markup.

First run logs in and saves the session to `.memory/auth/main.storageState.json`.
Later runs reuse it — no re-login.

### Step 5 — Use it in your own automation

The three-line mental model:

```js
const { createMemory } = require('./src/memory');
const mem = createMemory({ dir: '.memory' });

// AUTH — restore a saved session if present, else log in once and save it.
const context = await browser.newContext({ ...mem.auth.restore('main') });
if (!mem.auth.has('main')) { /* ...log in... */ await mem.auth.save(context, 'main'); }

// SEEN — process only new items. Mark AFTER processing so a crash retries.
const fresh = mem.seen.filterNew('items', items, (it) => it.id);
for (const item of fresh) { /* ...work... */ }
mem.seen.markAll('items', fresh, (it) => it.id);

// FACTS — remember preferences / run metadata.
mem.facts.set('runCount', mem.facts.get('runCount', 0) + 1);
```

Full API is in [`README.md`](README.md#api).

## Important gotchas

- **Mark seen items *after* processing.** Use `filterNew(...)` → do the work →
  `markAll(...)`. If you mark before, a mid-run crash silently skips unprocessed
  items on the next run.
- **`.memory/` holds secrets.** It contains cookies/tokens and is git-ignored —
  keep it that way; never commit it.
- **Session expiry.** Saved auth can go stale (server-side logout, cookie
  expiry). If a "logged-in" run redirects to login, call `mem.auth.clear('main')`
  and log in again.

## Optional polish (if maintaining/shipping)

- [ ] Add a `LICENSE` file (MIT) to match `package.json`.
- [ ] Add a CI workflow running `npm test` on push.
- [ ] Add a linter (e.g. ESLint) if collaborating.
- [ ] Publish to npm if you want `npm install` in other projects.

## Quick reference

```bash
npm test                 # run the 9 unit tests (no Playwright needed)
npm run example          # run the sample automation (needs Playwright installed)
npm install playwright   # install the browser driver for the example
```
