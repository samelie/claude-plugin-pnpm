# Team Template: Monorepo Deep Clean

Full monorepo health sweep — lint, types, knip, test across ALL packages (not just git-changed). Context-budget-aware respawning with parallel sub-agents per package group within each phase.

```yaml
name: "deep-clean"
version: 1
description: "Full monorepo lint/types/knip/test sweep with parallel dispatch + respawn"
packages: ["all"]
phases: 5
delegate_mode: true
plan_approval_default: false
task_claim: lead-assigned
hooks:
  task_completed: null
  teammate_idle: null
```

---

## Prerequisites

```json
// settings.json (or env)
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

## How to Execute

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/monorepo-deep-clean.md`.
Create a team named "deep-clean" using TeamCreate.
Press Shift+Tab to enable delegate mode (restricts lead to coordination-only tools).
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

---

## Roles

### 1. Lead (you — the orchestrator)

- Creates team via `TeamCreate`
- Enables delegate mode (Shift+Tab) immediately after TeamCreate
- Creates all tasks via `TaskCreate` with correct `blockedBy` dependencies
- Spawns QB agent
- Assigns T1-T4 to QB via `TaskUpdate` (owner: "qb")
- **Does NOT implement or run checks** — only orchestrates and gates phase transitions
- Monitors `TaskList` to track progress; advances phases when QB reports completion
- Sends `shutdown_request` to QB when done, then calls `TeamDelete`

### 2. Quarterback (dispatch + respawn manager)

- Spawned by lead as `general-purpose` agent with `model: "opus"`
- **Primary job**: discover errors, group packages, dispatch parallel sub-agents, manage respawns
- Runs root-level check commands to discover error scope
- Groups erroring packages (~3 per group), dispatches specialized sub-agents via `Task` tool
- Monitors sub-agent results using STATUS protocol
- Re-spawns fresh sub-agents for packages with remaining errors (max 8 per group per phase)
- Reports final status per phase to lead
- **Does NOT fix code directly** — only dispatches and tracks

### 3. Sub-agents (1 per package group per phase)

- Spawned by QB via `Task` tool with dedicated subagent types
- Each agent owns a **package group** (~3 packages) for one check type
- Uses `max_turns: 20` hard cap
- Must self-terminate after ~10 minutes if still running
- MUST report STATUS protocol line on termination (see below)
- On respawn, receives summary of prior agent's progress to avoid rework

### 4. No finalization agents needed

- Deep clean IS the finalization — lint/types/knip/test are the phases themselves

---

## Team Structure Table

| Agent | Name | subagent_type | model | Role | Phase |
|-------|------|---------------|-------|------|-------|
| Lead | `lead` | (you) | `opus` | orchestrate, gate phases | all |
| Quarterback | `qb` | general-purpose | `opus` | discover errors, dispatch, manage respawn | all |
| Lint Agent(s) | `lint-{group}-{n}` | pnpm-lint | `opus` | fix lint errors for package group | 1 |
| Types Agent(s) | `types-{group}-{n}` | pnpm-types | `opus` | fix type errors for package group | 2 |
| Knip Agent(s) | `knip-{group}-{n}` | pnpm-knip | `opus` | remove dead code/deps for package group | 3 |
| Test Agent(s) | `test-{group}-{n}` | pnpm-test | `opus` | fix test failures for package group | 4 |

- `{group}` = package group identifier (a, b, c...)
- `{n}` = respawn counter (1, 2, 3...)
- Example: `lint-a-1`, `lint-a-2` (respawn), `lint-b-1` (different group)

---

## File Ownership Matrix

Not file-based — ownership is by **package group**. QB assigns package groups to sub-agents dynamically based on error discovery.

**Rule**: No two sub-agents modify the same package simultaneously. QB ensures groups don't overlap.

---

## Phase Transitions

| Transition | Gate |
|------------|------|
| 0 → 1 | QB spawned, all tasks created with deps |
| 1 → 2 | Root `pnpm lint` exits clean (or max respawns hit) |
| 2 → 3 | Root `pnpm types` exits clean (or max respawns hit) |
| 3 → 4 | Root `pnpm knip` exits clean (or max respawns hit) |
| 4 → 5 | Root `pnpm test` exits clean (or max respawns hit) |
| 5 → done | Lead receives final report, shutdown QB, TeamDelete |

