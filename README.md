# @adddog/claude-plugin-pnpm

Claude Code plugin for pnpm monorepos. Provides agent team orchestration, workspace-aware lint/types/test/knip fixing, and changeset-driven shipping workflows out of the box.

## Install

```bash
claude plugin add @adddog/claude-plugin-pnpm
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
3. Outputs a complete `team-plan.md` + optional `team-scope.json` and `settings.hooks.json`
4. Lead agent executes the plan

## Hooks

Quality gates enforced at the Claude Code hook level:

| Hook | Event | Purpose |
|------|-------|---------|
| `check-team-scope.sh` | PreToolUse (Edit/Write) | Enforce file edits stay within team's package scope |
| `subagent-stop-verify.sh` | SubagentStop | Ensure agents report STATUS before stopping |

Hooks are wired via `hooks.json`. Merge relevant sections into `.claude/settings.local.json` when activating a team.

## Prerequisites

- pnpm workspace monorepo
- `@changesets/cli` (for `/ship` and `/changeset` skills)
- `python3` (for hook scripts)
