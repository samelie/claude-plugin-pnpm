# Team Template: Base Pattern

> Copy this file, rename it, and fill in the placeholders (`{...}`) to create a new team template.

## Team Naming Convention

`{team-name}` format: `YYYYMMDD-{slug}` (e.g., `20260420-refactor-auth`)
- Date prefix enables chronological ordering in `team-session/`
- Slug: kebab-case task summary, max 30 chars
- Templates (knip-audit, monorepo-health) may omit date prefix

---

```yaml
# --- YAML Frontmatter (copy to your template, fill in) ---
name: "{team-name}"
version: 1
description: "{1-line purpose}"
packages: ["{@scope/pkg1}", "{@scope/pkg2}"]
phases: {N}
delegate_mode: true
plan_approval_default: true
task_claim: self  # self | lead-assigned
hooks:
  task_completed: "pnpm -F '{package}' build"
  teammate_idle: null  # optional
```

---

## Prerequisites

```json
// settings.json (or env)
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

## How to Execute

```
Read `team-session/{team-name}/team-plan.md`.
Create a team named "{team-name}" using TeamCreate.
Press Shift+Tab to enable delegate mode (restricts lead to coordination-only tools).
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

---

## Roles

### 1. Lead (you — the orchestrator)

- Creates team via `TeamCreate`
- Enables delegate mode (Shift+Tab) immediately after TeamCreate
- Creates all tasks via `TaskCreate` with correct `blockedBy` dependencies
- Spawns all agents via `Task` tool with `team_name` and `name` params
- Agents self-claim tasks from TaskList (lead pre-assigns critical tasks only)
- **Does NOT implement** — only orchestrates and gates phase transitions
- Monitors `TaskList` to track progress; advances phases when dependencies resolve
- Runs final verification commands after all phases complete
- Sends `shutdown_request` to all agents when done, then calls `TeamDelete`

### 2. Quarterback (QA monitor)

- Spawned by lead as a `general-purpose` agent with `model: "opus"`
- **Primary job**: subjective review — does the code match requirements, follow patterns, avoid bugs?
- Hooks handle mechanical checks (build/test/lint) — QB focuses on what automation can't judge
- Receives messages from implementers when they complete tasks
- Reviews the changed files (reads code, checks patterns, verifies requirements)
- If output is wrong or incomplete:
  - Sends message to lead explaining the issue
  - Lead can either instruct the original agent to fix, or spawn a **fresh** agent with clean context to redo the task
- If output is correct: sends confirmation to lead so lead can mark task complete and unblock dependents
- Does NOT implement code — only reviews and flags issues

### 3. Implementers (1 per task group)

- Spawned by lead as `general-purpose` agents with `model: "opus"`
- Each agent owns a **cohesive group of related tasks** (not one agent per micro-task)
- Group similar/coupled work onto the same agent to minimize cross-agent coordination
- **Works in plan mode first** — submits plan for lead approval before implementing
- Only modifies files listed in task's `files_owned`
- After completing a task, self-claims next unassigned unblocked task from TaskList
- When task is done, sends message to quarterback with summary of changes
- If quarterback flags issues, fixes them (or lead spawns fresh agent if context is polluted)
- Runs `build` command for their package(s) before reporting done

### 4. Finalization Agents (lint + types)

- Spawned ONLY after all implementer tasks are complete (phase-gated via `blockedBy`)
- Use dedicated subagent types — NOT general-purpose:
  - `pnpm-lint` agent for lint:fix
  - `pnpm-types` agent for typecheck
- These agents use `model: "sonnet"` (sufficient for mechanical fixes)
- Fix all errors, iterate until clean

---

## Team Structure Table

| Agent | Name | subagent_type | model | Role | Phase |
|-------|------|---------------|-------|------|-------|
| Lead | `lead` | (you) | `opus` | orchestrate, gate phases | all |
| Quarterback | `qb` | general-purpose | `opus` | review implementer output | 1+ |
| Implementer A | `{name-a}` | general-purpose | `opus` | {task group A description} | 1 |
| Implementer B | `{name-b}` | general-purpose | `opus` | {task group B description} | 1 |
| Implementer N | `{name-n}` | general-purpose | `opus` | {task group N description} | 1 |
| Lint | `lint-agent` | pnpm-lint | `sonnet` | lint:fix affected packages | 2 |
| Types | `types-agent` | pnpm-types | `sonnet` | typecheck affected packages | 2 |

