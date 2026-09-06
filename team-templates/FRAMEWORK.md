# Team Framework

> Invariant rules for all agent teams. team-kit-run reads the execution sections; the planner reads the rest as constraints.
> Agents read the sections relevant to their role.
>
> Customize monorepo-specific rules (branch prefix, tsconfig policy, etc.) in your project's CLAUDE.md.

---

## Roles

### Designer (phase-based requirements)

- Uses `team-designer` agent definition
- **Stateless, phase-aware** — dispatched multiple times with specific phase
- Phases: `clarify` (one question) | `explore` (2-3 approaches) | `present` (one section) | `write` (requirements.md) | `discovery` (five-exit research ⇄ grill loop)
- Each dispatch does ONE thing and returns — lead maintains state between dispatches
- Lead dispatches via the `skills/team-kit-create/references/clarify.md` and `explore.md` patterns
- Outputs `requirements.md` to team-session folder (in `write` phase)
- In `discovery` phase: routes every open question to one of **five exits** — self-resolve (code, no round-trip) | research (lead fans out targeted researchers, parallel) | prototype (cheap artifact to react to) | grill (human judgment, ONE per round) | fog (→ `map.md` Not yet specified). Research is **re-entrant**, so a human answer can redirect what gets researched next. Updates `requirements.md` inline and owns the `map.md` ledger. Terminates on fog-drain; safety cap 10 rounds. Findings inform, humans decide — a research fact never becomes a scope change on its own.
- **Does NOT plan tasks, make technical decisions, or write code** — only gathers and refines requirements (WHAT, not HOW)

### Implementers

- Each agent owns a **cohesive group of related tasks** (not one per micro-task)
- Only modifies files in its `files_owned`
- Runs build/verify for their package(s) before reporting done
- The review stage reviews changed files

**Use only supported agent types.** See team-planner.md for the full list with `subagent_type` values. Do not invent agent types — if a task doesn't fit existing roles, assign to `team-coder` with specific instructions.

### Finalization Agents

- Spawned ONLY after all implementer tasks complete (phase-gated via `blockedBy`)
- Use dedicated subagent types — NOT general-purpose:
  - `pnpm-lint` for lint:fix
  - `pnpm-types` for typecheck
  - `pnpm-knip` for dead code removal
  - `pnpm-test` for test fixes
- Use `model: "sonnet"` (sufficient for mechanical work)

---

## Session Path (CRITICAL)

**Every agent prompt MUST include the session path.** Without it, agents write to wrong locations.

### Session folder

The session-start hook creates `team-session/YYYYMMDD-{team-name}/` automatically.

### Each agent prompt includes

```markdown
## Session Path

Session path: `team-session/YYYYMMDD-{team-name}/`

Write all output to: `{session_path}/{your-name}/`
Read other agents from: `{session_path}/{agent-name}/`
```

### Why this matters

Agents use `write-findings` and `read-findings` skills. These skills need to know WHERE:
- Without session path: agents write to `team-session/researcher/` (WRONG)
- With session path: agents write to `team-session/20260420-feature/researcher/` (CORRECT)

### Example agent prompt

```markdown
You are researcher on team 20260420-cs-submittals.

## Session Path

Session path: `team-session/20260420-cs-submittals/`

Write findings to: `team-session/20260420-cs-submittals/researcher/`
Read architect output from: `team-session/20260420-cs-submittals/architect/`

## Your Task
...
```

---

## Phase Gating

All teams follow this phase pattern:

| Phase | What happens | Gate to advance |
|-------|-------------|-----------------|
| 0 | Workflow authored + launched | All agents spawned |
| 1..N | Implementers work in parallel, review stage checks | All phase tasks complete + review (spec→quality) passed |
| N+1 | Finalization agents (lint/types/knip/test) | All exit clean |
| N+2 | Validation — verify feature/fix works beyond unit tests | Acceptance criteria verified |
| Final | team-verifier validate + human-gated prod checklist | Verification passes |

Phases are sequential. Tasks within a phase can be parallel. Use `blockedBy` to enforce ordering.

### Validation Phase (N+2)

Unit tests prove code is correct. Validation proves the feature **actually works**.

**During planning, planner must answer:**
- How do we verify this works end-to-end?
- What's the minimal smoke test?
- Can it be automated or is it manual?
- What environments need testing?

**Validation scope varies by task type:**

| Task Type | Validation Examples |
|-----------|---------------------|
| API change | Call endpoint, verify response shape |
| UI feature | Load page, interact, verify behavior |
| Infrastructure | Deploy to staging, verify resources exist |
| Refactor | Run existing integration tests, compare behavior |
| Bug fix | Reproduce original bug scenario, confirm fixed |

**Validation output in team-session:**

```markdown
# Validation Report

## Acceptance Criteria Verification

| AC ID | Criterion | Verified | Evidence |
|-------|-----------|----------|----------|
| AC-1 | Given X, When Y, Then Z | ✅ | screenshot/log/command output |
| AC-2 | ... | ❌ | what failed |

## Smoke Test Results

- [ ] {describe what was tested and outcome}

## Manual Verification (if applicable)

- [ ] {step performed by human, result}
```

