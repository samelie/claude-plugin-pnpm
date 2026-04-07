# Team Template: Knip Config Audit

Audit all ~146 `knip.config.ts` files. Remove stale/extraneous entries. Tighten configs to only what's actually needed. Run knip after each change to validate.

## Prerequisites

```
claude config set --global experiments.agentTeams true
```

## How to Execute

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/knip-config-audit.md`.
Create a team named "knip-audit" using TeamCreate.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

---

## Key Context: How `defineKnipConfig` Works

Source: `packages/monorepo-consistency/src/domains/knip/defaults.ts`

`defineKnipConfig(overrides)` deep-merges overrides onto defaults using lodash `mergeWith`. **Arrays are concatenated, not replaced.**

### Defaults already cover

- **entry**: `["knip.config.ts"]`
- **project**: `["knip.config.ts", "eslint.config.mjs"]`
- **ignore**: `**/knip.config.ts`, `**/eslint.config.mjs`, `**.eslintrc*`, `**/.storybook/**`, `**/*.stories.*`, `**/dev-dist/**`, `**/mocks/handlers.ts`, `**/tailwind.config.ts`, `**/vite-env.d.ts`, `**/examples/**`, `**/dist/**`
- **rules**: dependencies, unlisted, files, exports, types, enumMembers, duplicates, unresolved, binaries = `"error"`; classMembers, nsExports, nsTypes = `"off"`
- **eslint**: `false`
- **typescript.config**: `["./tsconfig.json"]`
- **vitest**: config + entry patterns for `.test.`/`.spec.`/`.bench.` files

### What this means for audit

Any config that re-declares something already in defaults has a **redundant entry**. Since arrays concat, duplicate ignore patterns double up. Configs should only contain:

1. **entry** — actual source entry points (e.g. `["src/index.ts"]`)
2. **project** — actual source globs (e.g. `["src/**/*.ts"]`)
3. **ignoreDependencies** — deps knip can't detect usage of (with WHY comment)
4. **ignoreUnresolved** — unresolvable imports (with WHY comment)
5. **ignore** — files knip shouldn't scan beyond defaults (with WHY comment)
6. **ignoreBinaries** — binaries knip can't find (with WHY comment)
7. **Plugin configs** — webpack, vite, etc. entry overrides

---

## Roles

### 1. Lead (you — the orchestrator)

- Creates team via `TeamCreate`
- Discovers all `knip.config.ts` files, batches them (~15 per auditor)
- Creates tasks via `TaskCreate` with correct `blockedBy` dependencies
- Spawns all agents via `Task` tool with `team_name` and `name` params
- Assigns tasks to agents via `TaskUpdate` with `owner`
- **Does NOT implement** — only orchestrates and gates phase transitions
- Monitors `TaskList` to track progress
- Sends `shutdown_request` to all agents when done, then calls `TeamDelete`

### 2. Quarterback (QA monitor)

- Spawned by lead as `general-purpose` agent with `model: "opus"`
- Spot-checks auditor output: reads changed configs, verifies entries are justified
- If auditor removed something that was actually needed (knip now fails): flags to lead
- If auditor left stale entries: flags to lead
- Approves or rejects each batch
- Does NOT implement — only reviews

### 3. Auditors (up to 10 parallel)

- Spawned by lead as `pnpm-knip` agents with `model: "sonnet"`
- Each auditor owns a batch of ~15 `knip.config.ts` files
- Follows the **Auditor Procedure** below for each config
- Reports to QB when batch complete
- Fixes issues QB flags

### 4. Root Auditor (1 dedicated agent)

- Spawned by lead as `pnpm-knip` agent with `model: "sonnet"`
- Handles ONLY the root-level `knip.config.ts` (has `workspaces` config, different structure)
- Same audit procedure but with awareness of workspace-level concerns

---

## Team Structure

