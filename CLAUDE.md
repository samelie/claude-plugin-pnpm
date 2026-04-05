# claude-plugin-pnpm

## Team Trigger

When the user's message starts with **"as a team"** (e.g., "as a team, refactor the auth middleware"), invoke the `/team-creation` skill with the rest of the message as the task description. This is the natural language entry point for multi-agent team planning.

Other trigger phrases: "team up on", "work as a team on", "let's team up".

## Available Team Agents

| Agent | subagent_type | Role |
|-------|--------------|------|
| `team-architect` | `claude-plugin-pnpm:team-architect` | Design + decompose into subtasks |
| `team-coder` | `claude-plugin-pnpm:team-coder` | Implement assigned subtasks |
| `team-researcher` | `claude-plugin-pnpm:team-researcher` | Read-only investigation |
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
