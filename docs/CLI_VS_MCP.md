# Playwright CLI vs Playwright MCP

Two different tools share the "Playwright" name. This repo is built on the
**CLI / test runner**. The **MCP server** is a separate, complementary thing.
This page explains what each is, their current status, and when to use which.

> **Version status (as of this writing)**
> - **Playwright CLI (`@playwright/test`)** — installed here: **1.61.1**. Mature,
>   generally available, stable `1.x` API. This is what `playwright.config.js`,
>   `tests/`, and the CI workflow use.
> - **Playwright MCP (`@playwright/mcp`)** — latest on npm: **0.0.78**.
>   Pre-1.0 and actively evolving; its tool set and flags can change between
>   releases. Official, maintained by the Playwright team at Microsoft. Not used
>   by this repo — documented here for comparison.
>
> Check current versions yourself:
> ```bash
> npx playwright --version          # the CLI/test runner
> npm view @playwright/mcp version  # the MCP server
> ```

---

## What each one is

### Playwright CLI / test runner (`@playwright/test`)
The classic tool: **you write test/automation code**, and the `playwright`
command runs it deterministically. Config lives in `playwright.config.js`;
behavior is driven by env vars and flags. Everything in this repo is this.

- **Who runs it:** a developer, a script, or CI — non-interactively.
- **Control model:** you write selectors and steps in JS/TS.
- **Determinism:** high — the same code + config produces the same run.
- **Output:** reporters (list/html/github/junit…), traces, screenshots.

### Playwright MCP server (`@playwright/mcp`)
An **MCP (Model Context Protocol) server** that exposes browser actions as
**tools an LLM/agent can call** (navigate, click, type, snapshot, etc.). Instead
of you writing selectors, an AI client (Claude Code/Desktop, VS Code, Cursor, …)
drives the browser live by calling those tools.

- **Who runs it:** an AI agent, interactively, deciding steps as it goes.
- **Control model:** the model reads an **accessibility-tree snapshot** of the
  page (structured text, not pixels) and chooses actions. No pre-written
  selectors.
- **Determinism:** low by design — the agent adapts each turn.
- **Output:** tool results fed back to the model; good for exploration and
  one-off tasks.

## Side by side

| | **CLI / test runner** | **MCP server** |
| --- | --- | --- |
| Package | `@playwright/test` | `@playwright/mcp` |
| Status | Stable, GA (`1.x`) | Pre-1.0 (`0.0.x`), evolving |
| Driver | Your code / CI | An AI agent |
| Interaction | Batch, non-interactive | Interactive, turn-by-turn |
| You write selectors? | Yes | No (agent uses a11y snapshot) |
| Reproducible runs | Yes | No (agent-decided) |
| Fits in CI/CD | Yes — this repo | Not really its purpose |
| Best for | Repeatable automation, tests, scraping pipelines | Exploration, "go do X in the browser", prototyping flows |
| Used in this repo | **Yes** | No |

## When to use which

**Use the CLI (this repo) when** you want a job that runs the same way every
time: scheduled scrapes, regression tests, an automation that must run in
CI/CD, anything where you'll re-run it and expect identical behavior. The memory
layer (`auth`/`seen`/`facts`) is built for exactly these repeatable runs.

**Use the MCP server when** you want an AI agent to operate a browser for you
ad hoc — "log into this site and tell me what's on the dashboard", "figure out
the steps to check out", exploratory testing, or **discovering the selectors and
flow** you'll then harden into a CLI spec here.

**They compose well:** let the MCP agent explore a flow interactively, then
codify the stable version as a `tests/*.spec.js` in this repo so it runs
deterministically in CI — with the memory layer handling auth and dedupe.

## Trying the MCP server (optional — not required for this repo)

The MCP server is standalone; you don't install it into this project. You point
an MCP-capable client at it. For **Claude Code**, register it once:

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

Or add it to your client's MCP JSON config:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

Then, in a chat, ask the agent to open a page and act on it — it will call the
Playwright MCP tools to do so. Because it's `0.0.x`, pin a version
(`@playwright/mcp@0.0.78`) if you need reproducibility, and re-check the flags
after upgrades.

> This repo does **not** depend on the MCP server. Everything in
> [GETTING_STARTED](./GETTING_STARTED.md) works with the CLI alone.