| Agent | Name | subagent_type | model | Role | Phase |
|-------|------|---------------|-------|------|-------|
| Lead | `lead` | (you) | `opus` | orchestrate, gate phases | all |
| Quarterback | `qb` | general-purpose | `opus` | review auditor output | 1-2 |
| Auditor 1 | `auditor-1` | pnpm-knip | `sonnet` | audit batch 1 | 1 |
| Auditor 2 | `auditor-2` | pnpm-knip | `sonnet` | audit batch 2 | 1 |
| ... | `auditor-N` | pnpm-knip | `sonnet` | audit batch N | 1 |
| Root Auditor | `root-auditor` | pnpm-knip | `sonnet` | audit root knip.config.ts | 2 |

---

## Orchestration Flow

```
Phase 0   [lead]           ── TeamCreate, discover configs, batch, TaskCreate, spawn agents
                                    │
Phase 1   [auditor-1]      ── batch 1 (~15 configs)  ─┐
          [auditor-2]      ── batch 2 (~15 configs)  ─┤ parallel
          ...              ── ...                     ─┤
          [auditor-N]      ── batch N (~15 configs)  ─┘
                                    │
          [qb]             ── spot-checks each batch as auditors finish
                                    │ (lead gates: all Phase 1 tasks approved by qb)
                                    │
Phase 2   [root-auditor]   ── audit root knip.config.ts
          [qb]             ── reviews root config changes
                                    │
Phase 3   [lead]           ── final `pnpm knip` on a sample of packages
                              shutdown all agents, TeamDelete
```

---

## Auditor Procedure

For each `knip.config.ts` in your batch:

### Step 1: Read the config

```bash
# Read the knip.config.ts
```

### Step 2: Read the package.json

```bash
# Read package.json in same directory — note actual dependencies
```

### Step 3: Identify stale/redundant entries

Check each config key:

- **entry**: Does the entry point file actually exist? Is it the right one?
- **project**: Does the glob match actual source files? Is it overly broad or narrow?
- **ignoreDependencies**: For each entry, is the dep still in package.json? If not, remove. If yes, is there a real reason knip can't detect its usage? Verify by checking if dep is used in source.
- **ignoreUnresolved**: For each entry, does the import still exist in source? If not, remove.
- **ignore**: For each pattern, is it already covered by defaults? If so, remove. Does the pattern match actual files that need ignoring?
- **ignoreBinaries**: For each entry, is the binary still used? Still undetectable by knip?
- **Anything duplicating defaults**: remove entirely

### Step 4: Trim the config

- Remove all stale/redundant entries found in Step 3
- Ensure remaining ignore entries have a `// WHY:` comment
- If config becomes just `entry` + `project` with no overrides, that's fine — that's the ideal minimal config

### Step 5: Run knip to validate

```bash
pnpm -F "<package-name>" knip
```

- If clean (exit 0): done
- If new errors appear: some removed ignore was actually needed. Add it back with a WHY comment. Re-run.
- If errors are **pre-existing** (not caused by your changes): leave them. Your job is to tighten configs, not fix all knip errors.

### Step 6: Check for unused deps in package.json

While running knip, if it reports unused dependencies that are genuinely unused:
- Remove them from `package.json` (both `dependencies` and `devDependencies`)
- Do NOT run `pnpm install` — leave that for lead's final phase

### Rules for auditors

- **DO**: Remove stale ignores, trim redundant entries, add WHY comments, remove unused deps from package.json
- **DO NOT**: Modify source code, add new dependencies, change entry/project unless clearly wrong, modify tsconfig
- **DO NOT**: Remove an ignore entry if you can't verify it's stale (when in doubt, keep it)
- **DO NOT**: Run `pnpm install` or `pnpm knip` on the root — only on individual packages

---

## Quarterback Protocol

### Spot-check procedure

For each completed batch, QB picks 3-5 configs from the batch and:

1. **Reads** the modified `knip.config.ts`
2. **Reads** the corresponding `package.json`
3. **Checks**:
   - Were default-duplicating entries removed?
   - Do remaining `ignoreDependencies` entries correspond to real deps in package.json?
   - Do remaining `ignore` patterns serve a purpose not covered by defaults?
   - Are WHY comments present on all ignore entries?
   - Were any entries removed that shouldn't have been? (Run `pnpm -F "<pkg>" knip` on 1-2 spot-checked packages)
