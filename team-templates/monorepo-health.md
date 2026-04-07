# Team Template: Monorepo Health

Run all monorepo health checks (lint, types, knip, test) on changed packages. Iterative fix loop with context-budget-aware respawning — sub-agents are capped at `max_turns: 20` and respawned fresh when they hit the limit.

## Prerequisites

```
claude config set --global experiments.agentTeams true
```

## How to Execute

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/monorepo-health.md`.
Create a team named "monorepo-health" using TeamCreate.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

---

## Roles

### 1. Lead (you — the orchestrator)

- Creates team via `TeamCreate`
- Creates all tasks via `TaskCreate` with correct `blockedBy` dependencies
- Spawns QB agent
- Monitors progress; gates phase transitions
- Receives final report from QB
- Sends `shutdown_request` to QB, then calls `TeamDelete`
- **Does NOT implement or run checks** — only orchestrates

### 2. Quarterback (dispatch + respawn manager)

- Spawned by lead as `general-purpose` agent with `model: "opus"`
- Determines changed packages (git diff vs main)
- Runs checks **sequentially**: lint → types → knip → test
- For each check: dispatches a specialized sub-agent via `Task` tool
- Monitors sub-agent results using the STATUS protocol
- Re-spawns fresh sub-agents when context budget exhausted (up to 5x per check)
- Reports final status per check to lead
- **Does NOT fix code directly** — only dispatches and tracks

---

## Team Structure

| Agent | Name | subagent_type | model | Role | Phase |
|-------|------|---------------|-------|------|-------|
| Lead | `lead` | (you) | `opus` | orchestrate, gate phases | all |
| Quarterback | `qb` | general-purpose | `opus` | dispatch checks, manage respawn loop | all |
| Lint Agent | `lint-{n}` | pnpm-lint | `opus` | fix lint errors | 1 |
| Types Agent | `types-{n}` | pnpm-types | `opus` | fix type errors | 2 |
| Knip Agent | `knip-{n}` | pnpm-knip | `opus` | remove dead code/deps | 3 |
| Test Agent | `test-{n}` | pnpm-test | `opus` | fix test failures | 4 |

`{n}` suffix increments on respawn (lint-1, lint-2, etc.)

---

## Orchestration Flow

```
Phase 0   [lead]     ── TeamCreate, TaskCreate (4 tasks), spawn QB
                              │
Phase 1   [qb]       ── dispatch lint agent (max_turns: 20)
                         parse result → CLEAN or ERRORS_REMAINING
                         if errors → respawn fresh lint agent (up to 5x)
                              │ (all lint clean)
Phase 2   [qb]       ── dispatch types agent (max_turns: 20)
                         same respawn loop
                              │ (all types clean)
Phase 3   [qb]       ── dispatch knip agent (max_turns: 20)
                         same respawn loop
                              │ (all knip clean)
Phase 4   [qb]       ── dispatch test agent (max_turns: 20)
                         same respawn loop
                              │ (all tests clean)
Phase 5   [lead]     ── final report, shutdown QB, TeamDelete
```

### Why Sequential

- Lint fixes (unused imports) resolve type errors
- Type fixes affect knip results (used/unused exports)
- All fixes affect test outcomes
- Avoids agents conflicting on same files

---

## Dependency Graph

```
T1 (lint)   ───→ T2 (types) ───→ T3 (knip) ───→ T4 (test)
```

All sequential. Each blockedBy prior.

---

## Tasks

### T1: Lint Fix

**Phase:** 1
**blockedBy:** none

Run `pnpm-lint` on changed packages. Fix all lint errors. Iterate until clean.

### T2: Type Check Fix

**Phase:** 2
**blockedBy:** T1

Run `pnpm-types` on changed packages. Fix all type errors. Iterate until clean.

### T3: Knip Dead Code Removal

**Phase:** 3
**blockedBy:** T2

Run `pnpm-knip` on changed packages. Remove unused exports/deps/files. Iterate until clean.

### T4: Test Fix

**Phase:** 4
**blockedBy:** T3

Run `pnpm-test` on changed packages. Fix all test failures. Iterate until clean.

---

## Context-Budget-Aware Task Loop

### The Problem

Sub-agents iterate (run → fix → rerun) but exhaust context before finishing. Quality degrades as context grows past ~120K tokens.

### The Solution

Each sub-agent dispatch is capped at `max_turns: 20`. QB monitors results and re-spawns fresh agents that pick up where the last left off.

### Sub-agent STATUS Protocol

Every sub-agent MUST end its final message with one of:

```
STATUS: CLEAN
```

```
STATUS: ERRORS_REMAINING: <count> errors in <packages>
```

If agent was cut off by max_turns (no STATUS line), QB treats as ERRORS_REMAINING.

### Re-spawn Protocol

On respawn, QB prompt includes:
1. Which packages still have errors
2. Summary of what prior agent fixed (so it doesn't redo work)
3. Instruction to re-run check and continue fixing
4. Attempt number (for tracking)

Safety: max 5 respawns per check. After 5, QB reports remaining errors to lead.

### QB Task Loop (pseudocode)

```
for check in [lint, types, knip, test]:
  attempt = 0
  status = "ERRORS_REMAINING"
  prior_summary = ""

  while status != "CLEAN" and attempt < 5:
    attempt++
    result = Task(
      subagent_type = check_agent_type,   # pnpm-lint | pnpm-types | pnpm-knip | pnpm-test
      model = "opus",
      max_turns = 20,
      name = "{check}-{attempt}",
      prompt = build_prompt(check, packages, attempt, prior_summary)
    )

    if "STATUS: CLEAN" in result:
      status = "CLEAN"
    else:
      prior_summary = extract_progress(result)

  mark_task_complete(check)
  report_to_lead(check, status, attempt)
