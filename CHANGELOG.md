## 0.2.0

- **feat**: new team-kit skills family for self-contained team planning:
  - `team-kit-create` — orchestrator (renamed from `team-creation`)
  - `team-kit-clarify` — requirements extraction, one question at a time
  - `team-kit-explore` — propose 2-3 approaches with tradeoffs
  - `team-kit-present` — section-by-section design approval
  - `team-kit-review` — post-plan review checklist
- **feat**: new `team-monitor` agent — read-only health observer for large teams (5+ agents)
  - Tracks agent activity, task state, message patterns
  - Flags stuck agents, blocked tasks, STATUS violations
  - Reports periodic health summaries to lead
- **feat**: removed `superpowers:brainstorming` dependency — team-kit is now fully self-contained
- **feat**: approach exploration phase — user selects from alternatives before planner commits
- **feat**: section-by-section design approval — components, data flow, file ownership, tasks approved incrementally
- **feat**: post-plan review protocol — placeholder scan, type consistency, ambiguity check
- **feat**: user file review gate — explicit file review before spawn prompt
- **feat**: planner now receives chosen approach as input, honors user's selection
- **docs**: added no-placeholders rule and type consistency check to PLANNER.md
- **docs**: added post-plan review protocol to FRAMEWORK.md
- **docs**: added team-monitor role to FRAMEWORK.md
- **branding**: unified naming to "Team Kit" (`team-kit-*` skill prefix)

## 0.1.1

- **fix**: add required `"matcher": "*"` field to `SessionStart`, `SubagentStop`, and `Stop` hook entries. Per [official hook-development docs](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md), every hook entry needs a matcher — missing matchers cause schema validation failures that surface as generic "SessionStart:startup hook error".
- **fix**: change `PreToolUse` matcher from regex-anchored `^(Edit|Write|MultiEdit)$` to documented pipe-delimited `Edit|Write|MultiEdit`.
- **fix**: prefix all hook commands in `hooks/hooks.json` with `bash`/`sh`. npm publish strips executable bits from `755` → `644`, and Claude Code was invoking hook scripts directly without an interpreter, producing `permission denied`. Fix decouples hook execution from file permissions — matches the pattern used by `claude-memory` and Anthropic's official examples.
- **cleanup**: remove `continueOnError: true` fields — not in the official schema.

## 0.1.0

- **fix**: stop team flow from polluting `.claude/`. Plugin's own `hooks/hooks.json` already wires everything — `settings.hooks.json` generation was dead code that merged into `.claude/settings.local.json`, causing corruption from concurrent writes. Deleted entirely.
- **fix**: `check-team-scope` hook now discovers `team-scope.json` under `$CLAUDE_PROJECT_DIR/team-session/*/` instead of the never-written `.claude/team-scope.json` — closes silent scope-enforcement bypass.
- **fix**: pre-existing subshell bug in `check-team-scope` match loop (`MATCH=yes` was lost across pipe). Latent until now because no scope file was ever found.
- **fix**: moved built-in templates (`monorepo-health`, `monorepo-deep-clean`, `knip-config-audit`, `k8s-jobs-migration`, `migrate-monorepo-scripts`) from `.claude/team-templates/` to `${CLAUDE_PLUGIN_ROOT}/team-templates/`. Kills planner hallucination of `.claude/team-templates/generated/{team-name}/` output paths.
- **cleanup**: stripped dead `.claude/team-domain.md` references from 9 team agents.
- **feat**: team-agent workflows now query Arcana + CocoIndex knowledge tools before code exploration (quarterback, team-auditor, team-coder, team-reviewer, team-security-auditor, team-tester).

## 0.0.3

- Fix README install command (`claude plugin install`, not `add`)

## 0.0.2

- Fix: remove `hooks` field from plugin.json

## 0.0.1 — Initial release