4. **If OK**: message lead with approval
5. **If NOT OK**: message lead with specific issues per config file

### When to reject

- Auditor left entries that duplicate defaults
- Auditor removed an ignore that was actually needed (knip now errors)
- Missing WHY comments on non-obvious ignores
- Auditor modified source code (forbidden)

---

## Lead Phase 0: Discovery & Batching

### Discovery

```bash
# Find all knip.config.ts files, exclude root
find . -name "knip.config.ts" -not -path "./knip.config.ts" -not -path "*/node_modules/*" | sort
```

### Batching

- Count total configs, divide by target batch size (~15)
- Cap at 10 auditors (if >150 configs, increase batch size)
- Group by directory proximity when possible (same project area = same batch)
- Root `knip.config.ts` is ALWAYS separate (Phase 2)

### Task creation

Create one task per batch:

```
TaskCreate({
  subject: "Audit knip configs batch N: <first-pkg> ... <last-pkg>",
  description: "Audit these knip.config.ts files:\n<list of paths>\n\nFollow auditor procedure from team template.",
  activeForm: "Auditing knip configs batch N"
})
```

Plus one task for root:

```
TaskCreate({
  subject: "Audit root knip.config.ts",
  description: "Audit root-level knip.config.ts with workspaces config. Follow auditor procedure.",
  activeForm: "Auditing root knip config",
  blockedBy: [all Phase 1 task IDs]
})
```

---

## Lead Orchestration Checklist

```
[ ] 1. TeamCreate with name "knip-audit"
[ ] 2. Discover all knip.config.ts files (exclude root + node_modules)
[ ] 3. Batch configs into groups of ~15
[ ] 4. TaskCreate for each batch + root task (with blockedBy)
[ ] 5. Spawn QB agent
[ ] 6. Spawn up to 10 auditor agents (parallel)
[ ] 7. Assign batch tasks to auditors via TaskUpdate (owner)
[ ] 8. Monitor TaskList — wait for qb approval on each batch
[ ] 9. When all Phase 1 batches approved: spawn root-auditor
[ ] 10. Assign root task to root-auditor
[ ] 11. Wait for qb approval on root task
[ ] 12. Run `pnpm -F "<sample-pkg>" knip` on 2-3 packages as sanity check
[ ] 13. Send shutdown_request to all agents
[ ] 14. TeamDelete
```

---

## Agent Prompt Templates

