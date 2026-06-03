# Team Kit + Workflows — Merge Plan

> Status: PROPOSAL (not yet shipped methodology). Refines the team kit (`team-templates/FRAMEWORK.md`, `PLANNER.md`, `team-kit-*` skills) to be workflow-aware. Generated from a parallel research workflow over the current kit + latest Claude Code workflows/ultracode docs.

## Decisions locked (2026-06-03)

1. **First action = verify the bridge empirically.** Namespaced `agentType` resolution from inside a workflow is the load-bearing assumption. Nothing else starts until this passes (open question #1).
2. **`plan.workflow.ts` is the sole source of truth.** `team-plan.md` is GENERATED from the script as a human-readable view — no hand-authored twin, no drift.
3. **Keep the live-team (SendMessage) path documented as the minority case.** Hybrid is default; full team/`team-session` path stays as the escape hatch for genuinely-conversational-mid-task work. Do not delete.
4. **This session = decisions + plan refinement only.** No runtime/code changes yet.
5. **No git worktrees — single-branch development (locked 2026-06-03).** Spike 2 proved workflow writers have no scope guard; worktrees were the structural fix for SAME-FILE source clobbering. Rejecting them constrains ONLY parallel same-file **source-code** edits → use single-writer or propose-then-apply for those. Everything else stays parallel: schema returns, `team-session/` artifact writes (disjoint per-agent paths), and all read-only stages. See "Single-branch write model".

## Source confidence (verified 2026-06-03)

Verified against the live official docs (`code.claude.com/docs/en/workflows` + changelog) and `github.com/shinpr/claude-code-workflows`.

- **Published docs are CONCEPTUAL ONLY — no public API reference exists.** `/docs/en/ultracode` + `/docs/en/effort` return 404. The primitive layer (`agent()`/`parallel()`/`pipeline()`/`schema`/`agentType`/`isolation`) is documented in the **Workflow tool spec given to the runtime** (authoritative contract, more detailed than public docs), NOT on the web. Treat primitive claims as HIGH confidence (tool spec) but note they are not publicly documented.
- **CONFIRMED by live docs:** JS script orchestrates subagents in background; script has no fs/shell (only agents do); intermediate results stay in script vars; resumable WITHIN session only (exit Claude Code → next session starts fresh); `args` global; ultracode = `/effort ultracode` (xhigh + auto-orchestration), session-scoped; keyword `workflow`→`ultracode` renamed at v2.1.160; no mid-run input; multi-gate = sequential workflows; v2.1.154+ research preview.
- **Soften:** `min(16, cores-2)` — public docs only say "up to 16, fewer on limited CPU". The `cores-2` arithmetic is from the tool spec, not public docs. Cap of 1000 agents/run confirmed.
- **`shinpr/claude-code-workflows` does NOT use the native feature** — it's a mature MIT plugin (415★, active) implementing the PROMPT-ORCHESTRATED predecessor paradigm (the manual-lead model we're leaving). Mine it for contracts/flow shapes, not execution model. Silent on every native-workflows blocker.

## Platform facts (net-new from live docs)

Operational facts that affect the design, confirmed against published docs:

- **Workflow subagents ALWAYS run in `acceptEdits` mode and inherit your tool allowlist, regardless of session mode — file edits auto-approved.** Implication: the back-half loses the per-implementer `mode:'plan'` gate AND edits auto-apply. Since `check-team-scope` ALSO doesn't fire (spike 2) and worktrees are rejected (decision #5), the ONLY safety left is the upfront human plan-approval (phase 7) + strictly serialized writes (single-writer / propose-then-apply).
- **MCP tools are available inside workflow agents, allowlist-gated** (non-allowlisted MCP/shell/web prompt mid-run). So cocoindex/claude-mem/context-mode should work for workflow-spawned role agents IF allowlisted — but the repo gave no proof for the workflow-`agent()` sandbox specifically, so still confirm in the bridge spike.
- **Human kill-switch exists:** `/workflows` TUI → `x` stops an agent or the whole run, `p` pause/resume, `r` restart agent, `s` save script. Works even under auto-mode/ultracode (which only skip the *launch* prompt, not the TUI controls).
- **Saved-workflow locations:** `.claude/workflows/` (project, shared/committed) or `~/.claude/workflows/` (personal). Becomes a `/<name>` command. **Project wins on name collision** → our 5 converted templates live in the plugin's `.claude/workflows/`.
- **Disable:** `disableWorkflows:true` in settings / `CLAUDE_CODE_DISABLE_WORKFLOWS=1` → ultracode removed from `/effort` menu.
- **Per-stage model override exists** (docs: "uses your session's model unless the script routes a stage to a different one") — confirms `opts.model`.
- **Run script is written to `~/.claude/projects/<session>/` and the path returned** — readable/diffable/relaunchable. Only `/deep-research` ships built-in.

