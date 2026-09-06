---
name: team-kit-run
description: "Execute a task as a native-workflow multi-agent run over the team-kit role agents. Reproducible, single-branch, prod-safe orchestration. Also covers the opt-in Codex execution lane — delegating a verify stage to an OpenAI Codex worker instead of a Claude subagent. Triggers: team-kit-run, run the team, execute the team plan, run the workflow team, orchestrate as a workflow, run plan.workflow, execute multi-agent workflow, fan out the team, delegate verify to codex, run the verify on codex, use the codex lane, codex delegation, team-codex-verifier"
disallowed-tools: AskUserQuestion
---

# /team-kit-run — Execute work as a native-workflow multi-agent run

Companion to `team-kit-create`. `create` PLANS (interactive, human-gated). `team-kit-run` EXECUTES — it drives the team-kit role agents through the native `Workflow` tool. You stay **orchestrator**: author + launch the workflow, gate the unsafe parts, report results. You do NOT do the work inline.

Design rationale + verification evidence (ADR): `${CLAUDE_PLUGIN_ROOT}/docs/teamkit-methodology.md` (spikes 1–4; reconsolidation 2026-06-05). THIS skill is the operational source of truth for the rules.

> **CONTRACT STATUS (re-baselined 2026-08-23).** The workflow API is a **documented contract** (tool schema: `agent`/`parallel`/`pipeline`/`phase`/`log`/`args`/`budget`/`workflow`/`meta`; opts `schema`/`model`/`effort`/`isolation`/`agentType`). Rules 1/2/3/7/9 + resume-caching are DOCUMENTED behavior — treat the schema as authority, the rules as operational consequences. **Probe-only findings the docs still don't state** (these keep the re-verify-on-upgrade duty): rule 4b (scope-guard did not block out-of-scope writes), rule 6's same-session-only resume restriction (probed 2026-06-05; docs state no such restriction — re-probe), rule 13's model-inheritance (no `opts.model` → session model), rule 15 + addendum (empty-return / dark-agent forensics), rule 16 (subagent write guard on `findings*`/`report*` basenames — harness prompts suggest the set may have widened to `summary*`/`analysis*`; un-probed, avoid all four), and rule 2's detail that custom agentTypes get zero `ToolSearch`/`Glob`/`Grep` (frontmatter `mcp__*` globs DO project — documented; the tool-surface detail is probe color). Failure model is **null-first** (rule 11): `agent()` resolves null on terminal API error or user skip; the documented throw is budget exceedance.

## When to use

Three entry modes:
1. **Approved `team-plan.md`** (from `team-kit-create`) — **author (native) → lint → save → run** the committed spine `plan.workflow.js`. See `## Entry-mode-1 — committed spine (native author → lint → save)` below.
2. **Direct task** via the canonical invocation contract below — clear task that doesn't need the full clarify/explore planning ceremony. (Most common.)
3. **Saved template workflow** (`/monorepo-health`, etc.) — fully canned, parameterized via `args`.

NOT for: tiny 1–3 file tight-coupling fixes (single agent, no orchestration); anything still needing requirements clarification (run `team-kit-create` first).

### Workflow cost model — model tiering, not cache sharing

Workflow `agent()` calls are **named subagents with isolated caches** — live probe `wf_16f795f9-f2d` showed followers re-create ~14.5k tokens each (even warm + serial); there is NO cross-agent prefix reuse. A workflow fanning out N agents that all need the same big blob pays N× for it. Two consequences:

- **Keep workflow prompts lean** — push shared bulk to disk (`team-session/`); each agent reads only its slice.
- **Model tiering IS the cost lever** — `opts.model:'sonnet'` on mechanical/review/finalize stages, `'haiku'` for O(1) gate mechanics (preflight assertions, disk audits); reserve the inherited session model (currently fable) for implement/design (rule 13). There is no cache-sharing lever on the workflow path.

## Hard platform rules (contract-backed where documented; probe-only subset re-verified on upgrade)

These come from spikes 1–4 + the 2026-06-05 re-verification (`wf_2a347dc4-297`, `wf_e3818563-661`) and shape EVERY workflow you author here. The documented majority (banner above) is contract-backed — treat the schema as authority; only the banner's probe-only subset carries the re-verify-on-upgrade duty.