### Why Sequential Phases

- Lint fixes (unused imports) resolve type errors
- Type fixes affect knip results (used/unused exports)
- All fixes affect test outcomes

### Why Parallel Within Phase

- Different packages don't conflict — safe to fix `@park-app/*` and `@paradocx/*` simultaneously
- Massively faster than serial for full monorepo

---

## Orchestration Flow

```
Phase 0   [lead]     ── TeamCreate, delegate mode, TaskCreate (T1-T4), spawn QB, assign all tasks to QB
                              │
Phase 1   [qb]       ── run `pnpm lint` to discover all errors
                         group packages, dispatch parallel lint agents
                         collect STATUS results
                         respawn for ERRORS_REMAINING packages (up to 8x total per group)
                              │ (all lint clean)
Phase 2   [qb]       ── run `pnpm types` to discover all errors
                         same parallel dispatch + respawn loop
                              │ (all types clean)
Phase 3   [qb]       ── run `pnpm knip` to discover all errors
                         same parallel dispatch + respawn loop
                              │ (all knip clean)
Phase 4   [qb]       ── run `pnpm test` to discover all errors
                         same parallel dispatch + respawn loop
                              │ (all tests clean)
Phase 5   [lead]     ── final report, shutdown QB, TeamDelete
```

---

## Dependency Graph

```
T1 (lint)   ───→ T2 (types) ───→ T3 (knip) ───→ T4 (test)
```

All sequential. Each blockedBy prior.

---

## Tasks

### T1: Lint Fix (all packages)

| Field | Value |
|-------|-------|
| **Phase** | 1 |
| **Agent** | qb (dispatches sub-agents) |
| **blockedBy** | none |
| **files_owned** | all packages (dynamic grouping) |
| **verify** | `pnpm lint` exits 0 |

Run lint across all packages. Fix all errors. Iterate until clean.

#### Acceptance criteria

- [ ] Root `pnpm lint` exits 0
- [ ] No regressions in other checks

### T2: Type Check Fix (all packages)

| Field | Value |
|-------|-------|
| **Phase** | 2 |
| **Agent** | qb (dispatches sub-agents) |
| **blockedBy** | T1 |
| **files_owned** | all packages (dynamic grouping) |
| **verify** | `pnpm types` exits 0 |

Run types across all packages. Fix all errors. Iterate until clean.

#### Acceptance criteria

- [ ] Root `pnpm types` exits 0
- [ ] Lint still clean

### T3: Knip Dead Code Removal (all packages)

| Field | Value |
|-------|-------|
| **Phase** | 3 |
| **Agent** | qb (dispatches sub-agents) |
| **blockedBy** | T2 |
| **files_owned** | all packages (dynamic grouping) |
| **verify** | `pnpm knip` exits 0 |

Run knip across all packages. Remove unused exports/deps/files. Iterate until clean.

#### Acceptance criteria

- [ ] Root `pnpm knip` exits 0
- [ ] Lint + types still clean

### T4: Test Fix (all packages)

| Field | Value |
|-------|-------|
| **Phase** | 4 |
| **Agent** | qb (dispatches sub-agents) |
| **blockedBy** | T3 |
| **files_owned** | all packages (dynamic grouping) |
| **verify** | `pnpm test` exits 0 |

Run tests across all packages. Fix all failures. Iterate until clean.

#### Acceptance criteria

- [ ] Root `pnpm test` exits 0
- [ ] Lint + types + knip still clean

---

## Hooks (Quality Gates)

No hooks configured for deep-clean — QB manages verification directly by re-running root-level commands after each phase.

---

## Quarterback Protocol

The QB follows this dispatch loop for each phase:

### Step 1: Discover Errors

Run root-level check command (e.g. `pnpm lint`). Parse output → map of `{package: error_count}`. Skip packages with 0 errors. If no errors → mark phase CLEAN, advance.

### Step 2: Group Packages

Group erroring packages into chunks of ~3. Keep related packages together when possible (e.g. all `@park-app/*` in one group).

### Step 3: Parallel Dispatch

Launch one sub-agent per group **simultaneously** (multiple Task calls in one message). Collect all results.

### Step 4: Parse Results and Respawn

For each group result:
- `STATUS: CLEAN` → group done
- `STATUS: ERRORS_REMAINING` or no STATUS line → extract progress summary, respawn fresh agent

