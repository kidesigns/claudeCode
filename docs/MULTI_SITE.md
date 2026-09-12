# Multiple sites

This project runs end-to-end automation against several websites while keeping
each site's **code, config, login, and memory fully separated**. You add a site
by dropping a folder under `sites/` — there is no central list to maintain.

- [Command cheat sheet](#command-cheat-sheet)
- [How it's organized](#how-its-organized)
- [Selecting which sites run](#selecting-which-sites-run)
- [Adding a new site](#adding-a-new-site)
- [Common recipes](#common-recipes)
- [Debugging a site](#debugging-a-site)
- [Per-site memory](#per-site-memory)
- [Login per site](#login-per-site)
- [CI/CD](#cicd)

## Command cheat sheet

| Goal | Command |
| --- | --- |
| List discovered sites | `npm run sites` |
| List what would run (no browser) | `npx playwright test --list` |
| Run everything (all sites, chromium) | `npm run pw` |
| Run one site | `PW_SITES=acme npm run pw` |
| Run several sites | `PW_SITES=acme,globex npm run pw` |
| Run one generated project | `npx playwright test --project=acme-chromium` |
| Cross-browser | `PW_BROWSERS=chromium,firefox,webkit npm run pw` |
| Watch it happen (visible) | `PW_HEADED=1 npm run pw` |
| Interactive UI mode | `npx playwright test --ui` |
| Step-through debugger | `PW_HEADED=1 npx playwright test --debug` |
| Only tests matching a title | `PW_GREP='checkout' npm run pw` |
| Log in once per site, reuse | `PW_REUSE_AUTH=1 npm run pw` |
| Open the last HTML report | `npm run pw:report` |
| Open a saved trace | `npx playwright show-trace <trace.zip>` |
| Memory-layer unit tests | `npm test` |

Env knobs combine freely, e.g.
`PW_SITES=acme PW_BROWSERS=firefox PW_HEADED=1 PW_REUSE_AUTH=1 npm run pw`.

## How it's organized

```
sites/
  _template/                 # copy this to start a new site ("_" = ignored)
    site.config.js           # name, baseURL, auth recipe
    auth.setup.js            # one-liner that registers the login setup
    tests/
      home.spec.js           # this site's specs live here
  acme/                      # example: a form-login site
    site.config.js
    auth.setup.js
    tests/dashboard.spec.js
  globex/                    # example: a no-login site
    site.config.js
    tests/catalog.spec.js

lib/
  sites.js                   # discovers sites/ and loads each site.config.js
  site-auth.js               # shared login-setup registration

playwright.config.js         # builds projects from discovered sites × browsers
```

`playwright.config.js` turns each discovered site into Playwright **projects**:

- `"<site>-<browser>"` — e.g. `acme-chromium`, `globex-firefox`. Its `testDir`
  is `sites/<site>/tests` and its `baseURL` is the site's `baseURL`, so a
  site's specs can only run against that site.
- `"<site>:setup"` — a login project, added only when `PW_REUSE_AUTH=1` **and**
  that site's `auth.enabled` is true. The browser projects depend on it and
  reuse the session it saves.

So tests are isolated by directory, config by `site.config.js`, sessions/state
by a per-site memory namespace.

## Selecting which sites run

`PW_SITES` (comma list of folder names) picks sites; blank runs all:

```bash
npm run sites                         # list discovered sites
npx playwright test                   # all sites
PW_SITES=acme npx playwright test     # just acme
PW_SITES=acme,globex npx playwright test
```

It composes with every other knob:

```bash
PW_SITES=acme PW_BROWSERS=chromium,firefox PW_HEADED=1 npm run pw
```

You can also target generated projects directly (Playwright runs their setup
dependency automatically):

```bash
npx playwright test --project=acme-chromium
```

An unknown name fails fast with the list of known sites.

## Adding a new site

1. **Copy the template:**
   ```bash
   cp -r sites/_template sites/widgetco
   ```
2. **Edit `sites/widgetco/site.config.js`** — set `name: 'widgetco'`, the
   `baseURL` (read from an env var like `WIDGETCO_BASE_URL`), and either the
   login selector recipe or a custom `login` function. Set `auth.enabled:false`
   if the site needs no login.
3. **Write specs** in `sites/widgetco/tests/*.spec.js`. Use
   `memoryForSite('widgetco')` for this site's auth/seen/facts.
4. **Add its env vars** to `.env` (and as CI secrets/variables).

5. **Verify discovery and wiring** before writing real selectors:
   ```bash
   npm run sites                               # widgetco should appear
   PW_SITES=widgetco npx playwright test --list  # its project(s) should list
   ```

That's it — `npm run sites` will now list `widgetco` and it'll run with the rest.

> **Placeholder sites auto-skip.** A site whose `baseURL` still points at a
> reserved `example.(com|org|net)` domain (like the bundled `acme`/`globex`) is
> treated as unconfigured: its specs **skip** via `isExampleSite()` (see
> `lib/sites.js`), so CI stays green out of the box. The moment you set a real
> `baseURL`, that site's specs run normally.

### Full example, end to end

```bash
# 1. scaffold
cp -r sites/_template sites/widgetco

# 2. set name + baseURL + login in the config
#    (edit sites/widgetco/site.config.js — name: 'widgetco', WIDGETCO_BASE_URL, selectors)

# 3. local env vars
cat >> .env <<'ENV'
WIDGETCO_BASE_URL=https://widgetco.internal.example
WIDGETCO_USER=
WIDGETCO_PASS=
ENV

# 4. confirm it's picked up
npm run sites
PW_SITES=widgetco npx playwright test --list

# 5. run it (log in once, visible, chromium)
PW_SITES=widgetco PW_REUSE_AUTH=1 PW_HEADED=1 npm run pw
```

For CI, add matching entries to `.github/workflows/playwright.yml` `env:` block
and create the repo Variable/Secrets (see [CI/CD](#cicd)):

```yaml
WIDGETCO_BASE_URL: ${{ vars.WIDGETCO_BASE_URL }}
WIDGETCO_USER: ${{ secrets.WIDGETCO_USER }}
WIDGETCO_PASS: ${{ secrets.WIDGETCO_PASS }}
```

## Common recipes

**Run just the site I'm actively working on, visibly:**
```bash
PW_SITES=acme PW_HEADED=1 npm run pw
```

**Run a single spec file / a single test:**
```bash
npx playwright test sites/acme/tests/dashboard.spec.js   # one file
PW_GREP='new orders' npm run pw                          # by title
```

**Re-run only what failed last time:**
```bash
npx playwright test --last-failed
```

**Reset one site's memory** (force it to re-login / re-process everything):
```bash
rm -rf .memory/acme        # removes that site's auth + seen + facts only
```

**Run two sites in parallel across browsers:**
```bash
PW_SITES=acme,globex PW_BROWSERS=chromium,firefox PW_WORKERS=4 npm run pw
```

**See every generated project name** (useful for `--project`):
```bash
npx playwright test --list | grep -oE '\[[^]]+\]' | sort -u
```

## Debugging a site

| Tool | Command | Use it for |
| --- | --- | --- |
| UI mode | `npx playwright test --ui` | time-travel through a run, pick sites/tests to re-run |
| Inspector | `PW_HEADED=1 npx playwright test --debug` | step through actions, try selectors live |
| Headed | `PW_HEADED=1 PW_SITES=acme npm run pw` | just watch the browser |
| Trace | `PW_TRACE=on npm run pw` then `npx playwright show-trace` | post-mortem of a failure (DOM, network, console) |
| Report | `npm run pw:report` | the HTML report from the last run |
| Codegen | `npx playwright codegen https://acme.example.com` | record clicks to discover selectors for a new site |

`codegen` is the fastest way to build a new site's login recipe and spec
selectors — record the flow, then paste the generated selectors into that
site's `site.config.js` / specs.

## Per-site memory

Each site gets an isolated memory namespace so sessions and dedupe state never
collide:

```
.memory/
  acme/
    auth/main.storageState.json
    seen/orders.json
    facts.json
  globex/
    seen/products.json
    facts.json
```

In a spec, always scope memory to the site:

```js
const { memoryForSite } = require('../../../lib/sites');
const config = require('../site.config');
const mem = memoryForSite(config.name);   // -> .memory/<site>/...
```

## Login per site

Simple form logins are pure config — the shared `lib/site-auth.js` drives them:

```js
// sites/acme/site.config.js
auth: {
  enabled: true,
  userEnv: 'ACME_USER', passEnv: 'ACME_PASS',
  loginPath: '/login',
  usernameSelector: '#username',
  passwordSelector: '#password',
  submitSelector: 'button[type=submit]',
  successURL: '**/dashboard',
}
```

For SSO / multi-step / MFA, drop the selectors and give a function instead:

```js
auth: {
  enabled: true,
  login: async ({ page, context, config }) => {
    await page.goto('/sso');
    // ...whatever the flow needs; storageState is saved for you afterward...
  },
}
```

Credentials always come from env vars (repo secrets in CI), never committed.

## CI/CD

The GitHub Actions workflow exposes a **`sites`** input (blank = all) alongside
browsers/workers/retries/etc. Add per-site config as repo-level **Variables**
(`ACME_BASE_URL`, …) and per-site **Secrets** (`ACME_USER`, `ACME_PASS`, …);
their names must match the env vars each `site.config.js` reads. The workflow
caches the whole `.memory/` tree, so every site's `seen`/`facts` state is
preserved together (best-effort — see the caveat in
[GETTING_STARTED](./GETTING_STARTED.md#9-cicd-with-github-actions)).
