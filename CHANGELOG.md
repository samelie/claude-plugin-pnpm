## 0.5.0

### Minor Changes

- 18e4d8b: Add acceptance-contract goal-fidelity gate to team-kit planning. New `team-goal-auditor` agent (define + adversarial audit phases), `team-kit-acceptance` dispatch skill, and `definition-of-done.md` contract authored after planning and audited against the original prompt before handoff to execution. Wires Steps 4d/4e into `team-kit-create`, tightens the Step 7 handoff gate (sealed-contract validation + context firebreak), and extends SESSION-SCHEMA + CLAUDE.md roster. Hardening from a real dry-run: absolute session paths (symlink-safe dispatch) and a semantic-AC producible-evidence rule.

## 0.4.0

### Minor Changes

- c4514b0: Fix cocoindex search + restore agents' knowledge-tool access
  - cocoindex-code: install the `[full]` extra (local sentence-transformers embeddings). The slim install lacked torch/sentence-transformers, so the daemon threw `ModuleNotFoundError` and semantic search silently returned nothing. Fixed install commands in the update-deps and third-party-manager skills and the cocoindex-code doc; added a daemon-restart step, ModuleNotFoundError troubleshooting, and a leading-edge + health verify block (compares installed vs latest release and confirms the embedding model loads).
  - agents: grant MCP knowledge tools (cocoindex, claude-mem, context-mode, context7) to researcher, team-researcher, team-investigator, team-architect, team-planner, and team-designer. The explicit `tools:` allowlist previously excluded all MCP tools, making the preloaded investigation-methodology mandate unsatisfiable. Uses server-level wildcards (`mcp__server__*`) for upgrade resilience.
  - agents: grant the `Skill` tool to the 9 team agents instructed to use write-findings/read-findings — they could not invoke those skills before.
  - CLAUDE.md: task-gate investigation guidance (exploration only, not trivial lookups or mutations) and clarify per-tool roles (cocoindex = code locate, claude-mem = passive recall, context-mode = token hygiene).

- f4fd98c: Phase-based designer dispatch pattern
  - team-designer now stateless and phase-aware (clarify|explore|present|write)
  - Each dispatch does ONE thing and returns — lead maintains state between dispatches
  - team-kit-clarify/explore become dispatch instructions for lead orchestration
  - Lead stays lean, context doesn't bloat, interactive control preserved
  - Renamed spec.md → requirements.md for clearer 3-stage separation

- 6733e51: team-kit committed-spine (`team-kit-run` mode-1): the native "Claude writes the workflow, you save it" model with a thin guardrail — NOT a bespoke derivation pipeline. The orchestrator authors `plan.workflow.js` from the approved `team-plan.md` ground-truth, lints it, optionally fidelity-checks it, and saves it. md is canonical; the `.js` is a re-authorable build artifact.
  - **Advisory lint** (`scripts/validate-workflow.mjs`): syntax (wrapped `node --check`, handles top-level `await`/`return`), required `export const meta`, determinism/forbidden-API scan (rule 7), conditional invariant lint (coverage after `parallel()` rule 10, `tryAgent` on `await agent()` rule 11), prod-gate deny-scan. Self-tested (8 cases), wired as `test` + `validate:workflow`. **Encodes dated, reverse-engineered preview-API rules — advisory, not a correctness guarantee; re-verify on upgrade.**
  - **Optional fidelity check**: `team-spec-reviewer` + new `AlignmentVerdict` schema (SCHEMA-CATALOG §6) confirms the authored `.js` covers the plan (covered/missing/invented) — for high-stakes plans only.

  `team-kit-create`/`PLANNER`/`team-planner` updated: planner emits `team-plan.md` only; mode-1 authors the `.js`. Also reconsolidates the methodology (re-verified platform rules 2/3/4/6/9 against the current runtime, version-fragility banner) and replaces the 342-line `WORKFLOW-MERGE-PLAN.md` proposal with the lean `docs/teamkit-methodology.md` ADR. NOTE: the whole workflow JS API is vendor-unpublished + research-preview — this is a legible bet on a preview surface, not a guaranteed-stable one.

- 0431888: Semi-autonomous refine, per-agent tool scoping, interrupt protocol
  - designer refine phase now semi-autonomous: self-dispatches for code exploration questions, returns to lead only for human judgment. Round tracking in refine.md header.
  - Added `tools:` frontmatter to team-designer, team-planner, team-investigator (all agents now have explicit tool scoping)
  - Added structured interrupt protocol to FRAMEWORK.md (pause/abort/report_status)
  - Updated SESSION-SCHEMA refine.md template with Source column and round tracking
  - Rewrote README to lead with agentic pipeline documentation

## 0.3.6

- **docs**: D7 resolved — empirically verified (probe, 2026-06-04) that `PreToolUse`/`SubagentStart`/`SubagentStop` hooks DO fire for `/team-kit-run` workflow agents, tagged `agent_type: "workflow-subagent"`, identical to native `Task` subagents. The 0.3.5 observability hooks therefore populate `team-session/_observability/*.ndjson` on the workflow path too — the 0.3.5 "pending D7" caveat is superseded. `team-monitor` note corrected; `workflow-subagent` is a matchable agent_type for workflow-scoped hooks.