Max 8 respawns per group. After that, log remaining errors and move on.

### Step 5: Verify Phase Clean

Re-run root-level check. If straggler errors remain, dispatch final mop-up agent.

### Step 6: Advance Phase

Mark task complete via TaskUpdate. Send progress to lead. Move to next phase.

### QB Phase Loop (pseudocode)

```
for check in [lint, types, knip, test]:
  # 1. Discover errors
  run root-level check command (e.g. `pnpm lint`)
  parse output → map of {package: error_count}
  skip packages with 0 errors

  # 2. Group packages (max ~3 packages per group)
  groups = chunk(erroring_packages, 3)

  # 3. Parallel dispatch per group
  for each group:
    attempt = 0
    status = "ERRORS_REMAINING"
    prior_summary = ""

    while status != "CLEAN" and attempt < 8:
      attempt++
      result = Task(
        subagent_type = check_agent_type,
        model = "opus",
        max_turns = 20,
        name = "{check}-{group_id}-{attempt}",
        prompt = build_prompt(check, group_packages, attempt, prior_summary)
      )

      if "STATUS: CLEAN" in result:
        status = "CLEAN"
      else:
        prior_summary = extract_progress(result)

  # 4. Verify phase clean
  run root-level check command again
  if still errors → dispatch mop-up agents for remaining packages

  mark_task_complete(check)
  report_to_lead(check, status, attempts_used)
```

**Note on parallel dispatch:** Launch all group agents simultaneously using multiple Task calls in a single message. Collect all results before deciding on respawns.

---

## Context-Budget-Aware Task Loop

### The Problem

Full monorepo checks produce many errors. A single sub-agent iterating (run → fix → rerun) exhausts its context (~120K tokens) before finishing. Quality degrades as context grows.

### The Solution

1. **Parallel dispatch**: split packages into groups, run multiple sub-agents simultaneously
2. **Hard limits**: each sub-agent capped at `max_turns: 20` AND must self-terminate after 10 minutes
3. **STATUS protocol**: agents MUST report clean or remaining errors on termination — regardless of why they're stopping
4. **Fresh respawn**: QB re-dispatches with clean context for unfinished work

### Sub-agent STATUS Protocol

Every sub-agent MUST end its final message with exactly one of:

```
STATUS: CLEAN
```

```
STATUS: ERRORS_REMAINING: <count> errors in <packages>
```

**This is mandatory.** The QB cannot determine next steps without it.

If an agent is cut off by max_turns (no STATUS line in output), QB treats as ERRORS_REMAINING and respawns.

---

## Recovery Protocol

### Stuck agent (no STATUS line)
1. QB treats as ERRORS_REMAINING
2. Spawns fresh agent with same packages + progress summary from output

### Max respawns hit
1. QB logs remaining errors for that group
2. Advances to next group/phase — does not block indefinitely
3. Lead receives report of unresolved errors in final summary

### Context exhaustion
Sub-agent self-terminates early with STATUS line + progress summary. QB respawns with clean context + handoff.

Max respawns per group per phase: **8**

---

## Token Budget

| Team size | Cost multiplier | Use case |
|-----------|----------------|----------|
| 2-3 agents | 3-5x | Small monorepo, few errors |
| 4-6 agents | 6-10x | Medium monorepo |
| 7+ agents | 10x+ | Full monorepo sweep (this template) |

Expect high token usage — this is a full-monorepo audit by design.

---

## Lead Orchestration Checklist

```
[ ] 1. TeamCreate with name "deep-clean"
[ ] 2. Enable delegate mode (Shift+Tab)
[ ] 3. TaskCreate for T1-T4 with sequential blockedBy deps
[ ] 4. Spawn QB agent with full prompt (see below)
[ ] 5. Assign T1-T4 to QB via TaskUpdate (owner: "qb")
[ ] 6. Wait for QB to report all checks complete
[ ] 7. Send shutdown_request to QB
[ ] 8. TeamDelete
```

---

## Agent Prompt Templates

