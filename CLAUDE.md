# claude-plugin-pnpm

## Team Trigger

When the user's message starts with **"as a team"** (e.g., "as a team, refactor the auth middleware"), invoke the `/team-kit-create` skill with the rest of the message as the task description. This is the natural language entry point for multi-agent team planning.

Other trigger phrases: "team up on", "work as a team on", "let's team up", "team-kit".

**Debug trigger:** "as a team, debug..." or "as a team, investigate..." → uses debug-investigation template.

**Design trigger:** "as a team, design..." or "as a team, spec..." → spawns team-designer first, then planner.

## Teamkit Skills

| Skill | Purpose |
|-------|---------|
| `team-kit-create` | Orchestrator — scope problem, create team plan, deliver spawn prompt |
| `team-kit-clarify` | Requirements extraction — one question at a time |
| `team-kit-explore` | Approach exploration — propose 2-3 options with tradeoffs |
| `team-kit-present` | Section-by-section design approval |
| `team-kit-review` | Post-plan review checklist |
| `debug-session` | Root cause investigation methodology — single-agent or team escalation |
| `brainstorm-session` | Requirements gathering and design — single-agent or team escalation |

## Available Team Agents

### 3-Stage Flow

| Stage | Agent | Output | Focus |
|-------|-------|--------|-------|
| 1. Requirements | `team-designer` (phases: clarify→explore→write) | `requirements.md` | WHAT — user needs, constraints, acceptance criteria |
| 2. Design | `planner` | `design.md` | HOW — technical architecture, patterns, interfaces |
| 3. Planning | `planner` | `team-plan.md` | TASKS — executable work with agent assignments |

**Phase-based pattern**: Lead dispatches designer multiple times with specific phases (clarify, explore, present, write). Each dispatch does ONE thing and returns. Lead stays lean, maintains state between dispatches.

### Planning phase (used by team-kit-create skill)

| Agent | subagent_type | Role |
|-------|--------------|------|
| `team-designer` | `claude-plugin-pnpm:team-designer` | Phase-aware requirements specialist. Dispatched with phase: clarify\|explore\|present\|write. Stateless — lead maintains context. |
| `planner` | `claude-plugin-pnpm:planner` | Design + planning — produces design.md (HOW) + team-plan.md (TASKS). |
| `team-researcher` | `claude-plugin-pnpm:team-researcher` | Read-only investigation via Arcana + CocoIndex + code. Dispatched in background before planner for deep context. |

### Execution phase (dispatched by team lead)

| Agent | subagent_type | Role |
|-------|--------------|------|
| `team-monitor` | `claude-plugin-pnpm:team-monitor` | Health observer — tracks agent activity, task state, flags anomalies. Read-only. Use for 5+ agent teams. |
| `team-investigator` | `claude-plugin-pnpm:team-investigator` | Root cause investigation — systematic debugging Phases 1-3. Used by debug-investigation template. |
| `team-architect` | `claude-plugin-pnpm:team-architect` | Deep-dive module analyst — used mid-execution when a specific subsystem needs investigation before coders start. NOT for initial planning. |
| `team-coder` | `claude-plugin-pnpm:team-coder` | Implement assigned subtasks |
| `team-spec-reviewer` | `claude-plugin-pnpm:team-spec-reviewer` | Spec compliance review — runs BEFORE quality review |
| `team-reviewer` | `claude-plugin-pnpm:team-reviewer` | Code quality review — runs AFTER spec review |
| `team-tester` | `claude-plugin-pnpm:team-tester` | Write + run tests |
| `team-auditor` | `claude-plugin-pnpm:team-auditor` | Post-implementation audit |
| `team-security-auditor` | `claude-plugin-pnpm:team-security-auditor` | OWASP security audit |
| `team-verifier` | `claude-plugin-pnpm:team-verifier` | Run lint/types/knip/tests |
| `team-finisher` | `claude-plugin-pnpm:team-finisher` | Remove logs, enforce comment standards |

## Team Session

All agents communicate via `team-session/` (created by session-start hook). Use `read-findings` and `write-findings` skills for I/O.

## STATUS Protocol

Every team agent must end with: `STATUS: CLEAN`, `STATUS: PARTIAL`, or `STATUS: ERRORS_REMAINING: <count>`.