---

## File Ownership Matrix

| Agent | Owned paths |
|-------|-------------|
| {agent-a} | `src/module-a/**`, `tests/module-a/**` |
| {agent-b} | `src/module-b/**` |

**Rule**: No two agents modify the same file. If shared file needs changes from multiple tasks, assign all touching tasks to one agent.

---

## Phase Transitions

| Transition | Gate |
|------------|------|
| 0 -> 1 | All agents spawned, delegate mode enabled |
| 1 -> 2 | All Phase 1 tasks complete + QB approved (or hooks passed) |
| 2 -> 3 | lint + types exit 0 |
| 3 -> done | Lead runs final verification |

---

## Orchestration Flow

```
Phase 0   [lead]           ──── TeamCreate, delegate mode, TaskCreate (all tasks), spawn all agents
                                      │
Phase 1   [implementer-a]  ──── {task group A}  ─┐
          [implementer-b]  ──── {task group B}  ─┤ parallel
          [implementer-n]  ──── {task group N}  ─┘
                                      │
          [qb]             ──── reviews each implementer's output as they finish
          [hooks]          ──── mechanical checks on task completion
                                      │ (lead gates: all Phase 1 tasks marked complete by qb)
                                      │
Phase 2   [lint-agent]     ──── lint:fix affected packages  ─┐ parallel
          [types-agent]    ──── typecheck affected packages  ─┘
                                      │
Phase 3   [lead]           ──── final verification, shutdown all agents, TeamDelete
```

---

## Dependency Graph Template

```
T1 ({task group A})  ─┐
T2 ({task group B})  ─┤ parallel — no deps between them
T3 ({task group N})  ─┘
                       │
T4 (lint+types)      ─── blockedBy: T1, T2, T3
```

---

## Task Template

For each task, define:

### T{n}: {Task Title}

| Field | Value |
|-------|-------|
| **Phase** | {1\|2\|...} |
| **Agent** | {agent-name} |
| **blockedBy** | {none \| T1, T2} |
| **files_owned** | `{glob patterns}` |
| **verify** | `{command}` |

{1-3 sentence description of what to do}

#### Reference files

- `{path}` — {why}

#### Files to modify/create

- `{path}` — {what}

#### Implementation sketch

```
{pseudocode or code sketch — agents adapt to real types/signatures}
```

#### Acceptance criteria

- [ ] {criterion 1}
- [ ] {criterion 2}

---

## Hooks (Quality Gates)

Hooks are wired via the plugin's own `hooks/hooks.json` — always active when the plugin is enabled. No per-team setup needed.

| Hook | Event | What it does |
|------|-------|-------------|
| `check-team-scope` | PreToolUse (Edit/Write) | Blocks edits outside the agent's declared `files_owned`. Discovers scope from `team-session/*/team-scope.json`. |
| `check-status-protocol` | SubagentStop | Ensures sub-agents report STATUS before stopping |
| `stop-verify.sh` | Stop | Blocks lead from stopping if tasks remain incomplete |

To enable scope enforcement for a team, write `team-scope.json` to `team-session/{team-name}/`. The hook picks it up automatically.

**QB role retained** for subjective review (code quality, pattern adherence, requirement correctness). Hooks handle mechanical checks only.

---

## Quarterback Protocol

The quarterback follows this loop:

1. **Receive** completion message from implementer
2. **Read** all files the implementer changed
3. **Check** (subjective — hooks handle mechanical gates):
   - Does the code match the task requirements?
   - Does it follow existing patterns in the codebase?
   - Are there obvious bugs, missing imports, or type issues?
   - Were the acceptance criteria met?
4. **If OK**: message lead with approval -> lead marks task complete
5. **If NOT OK**: message lead with specific issues -> lead either:
   - Sends fix instructions to original agent, OR
   - Spawns fresh agent with clean context + the fix instructions to redo the task

### When to spawn a fresh agent vs. fix in place

- **Fix in place**: small, isolated issue (missing import, typo, wrong variable name)
- **Fresh agent**: agent went down a wrong path, accumulated bad assumptions, or context is large/confused

