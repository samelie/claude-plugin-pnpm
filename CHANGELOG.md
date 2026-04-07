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
