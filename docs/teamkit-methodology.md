# Team Kit × Workflows — methodology & decision record

> **Operational source of truth = the skills**, not this file: `skills/team-kit-create/SKILL.md` (PLAN), `skills/team-kit-run/SKILL.md` (EXECUTE — the hard-rules table + stage templates), `team-templates/{FRAMEWORK,PLANNER,SCHEMA-CATALOG}.md`. This doc is the **design rationale + verification evidence + decision log** (an ADR). Platform claims re-baselined 2026-10-11 against CC 2.1.296; rows tagged **probe-only** in the Evidence column have no doc or changelog behind them; the re-verify-on-upgrade list itself lives once, in the `skills/team-kit-run/SKILL.md` CONTRACT STATUS banner.

## North star
Native-first orchestration, **role-expertise-as-payload**. The platform's `Workflow` tool owns all control flow (fan-out, barriers, resume, schema handoff, concurrency, kill-switch). We author ZERO custom orchestration framework. Our value is the 16 `team-*` role agents (monorepo/pnpm/knowledge-MCP expertise), slotted into the native spine via `agent(prompt, { agentType: 'team-coder', schema })`.

## The two halves, split on the human-gate seam
- **Gated** (clarify → explore → present → plan-approve → file-review, + all prod/irreversible/paid actions): interactive, in-session → `team-kit-create`. Workflows take no mid-run input.
- **Deterministic** (research → implement → review → finalize → validate): native `Workflow` stages over the role agents → `team-kit-run`.

Default shape = HYBRID (interactive front-end → approved plan → background workflow). Pure-deterministic work (audits/migrations/research) = full workflow. Tiny coupled fix = single agent.

## The committed spine (the plan.workflow.js model) — native author → lint → save
- `team-plan.md` (from `team-kit-create`) is the **canonical GROUND TRUTH**.
- `plan.workflow.js` is the workflow **Claude AUTHORS from it** in `team-kit-run` mode-1. This IS the native Claude Code model — "Claude writes the script, you save it" — not a bespoke pipeline. The orchestrator already holds `team-plan.md` in context; it authors the script inline, then saves it. md changes → re-author. The `.js` is a re-authorable BUILD ARTIFACT, never a hand-edited source, and **not load-bearing infra**.
- This **supersedes the original decision #2** (js sole-source + a js→md generator) — no generator is built or wanted.
- **Guardrails (NOT correctness gates):**
  - **Axis A — advisory lint** (`scripts/validate-workflow.mjs`): syntax (wrapped `node --check`), `export const meta`, determinism/forbidden-API scan, conditional invariant lint (coverage after `parallel()`, `tryAgent` on `await agent()`), prod-gate deny-scan. Self-tested (`node .claude/scripts/validate-workflow.mjs --selftest`; also run by `pnpm -F @adddog/claude-plugin-pnpm test`). Its platform checks restate documented runtime rules (`workflows.md` → Edit a saved script, Behavior and limits); coverage/`tryAgent`/prod-gate are team-kit policy. **Advisory; NOT a guarantee.**
  - **Axis B — optional fidelity check:** `team-spec-reviewer` + `AlignmentVerdict` (SCHEMA-CATALOG §6) for high-stakes plans; skip small/obvious ones.
- **Status:** the machinery — the advisory lint, the mode-1 procedure, the `AlignmentVerdict` schema — is shipped and exercised: real runs have authored, linted and run `plan.workflow*.js` (e.g. `team-session/20260902-moirai-gap-closure/`, `team-session/20260925-crawl-stack-revival/`). The workflow API is a **documented contract** (`code.claude.com/docs/en/workflows.md`; Workflow entry in the Agent SDK TypeScript reference; bundled `/workflow-authoring` skill since 2.1.248). Durable bets: the role agents, the md ground-truth, the human-gate seam. Disposable: the mode-1 ceremony and any probe-only rule below.

## Platform rules (re-baselined 2026-10-11, CC 2.1.296)
Authority = the docs; `skills/team-kit-run/SKILL.md` holds the operational rules + stage templates. This table records only the evidence behind each.