| # | Rule | Consequence |
|---|------|-------------|
| 1 | **Bridge works.** `agent(p, {agentType:'team-coder'})` loads the role agent verbatim. (It *composes* with schema — schema is reliable on the current runtime; see rule 9.) | Reuse role agents as workers — zero rewrite. |
| 2 | **Custom agentType = frontmatter-derived toolset (workflow `agent()` sandbox).** Baseline `{Read, Bash, StructuredOutput}` + role frontmatter's `{Write, Edit, Skill}` — AND (re-probed 2026-08-03, `wf_f6675267-c10`) **frontmatter `mcp__*` globs DO project**: connected-server MCP tools appear and are DIRECTLY callable (team-architect got claude-mem/context-mode/context7 live; a disconnected server's tools are simply absent). The 2026-06-05 "cannot ADD beyond baseline" clause is REFUTED. **Still zero `ToolSearch`, `Glob`, `Grep` on every custom type probed** (verifier=`{Read,Bash,Write,Skill}`, coder=`+Edit`). | Give an execution role MCP by declaring the globs in its frontmatter; roles without them stay Bash/ccc-only. No ToolSearch → no deferred/on-demand tools inside custom types. |
| 3 | **The DEFAULT agent (no agentType) has the full surface** — direct `{Bash, Edit, Read, ReportFindings, Skill, ToolSearch, Write}` + ~116 deferred tools (all connected `mcp__*`) loadable via `ToolSearch` (re-confirmed live 2026-08-03). Custom types reach MCP only through frontmatter globs (rule 2) — `ToolSearch` remains default-agent-only. | Knowledge stages: default agent (path A) OR a custom role whose frontmatter declares the needed `mcp__*` globs (researcher/architect/investigator/designer do). |
| 4 | **(a) Workflow agents auto-`acceptEdits` (DOC-CONFIRMED). (b) Scope-guard did NOT block an out-of-scope write** — re-verified 2026-06-05: a `/tmp` write SUCCEEDED unblocked for both default + custom agents, no denial. (Whether any PreToolUse hook fires at all inside a workflow agent is indeterminate; don't rely on it either way.) | A workflow agent can write anywhere, unattended. Writes need a discipline, NOT a hook. |
| 5 | **No worktrees** (project decision). Single branch. | Same-file parallel source writes are unguarded → serialize or propose-then-apply. |
| 6 | **No mid-run user input**; each gated stage = a separate workflow run with its own journal. Resume probed same-session-only (2026-06-05) — the docs state no such restriction and the journal is on disk, so **re-probe cross-session resume** (`scriptPath` + prior `resumeFromRunId` from a new session) before relying on it either way. | Multi-gate work = several sequential runs. **Seams between runs are ORCHESTRATOR decision points, not human gates by default** — the orchestrator triages the returned status and relaunches (`resumeFromRunId` + identical args) autonomously; a HUMAN sits at a seam only where the plan declares one (HITL task, paid/irreversible, BLOCKED, contract change). See `## Autonomy contract`. |
| 7 | **Determinism:** `Date.now()`/`Math.random()`/argless `new Date()` THROW; scripts have NO `import`/fs/Node. | Pass timestamps via `args`; inline stage code (no imports). |
| 8 | **Kill switch:** `/workflows` TUI → `x` stops a run, `p` pause. Guard loops with `budget.total`. | Human can always stop a runaway run. |
| 9 | **Schema is RELIABLE on the current runtime** (re-verified 2026-06-05: 4/4 heavy custom-agentType agents, each Read 5 large files, returned valid `StructuredOutput`; skip-rate 0/4 — the earlier ~5×-skip claim did NOT reproduce). | Heavy stages (research/coder/review/verify/finish) STILL DEFAULT to NO schema → write their artifact to `team-session/` + end with a `STATUS:` line. This is for **lean context + bulk handoff to disk**, NOT because schema breaks. Bare-`await` of a schema agent is now acceptable, but ALWAYS wrap critical-path `await agent()` in `tryAgent` — transport errors (stall-watchdog/rate-limit/subprocess) are a SEPARATE abort vector from schema (rule 11). |
| 10 | **Assert coverage after EVERY `parallel()` fan-out.** Rule 9's null-degradation + the standard `.filter(Boolean)` cleanup can silently DROP a fan-out element — a missing slice then reads as "all clean". | Capture the `parallel()` result; assert `results.filter(Boolean).length === inputs.length`. On a gap, return `errors_remaining` + a `coverageGap {expected, got, missing}` object and do NOT proceed — a dropped/skipped element must never read as covered (see the `coverage()` helper below). |
| 11 | **Failure model is NULL-FIRST (documented) — wrap critical-path heavy awaits as backstop (reliability-2).** A terminal API error (after retries) or a user skip resolves `agent()` to **null**, not a throw — `statusOf(null)` already classifies `errors`, so null needs no wrapper (but check `journal.jsonl` before re-dispatching a null slice: user-skip is a decision, not a failure). The **documented throw is budget exceedance**; residual throws (subprocess/harness) are backstop territory, and one on the serial critical path still aborts the run. | Route critical-path heavy `await agent()` through `tryAgent()`: budget throw → synthesized `STATUS: BLOCKED` (escalate — never retry against a hard ceiling); other throw → `STATUS: ERRORS_REMAINING` with a **`transport:` marker**. The marker licenses exactly ONE orchestrator auto-resume (`resumeFromRunId` + identical args) before the human gate; agent-reported ERRORS_REMAINING (no marker) never auto-resumes (see the `tryAgent` helper below). |
| 12 | **`statusOf()` is a 4-way classifier — BLOCKED/NEEDS_CONTEXT escalate, they do NOT re-dispatch (reliability-3).** A 3-way `{clean\|errors\|partial}` collapses an agent's **escalate** signal ("the plan is wrong / I'm missing context") into the re-dispatchable bucket, so the review loop burns the FULL `MAX_REDISPATCH` budget re-running an unwinnable stage. Missing STATUS must NOT read as a soft `partial` either (no silent clean; observability-3). | Classify into `clean` / `blocked` (BLOCKED\|NEEDS_CONTEXT) / `errors` (ERRORS_REMAINING\|PARTIAL\|DONE_WITH_CONCERNS\|**missing STATUS**). Check BLOCKED/NEEDS_CONTEXT BEFORE ERRORS. `escalates(s)` → **break the loop immediately and return to the human gate** (don't increment `attempt`); only `errors` re-dispatches; only `clean` passes the gate (see the `statusOf` helper below — the canonical impl). **Loop counters persist in `build-state.md`, not script memory** — a relaunch RESUMES the count, never resets it (circuit-breaker; see the validation loops). |
| 13 | **Mechanical / review / finalize stages MUST pass `model:'sonnet'` — reserve the inherited session model for implement/design (cost-perf-2).** A stage with NO `opts.model` inherits the SESSION model (currently fable — probe-only finding, docs don't state inheritance), so the tiering table is aspirational without explicit opts — finalize/validate/spec-review/quality-review silently run on the top tier, the single biggest avoidable workflow cost (no cross-agent cache lever — model tiering IS the cost lever; see the workflow cost model above). Documented model enum: `'sonnet'\|'opus'\|'haiku'\|'fable'`. | Pass `model:'sonnet'` on EVERY mechanical (verifier/finalize/validate), review (spec/quality/plan/security), and finalize/finisher `agent()` call — set it on the `phases[]` entry AND each `agent()` opts; consider `'haiku'` for O(1) gate mechanics (preflight, disk audits). Only **implement** and **design/planning** stages keep the inherited model (real judgment work) — do NOT add `model:'sonnet'` there. **Second lever: `opts.effort`** — pass `effort:'low'` with the model override on mechanical/finalize/validate stages (overrides the role frontmatter's `effort: max`); reviews keep default effort (real diff-reading). |
| 14 | **Glob-disjointness pre-flight BEFORE any parallel source-write fan-out (reliability-7).** Worktrees are banned (rule 5), so disjoint `files_owned` is the ONLY structural backstop against two same-batch coders clobbering each other's uncommitted edits — yet no hook fires for workflow writers (rule 4) and the planner's "non-overlapping globs" is LLM discipline, not a runtime check (`PLANNER.md` file-ownership). A stale/typo'd plan with two coders sharing `src/**` will silently last-writer-win. | Before launching a parallel source-writing fan-out, run the deterministic `disjoint(owners)` pre-flight: compute the pairwise glob intersection of every coder's `files_owned`; if ANY two intersect, do NOT fan out — HARD-FAIL (`return { stage, status: 'errors_remaining', overlaps }`) or auto-DOWNGRADE the colliding pair to a single-writer serial pipeline (or propose-then-apply). Disjoint = parallel OK. Pure JS (no fs/glob import — rule 7) — see the `disjoint()` helper below (the canonical impl — there is no separate `plan.workflow.js`). Read-only fan-out and per-agent `team-session/` artifact writes (disjoint paths by construction) are EXEMPT — this gates source edits only. |
| 15 | **Empty return text ≠ no work — AUDIT the disk before a coverage bail (reliability-15).** `tryAgent` (rule 11) catches only THROWS; a heavy agent that FINISHES (edits its owned files, Writes its `team-session/` artifact) yet loses its RETURN TEXT comes back as `""` — not a throw. `coverage()`'s `.filter(Boolean)` then drops that empty slice and the run BAILS `errors_remaining`, discarding completed on-disk work. This is a SEPARATE vector from the schema-skip in rule 9 (disproven) — it is a lost free-text terminal on a no-schema stage. Hit 5× in one run (mono-cal gap-closure). | Before treating an empty `parallel()` slice as a gap, run `auditEmpty(items, results, tag)`: dispatch a cheap `team-verifier` per empty slice to read the artifact the agent was told to Write (+ the git diff of its owned files, for source-writers) and RECONSTRUCT a `STATUS` line. Only a slice with NO artifact AND NO diff is a true gap (the audit fan-out is itself coverage-checked → `null`). The `tag` makes every repair prompt UNIQUE across rounds (initial / spec-redo-N / qual-redo-N) so the in-run workflow cache cannot return a prior round's stale/empty audit (cache-poison guard) — the SAME reason re-dispatched coder prompts carry an attempt tag `[retry s<n>]`/`[retry q<n>]`. See the `auditEmpty()` helper below. |
| 16 | **Subagent Write guard denies `findings*`/`report*` basenames — BOTH lanes (live-probed 2026-08-03: `wf_f6675267-c10`, `wf_f161857a-342`, `wf_24219667-1c1`, + native Agent probe).** A subagent (workflow-spawned OR Agent-tool) calling Write on a file whose basename starts with `findings` or `report` gets `tool_use_error`: *"Subagents should return findings as text, not write report files. Include this content in your final response instead."* Filename-triggered, prefix-matched: same dir/content/agent, `notes.md` passed while `findings.md` was denied; `validation-report.md`, `spec-review.md`, `goal-audit.md`, `progress.md`, `results.md` all pass. Bash heredoc is NOT intercepted (proven), but do not instruct evasion — the guard is new/undocumented and may harden. **Harness prompt wording now also discourages `summary*`/`analysis*` — un-probed; treat all FOUR prefixes as never-name (cheap rename beats a mid-run denial).** | NEVER name a subagent-written artifact `findings*`/`report*` (precautionary: nor `summary*`/`analysis*`). RESOLVED 2026-08-04: researcher artifacts renamed `research-findings*.md` (rename-probed writable, `wf_b3666818-85c`). Backstop stands regardless: on any denial the agent follows the write-denial protocol (`team-session-writing`) and the LEAD writes the artifact — the main loop is not guarded. |

### Rule 15 addendum — the "dark agent" is a maxTurns KILL, not platform flakiness (forensics 2026-07-23, mono-cal tenancy: 19 dark agents across 3 runs, transcript-verified)

An agent that returns EMPTY with zero artifact is almost certainly a **frontmatter `maxTurns` cap kill**, and it is DETERMINISTIC, not intermittent. Mechanism (proven by transcript tails of all 19 dark agents): the cap fires mid tool-loop — terminal record is a `user` tool_result after an assistant `stop_reason:"tool_use"`, NO closing assistant turn, zero `end_turn`, zero errors. The workflow captures the TERMINAL record's text as the result → `""`, with no reason field anywhere. Because agents write their report + STATUS LAST by convention, a cap kill also destroys the artifact `auditEmpty` looks for — empty+no-artifact is the cap-kill signature, NOT proof of no work (dead coders' source EDITS survive; check git diff).

