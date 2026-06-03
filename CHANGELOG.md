## 0.3.0

- **feat**: `team-kit-run` skill — execute a task as a native-workflow multi-agent run over the team-kit role agents. Reproducible, single-branch, prod-safe. Complements `team-kit-create` (plan) with an execute path; the two are fully wired (create → run handoff).
- **feat**: `SCHEMA-CATALOG.md` — canonical PascalCase handoff schemas (`ResearchFindings`, `ImplResult`, `ReviewVerdict`, `VerifyReport`, `ACEvidence`) for the workflow EXECUTE path. Each carries `sessionFile` + `status` so the FILE (team-style) and SCHEMA (workflow) handoff models coexist.
- **feat**: saved-workflow support — `SAVED-WORKFLOW-RECIPE.md` documents converting team templates to native `.claude/workflows/*.js`; ships the `/monorepo-health` exemplar (report-only by default; `args.fix` enables single-writer fixes).
- **docs**: `FRAMEWORK.md` — added Workflow Execution section + agentType mapping table; deduped model-selection guidance.
- **fix**: plugin load error — removed a dead agent reference from the manifest and registered `team-plan-reviewer`. Manifest now matches disk (18 agents).
- **fix**: handoff filename drift resolved — `team-reviewer` writes `reviewer/review-{task-id}.md` (was `findings.md`, which collided with the researcher's output); `team-spec-reviewer` writes to the `spec-reviewer/` subdir (was session root); `team-security-auditor` writes `security-audit.md` (was `report.md`); SESSION-SCHEMA verifier output aligned to `verifier/results.md` (was `verification.md`); `{task}` unified to `{task-id}`. All agent docs now match the SCHEMA-CATALOG canonical paths.
- **chore**: version sync — `plugin.json` 0.0.5 → 0.3.0 and `package.json` 0.2.0 → 0.3.0. Both manifests now aligned at 0.3.0.

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
