# claude-plugin-pnpm

## Team Trigger

When the user's message starts with **"as a team"** (e.g., "as a team, refactor the auth middleware"), invoke the `/team-creation` skill with the rest of the message as the task description. This is the natural language entry point for multi-agent team planning.

Other trigger phrases: "team up on", "work as a team on", "let's team up".

## Available Team Agents

### Planning phase (used by team-creation skill)

| Agent | subagent_type | Role |
|-------|--------------|------|
| `planner` | `claude-plugin-pnpm:planner` | **THE** initial planning agent — produces design.md + team-plan.md. Always use this, not team-architect, for initial planning. |
| `team-researcher` | `claude-plugin-pnpm:team-researcher` | Read-only investigation via Arcana + CocoIndex + code. Dispatched in background before planner for deep context. |

### Execution phase (dispatched by team lead)

| Agent | subagent_type | Role |
|-------|--------------|------|
| `team-architect` | `claude-plugin-pnpm:team-architect` | Deep-dive module analyst — used mid-execution when a specific subsystem needs investigation before coders start. NOT for initial planning. |
| `team-coder` | `claude-plugin-pnpm:team-coder` | Implement assigned subtasks |
| `team-reviewer` | `claude-plugin-pnpm:team-reviewer` | Code review |
| `team-tester` | `claude-plugin-pnpm:team-tester` | Write + run tests |
| `team-auditor` | `claude-plugin-pnpm:team-auditor` | Post-implementation audit |
| `team-security-auditor` | `claude-plugin-pnpm:team-security-auditor` | OWASP security audit |
| `team-verifier` | `claude-plugin-pnpm:team-verifier` | Run lint/types/knip/tests |
| `team-finisher` | `claude-plugin-pnpm:team-finisher` | Remove logs, enforce comment standards |

## Team Session

All agents communicate via `team-session/` (created by session-start hook). Use `read-findings` and `write-findings` skills for I/O.

## STATUS Protocol

Every team agent must end with: `STATUS: CLEAN`, `STATUS: PARTIAL`, or `STATUS: ERRORS_REMAINING: <count>`.