```

---

## Lead Orchestration Checklist

```
[ ] 1. TeamCreate with name "monorepo-health"
[ ] 2. TaskCreate for T1-T4 with sequential blockedBy deps
[ ] 3. Spawn QB agent with full prompt (see below)
[ ] 4. Assign T1-T4 to QB via TaskUpdate (owner: "qb")
[ ] 5. Wait for QB to report all checks complete
[ ] 6. Send shutdown_request to QB
[ ] 7. TeamDelete
```

---

## Agent Prompt Templates

### Lead spawn command

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/monorepo-health.md`.
Create a team named "monorepo-health" using TeamCreate.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

### QB prompt

~~~
You are the quarterback for team "monorepo-health".

## Your Job

Run 4 sequential health checks on changed packages: lint → types → knip → test.
For each check, dispatch a specialized sub-agent, monitor its result, and respawn if needed.

## Step 1: Determine Changed Packages

Run:

    git diff --name-only main | grep -E '^[^/]+/' | sort -u

Map changed dirs to pnpm package names. These are the packages to check.
If no changed packages found, report CLEAN for all checks and finish.

## Step 2: Run Checks Sequentially

For each check in order [lint, types, knip, test]:

1. Set attempt = 0, status = "ERRORS_REMAINING", prior_summary = ""
2. While status != "CLEAN" AND attempt < 5:
   a. attempt++
   b. Dispatch sub-agent:

        Task(
          subagent_type = "{check_type}",   # pnpm-lint | pnpm-types | pnpm-knip | pnpm-test
          model = "opus",
          max_turns = 20,
          name = "{check}-{attempt}",       # e.g. lint-1, lint-2
          prompt = <see sub-agent prompt template below, filled in>
        )

   c. Parse result:
      - If result contains "STATUS: CLEAN" → status = "CLEAN"
      - Otherwise → extract what was fixed as prior_summary
3. Mark the corresponding task complete via TaskUpdate
4. Send progress message to lead

After all 4 checks complete, send final summary to lead.

## Sub-agent Prompt Template

Fill in the placeholders and pass as the `prompt` parameter:

    You are {check}-{attempt} for monorepo health.

    Packages to check: {package_list}

    {if attempt > 1:}
    Previous agent fixed: {prior_summary}
    Some errors remain. Re-run the check and continue fixing from where they left off.
    {end if}

    Run the check, fix errors, iterate until clean.

    ## WHEN TO STOP

    You MUST stop and report your status if ANY of these are true:
    1. All errors are fixed (STATUS: CLEAN)
    2. You have been working for ~10 minutes — stop where you are
    3. You notice your responses getting slower or your context feels large — stop early
    4. You are running out of turns

    Do NOT try to push through. It is BETTER to stop early with a clear status report
    than to degrade in quality. The quarterback will spawn a fresh agent to continue.

    ## STATUS REPORT (MANDATORY)

    Your FINAL message MUST end with exactly one of:
      STATUS: CLEAN
      STATUS: ERRORS_REMAINING: <count> errors in <packages>

    Include a brief summary of what you fixed so the next agent doesn't redo your work.

    ## Rules
    - pnpm -F "<pkg>" for all commands
    - Don't modify tsconfig (auto-generated)
    - Read existing code before modifying — match patterns already in use

## Rules

- pnpm -F "<pkg>" for all commands
- Don't modify tsconfig (auto-generated)
- You do NOT fix code — only dispatch sub-agents and track results
- Sequential order is mandatory: lint before types before knip before test
- Max 5 respawns per check — after that, report remaining errors
- Use TaskUpdate to mark tasks complete as each check finishes
- Send messages to lead for progress updates
~~~

---

## Critical Rules

1. `pnpm -F "<pkg>"` for all commands
2. Don't modify tsconfig (auto-generated)
3. Branch prefix: `sam/`
4. All agents use `model: "opus"`
5. Sub-agents dispatched via `Task` tool with `max_turns: 20`
6. Lead does NOT implement — only orchestrates
7. QB does NOT fix code — only dispatches and tracks
8. Sequential check order: lint → types → knip → test
9. Max 5 respawns per check
10. Sub-agents MUST end with STATUS protocol line
11. Read existing code before modifying — match patterns already in use
