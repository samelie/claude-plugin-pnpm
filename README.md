# @adddog/claude-plugin-pnpm

Claude Code plugin for pnpm monorepos. Provides agent team orchestration, workspace-aware lint/types/test/knip fixing, and changeset-driven shipping workflows out of the box.

## Install

```bash
claude plugin install claude-plugin-pnpm
```

Install at your pnpm monorepo root.

## Skills

| Skill | Trigger phrases | Description |
|-------|----------------|-------------|
| `/ship` | ship, ship it, feature complete, wrap up | Generate changeset + optional knowledge refresh + git workflow |
| `/changeset` | changeset, add changeset, describe changes | Generate a `.changeset/<id>.md` from git diff |
| `/full-monorepo-pnpm` | full monorepo, all packages, workspace-wide | Run lint/types/knip/test across ALL workspace packages in parallel batches |
| `/pnpm-workspace-filter` | lint, types, test, knip | Run + fix lint/types/test/knip on changed packages |

## Agents

| Agent | Model | Description |
|-------|-------|-------------|
| `full-monorepo-pnpm` | sonnet | Batch orchestrator — discovers packages, dispatches parallel sub-agents, collects results, respawns for remaining errors |
| `pnpm-workspace-filter` | sonnet | Single-package fixer — runs and fixes lint/types/test/knip errors |
| `quarterback` | opus | QA reviewer — read-only code review, pattern adherence, requirement verification |
| `planner` | opus | Generates executable team plans following the FRAMEWORK |

## Team Templates

The plugin includes a complete agent team framework for orchestrating multi-agent work:

- **FRAMEWORK.md** — Invariant rules for all agent teams: roles, phase gating, file ownership, STATUS protocol, recovery, model selection
- **PLANNER.md** — Planning methodology: how to group tasks, determine file ownership, order phases, decide on QB/hooks
- **team-template-base.md** — Fill-in-the-blanks starter template for new team plans

### Generating a team plan

1. Describe your task to Claude
2. The `planner` agent reads FRAMEWORK.md + PLANNER.md
3. Outputs `design.md` + `team-plan.md` + optional `team-scope.json` to `team-session/{team-name}/`
4. Lead agent executes the plan

## Hooks

