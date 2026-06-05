# Team Kit × Workflows — methodology & decision record

> **Operational source of truth = the skills**, not this file: `skills/team-kit-create/SKILL.md` (PLAN), `skills/team-kit-run/SKILL.md` (EXECUTE — the 14 hard rules + stage templates), `team-templates/{FRAMEWORK,PLANNER,SCHEMA-CATALOG}.md`. This doc is the **design rationale + verification evidence + decision log** (an ADR). It distills the former `WORKFLOW-MERGE-PLAN.md` (a 342-line proposal, now implemented and removed). Dated empirical claims — re-verify after each Claude Code upgrade.

## North star
Native-first orchestration, **role-expertise-as-payload**. The platform's `Workflow` tool owns all control flow (fan-out, barriers, resume, schema handoff, concurrency, kill-switch). We author ZERO custom orchestration framework. Our value is the ~17 `team-*` role agents (monorepo/pnpm/knowledge-MCP expertise), slotted into the native spine via `agent(prompt, { agentType: 'claude-plugin-pnpm:team-coder', schema })`.

## The two halves, split on the human-gate seam
- **Gated** (clarify → explore → present → plan-approve → file-review, + all prod/irreversible/paid actions): interactive, in-session → `team-kit-create`. Workflows take no mid-run input.
- **Deterministic** (research → implement → review → finalize → validate): native `Workflow` stages over the role agents → `team-kit-run`.

Default shape = HYBRID (interactive front-end → approved plan → background workflow). Pure-deterministic work (audits/migrations/research) = full workflow. Tiny coupled fix = single agent.

## The committed derived-spine (Option B — the plan.workflow.js model)
- `team-plan.md` (from `team-kit-create`) is the **canonical GROUND TRUTH**.
- `plan.workflow.js` is **DERIVED from it (md→js) by an LLM** in `team-kit-run` mode-1 — NOT a hand-coded generator. The deriver reads the live rules + the md and authors a current-valid script; nothing brittle to maintain. md changes → re-derive. The `.js` is a re-derivable build artifact, never a hand-edited source.
- This **supersedes the original decision #2** (js sole-source + a js→md generator), which was brittle on a research-preview API.
- **Trust gate = two axes** (both must pass before the derived script is run/committed):
  - **Axis A — structural/safety (deterministic):** `scripts/validate-workflow.mjs` — syntax (wrapped `node --check`), `export const meta`, determinism/forbidden-API scan, conditional invariant lint (coverage after `parallel()`, `tryAgent` on `await agent()`), prod-gate deny-scan. Self-tested (`pnpm -F @adddog/claude-plugin-pnpm test`).
  - **Axis B — semantic fidelity (LLM):** `team-spec-reviewer` + the `AlignmentVerdict` schema (SCHEMA-CATALOG §6) — does the `.js` faithfully implement the plan/design md? `{covered, missing, invented, verdict}`.
  - Fail → re-derive with gaps fed back (max 3; escalate to human on BLOCKED). First derivation per plan = human-approved before first run.

## Verified platform rules (dated 2026-06-05, runtime research-preview v2.1.154+)
The JS workflow API (`agent`/`parallel`/`pipeline`/`phase`/`schema`/`agentType`/`resumeFromRunId`) is **vendor-unpublished** → every rule is a dated empirical claim. Full detail + stage templates: `skills/team-kit-run/SKILL.md`.

| # | Rule | Evidence |
|---|------|----------|
| Bridge | `agent({agentType:'plugin:role'})` loads the role agent verbatim; composes with `schema` | spike 1 |
| 2 | Custom agentType in the workflow sandbox = `{Read,Bash,StructuredOutput}` + role-filtered `{Write,Edit,Skill}`. Zero `mcp__*`/ToolSearch/Glob/Grep | probed 5 types |
| 3 | Only the DEFAULT agent reaches MCP — via inheritance AND ToolSearch | probe |
| 4 | Workflow agents auto-`acceptEdits`; scope-guard did NOT block an out-of-scope write → serialize same-file writes, don't trust hooks | probe (write succeeded) |
| 6 | `resumeFromRunId` = 100% cache ONLY on byte-identical args+script (0 tok/5ms); any arg change re-runs broadly | probe `wf_1d2dd417-323` |
| 9 | Schema is RELIABLE (4/4 heavy agents returned); STATUS-line+artifact stays the default for lean context, not because schema breaks | probe |
| — | `pipeline()` no-barrier, serial single-writer (no clobber), mutating writes through a workflow | probe |

Knowledge routing (**path A**): knowledge stages run as the DEFAULT agent (ToolSearch→MCP) with the role injected; execution stages use custom `agentType`. The `ccc`/`mem-search`/`context-mode` Skill wrappers CANNOT bridge to MCP inside a custom agent — only Bash/ripgrep survive there.

Write model (single branch, no worktrees): schema returns + per-agent `team-session/` writes (disjoint paths) are parallel-safe; SOURCE edits = single-writer (serial) or propose-then-apply; never parallel same-file writers (disjointness pre-flight, no hook backstop).

## Decision log
1. Verify the `agentType` bridge first → PASS.
2. ~~`plan.workflow.js` = sole source + js→md generator~~ → **SUPERSEDED** by the md→js LLM derivation + two-axis gate (Option B, built 2026-06-05).
3. Keep the live-team (SendMessage) path as a documented minority escape hatch.
4. No git worktrees — single-branch development (hard, user-settled).
5. Reconsolidation 2026-06-05: re-verified rules 2/3/4/6/9 (9 refuted→softened; 2/3/4 confirmed+reframed); collapsed the 3 `plan.workflow.js` ontologies → one; killed phantom/line-number refs; added the version-fragility banner.

## Reproducibility tiers
saved `/command` workflow  >  derived+validated+committed `plan.workflow.js` (mode-1)  >  ad-hoc orchestrator-authored (mode-2).

## Deferred
Grant `team-planner`/deriver `Workflow`+`StructuredOutput` (self-derivation smoke-test) · resume/args `undefined`-path hardening · lightweight research/audit lane · optional read-only dry-run before mutating stages · first true end-to-end mode-1 run (supervised, gated by human-approve-first-run).