## North star: native-first, role-expertise-as-payload

The whole field (incl. `shinpr/claude-code-workflows`, 415★) builds multi-agent systems by reinventing orchestration **in prompts** — an LLM coaxed to follow a markdown recipe step-by-step, hand-parsing JSON, with no determinism guarantee. We do the opposite:

- **Orchestration is the platform's job.** Control flow, fan-out, barriers, resume, structured handoff, concurrency, kill-switch — all native (`agent()`/`parallel()`/`pipeline()`/`phase()`, schema validation, `/workflows` TUI). We author ZERO custom orchestration framework. (Worktree isolation exists natively but is rejected by decision #5 — single branch.)
- **Our value is the payload, not the plumbing.** The ~17 `team-*` role agents (domain expertise, monorepo conventions, pnpm/tsconfig awareness, knowledge-MCP grounding) are what's unique. The native `agent({agentType})` bridge slots them into the spine verbatim.
- **No framework tax.** Nothing to version, no prompt-recipe to keep the model "obeying." When Claude Code ships a new workflow primitive, we inherit it free.

Every design decision below is judged against this: **does it use a native capability, or rebuild one?** If native can do it, native does it.

## Thesis

Team kit and workflows are **not competitors** — they are the STATEFUL/INTERACTIVE half and the STATELESS/DETERMINISTIC half of the same multi-agent methodology. The bridge is:

```js
agent(prompt, { agentType: 'claude-plugin-pnpm:team-coder', schema: ImplResult })
```

The kit's value lives in two separable places:
1. **Role expertise** baked into the ~17 `team-*` agent definitions — keep verbatim.
2. **Orchestration logic** wiring those roles into a lifecycle — replace the failure-prone parts (manual lead checklist, session-path string discipline, file-handoff races, LLM-judged phase advancement) with a deterministic JS workflow spine.

The split runs along the **human-gate seam**: phases needing a human decision (clarify, explore-select, present, plan-approve, file-review) stay interactive/team-style because workflows take no mid-run input; phases that are deterministic fan-out → reduce (research, implement, review, verify, finalize) become workflow stages over the SAME role agents.

## Core principle: split on the human-gate seam

| Kind | Property | Execution |
|------|----------|-----------|
| **Gated** | needs human decision mid-stream (pick approach, approve sections, answer grill, approve plan, review files) | **Interactive / in-session** (team-style). Workflows take NO mid-run input. |
| **Deterministic** | fan-out → reduce → synthesize, no human decision (research sweep, parallel implement, spec/quality/security review, lint/types/knip/test, automatable validation) | **Workflow** (code-driven JS spine over stateless role agents). |

**Default shape = HYBRID:** interactive front-end produces an approved plan → executed as a resumable background workflow. Pure-deterministic jobs (audits, migrations, research) = full workflows. Tiny tightly-coupled fixes = single agent, no orchestration.

## The bridge mechanics