Quality gates enforced at the Claude Code hook level:

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start` | SessionStart | Creates `team-session/` symlink to a fresh tmpdir |
| `check-team-scope` | PreToolUse (Edit/Write) | Enforce file edits stay within team's package scope |
| `check-status-protocol` | SubagentStop | Ensure agents report STATUS before stopping |
| `stop-verify.sh` | Stop | Block lead from stopping with incomplete tasks |

Hooks are wired automatically via the plugin's `hooks/hooks.json` — always active when the plugin is enabled. The scope hook auto-discovers `team-session/*/team-scope.json` (written by the planner). No per-team wiring needed.

## Prerequisites

- pnpm workspace monorepo
- `@changesets/cli` (for `/ship` and `/changeset` skills)
- `python3` (for hook scripts)

## Local Development

When iterating on agents/skills, you don't want to push + reinstall for every change. Symlink the plugin cache to your local copy for instant updates:

```bash
# Remove the cached version
rm -rf ~/.claude/plugins/cache/adddog-tools/claude-plugin-pnpm/0.0.5

# Symlink to your local repo
ln -s /path/to/your/monorepo/packages/claude-plugin-pnpm \
      ~/.claude/plugins/cache/adddog-tools/claude-plugin-pnpm/0.0.5

# Reload plugins (in Claude Code)
/reload-plugins
```

Now edits to agents, skills, hooks, and templates take effect immediately after `/reload-plugins` — no git push, no version bump, no reinstall.

**To revert to published version:** delete the symlink and reinstall:
```bash
rm ~/.claude/plugins/cache/adddog-tools/claude-plugin-pnpm/0.0.5
claude plugin install claude-plugin-pnpm@adddog-tools --scope project
```

## Publishing & Updating — Gotchas

Hard-won notes from shipping this plugin. Skip the hour of debugging.

### `claude plugin update` does NOT fetch from npm

It only checks `~/.claude/plugins/npm-cache/package-lock.json`. If that lockfile is stale, update reports "already at latest" against a fake latest. To actually pull a new version:

```bash
# 1. Bump the dep range (see next gotcha about why ^0.0.x is broken)
vim ~/.claude/plugins/npm-cache/package.json

# 2. Force-clear npm's metadata cache (otherwise ETARGET on just-published versions)
npm cache clean --force

# 3. Reinstall deps in npm-cache
(cd ~/.claude/plugins/npm-cache && rm -rf node_modules package-lock.json && npm install)

# 4. Uninstall + reinstall the plugin so Claude picks up the new cached version
claude plugin uninstall claude-plugin-pnpm@adddog-tools --scope project
rm -rf ~/.claude/plugins/cache/adddog-tools/claude-plugin-pnpm/
claude plugin install claude-plugin-pnpm@adddog-tools --scope project
```

### `^0.0.x` caps at `<0.1.0` — minor bumps are silently skipped

Semver caret on a zero-major zero-minor version is narrower than you'd expect: `^0.0.2` matches `>=0.0.2 <0.0.3`. Bumping `0.0.4 → 0.1.0` is invisible to that range. When bumping past `0.0.x`, manually update `~/.claude/plugins/npm-cache/package.json` to `^0.1.0`.

### `claude plugin list` shows cache DIRECTORY names, not actual versions

After installing `0.1.0`, list may report `Version: 0.0.5` — that's the cache subdirectory name, not the package.json version inside. Verify the real version with:

```bash
cat ~/.claude/plugins/cache/adddog-tools/claude-plugin-pnpm/*/package.json | grep version
```

### Publishing a scoped package without auth returns 404, not 401

`npm publish @scope/pkg` with no login returns `E404 Not Found`. Run `npm whoami` first to confirm auth. 2FA-enabled accounts additionally need `--otp=<code>` or browser flow.

### CDN cache lag on `npm view`

Immediately after publish, `npm view @pkg version` may still report the previous version for several minutes (CDN). Bypass with the raw registry:

```bash
curl -s https://registry.npmjs.org/-/package/@adddog/claude-plugin-pnpm/dist-tags
# {"latest":"0.1.0"}
```

### hooks.json schema: `matcher` is REQUIRED on every hook entry

Per [official hook-development docs](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md), **every entry needs a `matcher` field** — including event types that aren't tool-specific like `SessionStart`, `Stop`, `SubagentStop`. Use `"*"` as a wildcard. Missing matchers cause schema validation failures that surface as generic `<Event>:<matcher> hook error` messages without useful detail.

Also: use pipe-delimited matchers (`"Edit|Write|MultiEdit"`) not regex anchors (`"^(Edit|Write|MultiEdit)$"`). The docs show the former; the latter may silently not match.

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "*",
      "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start\"" }]
    }],
    "PreToolUse": [{
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [{ "type": "command", "command": "sh \"${CLAUDE_PLUGIN_ROOT}/hooks/check-team-scope\"" }]
    }]
  }
}
```

### npm publish loses executable bits — always prefix hook commands with `bash`/`sh`

Scripts with exec bit (`755`) in source arrive as `644` after `npm publish` → install. If `hooks/hooks.json` invokes `"${CLAUDE_PLUGIN_ROOT}/hooks/session-start"` directly, Claude Code gets `permission denied` (exit 126) and surfaces it as `SessionStart:startup hook error`.

**Fix**: prefix every hook command with its interpreter. Never rely on the exec bit in published tarballs:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start\""
      }]
    }]
  }
}
```

Match the interpreter to the script's shebang (`bash` for `#!/usr/bin/env bash`, `sh` for `#!/usr/bin/env sh`). This also means hook scripts don't need shebangs to be honored — the interpreter is chosen explicitly in `hooks.json`.

### Plugin changes take effect on next session start, not mid-session

Hooks, skills, and agents are loaded once when a Claude Code session starts. After reinstalling the plugin, current sessions keep running the old code. Start a new session in the project to pick up changes.