| # | Rule | Evidence |
|---|------|----------|
| Bridge | `agent({agentType:'team-coder'})` loads the role agent verbatim (bare names post plugin→`.claude/` migration); composes with `schema` | spike 1; documented `agentType` opt |
| 2 | Custom agentType toolset = role frontmatter. Frontmatter `mcp__*` globs project; a frontmatter `ToolSearch` grant arrives and defers them. `Glob`/`Grep` in a `tools:` line that also lists `Bash` are not delivered — by design on native macOS/Linux builds, search runs as embedded `bfs`/`ugrep` via Bash | **probe-only** (glob projection + `ToolSearch` defer): probes 2026-08-03 (`wf_f6675267-c10`), 2026-09-04; Glob/Grep half: changelog 2.1.117 |
| 3 | MCP reaches agents on BOTH lanes: a plain background native dispatch (`team-measurer`) sees its frontmatter's `mcp__playwright__*` tools as deferred and `ToolSearch` loads their schemas | **probe-only** (deferred + `ToolSearch` load): probe PR-2 2026-10-11 (schema load only — a live call was not exercised); MCP retained: `sub-agents.md` (background subagents keep every MCP tool) |
| 4 | Workflow agents inherit the session permission mode (bypass/acceptEdits/auto pass through). Lifecycle hooks fire for workflow agents (`SubagentStart`/`SubagentStop` carry `agent_type`: the custom agentType, else `workflow-subagent`). The 2026-06-05 unblocked out-of-scope write is explained by a dead project hook (`check-team-scope` keyed on an absent `agent_name`, so it never blocked); PreToolUse firing inside a workflow agent is not separately probed at 2.1.296 → writes still need a discipline (disjoint ownership), not a hook | permission inheritance: `workflows.md` → Approve the plan; `sub-agents.md` → Permission modes. **probe-only** (hook firing + `agent_type` values): probes PR-3b/PR-4 2026-10-11 (`team-session/_observability/lifecycle.ndjson`) |
| 6 | Resume is same-session: a relaunch replays saved results until the first agent whose prompt differs, then re-runs that agent and every later one; a failed agent re-runs with everything started after it. A `claude --resume`d or backgrounded session can replay; a fresh session starts a new run; a missing journal fails with `nothing to resume` (2.1.265) | `workflows.md` → Resume after a pause; changelog 2.1.265 |
| 9 | Schema is reliable: unsatisfiable schemas rejected before the agent starts (2.1.260); validation retried up to 5× (`MAX_STRUCTURED_OUTPUT_RETRIES`). STATUS-line+artifact stays the default for lean context, not because schema breaks | `workflows.md` → What the saved script looks like; changelog 2.1.260 |
| — | `pipeline()` no-barrier, serial single-writer (no clobber), mutating writes through a workflow | **probe-only** |
| 16 | Subagent Write guard denies `.md` basenames starting `findings`/`report`/`summary`/`analysis` (BOTH lanes; Bash unintercepted). Undocumented, version-fragile. Researcher artifacts named `research-findings*.md`; write-denial protocol (`team-session-writing`) is the standing backstop | **probe-only**: probes 2026-08-03/04 (`wf_f161857a-342`, `wf_24219667-1c1`, `wf_b3666818-85c`); 2.1.296 binary regex |
| — | Plan and token audit: `hooks/record-plan-usage.mjs` (`SubagentStop`) appends to `team-session/_observability/plan-usage.ndjson` from the finished transcript and prints nothing, so it adds no tokens. Read it through `hooks/plan-usage-report.mjs [<session>]`, never raw. The lead is not logged | live probe 2026-11-04 |

Cost: siblings sharing model + effort + agentType + tools + schema + cwd share a cached prompt prefix (fan-out stagger `CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS`, default 5000, since 2.1.229; cache TTL 5m, `subagentPromptCacheTtl: 1h` option) — so every per-stage model/effort split forms a separate cache group (`workflows.md` → Prompt caching in a fan-out).

Knowledge routing: any role reaches MCP through frontmatter `mcp__*` globs (+ `ToolSearch` for the deferred path), on either lane; Bash/`rg`/`ccc` work everywhere. The 2026-08-01 claim that the `context-mode` Skill wrapper cannot bridge to MCP inside a custom agent is unprobed at 2.1.296.

Write model (single branch, no worktrees): schema returns + per-agent `team-session/` writes (disjoint paths) are parallel-safe; SOURCE edits = single-writer (serial) or propose-then-apply; never parallel same-file writers (disjointness pre-flight, no hook backstop).

## Decision log
1. Verify the `agentType` bridge first → PASS.
2. ~~`plan.workflow.js` = sole source + js→md generator~~ → **SUPERSEDED** by the native author→lint→save model — Claude authors the script from the md, an advisory lint guards, native save persists (no generator, no derivation pipeline).
3. Live-team (agent teams / SendMessage) path RETIRED 2026-07-17 — team-kit runs only on the Agent-tool (create) and Workflow (run) lanes. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is removed from project `.claude/settings.json`, but `~/.claude/settings.json` on this machine still sets it `=1` (env blocks merge), so agent teams are live in sessions here (still flag-gated per changelog 2.1.178). Team-kit dispatches never pass `name:` — a named Agent call launches a teammate, not a subagent, unless it is a fork or passes `isolation` on the call itself (`sub-agents.md` → Subagent names); a teammate skips `skills:` preload and is not the team-kit path. Dispatch plain `subagent_type`.
4. No git worktrees — single-branch development (hard, user-settled).
5. Reconsolidation 2026-06-05: collapsed the 3 `plan.workflow.js` ontologies → one. Re-baseline 2026-10-11 (CC 2.1.296): platform table rewritten against the published docs + probes PR-1..PR-4.

## Reproducibility tiers
saved `/command` workflow  >  authored+linted+saved `plan.workflow.js` (mode-1)  >  ad-hoc orchestrator-authored (mode-2).

The mode-1 author is always the main-session orchestrator: subagents never receive `Workflow` (`sub-agents.md` → Available tools, first filter), so a workflow cannot be authored or launched from inside a subagent.

## Deferred
resume/args `undefined`-path hardening · lightweight research/audit lane · optional read-only dry-run before mutating stages.