## 0.3.5

- **feat**: git-safety deny-gate — scoped `permissions.deny` for destructive git ops (`git stash`/`reset`/`checkout`/`restore`/`clean`/`rebase`) + `rm -rf`, committed to repo `.claude/settings.json`. Excludes `commit`/`push`/`merge` (the human-gate seam — lead still does git). NOT shippable via plugin `settings.json`, which only honors `agent`/`subagentStatusLine` keys — repo-level settings are the enforcement point.
- **feat**: read-only role agents now disallow `Write`/`Edit`/`NotebookEdit` in frontmatter — enforces the read-only contract for observer/reviewer/research roles at the tool-permission layer.
- **feat**: stall/timeout env vars — `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` + `CLAUDE_CODE_MAX_RETRIES` to bound async-agent stalls and retry budgets on long workflow runs.
- **feat**: observability hooks — `PostToolUseFailure` + `SubagentStart`/`SubagentStop` write ndjson ledgers to `team-session/_observability`. Confirmed for native-subagent/`Task`; workflow-path coverage pending D7.
- **fix**: `team-kit-run` skill disallows `AskUserQuestion` — no mid-run blocking; the run drives to a `STATUS:` line without human prompts.
- **fix**: `team-planner` emits coder lanes with `permissionMode: acceptEdits`.

## 0.3.4

- **fix**: backport the rule-9 FILE+STATUS transport + try/catch abort-safety into the SAVED workflow recipes (`.claude/workflows/monorepo-health.js`, `monorepo-fix.js`). 0.3.3 fixed the SKILL prose but never the shipped recipes — heavy Check/Fix stages still schema-forced. Schema is now stripped from heavy stages (light Discover schema kept). `monorepo-health.js` Fix loop converted from a bare-`await` (mid-run abort risk after work landed) to `try/catch` + `STATUS:` parsing.
- **fix**: `monorepo-health.js` coverage assertion — fixes a false-clean when reports were silently dropped.
- **fix**: `monorepo-fix.js` is report-only by default, gated behind `args.fix` (matches the health recipe contract).
- **docs**: doc sweep — `plan.workflow.ts` → `.js` (×23 across 4 docs); D4/D5/D6/G-nit drift corrected; added AsyncFunction syntax-check guidance (`node --check` is a false gate for workflow files). Validated via an abort-safety harness. `NEEDS-VALIDATION` banners removed.

## 0.3.3

- **fix**: team-kit-run transport correction — heavy execution agents (research/coder/review/verify/finish) now return FREE TEXT + a disk artifact + a `STATUS:` line the orchestrator parses, instead of schema-forcing. A live multi-package audit hit the `StructuredOutput` defect 5× (incl. a FATAL bare-`await` abort that killed a full run _after_ all code had landed): agents doing heavy tool work reliably finish but skip the forced final tool call. Schema is now reserved for LIGHT stages (discovery/echo/tiny verdict). New rule 9 + "never bare-`await` a schema agent on the critical path." Supersedes the 0.3.2 schema-based D/E transport — the control-flow logic (reject-loop, collision-flag) is unchanged; only the handoff transport.
- **fix**: propose-then-apply writes unified-diff patches to `proposals/{name}.diff` (FILE handoff) — robust vs the schema diff-fidelity gap; apply stage reads patches + flags same-path collisions in pure JS.
- **docs**: SCHEMA-CATALOG documents the heavy-agent FILE+STATUS transport caveat.

## 0.3.2

- **fix**: codify the two previously-uncoded `team-kit-run` recovery patterns (they were prose `//` comments): the **bounded reject→re-dispatch loop** (D) and **propose-then-apply collision-flag** (E). Both proven by a deterministic sandbox harness — D rejects→threads feedback→approves→caps at 3 then hands back to the human gate; E flags same-path proposals (never clobbers) and applies disjoint diffs serially.
- **fix**: propose-then-apply now requires `diffs` (minItems 1) and flags proposers returning none — an optional `diffs` schema let coders silently drop work (caught live by the harness's first run; compliance went 2/3 → 3/3 once required).
- **docs**: SCHEMA-CATALOG `ImplResult` documents the diff-fidelity guard.

## 0.3.1

- **fix**: manifest guard — `lint` now runs `scripts/check-manifest.mjs`, which fails if `plugin.json` `agents[]` and `agents/*.md` drift. A mismatch silently breaks plugin load (it bit us before 0.3.0); the no-op echo is replaced with a real check (also run by `/monorepo-health`).
- **chore**: delete `team-templates/team-template-base.md` — unreferenced dead weight, strictly superseded by `FRAMEWORK.md` (which adds Designer, Team Monitor, Validation N+2, Workflow Execution, Model Selection, Fork Mode, Interrupt, Post-Plan Review, STATUS). base.md still taught stale `general-purpose` agents + lint/types-only finalization.
- **docs**: ultracode policy in `CLAUDE.md` — under ultracode, deterministic spans (migrations, audits, sweeps, multi-dimension review) auto-author workflows; tier mapping (saved `/command` > `team-kit-run` > ad-hoc); team-size gate as a floor, not a ceiling (don't over-orchestrate).

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