Predictor (perfect partition of the 2026-07-23 roster): **capped `maxTurns` AND O(changed-files) workload.** Dark: reviewer (cap 15 — roster minimum — reads the whole diff; died 6/6), tester (cap 25, touches most files; died 6/6 across runs 1+3), coder (cap 30; only the 5 broadest tasks died, 10 smaller finished at 7–25 turns). Never dark: spec-reviewer + goal-auditor (NO cap — one spec-reviewer finished at 30 turns), verifier (cap 30 but O(1) fixed-gate work, peaks ~12). Model/effort/preloaded-skills do NOT predict it.

Mitigations: (a) RESOLVED 2026-07-23 — `maxTurns` REMOVED from all 8 capped team agents (runaway protection belongs to the orchestration layer: workflow budget guard, agent-count cap, `/workflows` kill switch, natural context ceiling — a turn cap kills silently and destroys the report evidence). If a cap ever reappears in `.claude/agents/<type>.md` frontmatter, treat it as the prime dark-agent suspect; (b) on empty+no-artifact, read `<transcriptDir>/journal.jsonl` first (doc'd 2026-08-03: it records each agent's actual return value), then the transcript tail (`agent-<id>.jsonl` last records: trailing tool_result + no end_turn = cap kill) and re-dispatch with SMALLER SCOPE or an uncapped/default agent — same prompt re-dies identically while looking random; (c) have heavy agents Write their report file EARLY (skeleton, updated as they go) so a kill leaves evidence; (d) statusOf caveat: `STATUS: ERRORS_REMAINING: 0` is CLEAN — match count-0 before the generic pattern; (e) reviewer feedback prompts must reuse the REVIEWER'S OWN labels (flat numbered file:line) — never re-map to orchestrator lane names.

### Rule 12 addendum — a plan that declares its own phase transitions is gated on THOSE, not on the strict classifier (2026-08-24, moirai-docs-vision-review run 1)

`team-plan.md` may ratify a `## Phase Transitions` block naming each boundary's advance condition. Where it does, **that condition gates the boundary** — inline `phaseGate(stage, txt, allowed)` (canonical impl in `references/stage-templates.js`, next to `gate`) with the plan's accept set verbatim. The strict `gate()` remains the default and stays correct everywhere else, **fix loops included**: inside verify/validate/review, not-clean genuinely means re-dispatch. BLOCKED/NEEDS_CONTEXT escalate either way, and an advanced-with-concerns stage is recorded, never silent.

Measured: the plan declared P2→P3 advances on *"docs-coder STATUS CLEAN/DONE_WITH_CONCERNS"*; the P1→P2 lane gate was widened for it and the generic strict `gate()` left on the phase's own tasks, where `statusOf` classes DONE_WITH_CONCERNS as `errors` — the run halted at a stage the ratified contract said should proceed (8 agents in, 0 errors, 0 empty). An authoring defect in the spine, not a run failure; it cost a resume round. **Widening a gate to MATCH the plan is alignment; widening it because a stage keeps failing is softening** — the second is the gate-gaming guard's business, and a boundary the plan never ruled on keeps the strict gate.

### Rule 6 sub-note — `resumeFromRunId` + caching semantics

Capture each launch's `WorkflowOutput.runId` and, after a **partial** run (some stages done, one crashed/rate-limited/timed out), prefer **resuming** over a cold relaunch: pass the prior `runId` as `resumeFromRunId`. Completed `agent()` calls whose inputs are UNCHANGED return cached — the run skips re-paying for already-finished stages and picks up at the failed one. Re-launching cold re-runs everything (live this audit: a cold relaunch re-ran ~72 agents).

`resumeFromRunId` is the within-session incremental-cache mechanism that backs rule 6. Use it for: the bounded reject→re-dispatch review loop and any single within-session multi-stage run that partially failed.

**Mechanism (documented): the cache is the longest unchanged PREFIX of `agent()` calls** — everything from the first changed call onward re-runs, changed or not. That explains both probe results (`wf_1d2dd417-323`): byte-identical args + script = 100% hit (nothing breaks the prefix); ANY `args` change re-ran ~70% (the first arg-interpolating prompt breaks the prefix, everything after re-runs regardless of its own inputs). **Implications:** resume is a real cost-saver ONLY when you re-pass IDENTICAL args (the resume-args contract below); surgical "only the changed stage re-runs" holds only when the edit sits AFTER the last cached call — never edit a stage EARLIER than the last cached call and expect downstream hits. So for the reject→re-dispatch loop: keep `args` and every SHARED prompt block byte-identical (prior prefix stays cached), and vary ONLY the contested stage's prompt — an `[attempt N]` / evidence-round tag, or an arg interpolated into that stage's prompt alone. A contested stage whose prompt does NOT change is not re-run — it replays its prior failing result from cache.

**Thread the `runId` — don't just document it (gaps-1).** Two threading levels: (a) WITHIN one workflow run the engine already caches completed `agent()` calls, so the in-script reject→re-dispatch loop costs nothing extra for unchanged stages; (b) ACROSS launches — when a re-dispatch crosses a human gate and becomes a SEPARATE `Workflow` launch — the orchestrator MUST keep the prior run's `WorkflowOutput.runId` (captured at step 4) and pass it as `resumeFromRunId` on the relaunch. Skip that and every prior passing stage re-runs from scratch. Treated as same-session-only until re-probed (banner probe-only list).

**Do not oversell it — treat `resumeFromRunId` as same-session-only until re-probed.** Probed same-session-only 2026-06-05, but the docs state no session restriction and the journal + script persist on disk — re-probe cross-session resume on the current binary; until then keep the durable `team-session/` artifact/marker as the cross-session checkpoint. The cache discount also depends on inputs being identical: if a resumed stage's prompt/`args` changed, that stage (and everything downstream of it) re-runs — see the resume-args contract below for the failure mode when `args` drift.

**Cache-safe prompt editing on resume (proven over 4 resume rounds, mono-cal P5).** When a resume must change ONE stage, edit ONLY that not-yet-run stage's prompt and keep every SHARED block **byte-identical** — the cache key is the RENDERED prompt text, so a shared-block edit re-renders every prompt in the script and re-runs the paid stages that already succeeded. Concretely, what worked: the shared `COMMON` preamble was never touched after launch, and a per-slice `rulings` field was rendered as an **empty string** for already-run slices so their prompts stayed byte-identical while the new slice's ruling text landed. That kept every completed stage cached across four rounds and avoided re-spending the calibration stage (~$0.69) and three paid errands three times over. The failure mode is silent and expensive — nothing warns you; you just pay again (`learnings.md` §5.2).

### Rule 6 resume-args contract — RE-PASS THE SAME `args` ON RESUME (reliability-9)

**When you resume with `resumeFromRunId`, you MUST re-pass the exact same `args` you launched with.** `resumeFromRunId` resumes the *journal*, NOT the `args` — omit them and every arg-interpolated global (`SESSION`, `PKG`, `DOC_URLS`, …) comes back `undefined`. This fails SILENTLY and is doubly destructive:

1. **Full cache miss.** The cache key is the rendered prompt TEXT. Every `agent()` prompt that interpolated an arg now renders differently (the arg reads `undefined`), so EVERY prompt changes → nothing cache-hits → the whole run re-pays from scratch. (Hit live this audit: a resume with dropped `args` re-ran ~72 agents instead of cache-hitting, ~5M tokens re-spent.)
2. **`undefined`-path writes.** A `Write` target built as `` `${SESSION}audit-report.md` `` renders `undefinedaudit-report.md` → files land at the REPO ROOT as `/repo/undefined*` instead of inside `team-session/`. No error is raised — the run looks like it succeeded.

Neither failure throws. Treat re-passing identical `args` as part of the resume call, not an optional extra. Same rule for the post-gate relaunch in step 4 and the reject→re-dispatch loop: if you thread the prior `runId`, thread the prior `args` with it.