**Skip validation when:**
- Pure refactor with no behavior change + existing tests cover it
- Documentation-only changes
- Lead explicitly marks task as "no validation needed" with rationale

---

## Workflow Execution

The phase ladder above has two execution counterparts, split on the **human-gate seam**. `team-kit-create` drives the gated half (interactive); `/team-kit-run` drives the deterministic half (native-workflow). Source of truth: `../skills/team-kit-run/SKILL.md` (rationale/evidence: `../docs/teamkit-methodology.md`) — empirically verified, spikes 1–4; re-verified 2026-06-05. The JS API is research-preview + vendor-unpublished → re-verify on each Claude Code upgrade.

| Half | Phases | Execution |
|------|--------|-----------|
| **Gated** (human decision mid-stream) | clarify, explore-select, present, plan approval, file review, AND all prod/irreversible/paid actions | interactive / in-session (team-kit-create + human). Workflows take NO mid-run input. |
| **Deterministic** (fan-out → reduce) | research, implement, review (spec→quality), finalize (lint/types/knip/test), validate (N+2) | `/team-kit-run` workflow stages over the role agents. |

**Verified platform rules that shape execution:**

1. **Bridge:** `agent(p, { agentType: 'team-coder', schema })` loads the role agent verbatim. Reuse roles as workers — no rewrite.
2. **Custom agentType = fixed toolset** in the workflow `agent()` sandbox: baseline Read/Bash/StructuredOutput + role-filtered Write/Edit/Skill. No raw MCP/ToolSearch/Glob/Grep (verified across 5 types 2026-06-05). → Knowledge stages use the DEFAULT agent (reaches MCP via inheritance AND ToolSearch) with the role injected via prompt. In-role lookups in customs = Bash/ripgrep only (ccc/mem-search Skill wrappers can't bridge to absent MCP).
3. **Workflow agents auto-acceptEdits; no scope guard blocked an out-of-scope write** (re-verified 2026-06-05, both default+custom). The file-ownership matrix + `check-team-scope` only guard the legacy native-team path. In workflows the guard is discipline, not a hook.
4. **Single branch, no worktrees.** Clobber risk = same-FILE writes only. Schema returns + `team-session/` artifact writes (disjoint paths) are parallel-safe; SOURCE edits are single-writer (serial) or propose-then-apply (parallel reason → one serial apply). Never parallel same-file writers.
5. **No mid-run input; resume within-session only.** A multi-gate job = several sequential workflow runs, human gates BETWEEN runs.
6. **Schema is reliable** (re-verified 2026-06-05, 4/4 heavy agents returned). Heavy stages STILL default to FILE + `STATUS:` for lean context + bulk handoff, NOT because schema breaks. Wrap critical-path `await agent()` in `tryAgent` for transport aborts (stall/rate-limit/subprocess).

**Scope/STATUS not hook-enforced (verified):** in `/team-kit-run` workflows, scope and STATUS are NOT hook-enforced — rely on single-writer / propose-then-apply discipline (rule 4) and the STATUS Protocol convention instead.

**Handoff:** stages pass the 5 canonical schemas in `SCHEMA-CATALOG.md` (data) + `sessionFile` pointers (bulk). The N+2 Validation phase is the workflow's Validate stage → `ACEvidence` (automatable AC only; `automatable:false` → in-session manual).

**Prod-gating (mandatory):** deploys, migrations, deletes, kubectl, scaling, ingest kicks, paid live calls NEVER run inside the autonomous workflow — they return as a human-gated checklist.

---

## File Ownership

**Rule: No two agents modify the same file.**

- The planner assigns `files_owned` glob patterns to each agent
- If a shared file needs changes from multiple tasks, ALL those tasks go to one agent
- Ownership is declared in the team plan's File Ownership Matrix
- When scope hooks are active, `PreToolUse` blocks edits outside owned paths
- Unowned files (not in any agent's list) are allowed — hooks only enforce declared ownership

---

## Model Selection

Use the least powerful model that can handle each role — conserve cost + speed. In a `/team-kit-run` workflow, set per-stage model via `opts.model` (omit to inherit the session model).

**By role / task type:**

| Role / task | Model | Why |
|-------------|-------|-----|
| Lead / orchestration | `opus` | judgment for orchestration |
| Plan / design critique | `opus` | fresh-eyes plan review (team-plan-reviewer / goal-auditor) |
| Implementation (feature, multi-file) | `opus` | implementation quality matters |
| Architecture / design / planning | `opus` | design judgment, broad understanding |
| Investigation / root cause | `opus` | deep-dive analysis |
| Spec review / quality review | `sonnet` | checklist comparison |
| Finalization (lint/types/knip/test) | `sonnet` | mechanical, pattern-following |
| Mechanical (lint fix, type fix, knip cleanup) | `sonnet` | mechanical |

**Complexity signals:** 1-2 files w/ complete spec → sonnet; multi-file w/ integration concerns → sonnet or opus; design judgment / broad codebase → opus.

**Per-agent defaults:** team-designer/planner/team-coder/team-investigator/team-architect → opus; team-spec-reviewer/team-reviewer/team-verifier → sonnet. Override when task complexity warrants.

---

## Recovery Protocol

### Respawn caps

- **Small fix** (missing import, typo) → same agent fixes, or fresh spawn with fix instructions
- **Wrong approach** → fresh spawn with clean context + fix instructions
- Max respawns per task: **3**

### Context exhaustion

Agent summarizes progress and requests a fresh spawn with handoff context (maps to the workflow `tryAgent` / fresh-spawn retry).

---

## STATUS Protocol

Every sub-agent MUST end its final message with exactly one of:

```
STATUS: CLEAN
```
Work complete, no issues.

```
STATUS: DONE_WITH_CONCERNS — <brief concern>
```
Work complete but agent has doubts about correctness or approach. Lead should review concerns before proceeding.

```
STATUS: NEEDS_CONTEXT — <what's missing>
```
Agent cannot proceed without additional information. Lead provides context and re-dispatches.

```
STATUS: BLOCKED — <reason>
```
Agent cannot complete task. Lead assesses:
1. Context problem → provide more context, re-dispatch same model
2. Task too complex → re-dispatch with more capable model
3. Task too large → break into smaller pieces
4. Plan is wrong → escalate to human

```
STATUS: ERRORS_REMAINING: <count> errors in <packages>
```
Work attempted but issues remain. Include what was tried.

```
STATUS: PARTIAL — completed N/M tasks, remaining: <list>
```
Some work done, more remains. Include summary of progress.

**Handling statuses:**

| Status | Orchestrator/host action |
|--------|-------------|
| CLEAN | Proceed to next step (review or next task) |
| DONE_WITH_CONCERNS | Read concerns, address if needed, then proceed |
| NEEDS_CONTEXT | Provide missing info, re-dispatch |
| BLOCKED | Assess blocker, adjust approach, re-dispatch or escalate |
| ERRORS_REMAINING | Review errors, dispatch fix or fresh agent |
| PARTIAL | Continue with next agent or re-dispatch for remaining |

If no STATUS line in output, the system treats it as ERRORS_REMAINING and respawns.

Include a brief summary of completed work so the next agent doesn't redo it.

---

## Post-Plan Review Protocol

After planner generates design.md + team-plan.md, run review before execution:

### Who reviews

- Lead can self-review using team-kit-create Step 6 (inline post-plan review checklist)
- Dispatch team-plan-reviewer for independent review

### What to check

| Check | What to verify |
|-------|----------------|
| Placeholder scan | No TBD, TODO, incomplete sections |
| Internal consistency | Architecture matches tasks, ownership covers all files |
| Type consistency | Function/type names match across tasks |
| Ambiguity check | Requirements unambiguous |
| Scope check | Focused enough for single execution |

### Review output

```markdown
**Status**: Approved | Issues Found

**Issues** (if any):
- [Section]: [specific issue] — [why it matters]

**Fixed inline**:
- [what was fixed]
```

### Decision flow

| Condition | Action |
|-----------|--------|
| No issues | Approved — proceed to user file review gate |
| Minor issues fixed inline | Approved — note fixes, proceed |
| Major issues (wrong approach, scope creep) | Re-run planner with feedback |
| Scope too broad | Recommend decomposition |

### User file review gate

After review passes, ask user to review actual files before spawn prompt:

> "Please review these files before proceeding:
> - `team-session/{name}/design.md`
> - `team-session/{name}/team-plan.md`
>
> Let me know if you want changes."

Only deliver spawn prompt after user approves files.

---

## Task Definition Format

Every task in a team plan must include:

```markdown
### T{n}: {Title}

| Field | Value |
|-------|-------|
| **Phase** | {1\|2\|...} |
| **Agent** | {agent-name} |
| **Requirement** | {AC-1, AC-2 — from requirements.md; every task maps to ≥1 AC} |
| **blockedBy** | {none \| T1, T2} |
| **files_owned** | `{glob patterns}` |
| **verify** | `{command}` |
| **type** | {AFK \| HITL — HITL = prod-mutating / irreversible / paid-live / needs human evidence; /team-kit-run routes HITL to the human-gated checklist, AFK into the workflow} |
| **Estimated** | {5-30 min — longer ⇒ split the task} |

{1-3 sentence description}

#### Acceptance criteria
- [ ] {criterion 1}
- [ ] {criterion 2}
```

Optional sections: Reference files, Implementation sketch.

---

## Monorepo Rules

1. `pnpm -F "<pkg>"` for all commands
2. Read existing code before modifying — match patterns already in use
3. Code snippets in tasks are sketches — agents adapt to real types/signatures
4. Leave changes uncommitted unless told otherwise

---

## Token Budget

| Team size | Cost multiplier | Use case |
|-----------|----------------|----------|
| 2-3 agents | 3-5x | Most tasks |
| 4-6 agents | 6-10x | Large parallel work |
| 7+ agents | 10x+ | Audits, mass migrations |

Prefer fewer agents with grouped tasks over many micro-task agents.
