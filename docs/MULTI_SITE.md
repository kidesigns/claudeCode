# Multiple sites

This project runs end-to-end automation against several websites while keeping
each site's **code, config, login, and memory fully separated**. You add a site
by dropping a folder under `sites/` — there is no central list to maintain.

- [How it's organized](#how-its-organized)
- [Selecting which sites run](#selecting-which-sites-run)
- [Adding a new site](#adding-a-new-site)
- [Per-site memory](#per-site-memory)
- [Login per site](#login-per-site)
- [CI/CD](#cicd)

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

That's it — `npm run sites` will now list `widgetco` and it'll run with the rest.

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