**Guard at the top of every script (fail-loud).** Args can also go missing on a fresh cold launch (typo'd `args` key, wrong invocation). Add the top-of-script args guard — canonical impl in `references/stage-templates.js` — so the run aborts with a clear error instead of silently writing to `/repo/undefined*`.

## Knowledge routing (path A — verified)

- **Research / investigation / knowledge-heavy** stages → two verified routes (2026-08-03): **(a) DEFAULT agent** (no `agentType`) — inject the role in the prompt + `Skill('investigation-methodology')`, load MCP via `ToolSearch`; **(b) custom `agentType` whose frontmatter declares `mcp__*` globs** (`team-researcher`/`team-architect`/`team-investigator`) — those MCP tools project directly, no ToolSearch needed. Route (b) keeps the full role definition; route (a) keeps deferred-tool breadth. Connected servers only — a down MCP server's tools are silently absent either way (`ccc` CLI is the stale-proof code-search path).
- **Execution** stages (implement/review/verify/finalize) → custom `agentType` directly. Coder/verifier/reviewer frontmatter declares no `mcp__*`, so in-role lookups there are **Bash `grep`/`sed` + pure-Bash skills** (NOT `rg` — see the evidence-integrity note below) (a Skill wrapper bottoming out in an `mcp__*` tool the agent lacks still fails — re-confirmed 2026-08-03). For knowledge mid-execution: `ccc` (pure Bash CLI, works everywhere) or route through a rule-3 / rule-2(b) agent.
  - **⚠ Evidence integrity — never `rg` for text you will QUOTE (2026-08-24).** A proxy in this environment rewrites `rg` output silently: the command exits 0 and returns token-mangled text that is not what the file says. Nothing errors, so a lane told to quote verbatim, resolve a cited `file:line` or count matches can ship a corrupted quote it has no way to notice — and verbatim quoting is exactly what evidence-bearing lanes are told to do. Use `grep` / `sed`; inside a `while read` loop they may not be on PATH, so call `/usr/bin/grep` and `/usr/bin/sed` absolute. State this in the DISPATCH of every agent whose output carries quotes — the sandbox does not enforce it.
  - **Exception — `ccc` works here.** The `ccc` skill is pure Bash CLI (`ccc search "<concept>"`), never touching MCP, so semantic code search IS available inside custom agentTypes. Prefer it over MCP everywhere (see `.claude/docs/third-party/cocoindex-code.md`); the CLI also can't go stale against the daemon the way the MCP process does. Corrected 2026-08-01 — the old blanket claim wrongly steered execution agents off a working path.

## Single-branch write model (verified)

Clobber risk is **same-FILE** writes, not parallel writes. Three write types:
- **Schema returns** — not files; always parallel-safe.
- **`team-session/` artifacts** (each agent → its OWN path, e.g. `coder-X/progress.md`) — parallel-SAFE (disjoint paths never collide; spike 4 confirmed concurrent writes).
- **Source edits** (`packages/...`) — the only constrained case:
  - disjoint file-ownership → parallel OK, **but PROVE it first**: run the `disjoint(owners)` glob pre-flight (rule 14, reliability-7) before the fan-out — the planner's "non-overlapping globs" is discipline, not a runtime check, and no hook fires for workflow writers. Any pairwise overlap → halt or downgrade to single-writer (a stray out-of-lane agent clobbering a peer is otherwise UNDETECTED).
  - **single-writer** (serial pipeline, one source-writer at a time) — default, safe; also the auto-downgrade target when the disjointness pre-flight flags an overlap.
  - **propose-then-apply** — parallel coders WRITE a unified-diff patch to `<session>proposals/{name}.diff` (FILE handoff — robust vs schema diff-fidelity); ONE sequential apply stage reads the patches, applies disjoint ones + flags same-file collisions. Parallel reasoning, serial mutation.

**A DIRTY tree at launch is the normal case — snapshot it, or every later diff lies.** Rule 5 bans
worktrees, so a run starts on whatever the branch already carries, and a concurrent session's
uncommitted work may sit on the very files this run must edit (measured 2026-08-23: it did). Before the
first write, `git diff -- <scoped paths> > <session>baseline.diff`, and tell EVERY stage to subtract it
before claiming any hunk as this run's. Without it, reviewers review a peer's work, gate-gaming audits
flag a peer's suppressions, and "additions only" is unprovable. **Ban `git checkout` / `restore` /
`stash` / `reset` / `commit` in every dispatch** — an agent "restoring" a deliberately-broken file with
`git checkout` destroys uncommitted work it does not own. To undo an edit, RE-EDIT the file.

**An AC whose reference point can MOVE must name a baseline SHA, not `HEAD`.** Same root as the dirty
tree: the run does not own the branch. Record `git rev-parse HEAD` at t0 in `build-state.md` and grade
every freeze / "byte-identical to" / diff-scoped criterion against THAT sha — `HEAD` at grade time is a
different commit than `HEAD` at seal time whenever a concurrent session, or the nightly backup commit,
lands mid-run. (Measured 2026-08-24: AC-5 froze a doc set *"byte-identical to HEAD"*; `fb701c9c2` landed
mid-run from another session — this run never commits. A freeze measured only against a moving HEAD moves
WITH it: the criterion reads green even if that commit rewrote a frozen file. The lead re-measured
`git diff <t0-sha> HEAD --stat -- <frozen set>` → empty and the freeze held, but nothing in the contract
required that measurement.) If a sealed contract already says `HEAD`, grade BOTH and record the t0
comparison as the one that means anything — an orchestrator ruling, not a contract edit.

**Order the guard before the surface it guards.** When a run ships both a capability and the check that
makes it safe, build the check FIRST — never leave a window where the capability is reachable unguarded,
not even within a single run. If the plan's own stage order puts the surface first, invert it and say so.

**Cite repo-root-relative, always.** A bare `src/cli/foo.ts:41` or `store.ts:168` is ambiguous the moment
a monorepo has two of them, and it strands the next reader. Measured twice on one effort, two authors
apart. Every `file:line` in a `team-session/` artifact or dispatch is relative to the repo root, or it is
a defect — including in prose you are only quoting.

**Contract is immutable to writers.** No coder/tester may edit `definition-of-done.md`, `requirements.md`, `team-plan.md`, or weaken a gate config to pass — the finalize gate-gaming guard treats any such edit as a FAILED gate. The contract is graded, never edited, by the things it grades.

## Prod-gating (mandatory)

NEVER place prod-mutating / irreversible / paid-live actions inside the autonomous workflow: deploys (`pulumi up`), DB migrations, deletes, `kubectl` mutations, scaling, ingest kicks, live cost-incurring API calls — including a CALIBRATION rehearsal that itself spends (the CALIBRATE template refuses in-script unless the plan declares it free; a spending rehearsal goes FIRST on the HITL checklist, capped, throwaway target). Gating input: each task's declared `type:` in `team-plan.md` — `HITL` → the **human-gated checklist** you return to the user, `AFK` → the workflow. The classify-at-run-time heuristic stays as backstop: a task that smells prod-mutating goes to the checklist even if typed `AFK` (mistyped plans happen; the reverse override never does). The workflow does the read-only / analysis / safe-code parts. (Spike 4: the planner correctly gated all 7 prod items.)

## Paid / irreversible stages — preconditions, calibration, one run per dispatch

Prod-gating (above) decides **what the workflow may not run**. This decides what must be TRUE, and what must have been REHEARSED, before the gated part spends anything. All four are earned from measurements, not theory (`mono-cal-codex-discovery`: `learnings.md` §3/§5, `execution-findings.md` EF-3/EF-4/EF-5/EF-10). Standing lesson underneath all of them: **a criterion that depends on the environment being in a particular state must ASSERT that state, not assume it** — EF-1 (profile emptiness), EF-3 (composition-root wiring), EF-4 (which redis), EF-5 (clone reachability) are one failure in four costumes.

**1 — Preconditions manifest: the plan DECLARES them, the run ASSERTS them before the first paid action.** rc-checked, abort on any failure. Five classes, each a one-line assertion nobody wrote:

| Class | The real question | Assertion shape (+ what it cost when missing) |
|---|---|---|
| **service liveness** | is a CONSUMER alive — not just a port answering | `redis-cli -u "$REDIS_URL" TTL bull:<queue>:stalled-check` → **positive int** (only a BullMQ *Worker* refreshes it, ~30s; a `Queue` client does not, and `-2` means DOWN). EF-4: the default `REDIS_URL` resolved to a **different, EMPTY** redis with no worker — a cycle inheriting it enqueues, blocks the 120 000 ms timeout, and dies *after* the run started spending |
| **credential availability** | does the exact var the CHILD process reads resolve | `[ -n "$CODEX_API_KEY" ]` — **for a `codex exec` child**. Name the var the child actually authenticates with (EF-12: `codex exec` authenticates **only** with `CODEX_API_KEY`; the ChatGPT login and `OPENAI_API_KEY` do not — and the runner deletes the latter from the child env). **Two Codex children, two different answers**: the `team-codex-verifier` lane authenticates the opposite way — it inherits `~/.codex/auth.json` from a local `codex login` and requires **no** API key at all, so its assertion is `codex login status`, not a var check. Asserting the wrong one passes while the run still cannot authenticate — which is this row's whole point applied to itself |
| **artifact reachability** | is the prerequisite reachable **from the source the run clones**, not merely from here | `git branch -r --contains <sha>` non-empty. **"Committed locally" is not "reachable from the clone source."** EF-5: the prerequisite commit was in the working tree and on **no remote branch** while the pipeline clones `--depth 1` from origin ⇒ the clone authored the artifact from scratch, a blocking AC failed, and the whole paid run was a loss. Every contract citation named that sha as if canonical; nothing tested that origin had it |
| **initial state** | did a PRIOR run leave state behind that makes this run's strongest check pass vacuously | assert the resolved dir/store is absent or empty immediately before acquisition, rc-asserted, and record the measured result **in the run's own receipt**. EF-1: a "Fresh" profile policy resolved to a deterministic, **never-wiped** path, so a re-run inherited the previous run's cookies for the graded origin — the one clause the code cannot forge would have passed with **zero real traffic**. Caught by an operator noticing, not by a criterion; a criterion that depends on someone remembering is not a criterion, and a hollow pass is strictly worse than a red one |
| **evidence durability** | will the run's evidence survive the run's own teardown | `test -d <evidence-dir>` rc 0, and the dir is OUTSIDE anything the runner `rm`s. EF-10/T-27: the runner rm's its `workDir` twice and the artifacts dir sits inside it — without an explicit external evidence dir every captured page dies at teardown and the ACs that read them become ungradeable *after* the money is spent |

Overlaps the HITL checklist's precondition column deliberately: **the checklist tells a human, the manifest fails the run.**

**2 — Calibration before any paid or irreversible one-shot stage. A standard stage, not a per-plan invention.**

A cheap, disposable, budget-capped rehearsal of the paid stage's FULL composition — real vendor, real composition root, real artifact writes — run BEFORE the graded stage and GATING it. Measured: ~$0.69 upper bound (≈$0.10 billed) caught **two** run-killers, either of which alone destroys a one-shot run:

- `meta.costUsd` came back **always `null`** (the package imports no price table), so the fail-closed budget rule charged the **full $1.00 ceiling per errand** ⇒ budget exhausts after errand 1, errand 2 never runs, money spent, no traversal, and the "≥2 errands started" criterion fails too.
- the evidence capture died **`EISDIR`** on every real run — `--save-session` leaves a `session-<n>/` **directory** in the artifacts dir and the hasher read it ⇒ no manifest, no sample page, a blocking AC **unsatisfiable**.

**Neither was visible to any test**, because both live where unit tests do not go: the composition root, and real vendor output shapes. That is the whole argument — calibration is the only stage that exercises the composition root against the real vendor before the spend, and neither defect is recoverable after a one-shot run. Treat its output as a **planning instrument** as well as a safety gate: it is where the plan's fog rows (prompt shape, budget splits, real vendor event shapes) get their first measurement.

Authoring rules: calibration writes its own artifact + `STATUS`, and **the paid stage does not launch unless calibration reads CLEAN** — an explicit `if (!ok(statusOf(calib))) return …`, never a fall-through. If calibration itself spends, it is HITL-gated like any paid action and goes FIRST on the checklist, capped, against a throwaway target. **Gate ordering is the other half of this**: calibration CLEAN before the spend, grading CLEAN before the irreversible step (merge / deploy / activate). Same run — it **stopped a bad merge twice**; both PRs were left OPEN rather than merged (`learnings.md` §3 item 5).

**3 — Real-capture persistence must be BOUND in production before the run whose stream you will need.** If any stage's tests assert an **external tool's wire shape**, assert before spending that the raw-capture persistence seam is bound at the **composition root**, cited `file:line`. Declared-and-invoked is not bound: the seam existed and was called, the system composition root bound nothing to it, and the paid graded run therefore persisted **no raw stream at all** — its record could not be re-derived afterwards and the defect had to be diagnosed from an archaeologically rescued session file (EF-3 / PD-18). The fixture rule itself — *a test asserting an external wire shape is generated from a persisted real capture, never hand-authored* — is authored create-side; see `team-kit-create`, do not restate it. The run-side obligation is only the binding check.

**4 — An agent NEVER silently retries a paid or irreversible run. One run per dispatch.** The agent runs it once, reports exactly where it got to and what it cost, and stops; the ORCHESTRATOR decides whether another happens, at a gate, with the prior attempt's evidence archived first. Pass it to the dispatch verbatim: *"Do NOT silently retry a paid run — report and stop. A second run is a decision, not a retry."* Held across four rounds; the round that failed ended `ERRORS_REMAINING: 1` having captured a **$0 reproduction corpus** instead of buying a fourth attempt — and that corpus is what made the defect tractable (`learnings.md` §5.3). Corollary on the failure path: a run that fails for a KNOWN, pre-measured environment limit is **recorded with its measurement, not retried** — say so in the dispatch, or the agent will burn a second run proving a limit you already measured at $0.

## Canonical invocation contract

If the user hasn't supplied these, infer from context or ask briefly. Fields:

```
TASK:            <what to accomplish>
SCOPE:           <pnpm -F targets / dirs / files>
ACCEPTANCE:      <done = the blocking AC in definition-of-done.md (from team-kit-create) — or an inline AC list for a direct task>
GATES:           <what needs human approval — or "standard: approve plan before execution">
DO-NOT-AUTOMATE: <prod/irreversible/paid → human-gated — or "none">
KNOWLEDGE:       <codebase research needed? y/n>
WRITES:          <single-writer (default) | propose-then-apply>
BRANCH:          single branch, no worktrees.
```

## Sealed contract + context firebreak (entry-mode-1)

When executing an approved plan from `team-kit-create`, the run boots from a **sealed contract on
disk** — it does NOT inherit create's conversation context:

```
prompt.md  map.md  requirements.md  design.md  team-plan.md  definition-of-done.md  goal-auditor/sat.md
```

- **Fresh orchestrator, disk-only.** Read these files; do not rely on planning-chat memory.
  Completeness test: *could a zero-memory agent execute from the contract alone?* If not, the gap
  lives only in create's head — it should have been written to disk before the seal (team-kit-create
  Step 7 gate).