---

## Recovery Protocol

### Stuck agent
1. Lead messages agent for status
2. No response -> spawn fresh agent with same task + progress summary

### Failed verification (QB rejection or hook failure)
1. Small fix -> original agent fixes
2. Wrong approach -> lead spawns fresh agent with clean context + fix instructions
3. Max respawns per task: 3

### Context exhaustion
Agent summarizes progress, reports to lead, requests fresh spawn with handoff context.

---

## Token Budget

| Team size | Cost multiplier | Use case |
|-----------|----------------|----------|
| 2-3 agents | 3-5x | Most tasks |
| 4-6 agents | 6-10x | Large parallel work |
| 7+ agents | 10x+ | Audits, mass migrations |

Prefer fewer agents with grouped tasks over many micro-task agents.

---

## Lead Orchestration Checklist

```
[ ] 1. TeamCreate
[ ] 2. Enable delegate mode (Shift+Tab)
[ ] 3. TaskCreate ALL tasks with blockedBy deps
[ ] 4. Spawn QB agent
[ ] 5. Spawn Phase 1 implementer agents (parallel)
[ ] 6. Agents self-claim tasks (lead pre-assigns critical tasks only)
[ ] 7. Monitor: QB reviews + hooks gate completions
[ ] 8. All Phase 1 approved -> spawn Phase 2 agents (lint + types)
[ ] 9. Phase 2 complete -> final verification
[ ] 10. shutdown_request to all agents
[ ] 11. TeamDelete
```

---

## Agent Prompt Templates

### Lead spawn command (you paste this to start)

```
Read `team-session/{team-name}/team-plan.md`.
Create a team named "{team-name}" using TeamCreate.
Press Shift+Tab to enable delegate mode.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

### Quarterback prompt

```
You are the quarterback (QA monitor) for team "{team-name}".

Your job:
- Receive completion messages from implementer agents
- Read and review their code changes
- Verify changes match task requirements and follow existing codebase patterns
- Send approval or rejection (with specific issues) to lead
- Hooks handle mechanical checks (build/test/lint) — focus on subjective review:
  does the code match requirements, follow patterns, avoid bugs?

You do NOT write code. You only review and report.

Rules:
- pnpm -F "<pkg>" for all commands
- Read existing code before judging — match patterns already in use
- Code snippets in tasks are sketches — implementations may differ and that's fine if correct
```

### Implementer prompt

```
You are implementer "{agent-name}" for team "{team-name}".

Your tasks: {list task IDs}

Instructions:
- Read `team-session/{team-name}/team-plan.md` for full task details
- Read ALL reference files before modifying anything
- You will work in plan mode first. Submit your plan for lead approval before implementing.
- Only modify files listed in your task's files_owned
- Match existing code patterns
- Run verify commands before reporting done
- When done, send message to "qb" with summary of changes made
- After completing a task, self-claim next unassigned unblocked task from TaskList
- If qb flags issues, fix them

Rules:
- pnpm -F "<pkg>" for all commands
- All agents use opus model
- Code snippets in tasks are sketches — adapt to real types/signatures
```

### Lint agent prompt

```
Run lint:fix on these packages and fix all errors:
{list packages}
Iterate until `pnpm -F "<pkg>" lint` exits 0 for all packages.
```

### Types agent prompt

```
Run typecheck on these packages and fix all errors:
{list packages}
Iterate until `pnpm -F "<pkg>" types` exits 0 for all packages.
```

---

## Critical Rules (copy to your template)

1. `pnpm -F "<pkg>"` for all commands
2. All implementer + qb agents use `model: "opus"`
3. Lint/types agents use `model: "sonnet"` with dedicated subagent types
4. Lead does NOT implement — only orchestrates
5. Quarterback does NOT implement — only reviews (subjective); hooks gate mechanical checks
6. Group similar tasks onto the same implementer agent
7. Code snippets in tasks are sketches — agents adapt to real types/signatures
8. Read existing code before modifying — match patterns already in use
9. Each implementer runs build/verify before reporting done
10. No two agents modify the same file (see File Ownership Matrix)
11. Implementers work in plan mode — submit plan for lead approval before implementing
12. Self-claim tasks from TaskList after completing current task
