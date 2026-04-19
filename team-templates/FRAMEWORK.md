# Team Framework

> Invariant rules for all agent teams. The planner reads this as constraints.
> The lead reads this as execution protocol. Agents read the sections relevant to their role.
>
> Customize monorepo-specific rules (branch prefix, tsconfig policy, etc.) in your project's CLAUDE.md.

---

## Roles

### Lead (the orchestrator)

- Creates team via `TeamCreate`
- Enables delegate mode (Shift+Tab) immediately after TeamCreate
- Creates ALL tasks via `TaskCreate` with `blockedBy` dependencies before spawning agents
- Spawns agents via `Task` tool with `team_name`, `name`, `mode` params
- **Does NOT implement** — only orchestrates and gates phase transitions
- Monitors `TaskList`; advances phases when dependencies resolve
- Runs final verification after all phases
- Sends `shutdown_request` to all agents when done, then `TeamDelete`

### Quarterback (QA reviewer)

- Uses the `quarterback` agent definition — **tool-restricted** (no Edit/Write)
- Structurally cannot modify code — only reads and reviews
- Focuses on **subjective review**: does code match requirements, follow patterns, avoid bugs?
- Hooks handle mechanical checks (build/test/lint) — QB doesn't duplicate that
- Receives completion messages from implementers, reviews changed files
- Sends approval or rejection (with specifics) to lead
- See [QB Protocol](#quarterback-protocol) below

### Implementers

- Spawned with `mode: "plan"` — must submit plan for lead approval before implementing
- Each agent owns a **cohesive group of related tasks** (not one per micro-task)
- Only modifies files in its `files_owned` (enforced by scope hook when active)
- After completing a task, self-claims next unassigned unblocked task from `TaskList`
- Reports to QB with change summary when done
- Runs build/verify for their package(s) before reporting done

### Finalization Agents

- Spawned ONLY after all implementer tasks complete (phase-gated via `blockedBy`)
- Use dedicated subagent types — NOT general-purpose:
  - `pnpm-lint` for lint:fix
  - `pnpm-types` for typecheck
  - `pnpm-knip` for dead code removal
  - `pnpm-test` for test fixes
- Use `model: "sonnet"` (sufficient for mechanical work)

---

## Phase Gating

All teams follow this phase pattern:

| Phase | What happens | Gate to advance |
|-------|-------------|-----------------|
| 0 | TeamCreate, delegate mode, TaskCreate all tasks, spawn all agents | All agents spawned |
| 1..N | Implementers work in parallel, QB reviews | All phase tasks complete + QB approved |
| N+1 | Finalization agents (lint/types/knip/test) | All exit clean |
| Final | Lead runs verification, shutdown all agents, TeamDelete | Verification passes |

Phases are sequential. Tasks within a phase can be parallel. Use `blockedBy` to enforce ordering.

---

## File Ownership

**Rule: No two agents modify the same file.**

- The planner assigns `files_owned` glob patterns to each agent
- If a shared file needs changes from multiple tasks, ALL those tasks go to one agent
- Ownership is declared in the team plan's File Ownership Matrix
- When scope hooks are active, `PreToolUse` blocks edits outside owned paths
- Unowned files (not in any agent's list) are allowed — hooks only enforce declared ownership

---

## Hook Enforcement Points

Hooks provide structural guardrails beyond prompt instructions.

| Hook Event | Script | What it enforces |
|-----------|--------|-----------------|
| `PreToolUse` (Edit\|Write) | `check-team-scope.sh` | File must be within team's package scope |
| `SubagentStop` | `subagent-stop-verify.sh` | Agent must have reported STATUS before stopping |
| `Stop` | (optional) | Lead can't stop until all tasks complete |

Scope enforcement comes from the plugin's own `hooks/hooks.json` — always active when the plugin is enabled. The scope hook auto-discovers `team-session/*/team-scope.json`. No per-team wiring needed.

### Hook input/output contract

- **Command hooks** receive tool input JSON on stdin
- **PreToolUse** can output `hookSpecificOutput` with `permissionDecision: "deny"` to block
- **SubagentStop** returns `{"decision": "approve"}` or `{"decision": "block", "reason": "..."}`
- Exit code 0 = allow, exit code 2 = reject with feedback

---

## Model Selection

| Role | Model | Why |
|------|-------|-----|
| Lead | `opus` | Needs judgment for orchestration |
| Quarterback | `opus` | Needs judgment for code review |
| Implementers | `opus` | Complex implementation work |
| Finalization (lint/types/knip/test) | `sonnet` | Mechanical, pattern-following work |

Override when task complexity warrants it (e.g., sonnet for simple implementers, opus for complex lint).

---

## Recovery Protocol

### Stuck agent (no response)

1. Lead messages agent for status
2. No response -> spawn fresh agent with same task + progress summary
3. Use `resume` parameter if agent is still alive and context isn't polluted

### Failed verification (QB rejection or hook failure)

1. **Small fix** (missing import, typo) -> original agent fixes, or `resume` the agent
2. **Wrong approach** -> spawn fresh agent with clean context + fix instructions
3. Max respawns per task: **3**

### Context exhaustion

Agent summarizes progress, reports to lead, requests fresh spawn with handoff context.

### When to resume vs fresh spawn

| Situation | Action |
|-----------|--------|
| Small fix, agent context is clean | `resume` with agent ID |
| Agent went wrong direction | Fresh spawn, clean context |
| Agent hit max_turns | Fresh spawn with progress summary |
| Agent idle, unknown state | Message first, then fresh if no response |

---

## STATUS Protocol

Every sub-agent MUST end its final message with exactly one of:

```
STATUS: CLEAN
```

```
STATUS: ERRORS_REMAINING: <count> errors in <packages>
```

```
STATUS: PARTIAL — completed N/M tasks, remaining: <list>
```

If no STATUS line in output, the system treats it as ERRORS_REMAINING and respawns.

Include a brief summary of completed work so the next agent doesn't redo it.

---

## Quarterback Protocol

1. **Receive** completion message from implementer
2. **Read** all files the implementer changed
3. **Check** (subjective — hooks gate mechanical):
   - Does the code match the task requirements?
   - Does it follow existing patterns in the codebase?
   - Are there obvious bugs, missing edge cases?
   - Were the acceptance criteria met?
4. **If OK**: message lead with approval -> lead marks task complete
5. **If NOT OK**: message lead with specific issues -> lead either:
   - Sends fix instructions to original agent
   - Spawns fresh agent with clean context + fix instructions

### Skip QB when

- Task is purely mechanical (lint fix, type fix, knip cleanup)
- Team has <=2 agents (overhead not worth it)
- Work is reviewed by hooks (build passes, tests pass)

---

## Post-Plan Review Protocol

After planner generates design.md + team-plan.md, run review before execution:

### Who reviews

- Lead can self-review using `teamkit-review` skill
- Lead can dispatch QB for independent review

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
| **blockedBy** | {none \| T1, T2} |
| **files_owned** | `{glob patterns}` |
| **verify** | `{command}` |

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

---

## Lead Orchestration Checklist

```
[ ] 1. TeamCreate
[ ] 2. Enable delegate mode (Shift+Tab)
[ ] 3. TaskCreate ALL tasks with blockedBy deps
[ ] 4. Spawn QB agent (if team needs one)
[ ] 5. Spawn implementer agents with mode: "plan"
[ ] 6. Approve implementer plans as they come in
[ ] 7. Monitor: QB reviews + hooks gate completions
[ ] 8. All implementation approved -> spawn finalization agents
[ ] 9. Finalization complete -> final verification
[ ] 10. shutdown_request to all agents
[ ] 11. TeamDelete
```