- **`map.md` binds during execution too.** Destination + **Out of scope** gate mid-run adaptations —
  a coder deviation or "improvement" that lands in Out of scope re-opens a settled user decision;
  anything still in **Not yet specified** is out of THIS run's scope.
- **`definition-of-done.md` is the stop condition.** All `blocking` AC PASS + mechanical gates green
  ⇒ done — NOT an iteration counter. The validate (N+2) stage grades the contract's AC; the
  `build-state.md` ledger tracks them (below).
- **`goal-auditor/sat.md` is the reachability record** — per blocking AC, the passing state create
  believed reachable, the site that produces it, its preconditions. Re-read it the moment a criterion
  refuses to go green: an AC whose sat row names a state nothing in the plan produces is
  **unsatisfiable**, a contract defect (orchestrator ruling / human scope call), not a coder failure.
  A proportionality-skipped SAT is one line saying no blocking AC graded a frozen artifact, an
  unforgeable witness, a production/external transition, or paid-irreversible work (`team-kit-create`
  Step 4d-b) — that line is a legitimate `sat.md`, an absent file is not.
- **Pass the ABSOLUTE session path** to every `agent()` (`team-session/` is a persistent untracked
  dir at repo root — a relative path fails from a workflow agent's cwd).
- **The contract is generator-immune.** Coders may NEVER edit `definition-of-done.md` or weaken a
  gate to pass it (gate-gaming guard, finalize stage).
- **Workflow can't render.** A blocking SEMANTIC AC whose evidence is a screenshot / running UI the
  custom-agentType sandbox can't produce (no MCP, no browser) is routed to the human-gated checklist
  as `NEEDS_HUMAN_EVIDENCE` — never silently passed, never auto-failed.

## Orchestrator rulings (`PD-n`) — adjudicating plan-vs-reality without breaking the seal

The contract is immutable to writers (above). That does not say what happens when execution proves the CONTRACT wrong — and the only remaining moves are bad ones: edit the contract (destroys the seal; writers editing what grades them is the exact failure the contract exists to guard) or halt the effort. The third move, proven over one effort (PD-15..PD-19):

> the orchestrator **rules in writing** → the **contract stays UNEDITED** → the ruling is graded as a **recorded deviation** whose intent-preservation an independent grader **re-verifies**.

What it handled in practice: a mechanical gate failing on a foreign, pre-existing error in another package (amended to *"zero errors attributable to `<owned glob>`"* after the orchestrator reproduced it standalone, and forbade both remedies that would have mutated a frozen lockfile); a byte-freeze whose own frozen file made the criterion **unsatisfiable** (deviated +5/−0, three job names byte-unchanged, checks then went green); a gate-gaming remedy rejected in favour of a real surface reduction; and twice, a verdict the orchestrator had **already signed** being corrected against new measurement.

**The argument against is real and is not buried here.** It concentrates authority in one agent. Two of the five rulings corrected an earlier ruling by that same agent — healthy — but **nothing forced that review**; the orchestrator happened to re-measure. A ruling that is wrong and unchallenged is worse than a halt: a halt is visible, a bad ruling gets laundered into the record as a legitimate deviation.

**Judgement: formalise it, bounded.** The authority already exists de facto — the orchestrator is the thing that decides whether execution proceeds — so writing it down adds no power. What it adds is a mandatory written trail and a mandatory independent re-check on a decision that otherwise gets made silently. Unformalised, this same call still happens; it just leaves no evidence.

Mandatory content — a "ruling" missing any of the four is not a ruling, it is an unrecorded deviation:

| | Clause |
|---|---|
| a | the **measurement** that forced it — command + observed rc, or `file:line` |
| b | the **alternatives considered and why each was rejected** — name the forbidden ones explicitly (e.g. a remedy that would mutate an artifact another AC freezes) |
| c | what the ruling **does NOT license** |
| d | a **grader instruction to re-verify the INTENT** rather than accept the ruling — a ruling is not settled until an independent grader re-measures the intent it claims to preserve |

Two addenda, both measured 2026-08-23:

- **Authorise the CLASS, not the instances.** A ruling that enumerates specific sites (`file.ts:181/184/186`)
  re-blocks the moment an equivalent site turns up that the list did not name — it happened twice on one
  effort, costing two extra rulings. State the principle and its limit (*"…may be EXTENDED additively; no
  existing expectation weakened, removed or skipped"*), then let it cover every instance.
- **A conversational grant is recorded exactly like a ruling.** "You have my auth" against a multi-item
  report is ambiguous, and an unrecorded reading is an unauditable deviation the moment anyone disagrees
  — the failure this effort's own PD-21 records. Write the four clauses, state the reading so it is
  FALSIFIABLE, and enumerate what it does NOT cover. **A blanket grant never authorises a paid or
  irreversible run** — those need per-run authorisation naming target and ceiling.

Out of a ruling's reach — these escalate to the human gate, never adjudicated:
- anything that lowers a blocking AC's **intent**. The LETTER may bend where the letter is self-contradictory; the intent may not.
- anything in `map.md` **Out of scope**, or that moves the **destination**. (The last ruling in that run found a blocking AC architecturally unreachable and routed it to the NEXT effort rather than narrowing the destination to fit — that is the correct shape.)
- any fix that would require editing `definition-of-done.md` / `requirements.md` / `team-plan.md` / `design.md` / `map.md`. If the contract must change, that is a human decision, not a ruling.

**When you assemble a brief FOR that human decision, give it an adversary** — the same optional-but-named
shape as the FIDELITY CHECK below, and for high-stakes escalations treat it as required. A single
research agent writing the brief has a structural incentive toward whichever verdict unblocks the work,
and it does not need to fabricate anything to act on it: it simply builds one side at length and gestures
at the other. Measured 2026-08-23 — the brief was accurate to the byte and still posed a **false binary**;
the second agent found two more options, and **the human chose one of those**, not the brief's
recommendation. A one-agent decision brief is advocacy with citations.

Where they live: `<session>build-state.md` under **Orchestrator rulings**, ids `PD-n`, cited by the validate stage's per-AC grading and by the final verdict. Same ledger as the AC state — re-read it at every gate, don't trust recollection.

## Autonomy contract — where humans sit, and where they don't

Plan approval (create Step 7) is the act that GRANTS autonomy; after it, the run self-drives to its stop condition. The plan's `autonomy:` block (authored by `team-planner`, ratified at create Step 5) is the grant's terms — loop caps, escalation set, seam policy. Softening a plan-declared gate run-side is editing a ratified contract: never do it. Absent an `autonomy:` block (direct-task mode-2), these defaults apply.

**Humans sit at exactly these seams — nothing else stops the run:**

| Seam | Why human |
|---|---|
| plan-declared `type: HITL` tasks + the prod/paid/irreversible checklist | genuinely destructive / one-shot |
| `STATUS: BLOCKED` / `NEEDS_CONTEXT` anywhere — EXCEPT a `team-codex-verifier` dead-turn (transport BLOCKED), which auto-falls-back to `team-verifier` per the Codex lane, notify only | "the plan is wrong / I'm missing context" — re-dispatch provably can't fix it |
| any fix requiring a contract-file edit, anything touching `map.md` Out-of-scope / destination | scope is the user's |
| INTEGRITY findings (gamed gate / contract edit / decoration guard) | never hand these back to the coder that produced them |
| cap / global-ceiling exhaustion, identical-failure-signature stall | bounded retries spent — arrive with the ledger, not a first-error stop |
| a paid run's second attempt | "a second run is a decision, not a retry" |
| parked `NEEDS_HUMAN_EVIDENCE` ACs | render-required evidence the sandbox can't produce |

**Everything else the orchestrator handles itself, notifying instead of asking:** re-dispatch/continue decisions between runs (relaunch with `resumeFromRunId` + identical args); ONE auto-resume on a `transport:`-marked failure (rule 11); one single-slice retry on a true coverage gap (never paid slices; journal-check user-skip first); glob-overlap auto-downgrade of the colliding pair to single-writer (rule 14 already sanctions it; recorded as a deviation); Codex dead-turn auto-fallback to `team-verifier` (verdict recorded as `claude-fallback` in build-state, notified — never presented as a Codex verdict; the human re-enters only if cross-vendor independence was the point of the opt-in); splitting an oversized plan into chained sequential launches within the plan's approved roster (cumulative agent count never exceeds what the plan enumerates).

**Bounds that make the grant safe:** attempt counters live in `build-state.md` and RESUME across relaunches; global ceiling — total coder fix-dispatches across review+verify+validate ≤ 6; failure-signature comparison escalates a no-progress loop immediately; `budget.remaining()` checked before each re-dispatch round and before any calibrate/paid stage; the `/workflows` kill switch and the 1000-agent lifetime cap stay as runaway backstops. The run's job is to arrive at its human gate either CLEAN or with a fully-diagnosed, ledger-recorded residue.

## Procedure (orchestrator)

1. **Triage the task** against the rules: which parts are read-only (parallel-safe), which are source-writes (serialize/propose-apply), which are prod (gate out), and which are **paid / irreversible / one-shot** — those get a preconditions manifest + a calibration gate ahead of them, and a one-run-per-dispatch clause in the dispatch itself (see the paid-stage section above).
2. **Seed team-session** (optional but preferred for traceability): `mkdir team-session/{YYYYMMDD-slug}/`; write `prompt.md` (raw task). **Snapshot the dirty tree NOW**: `git diff -- <scoped paths> > <session>baseline.diff` — the FINISH/FINALIZE/fix prompts all subtract it, and without it every later diff lies (single-branch write model above). Pass the absolute session path into agents.
3. **Author the workflow** by composing the stage templates below. The script MUST open with the pure-literal `export const meta = {name, description, phases}` block (platform requirement — the lint checks it, but mode-2 skips the lint, so author it in); `phase()` titles match `meta.phases` EXACTLY — enumerate every phase any inlined helper emits (Audit/Propose/Preflight/Calibrate/Finish/Grade included). Add `whenToUse` to any script destined for save as a `/command`. Use `phase()` per stage; set `opts.phase` inside `parallel`/`pipeline` — and prefer `pipeline()` for per-lane multi-stage chains (research→implement→verify per disjoint lane): it is the documented default, no barrier, wall-clock = slowest chain; the null-drop of a thrown stage is the same silent-gap vector rule 10 guards, so coverage() applies to pipeline results too. A recurring gate cluster an existing saved workflow already implements can be invoked as a CHILD via `workflow('name', args)` (one nesting level; shares budget/concurrency) instead of duplicating stages. Heavy stages return FREE TEXT + a disk artifact + a `STATUS:` line (rule 9); reserve `schema:` for LIGHT stages. Any paid/irreversible stage is preceded by the PRECONDITIONS gate and (for a one-shot) the CALIBRATE gate, each hard-returning on not-CLEAN. The ~15-agent ceiling is a LOCAL session guideline (gate granularity + cost), NOT a platform cap — documented platform limits are 16-way concurrency, 1000 agents/run lifetime, 4096 items/call. A bigger plan: chain sequential launches autonomously within the plan's approved roster (autonomy contract above), or raise the guideline via /config.
4. **Launch** via the `Workflow` tool (background). **Capture the launch's `WorkflowOutput.runId`.** For multi-gate work, run up to the next seam, then TRIAGE: a plan-declared human gate / paid / BLOCKED / contract question → present and wait; anything else → relaunch the next segment YOURSELF and notify (autonomy contract above). Either way: stop the prior run first if still live (`TaskStop`), pass the prior `runId` as `resumeFromRunId` **AND re-pass the SAME `args`** so already-completed, unchanged `agent()` calls return cached (rule 6 + sub-note + resume-args contract). Dropping `args` on resume re-renders every prompt → full silent cache miss + `/repo/undefined*` writes (reliability-9). The reject→re-dispatch review loop is the prime beneficiary: thread the prior `runId` (with identical `args`) so only the changed implement/review stage re-runs, not the whole pipeline.
5. **Update the build-state ledger + report**: write/refresh `<session>build-state.md` keyed on AC ids (pending/passed/failed/needs-human + grader + verdict) **plus loop/attempt counters (they RESUME across relaunches — rule 12) plus any `PD-n` orchestrator rulings with their four mandatory clauses**, rolled up from the finalize+validate artifacts — the orchestrator's externalized memory (re-read it each gate; don't trust recollection). Every minted id carries a human slug (`PD-4 amend-lint-scope`, `AC-3 gates-green`) — ids alone are unreadable at decision points (`team-session-writing` → Readable ids). Relay the structured result + team-session artifact paths. Return the prod-gated checklist — incl. any blocking SEMANTIC AC marked `NEEDS_HUMAN_EVIDENCE` (distinct `needs_human_evidence` status, never conflated with failure) — for the user to run manually. The run is DONE only when every blocking AC reads `passed`.

## Entry-mode-1 — committed spine (native author → lint → save)

This is the NATIVE Claude Code model — "Claude writes the workflow, you save it" — with a thin guardrail, NOT a bespoke derivation pipeline. Input: an APPROVED `team-plan.md` (+ `design.md`). md is the GROUND TRUTH; `plan.workflow.js` is the workflow Claude authors from it (re-author on md change; never hand-edit the `.js` as a source).

1. **AUTHOR (native)** — you, the orchestrator, ALREADY hold the approved `team-plan.md` in context. First confirm the contract is SEALED: `definition-of-done.md` exists, `goal-auditor/goal-audit.md` reads CLEAN, and `goal-auditor/sat.md` exists reading CLEAN **or** carrying the one-line proportionality skip (`team-kit-create` Step 4d-b — legal only when NO blocking AC grades a frozen artifact, an unforgeable witness, a production/external transition, or paid-irreversible work). A missing `sat.md`, or one reading `ERRORS_REMAINING`/`BLOCKED`, is UNSEALED: satisfiability was skipped or failed, and a blocking AC no correct run can open is a gate you otherwise discover by spending against it. Run can be triggered directly, and an unsealed plan never executes. Author `team-session/{team}/plan.workflow.js` inline from it + the stage templates above + the hard rules. (This is mode-2's authoring; mode-1 just adds the lint + save below for a reproducible committed artifact — there is NO separate "deriver agent" or md→js pipeline.) Map: plan phases → `phase()`; file-ownership → per-agent thunks (disjoint); `blockedBy` → stage ordering; `type: HITL` tasks → EXCLUDED from the script, onto the human-gated checklist (`type: AFK` → stages); verify cmds → finalize; AC → validate; `autonomy:` block → loop-cap constants (`MAX_REDISPATCH`/`MAX_VERIFY`/`MAX_VALIDATE`/`TOTAL_FIX` via `args.autonomy` — plan values override the template defaults 3/3/3/6) + any plan-declared escalation seams.
2. **LINT (advisory guardrail — NOT a correctness gate):** run `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-workflow.mjs <path>`. Catches structural slips (syntax, missing `meta`, forbidden APIs, missing coverage/tryAgent, prod-gate). **Schema-derived now that the API is documented** — target the documented contract (incl. phase-title/`meta.phases` exact-match parity, determinism bans, 4096-item cap); still advisory, not a guarantee. Fix ERRORs; use judgment on WARNINGs (forbidden/prod warns can be string-content false-positives).
3. **FIDELITY CHECK (optional, for high-stakes plans only)** — dispatch `team-spec-reviewer` with the **AlignmentVerdict** schema (`SCHEMA-CATALOG.md` §6) to confirm the script covers the plan (`{covered, missing, invented, verdict}`). Skip for small/obvious plans — don't over-ceremony.
4. **SAVE (native)** — `/workflows` → `s` → `.claude/workflows/<name>.js` (recurring → a `/command`), or commit `team-session/{team}/plan.workflow.js` (bespoke). md stays canonical.
5. **RUN** — launch via the `Workflow` tool (resumable; re-pass identical `args` on resume — rule 6).

This rides WITH the platform: Claude authors (native), an optional lint guards, native save persists. Mode-2 = the same minus the committed-save; mode-3 = a previously-saved `/command`. The committed `plan.workflow.js` is a re-authorable build artifact, not load-bearing infra — if the workflow API shifts, re-author against the new surface (do not maintain a brittle generator).

## agentType selection (stage → role)

Pick by capability. Knowledge stages = DEFAULT agent (rule 3); execution stages = custom agentType (rule 2). Don't guess from the roster — use this map.

| Stage | agentType | Why |
|-------|-----------|-----|
| Research / investigate | **(none — default agent)** | needs ToolSearch→MCP (rule 3); inject researcher role + `Skill('investigation-methodology')` |
| Deep-dive one subsystem | `team-architect` | focused module brief (read-only) |
| Root-cause debugging | `team-investigator` | hypothesis-one-at-a-time (loop-until-dry) |
| Implement (source write) | `team-coder` | single-writer or propose-then-apply |
| Write/refresh tests | `team-tester` | can Edit test files |
| Spec review (FIRST) | `team-spec-reviewer` | compliance vs requirements |
| Quality review (AFTER spec) | `team-reviewer` | structure/quality/security |
| Security audit | `team-security-auditor` | OWASP scan |
| Finalize: lint/types/knip/test (gate-gaming guard) | `team-verifier` | mechanical gates, knip-skeptical |
| Validate: grade deterministic ACs | `team-verifier` | runs each AC's verify command; semantic ACs DEFER to grade |
| Grade blocking SEMANTIC ACs | `team-goal-auditor` | fresh context, goal-anchored, disprove-own-finding — `grade` is the one prompt-carried phase (agent file enumerates define/sat/audit); never grade semantics with team-verifier |
| Strip logs / comment standards | `team-finisher` | cleanup — runs BEFORE the final verify pass, inside the verified span |
| Plan critique | `team-plan-reviewer` | fresh-context plan review |
| Finalize gates, run on Codex | `team-codex-verifier` | **opt-in only** — never pick this unless the user asked for Codex delegation; see below |

### Codex delegation (opt-in, OFF by default)

A verify stage can run on an OpenAI Codex worker instead of a Claude subagent. **The lane is off unless a plan names it** — there is no config file, no flag and no plan-format field, so a plan that never writes `team-codex-verifier` in a task's `Agent` field cannot reach any of this. Do not assign it on your own judgement; assign it only when the user has asked for it.

**Opting in** is one word — the task's `Agent` field:

```
| **Agent** | team-codex-verifier |     ← instead of team-verifier
```

Everything else is unchanged: same `team-session/` artifact path, same `STATUS:` protocol, same `statusOf` classification.

**Preconditions** — assert these before the stage, not after (a missing one costs a turn to discover):

| Assertion | Expect |
|---|---|
| `command -v codex` | rc 0 — the CLI must be installed |
| `codex login status` | rc 0. Auth rides the **local login**; the lane reads **no API key** and setting `CODEX_API_KEY` does nothing for it |

**Cost** — measured, not estimated: ≈1.4 percentage points of a 30-day free-plan window per turn. A *failed* turn is not a cheap failure: a worker that misreads its instructions does the whole job anyway, and the one measured instance cost more than the passing turn and the smoke turn combined. Front-load the two preconditions rather than retrying.

**Transport failure ≠ gate failure — auto-fallback, don't stop.** A dead turn (binary unreachable, timeout, unparseable envelope, non-zero exit) returns `STATUS: BLOCKED` and does **not** consume reject→re-dispatch retries. Verdict parity vs the Claude lane was measured identical, so on a dead turn the orchestrator re-runs the SAME stage on `team-verifier` and NOTIFIES — the verdict is recorded in build-state under grader `claude-fallback`, never presented as a Codex verdict. The human re-enters only if cross-vendor independence was the point of the opt-in (then the notify covers it), and any paid/irreversible step gated on this verify still goes through the human checklist regardless of grader. `STATUS: CLEAN`/`errors` mean the worker actually ran and reached a verdict. Treat `BLOCKED` from this role as "the seam broke", never as "the gates failed".

**Quality** — verdict parity against the Claude path was measured identical on a seeded 4-failure set (same file, line, column and error text). Delegation changes who runs the gates, not what counts as passing.

## Execution-stage templates (canonical impls: `references/stage-templates.js`)

The 5 canonical shapes in `${CLAUDE_PLUGIN_ROOT}/team-templates/SCHEMA-CATALOG.md` (ResearchFindings / ImplResult / ReviewVerdict / VerifyReport / ACEvidence) describe the on-disk artifact CONTENT each stage writes. Per **rule 9**, heavy stages do NOT force them as a return — they write the artifact to `team-session/` and end with a `STATUS:` line the orchestrator parses (`statusOf`). `schema:` is for LIGHT stages only.

**Read `references/stage-templates.js` at author time** (procedure step 3 / entry-mode-1 step 1) and INLINE what you use — workflow scripts cannot import (rule 7). It carries the canonical implementations; every "see the helper below" in the rules table resolves here → to that file:

| In the file | Rule | Purpose |
|---|---|---|
| top-of-script args guard | 6 | fail-loud when `args` dropped on resume — prevents silent full cache-miss + `/repo/undefined*` writes |
| `statusOf` / `ok` / `escalates` | 12 | 4-way STATUS classifier — BLOCKED/NEEDS_CONTEXT escalate to the human gate, never re-dispatch |
| `gate` | 12 | combined per-stage gate. **Gating on `escalates()` alone lets PARTIAL / ERRORS_REMAINING / missing-STATUS flow through as SUCCESS** — use this at every serial critical-path stage |
| `phaseGate` | 12 addendum | phase-boundary gate on the plan's OWN declared advance condition — the strict `gate` at a boundary the contract already ruled on halts a run that should proceed. Boundaries only; fix loops keep `gate` |
| `tryAgent` | 11 | null-first backstop — budget throw → `BLOCKED` (escalate), other throw → `ERRORS_REMAINING` with the `transport:` marker (licenses ONE orchestrator auto-resume) |
| `coverage` | 10 | post-fan-out assertion — a dropped slice must never read as covered |
| `auditEmpty` | 15 | empty-return disk audit before a coverage bail — reconstructs STATUS from artifact + git diff |
| `retryMissing` | 10, 15 | one single-slice re-dispatch of a TRUE gap before any whole-run bail — never paid slices; journal-check user-skip first |
| `segMatch` / `globsOverlap` / `disjoint` | 14 | glob-disjointness pre-flight before any parallel source-write fan-out; overlap → auto-DOWNGRADE the colliding pair (default), halt only roster-wide |
| PRECONDITIONS gate | paid-stage §1 | rc-checked liveness / credential / clone-reachability / initial-state / evidence-durability assertions before the first paid action |
| CALIBRATE gate | paid-stage §2, §4 | cheap full-composition rehearsal; CLEAN gates the spend; in-script ONLY when `args.calibrationIsFree` — a spending rehearsal is HITL, first on the checklist. The one-run-per-dispatch clause lives in the PAID-DISPATCH clause block that follows the gate in the same section — inline BOTH |
| RESEARCH template | 3, 9, 10, 15 | default-agent knowledge fan-out (path A), auditEmpty → retryMissing → coverage gating |
| IMPLEMENT templates | 5, 11, 13, 14 | single-writer / propose-then-apply / parallel disjoint lanes (+ retry-tag cache-poison guard) |
| REVIEW loop | 9, 11, 12 | bounded reject→re-dispatch (max 3), spec gates quality, escalate on BLOCKED |
| FINISH stage | — | `team-finisher` cleanup BEFORE the mechanical gates — inside the verified span |
| VERIFY loop | 12, 13 | finalize → targeted coder fix → re-verify, cap 3; INTEGRITY findings (gamed gate / contract edit) → human, never the gaming coder; failure-signature early-escalate |
| VALIDATE loop + GRADE | 12, 13 | per-AC grading + `maps_to`-routed fixes, cap 3; sat-check before looping a failing AC; semantic ACs → `team-goal-auditor(grade)`; NEEDS_HUMAN_EVIDENCE parks + continues |

## Output

- Structured result returned to the orchestrator (relay what matters).
- `team-session/{slug}/` artifacts: `prompt.md`, `research/*.md`, plan/review/verify outputs.
- A **human-gated checklist** of prod/irreversible items the workflow did NOT run — plus any blocking SEMANTIC AC marked `NEEDS_HUMAN_EVIDENCE` (render-required, workflow can't produce). A run whose only residue is parked evidence ACs exits with the distinct `needs_human_evidence` status — never conflated with failure; on evidence supplied, write the evidence path into the AC row, then relaunch `resumeFromRunId` + identical `args` — the re-grade re-runs because its PROMPT changes (evidence-round tag / the row it reads), not from the resume alone: a byte-identical completed call replays cached.
- `<session>build-state.md` — the AC ledger (every blocking AC → pending/passed/failed/needs-human + grader + verdict; ids carry human slugs, e.g. `AC-3 gates-green`) + loop counters + `PD-n` rulings. The run is DONE only when every blocking AC reads `passed` and mechanical gates are green.

## Reproducibility tiers

Most → least canned: saved `/command` workflow  >  authored + linted + saved `plan.workflow.js` (mode-1)  >  ad-hoc orchestrator-authored (mode-2). For recurring shapes, save the script as a `/command` (`.claude/workflows/`, with `meta.whenToUse`); for bespoke reproducible work, mode-1 (author → lint → save); for one-offs, mode-2 — which still leaves an editable persisted script (every invocation persists under the session dir): iterate via edit-file + `{scriptPath}` + `resumeFromRunId`, the documented loop that narrows the mode-2/mode-1 gap.