### Lead spawn command

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/knip-config-audit.md`.
Create a team named "knip-audit" using TeamCreate.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

### QB prompt

~~~
You are the quarterback (QA monitor) for team "knip-audit".

## Your Job

Spot-check auditor output for correctness. Each auditor processes a batch of ~15 knip.config.ts files, trimming stale/redundant entries.

## Key Context

`defineKnipConfig()` deep-merges overrides onto defaults (arrays concat). Defaults are in:
`packages/monorepo-consistency/src/domains/knip/defaults.ts`

Read that file first. Configs should NOT re-declare anything already in defaults.

## Spot-check Procedure

When an auditor reports done:
1. Pick 3-5 configs from their batch
2. Read each modified knip.config.ts + corresponding package.json
3. Verify:
   - Default-duplicating entries removed
   - Remaining ignoreDependencies match real deps in package.json
   - Remaining ignore patterns serve a purpose beyond defaults
   - WHY comments present on non-obvious ignores
   - No source code was modified
4. Optionally run `pnpm -F "<pkg>" knip` on 1-2 packages to confirm no regressions
5. Send approval or rejection (with specifics) to lead

## Rules

- pnpm -F "<pkg>" for all commands
- Don't modify tsconfig (auto-generated)
- You do NOT write code — only review and report
- Read `packages/monorepo-consistency/src/domains/knip/defaults.ts` before reviewing anything
~~~

### Auditor prompt

~~~
You are auditor "{agent-name}" for team "knip-audit".

## Your Job

Audit and tighten knip.config.ts files in your assigned batch. Remove stale/redundant entries. Validate with knip after each change.

## CRITICAL: Read First

Before touching ANY config, read these files:
- `packages/monorepo-consistency/src/domains/knip/defaults.ts` — the defaults your overrides merge onto
- `packages/monorepo-consistency/src/domains/knip/detectors.ts` — framework detection logic

## How defineKnipConfig Works

`defineKnipConfig(overrides)` deep-merges overrides onto defaults. **Arrays concatenate** (lodash mergeWith). So if defaults already have `"**/dist/**"` in ignore, adding it again in your config doubles it up.

## For Each Config in Your Batch

1. Read the `knip.config.ts`
2. Read the `package.json` in the same directory
3. For each config key, check:
   - **ignoreDependencies**: Is each dep still in package.json? Is it actually undetectable by knip? Remove stale ones.
   - **ignoreUnresolved**: Does each unresolved import still exist in source? Remove stale ones.
   - **ignore**: Is each pattern already covered by defaults? Remove duplicates. Does pattern match real files?
   - **ignoreBinaries**: Is each binary still used? Remove stale ones.
   - **entry/project**: Do paths actually exist? Are they correct?
   - **Any key duplicating defaults**: Remove entirely.
4. Trim the config. Add `// WHY:` comments on remaining ignores.
5. Run `pnpm -F "<package-name>" knip`
   - If clean: move to next config
   - If new errors from your changes: restore the needed ignore with WHY comment, re-run
   - If pre-existing errors (not from your changes): ignore them, move on
6. If knip reports genuinely unused deps: remove from package.json

## Rules

- **DO**: Remove stale ignores, trim redundant entries, add WHY comments, remove unused deps from package.json
- **DO NOT**: Modify source code, add new deps, change entry/project unless clearly wrong, modify tsconfig, run pnpm install
- When in doubt about an ignore entry, **keep it**
- When done with all configs in batch, send message to "qb" summarizing changes per config
- Leave all changes uncommitted

## Status Report

End your final message with:
```
STATUS: CLEAN — audited N configs, trimmed M entries, removed K unused deps
```
or
```
STATUS: PARTIAL — audited N/M configs, ran into issues with: <list>
```
~~~

### Root auditor prompt

~~~
You are the root-auditor for team "knip-audit".

## Your Job

Audit the root-level `knip.config.ts`. This config may have `workspaces` entries and different structure from workspace configs.

## Read First

- `packages/monorepo-consistency/src/domains/knip/defaults.ts`
- `./knip.config.ts` (the root config)
- `./package.json`
- `./pnpm-workspace.yaml`

## Procedure

Same audit procedure as workspace auditors but also check:
- **workspaces**: Do workspace paths match actual pnpm-workspace.yaml entries?
- **Root-level ignores**: Are they needed at root level vs workspace level?

When done, send message to "qb" with summary.

## Rules

- DO NOT modify workspace-level configs — only root
- Leave changes uncommitted
~~~

---

## Critical Rules

1. `pnpm -F "<pkg>"` for all commands
2. Don't modify tsconfig (auto-generated)
3. Branch prefix: `sam/`
4. QB uses `model: "opus"` — needs judgment for spot-checks
5. All auditors use `pnpm-knip` subagent_type with `model: "sonnet"`
6. Lead does NOT implement — only orchestrates
7. QB does NOT implement — only reviews
8. Auditors do NOT modify source code — only `knip.config.ts` and `package.json`
9. Max 10 parallel auditors, ~15 configs per batch
10. Root config is Phase 2 (after all workspace configs audited)
11. Every ignore entry must have a `// WHY:` comment
12. When in doubt, keep an ignore entry — false negatives are worse than false positives
13. Auditors must run `pnpm -F "<pkg>" knip` after each config change to validate
14. Leave all changes uncommitted for review