- **agentType reuses role expertise verbatim** — resolves the SAME subagent registry as `Agent`/`Task`. Zero rewrite of the 17 agent `.md` files; the workflow is just a new driver over them. **CONFIRMED (spike 1):** `agentType:'claude-plugin-pnpm:team-coder'` loaded the team-coder system prompt verbatim ("You are a coder on a development team…"); a control agent with no agentType was generic. `agentType` + `schema` compose.
- **Tool grant rule (CONFIRMED spikes 1+1b+1c — DEFINITIVE):** the workflow harness gives a custom agentType a **FIXED whitelist**: `Read, Bash, Write, Edit (only if the role grants it), Skill, StructuredOutput`. **Frontmatter can only FILTER within that whitelist — it cannot ADD tools.** Declared `mcp__*` grants, `Glob`, `Grep`, and `ToolSearch` are ALL dropped (adding `ToolSearch` to researcher.md changed nothing). Only the **default** workflow agent (no agentType) carries `ToolSearch` → can load any deferred tool incl. all MCP on demand (reached `ctx_stats`, no prompt). Verified by reload + retest.
- **Knowledge-grounding design (LOCKED — path A):** raw MCP is unreachable from custom role agents; resolved by routing knowledge to the default agent:
  - **Research / investigation / knowledge-planning stages** → run as the **DEFAULT workflow agent** (full ToolSearch→MCP) with role instructions injected via prompt + a `Skill('investigation-methodology')` call. Full cocoindex/claude-mem/context-mode reach.
  - **Implement / review / verify / finalize stages** → **custom agentType** (team-coder/team-reviewer/team-verifier) directly — proven, no raw-MCP need.
  - **In-role knowledge fallback:** a custom role agent that needs a one-off lookup mid-stage uses the Skill wrappers `ccc` / `mem-search` / `context-mode` (Skill tool IS present) or `Bash` ripgrep. Heavier than raw MCP but functional.
  - **(rejected) C:** frontmatter `ToolSearch`/MCP grants on custom roles — proven inert by spike 1c.