### Lead spawn command (you paste this to start)

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/monorepo-deep-clean.md`.
Create a team named "deep-clean" using TeamCreate.
Press Shift+Tab to enable delegate mode.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

### Quarterback prompt

~~~
You are the quarterback for team "deep-clean".

## Your Job

Run 4 sequential health checks across ALL monorepo packages: lint → types → knip → test.
For each check, discover errors, group packages, dispatch parallel sub-agents, and respawn as needed.

## Step 1: Discover Errors for Current Phase

Run the root-level script to get the full error picture:

    pnpm lint          # phase 1
    pnpm types         # phase 2
    pnpm knip          # phase 3
    pnpm test          # phase 4

Parse output to identify which packages have errors and roughly how many.
If no errors → mark phase CLEAN, move to next.

## Step 2: Group Packages

Group erroring packages into chunks of ~3 packages each. Keep related packages together when possible (e.g. all `@park-app/*` in one group).

## Step 3: Parallel Dispatch

Launch one sub-agent per group **simultaneously** (multiple Task calls in one message):

    Task(
      subagent_type = "{check_type}",   # pnpm-lint | pnpm-types | pnpm-knip | pnpm-test
      model = "opus",
      max_turns = 20,
      name = "{check}-{group_id}-{attempt}",
      prompt = <see sub-agent prompt template below>
    )

Collect all results.

## Step 4: Parse Results and Respawn

For each group result:
- If "STATUS: CLEAN" → group done
- If "STATUS: ERRORS_REMAINING" or no STATUS line → extract progress summary, respawn fresh agent

Max 8 respawns per group. After that, log remaining errors and move on.

## Step 5: Verify Phase Clean

After all groups report CLEAN (or hit respawn limit), re-run the root-level check command to verify.
If straggler errors remain, dispatch a final mop-up agent for those packages.

## Step 6: Advance Phase

Mark task complete via TaskUpdate. Send progress to lead. Move to next phase.

## Sub-agent Prompt Template

Fill in placeholders:

    You are {check}-{group_id}-{attempt} for monorepo deep clean.

    Packages to fix: {package_list}

    {if attempt > 1:}
    Previous agent fixed: {prior_summary}
    Some errors remain. Re-run the check and continue fixing from where they left off.
    {end if}

    Run the check on these packages, fix errors, iterate until clean.

    ## WHEN TO STOP

    You MUST stop and report your status if ANY of these are true:
    1. All errors are fixed (STATUS: CLEAN)
    2. You have been working for ~10 minutes — stop where you are
    3. You notice your responses getting slower or your context feels large — stop early
    4. You are running out of turns

    Do NOT try to push through and finish everything. It is BETTER to stop early with
    a clear status report than to degrade in quality. The quarterback will spawn a fresh
    agent to continue your work — that's the system working as designed.

    ## STATUS REPORT (MANDATORY)

    Your FINAL message MUST end with exactly one of:
      STATUS: CLEAN
      STATUS: ERRORS_REMAINING: <count> errors in <packages>

    This is how the quarterback knows whether to respawn you. If you omit this,
    a fresh agent will be spawned to redo your work from scratch — wasting the
    progress you made.

    Include a brief summary of what you fixed so the next agent doesn't redo your work.

    ## Rules
    - pnpm -F "<pkg>" for all commands
    - Don't modify tsconfig (auto-generated)
    - Read existing code before modifying — match patterns already in use

## Rules

- pnpm -F "<pkg>" for all commands
- Don't modify tsconfig (auto-generated)
- You do NOT fix code — only dispatch sub-agents and track results
- Sequential phase order is mandatory: lint → types → knip → test
- Within a phase, dispatch groups in parallel
- Max 8 respawns per group per phase
- Use TaskUpdate to mark tasks complete as each phase finishes
- Send messages to lead for progress updates
~~~

---

## Critical Rules (inherited from base + deep-clean specific)

1. `pnpm -F "<pkg>"` for all commands
2. Don't modify tsconfig (auto-generated)
3. Branch prefix: `sam/`
4. All agents use `model: "opus"`
5. Sub-agents dispatched via `Task` tool with `max_turns: 20`
6. Lead does NOT implement — only orchestrates
7. QB does NOT fix code — only dispatches and tracks
8. Sequential phase order: lint → types → knip → test
9. Parallel dispatch within each phase (package groups)
10. Max 8 respawns per group per phase
11. Sub-agents MUST end with STATUS protocol line — no exceptions
12. QB re-runs root check after each phase to verify clean
13. Read existing code before modifying — match patterns already in use
14. No two sub-agents modify the same package simultaneously
