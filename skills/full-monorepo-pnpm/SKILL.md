---
name: full-monorepo-pnpm
description: "Run any pnpm skill (lint, types, knip, test) across ALL workspace packages in parallel batches. Triggers: full monorepo, all packages, workspace-wide lint/types/knip/test."
context: fork
agent: full-monorepo-pnpm
---

# full-monorepo-pnpm

Orchestrate a pnpm target across ALL workspace packages (or a filtered subset) using 1-package-per-agent dispatch with rolling sub-batches.

## Usage

```
/full-monorepo-pnpm <target> [--filter=<pnpm-filter>] [--dry-run]
```

| Arg | Default | Description |
|-----|---------|-------------|
| `target` | required | `lint`, `types`, `knip`, `test` |
| `--filter` | all | pnpm filter syntax (e.g. `@scope/...`) |
| `--dry-run` | false | print dispatch plan only |

## Target -> Command

| Target | Script | Command |
|--------|--------|---------|
| `lint` | `lint:fix` | `pnpm -F "<name>" lint:fix` |
| `types` | `types` | `pnpm -F "<name>" types` |
| `knip` | `knip` | `pnpm -F "<name>" knip` |
| `test` | `test` | `pnpm -F "<name>" test` |

## Steps

### 1. Parse Args

Extract target, map to script/command. Invalid/missing -> print usage, stop:

```
Usage: /full-monorepo-pnpm <lint|types|knip|test> [--filter=...] [--dry-run]
```

### 2. Discover Packages

```bash
pnpm ls -r --depth -1 --json
pnpm ls -r --depth -1 --json --filter='<value>'   # if --filter provided
```

JSON array with `name` and `path` per package. Skip root workspace package (path = monorepo root).

### 3. Filter by Script

Read each `<path>/package.json`, check `scripts.<script>` exists. Drop packages without it.

Report: `Found N/M packages with "<script>" script.` N=0 -> stop.

### 4. Build Queue

Create a flat queue of all eligible packages (no grouping). Each entry: `{ name, path }`.

Sort alphabetically by package name.

### 5. Dispatch — Rolling Sub-Batches

`--dry-run` -> print queue, stop.

**Concurrency cap: 15 agents in flight at any time.**

Dispatch in **sub-batches of 5**. This means:

1. Dispatch first 5 agents (one package each).
2. Wait for that sub-batch to complete.
3. Collect results (see Step 6).
4. Dispatch next 5 from queue.
5. Repeat until queue is empty.

This keeps agents flowing without waiting for all 15 to finish before refilling.

**Maximum 3 sub-batches in flight before waiting:**
- Sub-batch 1 (5 agents) -> dispatch immediately
- Sub-batch 2 (5 agents) -> dispatch immediately
- Sub-batch 3 (5 agents) -> dispatch immediately
- Now wait for sub-batch 1 to complete -> collect results -> dispatch sub-batch 4
- Wait for sub-batch 2 to complete -> collect results -> dispatch sub-batch 5
- ...and so on until queue is drained

Each agent:

```
subagent_type: "pnpm-workspace-filter"
model: "sonnet"
name: "{target}-{sanitized_pkg_name}-w{wave}"
prompt: <Sub-Agent Prompt Template below>
```

### 6. Collect

Parse STATUS line from each result:
- `STATUS: CLEAN` -> done
- `STATUS: ERRORS_REMAINING: <count> errors in <package>` -> add to respawn queue
- Missing STATUS -> treat as ERRORS_REMAINING

### 7. Respawn (max 2 waves)

After all sub-batches in a wave complete, re-queue ERRORS_REMAINING packages for wave 2 (then wave 3 max). Include prior agent's summary so new agent doesn't redo work.

After wave 3 (initial + 2 respawns), stop and report.

### 8. Summary

```
## Results: {target}

| Package | Status |
|---------|--------|
| @scope/pkg-a | CLEAN |
| @scope/pkg-b | ERRORS_REMAINING (3 errors) |

Total: X/Y clean.

STATUS: CLEAN
STATUS: ERRORS_REMAINING: Z errors in N packages
```

---

## Sub-Agent Prompt Template

Each agent gets exactly ONE package. Fill `{target}`, `{command}`, `{pkg_name}`, `{pkg_path}`, `{prior_summary}`:

```
TARGET: {target}

OVERRIDE: Do NOT run git diff. Do NOT discover packages yourself.
Apply the "{target}" fix strategy from the pnpm-workspace-filter skill.

Your package and command:

- `pnpm -F "{pkg_name}" {command}`  (path: {pkg_path})

Run EXACTLY this command. Fix errors, iterate until clean.

## WHEN TO STOP

Stop and report if ANY:
1. All errors fixed -> STATUS: CLEAN
2. ~10 min elapsed
3. Context large / responses slowing
4. Running out of turns

Stop early with a clear report — a fresh agent continues your work.

{prior_summary}

## STATUS REPORT (MANDATORY)

Final message MUST end with exactly one of:
  STATUS: CLEAN
  STATUS: ERRORS_REMAINING: <count> errors in {pkg_name}

Include summary of fixes so next agent doesn't redo work.

## Rules
- pnpm -F "{pkg_name}" — use EXACT filter value above
- Read existing code before modifying — match patterns
- Leave changes uncommitted
```

**{prior_summary}** (waves 2+ only):
```
## Prior Agent Progress
Previous agent reported:
{summary}
Continue from where they left off. Do NOT redo already-fixed work.
```

---

## Critical Rules

- Do NOT fix code directly — only dispatch sub-agents
- Exact `name` from `pnpm ls` JSON as `-F` filter — no globs
- ONE package per agent — never group
- All sub-agents: `subagent_type: "pnpm-workspace-filter"`, `model: "sonnet"`
- Leave all changes uncommitted