- **schema replaces write-findings/read-findings** for the common case. Tool-validated JSON (retry-on-mismatch) flows through JS variables; intermediate results never enter main context. **Handoff rule:** schema for DATA; `team-session/` file (path passed IN the schema) only for BULK artifacts a downstream agent must read in full.
- **Single-branch write model (LOCKED — no worktrees).** The clobber risk is **same-FILE concurrent writes**, NOT parallel writes in general. Three write types, only one needs care:
  - **Type 1 — schema return data (primary handoff):** not a file write; flows through JS variables. Always parallel-safe, never touches the filesystem.
  - **Type 2 — `team-session/` artifact files (each agent → its OWN path):** **parallel-SAFE.** Disjoint paths (`coder-X/progress.md`, `reviewer/review-T3.md`) never collide; `check-team-scope` hard-allows `*/team-session/*` regardless. This is the current-kit model and stays fully parallel.
  - **Type 3 — source-code edits (real repo files under `packages/...`):** the ONLY risk, and only when two writers hit the **same** file. Spike 2 proved no scope guard fires in workflows, and worktrees are rejected (decision #5), so there's no structural backstop. Handle via:
    - **disjoint file-ownership + trust** → parallel source writes to non-overlapping files (current-kit model); caveat: a stray out-of-lane agent clobbering a peer is UNDETECTED (no hook in workflows).
    - **single-writer** → serial `pipeline`, one source-writer at a time. Simplest, fully safe.
    - **propose-then-apply** → parallel coders RETURN diffs (`{path, newContent|unifiedDiff}`) as schema data, one sequential apply stage writes + flags same-file collisions. Parallel reasoning, serial mutation, conflict-detectable.
  - Read-only stages (research, all reviews, verify) + all type-1/type-2 writes → full parallel fan-out. Only same-file type-3 edits are constrained.
- **planner emits a WORKFLOW SCRIPT as sole source** — `plan.workflow.ts` is canonical: file-ownership matrix → per-agent thunks, blockedBy → stage ordering, phases → `phase()` groups, verify cmds → final stage. `team-plan.md` is GENERATED from the script as a read-only human view — no drift.
- **SendMessage review loops become verify stages** — QB/spec-reviewer/quality-reviewer/security-auditor are read-only reviewers → sequential verify stages returning `{verdict, issues[]}`. Reject → bounded re-dispatch (max 3) with issues fed back. STATUS protocol → schema presence + thunk-throw→null + `.filter(Boolean)`.
- **ultracode makes workflow-per-deterministic-phase the default** — `/effort ultracode` flips kit policy: deterministic spans auto-author a workflow; token cost stops being a planning variable.
- **workflow() composition mirrors template nesting** — standalone templates become saved workflows with `export meta` → `/<name>` slash commands, parameterized via `args`, composed one-level-deep.

## Decision matrix

| Scenario | Use | Why |
|----------|-----|-----|
| Small fix (1-3 files, tight coupling) | **team** (single agent) | No fan-out to fan out; orchestration is pure tax. Team-size gate already redirects here. |
| Large feature (10+ files, multi-module, needs approved spec) | **hybrid** | Front half (clarify/explore/present/plan-approve) = human gates → interactive. Back half = workflow: **serial implement (single-writer) or propose-then-apply**, then PARALLEL review + verify. |
| Codebase audit / review (100+ files, read-only) | **workflow** | Pure breadth fan-out → reduce → synthesize, no human gate, no shared state. Beats a team: no SendMessage, no session-path, no race. |
| Migration across N sites (mechanical) | **workflow** | parallel team-coder per site each RETURNS a diff (propose-then-apply), single apply stage writes sequentially + flags collisions; or serial pipeline if sites touch shared files. Resumable via journal. No worktrees. |
| Open-ended research / investigation | **workflow** | fan-out search → adversarial-verify → synthesize, loop-until-dry. team-researcher/investigator as agentType. |
| Iterative design needing human gates | **team** | Workflows take NO mid-run input. Every designer phase is a synchronous human decision → stays interactive. |

## Lifecycle (merged)

| Phase | Execution | How |
|-------|-----------|-----|
| 0. Persist prompt | in-session | write prompt.md; pass raw prompt + slug timestamp into workflows via `args` (Date.now() throws in workflows). |
| 1a. Clarify | in-session | designer(clarify) Q&A loop. Human gate. |
| 1b. Explore | hybrid | optional judge-panel workflow drafts N approaches; human SELECTS in-session. |
| 1c. Present | in-session | 5-section approval loop. Human gate. |
| 1d. Write requirements | workflow/agent | single agent synthesizes approved inputs → requirements.md. |
| 2. Research | **workflow** | parallel knowledge agents over entry-points/data-flows/coupling; reduce → findings.md. **Use the DEFAULT agent + injected researcher prompt + `Skill('investigation-methodology')` — NOT `agentType:team-researcher`, which can't reach MCP (spike 1c).** Biggest token+latency win vs single scout. |
| 3. Refine | hybrid | code-answerable branch = fan-out verify workflow; human-judgment branch = in-session gate; bounded loop. |
| 4. Design + Plan | hybrid | team-planner agent → design.md AND `plan.workflow.ts`; self-review = verify stage over the script. |
| 5. Present design | in-session | section-by-section approval. Human gate (sign-off boundary). |
| 6. Plan review | **workflow** | team-plan-reviewer as adversarial / perspective-diverse verify → {verdict, blocking[]}. |
| 7. File review gate | in-session | human approves files → **launch `plan.workflow.ts`** (replaces spawn prompt). |
| E0. Setup | **eliminated** | no TeamCreate/delegate/TaskCreate/session-path. Runtime IS the setup; blockedBy → JS ordering. |
| E1..N. Implement | **workflow** | agentType:'team-coder'. **Single-writer: serial pipeline over modules (no parallel writes).** Or propose-then-apply: parallel coders return diffs → one apply stage writes + collision-checks. No worktrees. |
| E*. Review | **workflow** | sequential verify: spec-review THEN quality-review (+security/audit); reject → bounded re-dispatch with issues fed back. |
| EN+1. Finalize | **workflow** | parallel pnpm-lint/types/knip/test (sonnet via opts.model); knip → {realIssues, suspectedFalsePositives}; loop-until-clean. |
| EN+2. Validate | hybrid | automatable AC → verify-workflow returning AC-evidence table; manual/UI → in-session. |
| EFinal. Teardown | **eliminated** | stateless agents self-terminate on return; summarize-session = final synthesize stage over run data. |

## Multi-gate features = several sequential workflows

Because a workflow takes no mid-run input, a feature with multiple human gates becomes a SEQUENCE of workflows with gates living in the interactive session BETWEEN runs:

`research-workflow` → (human picks approach) → `plan-workflow` → (human approves) → `implement+review+verify-workflow` → (human validates UI)

## Reusable execution library (planner composes these)

- `implementStage(modules)` — SERIAL pipeline of team-coder (single-writer), or `proposeApplyStage` (parallel coders return diffs → one apply stage). No worktrees.
- `reviewStage(changes)` — spec-review then quality-review (sequential), perspective-diverse option for confidence-critical changes.
- `finalizeStage(packages)` — parallel pnpm-lint/types/knip/test on sonnet, loop-until-clean.
- `validateStage(acs)` — AC-evidence schema for automatable criteria.

## Patterns mapped to old roles

| Old mechanism | Workflow pattern |
|---------------|------------------|
| Background scout (single team-researcher) | multi-source sweep (fan-out → reduce) |
| QB approve/reject via SendMessage | verify stage returning {verdict, issues[]} |
| spec-reviewer before quality-reviewer | two sequential verify stages (ordering preserved) |
| team-investigator hypothesis-one-at-a-time | loop-until-dry over team-investigator |
| deep-clean QB-dispatches-subagents | pipeline one agent per file + completeness-critic |
| recovery max-3-respawns | bounded JS retry counter, issues fed back into re-dispatched thunk |

## Mine from shinpr/claude-code-workflows (contracts/flow, NOT execution)

That repo is the prompt-orchestrated paradigm we're replacing — but its contracts and flow shapes are battle-tested. Lift these:

| Adopt | What | Why | Effort |
|-------|------|-----|--------|
| **Centralized agent-contract table** | One doc listing each role-agent's return discriminants the orchestrator branches on (their `subagents-orchestration-guide`). Port their enum vocab into our handoff schemas. | Our schemas are locked; their enums are proven: `escalation_type` (7 values), `stub_detected` + `incompleteImplementations[]`, quality `blocked.reason`, `verdict.decision` (approved/approved_with_conditions/needs_revision/rejected). | S |
| **Named failure modes** `stub_detected` / `escalation_type` routing back to coder w/ `incompleteImplementations[]` | Concrete reject reasons for team-coder ↔ team-verifier loop instead of generic "needs fixes". | S |
| **Re-run ONLY failed verifiers** convergence loop | Their `recipe-build`: consolidate findings → fix → re-run only the failed gate, repeat until pass/blocked. | Cuts cost/latency in our finalizeStage vs re-running whole gate. | S |
| **Mermaid state-machine as the generated artifact** | Emit a Mermaid DAG (not just prose) FROM `plan.workflow.ts`. | Fits our "markdown generated from script" decision; gives reviewers at-a-glance flow at the file-review gate. | S-M |
| **Scale-gated process dial** (Small 1-2 / Medium 3-5 / Large 6+ files) | Deterministic "how much process" keyed off blast radius — which docs/review stages are mandatory. | Maps onto our team-size gate + when pipeline includes spec-review vs skips. | S |
| **Tri-state readiness marker** (`ready`/`escalated`/`pending`/`absent`) in the plan | File-backed resume/preflight branch — proceed / surface gaps / require preflight. | Complements our within-session journal with a durable cross-session marker (journal dies on exit). | M |
| **`disable-model-invocation: true` on entry skills** | Recipes are explicit `/command` only, never auto-triggered. | Apply to our converted template workflows — no accidental auto-fire. | S |

**Do NOT copy:** their orchestrator-persona execution model (the non-determinism we're leaving), generic role names, or assume worktree/pnpm behavior — they have neither.

## Migration steps

1. **[FIRST — gates everything] Verify the bridge empirically:** throwaway workflow calling `agent(prompt, { agentType: 'claude-plugin-pnpm:team-coder', schema })`. Confirm the namespaced subagent registry resolves from inside a workflow AND that MCP/knowledge tools (cocoindex, claude-mem, context-mode) survive the runtime. **No other step starts until this passes.**
2. Add a **Workflow Execution** section to FRAMEWORK.md declaring the human-gate seam as the canonical hybrid default. (Fold the duplicated FRAMEWORK vs team-template-base sections + the two Model Selection sections while editing — pre-existing debt.)
3. Define a canonical handoff-schema set (ResearchFindings, ImplResult, ReviewVerdict, VerifyReport, ACEvidence). Document: schema for data, team-session/ path-in-schema for bulk only.
4. Teach team-planner to emit `plan.workflow.ts` as the SOLE plan source of truth; `team-plan.md` is GENERATED from the script as a human-readable view (no hand-authored twin). Keep no-placeholders + type-consistency self-review, now applied to a real script. Build the script→markdown generator as part of this step.
5. Build a reusable execution workflow library (implementStage/reviewStage/finalizeStage/validateStage). Planner composes these instead of bespoke orchestration each time.
6. **Convert the 5 standalone templates first** (monorepo-health, deep-clean, knip-audit, debug-investigation, migrate-scripts) → saved workflows with `export meta` → `/<name>`, parameterized via args. No human gate, pure fan-out → safest first conversions, 100% of the benefit. Ship BEFORE touching the gated pipeline.
7. Rewrite team-kit-create's tail: replace 'deliver spawn prompt' + E0 manual checklist with 'launch plan.workflow.ts'. Front-end skills stay interactive.
8. Encode review/recovery loops as deterministic JS: reject → re-dispatch thunk with issues fed back, max 3 as a counter. Retire SendMessage for the back half.
9. Add ultracode policy guidance to CLAUDE.md: deterministic spans auto-author workflows; multi-gate features = sequential workflows; token cost accepted-by-design.
10. Deprecation pass: mark E0 setup checklist, session-path injection, team-session/ symlink fallback as legacy-only (live-team path). Keep full team/SendMessage path documented for the genuinely-interactive minority.
11. Update CHANGELOG/README + bump version; resolve the stale Arcana reference (team-kit-create researcher dispatch + CHANGELOG 0.1.0) → CocoIndex+claude-mem. Surface the N+2 Validation phase in the pipeline flowchart.

## Verification methodology (prove every change works)

Native-first only counts if we PROVE the native capability does what we claim. Every change ships with a verification workflow — we never assume.

**Interactive verify loop** (user present to reload):
1. Make change (edit agent `.md` / skill / plan).
2. **Reload** — user reloads the plugin/skills (or restarts the session) so the runtime picks up the edit.
3. Re-run the matching verification workflow.
4. Compare schema-validated output to expected — A/B vs a **control agent** where the question is "did the platform do X". Pass → proceed; fail → fix, repeat.

**Why workflows verify cleanly:** schema-forced output = machine-checkable proof, not vibes; control-agent A/B isolates platform behavior from model claims; runs are cheap, backgrounded, resumable.

**Spike ladder** (each gates the next):

| # | Spike | Proves | Status |
|---|-------|--------|--------|
| 1 | **Bridge** | namespaced `agentType` resolves our role agent verbatim; schema composes; MCP not stripped (default agent reached ctx_stats via ToolSearch) | ✅ **PASS** — tool-grant rule discovered |
| 1b | MCP grant | does a role agent that DECLARES `mcp__*` (team-researcher) get those callable inside a workflow | ✅ **PASS (negative)** — declared MCP STRIPPED; custom agents get no ToolSearch, no raw mcp__*, no Glob/Grep; only default agent reaches MCP (via ToolSearch) |
| 1c | ToolSearch grant | (reloaded + retested) does adding `ToolSearch` to a role frontmatter unlock MCP for custom agentTypes | ❌ **FAILED** — frontmatter CANNOT add tools outside the harness whitelist; researcher still got only Read/Bash/Write/Skill. Edit reverted. → adopt path A |
| 2 | Hook fire | does `check-team-scope` guard workflow writers | ❌ **NO** — out-of-scope `/tmp` write SUCCEEDED, no interception, no denial. PreToolUse scope guard INACTIVE for workflow agents → **worktree isolation mandatory** |
| 3 | ~~Worktree×pnpm~~ | — | 🚫 **DROPPED** (decision #5: no worktrees) |
| 4 | End-to-end | a tiny real task through `implementStage (single-writer) → reviewStage → finalizeStage` produces correct, reviewed, lint-clean output on one branch | pending |

**Acceptance rule:** no migration step proceeds until its spike passes. Spike 1's result rewrites this plan's "still unverified" claims into facts — or kills the thesis.

## Risks

- **agentType registry resolution inside a workflow is the load-bearing assumption.** If namespaced types don't resolve from the workflow runtime, the whole bridge collapses. Verify FIRST.
- Loss of mid-run human gates: a wrong approach burns the full bounded-retry budget before surfacing. Mitigate with strong upfront plan-approval + fast-failing first review stage.
- **Workflow agents auto-acceptEdits AND check-team-scope is inactive (BOTH confirmed, spikes 1+2).** A workflow agent can write anywhere, unguarded. This only bites for **same-file source edits** (types 1+2 are collision-free). With worktrees rejected (decision #5), there's no structural backstop, so **parallel source writers must be on disjoint files** — and a stray out-of-lane agent clobbering a peer is UNDETECTED. Safety boundary = phase-7 plan approval + planner-enforced disjoint ownership, or single-writer/propose-then-apply when same-file edits are possible.
- Propose-then-apply adds an apply/reconcile stage; two coders proposing edits to the SAME file is a real conflict the apply stage must detect + surface (not auto-merge).
- Determinism constraints (no Date.now/Math.random/argless new Date) break naive ports of any timestamping/randomizing prompt.
- Resume is WITHIN-session only — a crashed session loses the journal; long migrations gain less resilience than they appear.
- Schema rigidity: nuanced reviewer judgment (QB's whole value) may flatten into checkbox theater under {verdict, issues[]}.
- Role/agent sprawl NOT solved — planner still picks from 17 agentTypes; a script makes mis-selection harder to spot than readable team-plan.md.
- ~~Two plan artifacts reintroduce drift~~ — RESOLVED: `plan.workflow.ts` is sole source, `team-plan.md` generated from it. New cost: a script→markdown generator to build + maintain.
- Concurrency cap (min(16, cores-2)) silently serializes a "parallel" plan on low-CPU machines; token cost still multiplies.
- Ultracode-everywhere can over-orchestrate trivial tasks; needs the team-size gate as a hard floor.

## Open questions

**RESOLVED:**
- ~~plan-artifact drift~~ → script sole source + generated markdown.
- ~~live-team path~~ → kept as documented minority.
- ~~human kill-switch on a runaway run~~ → `/workflows` TUI `x` stops agent/whole run (works under auto/ultracode); pair with `budget.total` guard on loops.
- ~~resume across front-end gates~~ → by design: each gated stage is a SEPARATE workflow run with its own journal; resume is within-session only, no cross-run replay. Approved-spec context must pass via `args` / a written artifact path, not journal.

**RESOLVED (spikes 1 + 1b, 2026-06-03):**
- ~~Does the subagent registry resolve namespaced agentTypes inside a workflow?~~ → **YES.** `claude-plugin-pnpm:team-coder` loaded verbatim; control was generic; `agentType`+`schema` compose. Bridge confirmed; native-first thesis holds.
- ~~Do custom role agents get their declared MCP inside a workflow?~~ → **NO.** Harness strips `mcp__*`/Glob/Grep/ToolSearch from custom agentTypes; only the default agent reaches MCP (via ToolSearch). Knowledge access for role agents = Skill-indirection or default-agent path (design choice below).

- ~~Knowledge-grounding path~~ → **LOCKED: path A.** Knowledge stages = default agent + ToolSearch + injected role prompt + `Skill('investigation-methodology')`. Execution stages = custom agentType. In-role lookups = Skill wrappers. (C disproven by spike 1c.)

- ~~Do plugin hooks guard workflow writers?~~ → **NO (spike 2).** `check-team-scope` did not block an out-of-scope write; PreToolUse scope guard inactive for workflow agents. **Worktree isolation is the only write guard — mandatory for parallel-writer stages.** (SubagentStop STATUS-protocol hook likewise assumed inert — fine, schema-return replaces it.) Academic sub-point left open: hooks-don't-fire-at-all vs fire-but-agent_name-empty — either way unreliable.

- ~~Worktree×pnpm behavior~~ → **N/A (decision #5: no worktrees).** Single-branch single-writer / propose-then-apply instead.

**NEXT ACTION:** spike 4 (end-to-end, single-writer) — only remaining verification.

1. **[spike 4]** Run a tiny real task through serial implement → parallel review → finalize on one branch; confirm propose-then-apply (or single-writer) produces correct, reviewed, lint-clean output and that the apply stage flags a deliberate same-file collision.
2. Where does the interactive front-end hand off to the background workflow — what exactly must pass through `args` vs a written artifact path to preserve approved-spec context?
3. Fork mode (~10x cache discount) vs workflow stateless agents — mutually exclusive, or can workflow agents fork-inherit? Affects back-half cost.
