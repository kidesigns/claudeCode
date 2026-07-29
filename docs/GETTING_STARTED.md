# Getting Started

A complete walkthrough: install → first run → how the pieces fit → configuring
runs → CI/CD. If you just want the knob reference, see the table in the
[README](../README.md#running-playwright--configure-it-any-way-you-like).

- [1. What this project is](#1-what-this-project-is)
- [2. Prerequisites](#2-prerequisites)
- [3. Install](#3-install)
- [4. Your first run](#4-your-first-run)
- [5. Project structure](#5-project-structure)
- [6. The memory layer](#6-the-memory-layer)
- [7. Configuring how Playwright runs](#7-configuring-how-playwright-runs)
- [8. Wiring in your real automation](#8-wiring-in-your-real-automation)
- [9. CI/CD with GitHub Actions](#9-cicd-with-github-actions)
- [10. Troubleshooting](#10-troubleshooting)
- [11. Playwright CLI vs MCP](#11-playwright-cli-vs-mcp)

---

## 1. What this project is

Two things, layered:

1. **A memory/state layer** (`src/memory.js`) — a small, dependency-free module
   that gives a Playwright automation persistent memory across runs:
   - **auth** — saved login sessions (`storageState`),
   - **seen** — dedupe state so each run only handles new items,
   - **facts** — a key/value store for preferences and remembered data.
2. **A configuration-driven Playwright runner** — `playwright.config.js` plus a
   GitHub Actions workflow, where every option (browser, headed, workers,
   retries, auth reuse, …) is set by environment variables. The **same knobs
   work locally and in CI**.

## 2. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 18+ (tested on 22) | `node --version` |
| npm | 9+ | ships with Node |
| Git | any | to clone/push |

You do **not** need Playwright pre-installed globally — it comes in as a project
dependency in the next step.

## 3. Install

```bash
git clone <this-repo-url>
cd claudeCode

# install JS dependencies (@playwright/test, dotenv)
npm install

# download the browser binaries Playwright drives
npx playwright install --with-deps chromium
# ...or all three engines:
# npx playwright install --with-deps chromium firefox webkit
```

`--with-deps` also installs the OS libraries the browsers need (handy on fresh
Linux/CI machines). On macOS/Windows you can drop it.

Then create your local config from the template:

```bash
cp .env.example .env
# edit .env — set PW_BASE_URL, and SITE_USER/SITE_PASS if using auth
```

## 4. Your first run

```bash
# unit tests for the memory layer (no browser needed) — should print 9 passing
npm test

# list what Playwright *would* run, without launching a browser
npx playwright test --list

# actually run the example spec
npx playwright test
```

> The bundled `tests/example.spec.js` uses **placeholder** URLs/selectors
> (`example.com`, `.item`, `#username`). It's there to demonstrate wiring — it
> will only pass end-to-end once you point it at a real site (see
> [section 8](#8-wiring-in-your-real-automation)).

After a run, open the HTML report:

```bash
npm run pw:report     # = playwright show-report
```

## 5. Project structure

```
.
├── src/memory.js                 # the memory/state layer (drop-in, no deps)
├── examples/scrape-with-memory.js# raw `playwright` library example (no test runner)
├── tests/
│   ├── auth.setup.js             # login "setup" project (runs when PW_REUSE_AUTH=1)
│   └── example.spec.js           # example spec using the memory layer
├── test/memory.test.js           # unit tests for the memory layer (node --test)
├── playwright.config.js          # env-driven Playwright configuration
├── .env.example                  # every config knob, documented
├── .github/workflows/playwright.yml  # configurable CI/CD pipeline
└── docs/                         # this guide + CLI-vs-MCP notes
```

Note the two test locations, on purpose:
- `test/` (singular) holds **memory unit tests**, run by Node's built-in runner
  (`npm test`). Files end in `.test.js`.
- `tests/` (plural) holds **Playwright specs**, run by the Playwright CLI. Files
  end in `.spec.js` / `.setup.js`. Node's runner ignores these.

## 6. The memory layer

```js
const { createMemory } = require('./src/memory');
const mem = createMemory({ dir: '.memory' });
```

| Namespace | Use it for | Key methods |
| --- | --- | --- |
| `mem.auth` | staying logged in | `restore(name)`, `has(name)`, `save(context, name)`, `path(name)`, `clear(name)` |
| `mem.seen` | dedupe / incremental | `filterNew(coll, items, idFn)`, `markAll(coll, items, idFn)`, `add`, `has`, `count`, `clear` |
| `mem.facts` | preferences / metadata | `get(k, fallback)`, `set(k, v)`, `has`, `delete`, `all()` |

The canonical dedupe pattern — **mark seen only after processing** so a crash
retries unprocessed items instead of silently skipping them:

```js
const fresh = mem.seen.filterNew('items', items, (it) => it.id);
for (const item of fresh) { /* ...do the work... */ }
mem.seen.markAll('items', fresh, (it) => it.id);
```

Everything is stored as plain JSON under `.memory/` with atomic writes. That
directory is git-ignored (it can hold cookies/tokens). Full API in the
[README](../README.md#api).

## 7. Configuring how Playwright runs

`playwright.config.js` reads environment variables, each with a safe default.
Set them three equivalent ways:

```bash
# A) inline, one-off
PW_BROWSERS=firefox PW_HEADED=1 npx playwright test

# B) in .env (persists for every local run)
echo "PW_BROWSERS=firefox" >> .env

# C) via npm shortcuts
npm run pw:headed        # PW_HEADED=1
npm run pw:all           # all three browsers
npm run pw:auth          # PW_REUSE_AUTH=1
```

Common knobs (full list in `.env.example`):

| Variable | Default | Effect |
| --- | --- | --- |
| `PW_BROWSERS` | `chromium` | comma list: `chromium,firefox,webkit` |
| `PW_HEADED` | `0` | show the browser window |
| `PW_WORKERS` | auto (1 in CI) | parallel workers |
| `PW_RETRIES` | `0` (2 in CI) | retries per failing test |
| `PW_BASE_URL` | – | base for `page.goto('/path')` |
| `PW_GREP` | – | only run tests whose title matches this regex |
| `PW_TRACE` | `retain-on-failure` | `on` / `off` / `retain-on-failure` / `on-first-retry` |
| `PW_REPORTER` | `list` (CI: `github,html`) | comma list of reporters |
| `PW_REUSE_AUTH` | `0` | run login setup + reuse `storageState` |

Playwright **also auto-detects CI** (the `CI` env var): it bumps retries, drops
to a single worker, and enables `forbidOnly` so a stray `test.only` fails the
build. You don't set those manually.

## 8. Wiring in your real automation

The bundled spec is a scaffold. To make it drive *your* site:

1. **Set the base URL** — `PW_BASE_URL=https://your-app.example` in `.env`.
2. **Replace the login flow** in `tests/auth.setup.js` — swap `#username`,
   `#password`, the submit selector, and the post-login `waitForURL(...)` for
   your app's real login page. Keep the final
   `context.storageState({ path: AUTH_STATE })` call — that's what persists the
   session.
3. **Replace the scrape/act flow** in `tests/example.spec.js` — swap `.item`
   and the fields for your real selectors and per-item work. Keep the
   `filterNew → work → markAll` shape to get dedupe for free.
4. **Turn on auth reuse** when you want to log in once and reuse it:
   `PW_REUSE_AUTH=1 npm run pw`.

Prefer the raw `playwright` library (no test runner)? `examples/scrape-with-memory.js`
shows the same three memory features without `@playwright/test`.

## 9. CI/CD with GitHub Actions

The workflow lives at `.github/workflows/playwright.yml`. The essentials:

**When it runs**
- automatically on push to `main` and on every pull request (with defaults),
- on demand from **Actions → Playwright → Run workflow**, where you pick the
  browsers, workers, retries, auth reuse, base URL, grep, and reporter.

**How config flows.** Each `workflow_dispatch` input maps to the same `PW_*`
env var your local `.env` uses, so *CI runs behave exactly like local runs*:

```yaml
env:
  PW_BROWSERS: ${{ inputs.browsers || 'chromium' }}
  PW_RETRIES:  ${{ inputs.retries  || '2' }}
  PW_REUSE_AUTH: ${{ inputs.reuse_auth && '1' || '0' }}
  SITE_USER: ${{ secrets.SITE_USER }}
  SITE_PASS: ${{ secrets.SITE_PASS }}
```

**Secrets (for the login flow).** Add them once in the repo:
`Settings → Secrets and variables → Actions → New repository secret` →
`SITE_USER` and `SITE_PASS`. They're injected as env vars and never committed.

**What the pipeline does, step by step**
1. `actions/checkout` — clone the repo.
2. `actions/setup-node` (Node 20, npm cache) → `npm ci`.
3. `actions/cache` restores `.memory/` from a previous run — best-effort
   cross-run dedupe state (see the caveat below).
4. Installs **only the browsers you asked for** (`PW_BROWSERS` → space list).
5. `npx playwright test` — runs with all the `PW_*` values above.
6. `actions/upload-artifact` — uploads the HTML report (download it from the
   run summary).

> **Ephemeral runners caveat.** A CI runner starts clean every run, so on-disk
> state does not automatically survive between runs. `storageState` is
> therefore best treated as *within-run* convenience (re-created each run from
> secrets via the setup project). The `.memory/` **cache** gives *best-effort*
> cross-run `seen`/`facts` persistence — GitHub can evict caches, so don't rely
> on it for correctness. If you need guaranteed cross-run memory, back
> `.memory/` with an artifact download/upload pair or an external store
> (bucket/DB).

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Executable doesn't exist … run "playwright install"` | `npx playwright install --with-deps <browser>` |
| `Unknown PW_BROWSERS entry: "safari"` | valid values are `chromium`, `firefox`, `webkit` |
| Login setup never runs | it only runs with `PW_REUSE_AUTH=1` |
| `npm test` tries to run the `.spec.js` files | it shouldn't — Node's runner only matches `*.test.js`; keep Playwright specs as `.spec.js`/`.setup.js` |
| Tests pass locally but flake in CI | raise `PW_RETRIES`, set `PW_TRACE=on-first-retry`, and open the uploaded trace with `npx playwright show-trace` |
| Want to watch it happen | `PW_HEADED=1 npm run pw` (local only — CI is headless) |

## 11. Playwright CLI vs MCP

The runner in this repo is the **Playwright CLI / test runner** — a
deterministic, config-driven tool. There's also a separate **Playwright MCP
server** that lets an AI agent drive a browser interactively. They solve
different problems and can coexist. See **[CLI_VS_MCP.md](./CLI_VS_MCP.md)** for
the full comparison and current status.
