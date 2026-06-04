---
name: team-kit-run
description: "Execute a task as a native-workflow multi-agent run over the team-kit role agents. Reproducible, single-branch, prod-safe orchestration. Triggers: team-kit-run, run the team, execute the team plan, run the workflow team, orchestrate as a workflow, run plan.workflow, execute multi-agent workflow, fan out the team"
disallowed-tools: AskUserQuestion
---

# /team-kit-run — Execute work as a native-workflow multi-agent run

Companion to `team-kit-create`. `create` PLANS (interactive, human-gated). `team-kit-run` EXECUTES — it drives the team-kit role agents through the native `Workflow` tool. You stay **orchestrator**: author + launch the workflow, gate the unsafe parts, report results. You do NOT do the work inline.

Design source of truth + verification evidence: `${CLAUDE_PLUGIN_ROOT}/WORKFLOW-MERGE-PLAN.md` (spikes 1–4). The rules below are EMPIRICALLY VERIFIED — do not assume otherwise.

## When to use

Three entry modes:
1. **Approved `plan.workflow.js`** (from `team-kit-create`) — run the full executable plan.
2. **Direct task** via the canonical invocation contract below — clear task that doesn't need the full clarify/explore planning ceremony. (Most common.)
3. **Saved template workflow** (`/monorepo-health`, etc.) — fully canned, parameterized via `args`.

NOT for: tiny 1–3 file tight-coupling fixes (single agent, no orchestration); anything still needing requirements clarification (run `team-kit-create` first).

### fork vs workflow — routing rule (verified, mutually exclusive)

Fork (~10x child cost discount) and the workflow path do NOT mix. Fork inherits the parent prompt cache via the **Agent tool** (omit `subagent_type`) = the native-team / `team-kit-create`-lead path ONLY. Workflow `agent()` calls are **named subagents with isolated caches** — live probe `wf_16f795f9-f2d` showed followers re-create ~14.5k tokens each (even warm + serial); there is NO cross-agent prefix reuse on the workflow path. So fork is architecturally N/A here.

| If the work is… | Route to | Why |
|---|---|---|
| shared-context ≫ per-task context AND N large parallel agents | **native-team + fork** (Agent tool, see FRAMEWORK `## Fork Mode`) | pay the shared context once via cache inheritance (~10x discount) |
| deterministic / resumable / independent stages | **workflow** (`/team-kit-run`) | lean per-agent context; reproducible; survives session exit |

**The workflow cost lever is model tiering (`opts.model:'sonnet'` on mechanical/review stages) + lean per-agent context — NOT cache sharing.** A workflow fanning out N agents that all need the same big blob pays N× for it: keep workflow prompts lean, push shared bulk to disk, agents read only their slice. Native-team is a **first-class sanctioned fork lane** for shared-context-heavy fan-out, not a legacy fallback.

## Hard platform rules (verified — non-negotiable)

These come from spikes 1–4 and shape EVERY workflow you author here.

| # | Rule | Consequence |
|---|------|-------------|
| 1 | **Bridge works.** `agent(p, {agentType:'claude-plugin-pnpm:team-coder'})` loads the role agent verbatim. (It *composes* with schema, but see rule 9 — don't schema-force heavy agents.) | Reuse role agents as workers — zero rewrite. |
| 2 | **Custom agentType = FIXED toolset:** `Read, Bash, Write, Edit (only if role grants), Skill, StructuredOutput`. Frontmatter CANNOT add tools. No `mcp__*`, no `ToolSearch`, no `Glob`/`Grep`. | Role agents can't reach raw MCP. |
| 3 | **Only the DEFAULT agent (no agentType) has `ToolSearch`** → can load any MCP on demand (cocoindex/claude-mem/context-mode), no permission prompt for reads. | Knowledge stages use the default agent — see path A. |
| 4 | **No scope guard fires for workflow writers** (`check-team-scope` inactive) AND workflow agents auto-`acceptEdits`. | A workflow agent can write anywhere, unattended. Writes need a discipline, not a hook. |
| 5 | **No worktrees** (project decision). Single branch. | Same-file parallel source writes are unguarded → serialize or propose-then-apply. |
| 6 | **Resume is within-session only**; each gated stage = a separate workflow run with its own journal. No mid-run user input. | Multi-gate work = several sequential runs; human gates live BETWEEN runs. |
| 7 | **Determinism:** `Date.now()`/`Math.random()`/argless `new Date()` THROW; scripts have NO `import`/fs/Node. | Pass timestamps via `args`; inline stage code (no imports). |
| 8 | **Kill switch:** `/workflows` TUI → `x` stops a run, `p` pause. Guard loops with `budget.total`. | Human can always stop a runaway run. |
| 9 | **Schema-forcing is unreliable for HEAVY agents.** Agents doing real tool work (multi-file edits, 100s of calls) reliably finish but skip the final `StructuredOutput` call — observed 5× in a live audit. In `parallel()` it degrades to `null` (survivable); a bare `await agent({schema})` **throws and aborts the whole run**. | Heavy stages (research/coder/review/verify/finish) take NO schema → write their artifact to `team-session/` + end with a `STATUS:` line the orchestrator parses. Reserve `schema:` for LIGHT stages (discovery/echo/tiny verdict). NEVER bare-`await` a schema agent on the critical path. |
| 10 | **Assert coverage after EVERY `parallel()` fan-out.** Rule 9's null-degradation + the standard `.filter(Boolean)` cleanup can silently DROP a fan-out element — a missing slice then reads as "all clean". | Capture the `parallel()` result; assert `results.filter(Boolean).length === inputs.length`. On a gap, return `errors_remaining` + a `coverageGap {expected, got, missing}` object and do NOT proceed — a dropped/skipped element must never read as covered (`coverage()` helper + pattern `monorepo-health.js:71-84`). |
| 11 | **Wrap EVERY critical-path heavy `await agent()` in try/catch (reliability-2).** Schema isn't the only abort vector: a stall-watchdog abort, a transient server/rate-limit throw, or a subprocess error makes a bare `await agent()` (even schema-less) **throw and abort the whole run** — losing every prior stage's in-memory progress. The `parallel()` null-degradation in rules 9–10 does NOT cover a *thrown* heavy await on the serial critical path (implement/spec/quality/finalize/validate). | Route every critical-path heavy `await agent()` through the `tryAgent()` wrapper: on throw it logs, synthesizes a `STATUS: ERRORS_REMAINING` result, and lets the orchestrator route to the human gate instead of crashing the run (pattern `monorepo-health.js:98-112`). |
| 12 | **`statusOf()` is a 4-way classifier — BLOCKED/NEEDS_CONTEXT escalate, they do NOT re-dispatch (reliability-3).** A 3-way `{clean\|errors\|partial}` collapses an agent's **escalate** signal ("the plan is wrong / I'm missing context") into the re-dispatchable bucket, so the review loop burns the FULL `MAX_REDISPATCH` budget re-running an unwinnable stage. Missing STATUS must NOT read as a soft `partial` either (no silent clean; observability-3). | Classify into `clean` / `blocked` (BLOCKED\|NEEDS_CONTEXT) / `errors` (ERRORS_REMAINING\|PARTIAL\|DONE_WITH_CONCERNS\|**missing STATUS**). Check BLOCKED/NEEDS_CONTEXT BEFORE ERRORS. `escalates(s)` → **break the loop immediately and return to the human gate** (don't increment `attempt`); only `errors` re-dispatches; only `clean` passes the gate (pattern `plan.workflow.js statusOf`). |
| 13 | **Mechanical / review / finalize stages MUST pass `model:'sonnet'` — reserve inherited opus for implement/design (cost-perf-2).** A stage with NO `opts.model` inherits the SESSION model (opus on the common path), so the documented tiering table is aspirational — finalize/validate/spec-review/quality-review silently run on opus, the single biggest avoidable workflow cost (the workflow path has NO cross-agent cache lever — model tiering IS the cost lever; see fork-vs-workflow routing). | Pass `model:'sonnet'` on EVERY mechanical (verifier/finalize/validate), review (spec/quality/plan/security), and finalize/finisher `agent()` call — set it on the `phases[]` entry AND each `agent()` opts (pattern `monorepo-fix.js:8-9,132`, `monorepo-health.js` Check/Fix). Only **implement** and **design/planning** stages keep inherited opus (real judgment work) — do NOT add `model:'sonnet'` there. |
| 14 | **Glob-disjointness pre-flight BEFORE any parallel source-write fan-out (reliability-7).** Worktrees are banned (rule 5), so disjoint `files_owned` is the ONLY structural backstop against two same-batch coders clobbering each other's uncommitted edits — yet no hook fires for workflow writers (rule 4) and the planner's "non-overlapping globs" is LLM discipline, not a runtime check (`PLANNER.md` file-ownership). A stale/typo'd plan with two coders sharing `src/**` will silently last-writer-win. | Before launching a parallel source-writing fan-out, run the deterministic `disjoint(owners)` pre-flight: compute the pairwise glob intersection of every coder's `files_owned`; if ANY two intersect, do NOT fan out — HARD-FAIL (`return { stage, status: 'errors_remaining', overlaps }`) or auto-DOWNGRADE the colliding pair to a single-writer serial pipeline (or propose-then-apply). Disjoint = parallel OK. Pure JS (no fs/glob import — rule 7) — see the `disjoint()` helper + pattern below (mirrors the report-only `plan.workflow.js overlapPairs()`). Read-only fan-out and per-agent `team-session/` artifact writes (disjoint paths by construction) are EXEMPT — this gates source edits only. |

### Rule 6 sub-note — `resumeFromRunId` + caching semantics

Capture each launch's `WorkflowOutput.runId` and, after a **partial** run (some stages done, one crashed/rate-limited/timed out), prefer **resuming** over a cold relaunch: pass the prior `runId` as `resumeFromRunId`. Completed `agent()` calls whose inputs are UNCHANGED return cached — the run skips re-paying for already-finished stages and picks up at the failed one. Re-launching cold re-runs everything (live this audit: a cold relaunch re-ran ~72 agents).

`resumeFromRunId` is the within-session incremental-cache mechanism that backs rule 6. Use it for: the bounded reject→re-dispatch review loop (only the changed stage re-runs) and any single within-session multi-stage run that partially failed.

**Thread the `runId` — don't just document it (gaps-1).** Two threading levels: (a) WITHIN one workflow run the engine already caches completed `agent()` calls, so the in-script reject→re-dispatch loop costs nothing extra for unchanged stages; (b) ACROSS launches — when a re-dispatch crosses a human gate and becomes a SEPARATE `Workflow` launch — the orchestrator MUST keep the prior run's `WorkflowOutput.runId` (captured at step 4) and pass it as `resumeFromRunId` on the relaunch. Skip that and every prior passing stage re-runs from scratch. Same-session-only.

**Do not oversell it — `resumeFromRunId` is same-session-only.** It does NOT survive session exit and is NOT a cross-session checkpoint (for that, use a durable on-disk `team-session/` artifact/marker). The cache discount also depends on inputs being identical: if a resumed stage's prompt/`args` changed, that stage (and everything downstream of it) re-runs — see the resume-args contract below for the failure mode when `args` drift.

### Rule 6 resume-args contract — RE-PASS THE SAME `args` ON RESUME (reliability-9)

**When you resume with `resumeFromRunId`, you MUST re-pass the exact same `args` you launched with.** `resumeFromRunId` resumes the *journal*, NOT the `args` — omit them and every arg-interpolated global (`SESSION`, `PKG`, `DOC_URLS`, …) comes back `undefined`. This fails SILENTLY and is doubly destructive:

1. **Full cache miss.** The cache key is the rendered prompt TEXT. Every `agent()` prompt that interpolated an arg now renders differently (the arg reads `undefined`), so EVERY prompt changes → nothing cache-hits → the whole run re-pays from scratch. (Hit live this audit: a resume with dropped `args` re-ran ~72 agents instead of cache-hitting, ~5M tokens re-spent.)
2. **`undefined`-path writes.** A `Write` target built as `` `${SESSION}audit-report.md` `` renders `undefinedaudit-report.md` → files land at the REPO ROOT as `/repo/undefined*` instead of inside `team-session/`. No error is raised — the run looks like it succeeded.

Neither failure throws. Treat re-passing identical `args` as part of the resume call, not an optional extra. Same rule for the post-gate relaunch in step 4 and the reject→re-dispatch loop: if you thread the prior `runId`, thread the prior `args` with it.

**Guard at the top of every script (fail-loud).** Args can also go missing on a fresh cold launch (typo'd `args` key, wrong invocation). Add a top-of-script guard so the run aborts with a clear error instead of silently writing to `/repo/undefined*`:

```js
// fail-loud if args were dropped (e.g. resume without re-passing args, or a typo'd key).
// without this the run interpolates `undefined` into prompts + Write paths and SILENTLY
// cache-misses every stage + writes to /repo/undefined* (reliability-9).
const SESSION = args.session   // absolute team-session path, e.g. team-session/20260604-slug/
if (!SESSION) throw new Error('args missing: `session` is undefined — re-pass the SAME args on resumeFromRunId (rule 6 resume-args contract)')
// repeat for every required arg the prompts interpolate (PKG, DOC_URLS, timestamps, …):
const PKG = args.pkg
if (!PKG) throw new Error('args missing: `pkg` is undefined (rule 6 resume-args contract)')
```

## Knowledge routing (path A — verified)

- **Research / investigation / knowledge-heavy** stages → **DEFAULT agent** (no `agentType`). Inject the role in the prompt + tell it to `Skill('investigation-methodology')` and use `ToolSearch` to load `mcp__cocoindex-code__search`, `mcp__plugin_claude-mem_mcp-search__*`, `mcp__plugin_context-mode_context-mode__*`. (Spike 4: default agents reached cocoindex + claude-mem this way.)
- **Execution** stages (implement/review/verify/finalize) → custom `agentType` directly (no raw MCP needed). In-role lookups fall back to Skill wrappers (`ccc`, `mem-search`, `context-mode`) or Bash ripgrep.

## Single-branch write model (verified)

Clobber risk is **same-FILE** writes, not parallel writes. Three write types:
- **Schema returns** — not files; always parallel-safe.
- **`team-session/` artifacts** (each agent → its OWN path, e.g. `coder-X/progress.md`) — parallel-SAFE (disjoint paths never collide; spike 4 confirmed concurrent writes).
- **Source edits** (`packages/...`) — the only constrained case:
  - disjoint file-ownership → parallel OK, **but PROVE it first**: run the `disjoint(owners)` glob pre-flight (rule 14, reliability-7) before the fan-out — the planner's "non-overlapping globs" is discipline, not a runtime check, and no hook fires for workflow writers. Any pairwise overlap → halt or downgrade to single-writer (a stray out-of-lane agent clobbering a peer is otherwise UNDETECTED).
  - **single-writer** (serial pipeline, one source-writer at a time) — default, safe; also the auto-downgrade target when the disjointness pre-flight flags an overlap.
  - **propose-then-apply** — parallel coders WRITE a unified-diff patch to `<session>proposals/{name}.diff` (FILE handoff — robust vs schema diff-fidelity); ONE sequential apply stage reads the patches, applies disjoint ones + flags same-file collisions. Parallel reasoning, serial mutation.

## Prod-gating (mandatory)

NEVER place prod-mutating / irreversible / paid-live actions inside the autonomous workflow: deploys (`pulumi up`), DB migrations, deletes, `kubectl` mutations, scaling, ingest kicks, live cost-incurring API calls. Classify each task item; route unsafe ones to a **human-gated checklist** you return to the user. The workflow does the read-only / analysis / safe-code parts. (Spike 4: the planner correctly gated all 7 prod items.)

## Canonical invocation contract

If the user hasn't supplied these, infer from context or ask briefly. Fields:

```
TASK:            <what to accomplish>
SCOPE:           <pnpm -F targets / dirs / files>
ACCEPTANCE:      <done = tests green / endpoint works / AC list>
GATES:           <what needs human approval — or "standard: approve plan before execution">
DO-NOT-AUTOMATE: <prod/irreversible/paid → human-gated — or "none">
KNOWLEDGE:       <codebase research needed? y/n>
WRITES:          <single-writer (default) | propose-then-apply>
BRANCH:          single branch, no worktrees.
```

## Procedure (orchestrator)

1. **Triage the task** against the rules: which parts are read-only (parallel-safe), which are source-writes (serialize/propose-apply), which are prod (gate out).
2. **Seed team-session** (optional but preferred for traceability): `mkdir team-session/{YYYYMMDD-slug}/`; write `prompt.md` (raw task). Pass the absolute session path into agents.
3. **Author the workflow** by composing the stage templates below. Use `phase()` per stage; set `opts.phase` inside `parallel`/`pipeline`. Heavy stages return FREE TEXT + a disk artifact + a `STATUS:` line (rule 9); reserve `schema:` for LIGHT stages.
4. **Launch** via the `Workflow` tool (background). **Capture the launch's `WorkflowOutput.runId`.** For multi-gate work, run ONLY up to the next human gate, present, then launch the next run — and pass the prior `runId` as `resumeFromRunId` **AND re-pass the SAME `args`** on that next launch so already-completed, unchanged `agent()` calls return cached instead of re-running (rule 6 + sub-note + resume-args contract). Dropping `args` on resume re-renders every prompt → full silent cache miss + `/repo/undefined*` writes (reliability-9). Same-session-only. The reject→re-dispatch review loop is the prime beneficiary: thread the prior `runId` (with identical `args`) so only the changed implement/review stage re-runs, not the whole pipeline.
5. **Report**: relay the structured result + team-session artifact paths. Return the prod-gated checklist for the user to run manually.

## agentType selection (stage → role)

Pick by capability. Knowledge stages = DEFAULT agent (rule 3); execution stages = custom agentType (rule 2). Don't guess from the 17-role roster — use this map.

| Stage | agentType | Why |
|-------|-----------|-----|
| Research / investigate | **(none — default agent)** | needs ToolSearch→MCP (rule 3); inject researcher role + `Skill('investigation-methodology')` |
| Deep-dive one subsystem | `claude-plugin-pnpm:team-architect` | focused module brief (read-only) |
| Root-cause debugging | `claude-plugin-pnpm:team-investigator` | hypothesis-one-at-a-time (loop-until-dry) |
| Implement (source write) | `claude-plugin-pnpm:team-coder` | single-writer or propose-then-apply |
| Write/refresh tests | `claude-plugin-pnpm:team-tester` | can Edit test files |
| Spec review (FIRST) | `claude-plugin-pnpm:team-spec-reviewer` | compliance vs requirements |
| Quality review (AFTER spec) | `claude-plugin-pnpm:team-reviewer` | structure/quality/security |
| Security audit | `claude-plugin-pnpm:team-security-auditor` | OWASP scan |
| Finalize: lint/types/knip/test | `claude-plugin-pnpm:team-verifier` | mechanical gates, knip-skeptical |
| Strip logs / comment standards | `claude-plugin-pnpm:team-finisher` | final cleanup |
| Plan critique | `claude-plugin-pnpm:team-plan-reviewer` | fresh-context plan review |

## Execution-stage templates (INLINE these — no imports)

The 5 canonical shapes in `${CLAUDE_PLUGIN_ROOT}/team-templates/SCHEMA-CATALOG.md` (ResearchFindings / ImplResult / ReviewVerdict / VerifyReport / ACEvidence) describe the on-disk artifact CONTENT each stage writes. Per **rule 9**, heavy stages do NOT force them as a return — they write the artifact to `team-session/` and end with a `STATUS:` line the orchestrator parses (`statusOf` below). `schema:` is for LIGHT stages only.

```js
// TOP-OF-SCRIPT GUARD (reliability-9) — fail loud if args were dropped. resumeFromRunId resumes the
// journal, NOT args; omit them on resume and SESSION/PKG/etc. read `undefined`, every prompt re-renders
// (full silent cache miss) + Write paths become /repo/undefined*. Re-pass the SAME args on resume.
const SESSION = args.session   // absolute team-session path the agents Write under
if (!SESSION) throw new Error('args missing: `session` undefined — re-pass the SAME args on resumeFromRunId (rule 6 resume-args contract)')
// add one guard per required arg the prompts below interpolate (PKG, DOC_URLS, timestamps, …).

// Heavy agents do real tool work → they reliably FINISH but skip a forced StructuredOutput (rule 9).
// Heavy stages take NO schema: they WRITE their artifact to team-session/ + end with a STATUS line the
// orchestrator parses. statusOf() reads it. Schema is reserved for LIGHT stages (discovery/echo).
//
// 4-WAY CLASSIFIER (rule 12, reliability-3). A 3-way {clean|errors|partial} collapses BLOCKED and
// NEEDS_CONTEXT into a re-dispatchable bucket, so a "the plan is wrong / I'm missing context" agent
// burns the FULL MAX_REDISPATCH budget re-running an unwinnable stage instead of stopping. Split it:
//   • CLEAN              → done.
//   • BLOCKED|NEEDS_CONTEXT → 'blocked' → break the loop IMMEDIATELY, return to the HUMAN GATE
//                            (escalate signal — a human decision is needed; re-dispatch can't fix it).
//   • ERRORS_REMAINING   → 'errors' → re-dispatchable (the loop retries up to the cap).
//   • PARTIAL|DONE_WITH_CONCERNS → 'errors' → not-clean, re-dispatchable (never reads as clean).
//   • MISSING STATUS     → 'errors', NOT 'partial' (no silent clean; observability-3). A dropped/
//                          truncated terminal text must fail closed, never pass the gate.
// BLOCKED/NEEDS_CONTEXT MUST be checked BEFORE ERRORS_REMAINING so an "ERRORS_REMAINING but BLOCKED"
// line still escalates. Mirrors plan.workflow.js statusOf.
const statusOf = (t) => {
  const s = String(t || '')
  if (/STATUS:\s*CLEAN/i.test(s)) return 'clean'
  if (/STATUS:\s*(BLOCKED|NEEDS_CONTEXT)/i.test(s)) return 'blocked'   // escalate → human gate
  if (/STATUS:\s*ERRORS_REMAINING/i.test(s)) return 'errors'
  if (/STATUS:\s*(PARTIAL|DONE_WITH_CONCERNS)/i.test(s)) return 'errors' // not-clean, re-dispatchable
  return 'errors'                                                        // missing STATUS = errors, not clean
}
const ok = (s) => s === 'clean'
const escalates = (s) => s === 'blocked'   // BLOCKED/NEEDS_CONTEXT — break loop to the human gate

// TRY-AGENT WRAPPER (rule 11, reliability-2) — a bare `await agent()` on the serial critical path
// THROWS and aborts the WHOLE run if the agent stalls-out (watchdog abort), rate-limits, or its
// subprocess errors — even with NO schema. That loses every prior stage's in-memory progress. Wrap
// every critical-path heavy await through this: on throw it logs + synthesizes a STATUS:
// ERRORS_REMAINING result text (which statusOf() reads as 'errors') so the orchestrator routes to the
// HUMAN GATE instead of crashing. Mirrors monorepo-health.js:98-112. (parallel() degrades to null on
// its own — rule 9/10 — so this wrapper is for the SERIAL critical path: implement/spec/quality/finalize/validate.)
const tryAgent = async (label, p, opts) => {
  try { return await agent(p, opts) }
  catch (e) {
    const msg = (e && e.message) || e
    log(`Critical-path agent threw at ${label} — ${msg}. Synthesizing ERRORS_REMAINING → human gate (reliability-2).`)
    return `STATUS: ERRORS_REMAINING (agent threw at ${label}: ${msg})`   // statusOf() → 'errors'
  }
}

// COVERAGE ASSERTION (rule 10, reliability-1) — a parallel() fan-out can silently DROP an element:
// a schema-skipping heavy agent degrades to null (rule 9) and .filter(Boolean) erases it, so a
// missing slice would read as "all clean". After EVERY parallel() fan-out, assert full coverage:
// results.filter(Boolean).length === inputs.length, else return errors_remaining + a coverageGap
// object. A coverage gap MUST NOT return clean (pattern: monorepo-health.js:71-84).
const coverage = (results, expected) => {
  const got = results.filter(Boolean).length
  return got === expected ? null : { expected, got, missing: expected - got }
}

// GLOB-DISJOINTNESS PRE-FLIGHT (rule 14, reliability-7) — worktrees are banned (rule 5), so disjoint
// files_owned is the ONLY structural backstop against two same-batch coders clobbering each other; the
// planner's "non-overlapping globs" is LLM discipline, NOT a runtime check, and no hook fires for
// workflow writers (rule 4). Run this BEFORE any parallel SOURCE-write fan-out. Pure JS — no fs/glob
// import (rule 7); compares the literal segments of each glob (`**`/`*`/`?` as wildcards). Conservative:
// it FLAGS a pair when their patterns could match a common path; a flagged pair is downgraded/halted,
// never trusted. Read-only fan-out + per-agent team-session/ writes (disjoint paths) are EXEMPT.
// Mirrors the report-only plan.workflow.js overlapPairs().
//
// segMatch(a, b): could glob `a` and glob `b` match a common path? Walk segments; `**` swallows the rest.
const segMatch = (a, b) => {
  const A = a.split('/'), B = b.split('/')
  let i = 0, j = 0
  while (i < A.length && j < B.length) {
    if (A[i] === '**' || B[j] === '**') return true   // ** matches any remaining tail → potential overlap
    const wa = A[i].includes('*') || A[i].includes('?'), wb = B[j].includes('*') || B[j].includes('?')
    if (!wa && !wb && A[i] !== B[j]) return false      // two literal segments differ → disjoint
    i++; j++                                            // wildcard segment (or equal literals) → keep walking
  }
  // one pattern is a prefix of the other (e.g. src/a vs src/a/b) → overlap; equal-length consumed → overlap
  return true
}
const globsOverlap = (g1, g2) => g1.some(a => g2.some(b => segMatch(a, b)))
// owners: [{ name, files_owned: [glob,…] }, …]. Returns [] when fully disjoint, else the colliding pairs.
const disjoint = (owners) => {
  const overlaps = []
  for (let i = 0; i < owners.length; i++)
    for (let k = i + 1; k < owners.length; k++)
      if (globsOverlap(owners[i].files_owned, owners[k].files_owned))
        overlaps.push({ a: owners[i].name, b: owners[k].name })
  return overlaps   // empty = disjoint → parallel OK; non-empty = collision → halt or downgrade (rule 14)
}

// RESEARCH (read-only, parallel) — DEFAULT agent + injected role (path A). FREE TEXT + writes findings.md.
const RESEARCHER = `You are a team RESEARCHER. Read-only. Use ToolSearch to load ` +
  `mcp__cocoindex-code__search / claude-mem / context-mode; follow investigation-methodology. ` +
  `Do NOT modify files. Write findings to <session>research/<name>.md, then END with a STATUS line.`
const research = await parallel(areas.map(a => () =>
  agent(`${RESEARCHER}\nInvestigate: ${a.desc}\nWrite: <session>research/${a.name}.md`,
    { label: `research:${a.name}`, phase: 'Research' })))        // NO agentType, NO schema → free text
// COVERAGE ASSERTION (rule 10) — a dropped research area must NOT read as covered.
const researchGap = coverage(research, areas.length)
if (researchGap) { log(`Research coverage gap: ${JSON.stringify(researchGap)}. NOT clean.`)
  return { stage: 'research', status: 'errors_remaining', coverageGap: researchGap } }
// orchestrator reads <session>research/*.md for detail; gate on statusOf(research[i]).

// IMPLEMENT — single-writer (default, safe on one branch). FREE TEXT + writes coder-{name}/progress.md.
// Routed through tryAgent (rule 11) — a thrown coder (stall/rate-limit/subprocess) must NOT abort the run.
const runImplement = (fb) => tryAgent(`impl:${name}`,
  `Implement ${task} in ${files}. ${context}${fb || ''}\n` +
  `Edit ONLY your owned files. Write progress to <session>coder-${name}/progress.md; END with a STATUS line.`,
  // NO model override → inherits the session model (opus). implement is real design/judgment work — the
  // ONE stage class that keeps opus (rule 13). Do NOT add model:'sonnet' here; it's reserved for it + design.
  { label: `impl:${name}`, phase: 'Implement', agentType: 'claude-plugin-pnpm:team-coder' })   // NO schema
await runImplement()   // tryAgent-wrapped: on throw → STATUS: ERRORS_REMAINING text, not a run abort
// IMPLEMENT — propose-then-apply (parallel reasoning, serial mutation). PROVEN logic (de-harness): same-path = FLAG.
// Coders WRITE a unified diff to <session>proposals/{name}.diff (FILE handoff — robust vs schema diff-fidelity) +
// state target path(s) + STATUS. NO schema. The apply stage reads the patches; grouping/collision is pure JS.
//
// GLOB-DISJOINTNESS PRE-FLIGHT (rule 14, reliability-7) — BEFORE fanning out parallel source writers, prove
// their declared files_owned globs don't intersect. Even though propose-then-apply flags same-FILE collisions
// at apply time, an overlapping OWNERSHIP plan means two coders reason against the same files in parallel and
// produce conflicting diffs — catch it up front. A non-empty result = a stale/typo'd plan: HALT (return errors)
// or DOWNGRADE the colliding modules to a single-writer serial pipeline. modules carry { name, files_owned }.
const overlaps = disjoint(modules)
if (overlaps.length) { log(`Ownership overlap (reliability-7) — NOT disjoint, cannot parallel-write: ${JSON.stringify(overlaps)}. Halt or downgrade colliding modules to single-writer.`)
  return { stage: 'propose', status: 'errors_remaining', overlaps } }
const proposals = await parallel(modules.map(m => () =>
  agent(`Propose ${m.task}. Do NOT edit source. Write a unified diff to <session>proposals/${m.name}.diff, ` +
    `state the target path(s), END with STATUS.`,
    { label: `propose:${m.name}`, phase: 'Propose', agentType: 'claude-plugin-pnpm:team-coder' })))
// COVERAGE ASSERTION (rule 10) — a dropped proposer = a missing diff the apply stage would silently
// skip, landing a partial change that reads as complete. A coverage gap MUST NOT proceed to apply.
const proposalGap = coverage(proposals, modules.length)
if (proposalGap) { log(`Propose coverage gap: ${JSON.stringify(proposalGap)}. NOT clean — do NOT apply.`)
  return { stage: 'propose', status: 'errors_remaining', coverageGap: proposalGap } }
// APPLY (one writer): read <session>proposals/*.diff (Bash), group by target path; a path with >1 proposer =
// COLLISION → flag for manual merge (never clobber); apply the rest serially. Pure file + JS, no schema.

// REVIEW + bounded reject → re-dispatch (PROVEN de-harness: reject@1 → feedback → approve@2; max-3 cap).
// spec gates quality; STATUS drives the loop (NO schema — reviewers do real diff-reading work, rule 9).
// runId threading (gaps-1): the in-run loop below re-dispatches as separate agent() calls inside ONE workflow run,
// so the engine already caches the unchanged prior stages. The expensive miss is when a re-dispatch crosses a
// HUMAN GATE and becomes a SEPARATE launch: the orchestrator MUST capture this run's WorkflowOutput.runId (step 4)
// and pass it as resumeFromRunId on the relaunch — else every prior passing stage re-runs from scratch (same-session
// only; identical args required or the cache misses — see rule 6 sub-note + the resume-args contract).
// BLOCKED/NEEDS_CONTEXT from ANY stage breaks the loop to the human gate (rule 12, reliability-3) —
// re-dispatch cannot resolve "the plan is wrong / I'm missing context", so escalate instead of burning
// MAX_REDISPATCH on an unwinnable stage. Only 'errors' re-dispatches.
const MAX_REDISPATCH = 3
let attempt = 0, status = null, escalated = null
const feedback = []
while (attempt < MAX_REDISPATCH) {
  const fb = feedback.length ? `\nAddress prior review feedback (detail in <session>reviewer/*.md): ${feedback.join(' | ')}` : ''
  const impl = await runImplement(fb)                       // ← the IMPLEMENT thunk above (single-writer OR propose-apply); tryAgent-wrapped
  if (escalates(statusOf(impl))) { escalated = { at: `impl#${attempt + 1}`, reason: 'implement BLOCKED/NEEDS_CONTEXT — see coder progress.md' }; break }
  // spec + qual routed through tryAgent (rule 11): a thrown reviewer synthesizes ERRORS_REMAINING text →
  // statusOf reads 'errors' → not-ok → the loop re-dispatches/escalates instead of the throw aborting the run.
  const spec = await tryAgent(`spec#${attempt + 1}`, `Spec-review vs requirements; read the git diff. Write <session>spec-reviewer/spec-review.md; END with STATUS.`,
    // model:'sonnet' — review is a mechanical/review stage (rule 13). Reserve inherited opus for implement/design.
    { label: `spec#${attempt + 1}`, phase: 'Review', agentType: 'claude-plugin-pnpm:team-spec-reviewer', model: 'sonnet' })
  const specStatus = statusOf(spec)
  if (escalates(specStatus)) { escalated = { at: `spec#${attempt + 1}`, reason: 'spec BLOCKED/NEEDS_CONTEXT — see spec-reviewer/spec-review.md' }; break }  // escalate, don't re-dispatch
  if (!ok(specStatus)) { feedback.push('spec failed — see spec-reviewer/spec-review.md'); attempt++; continue }  // spec gates quality
  const qual = await tryAgent(`qual#${attempt + 1}`, `Quality-review (structure/quality/security). Write <session>reviewer/review.md; END with STATUS.`,
    // model:'sonnet' — review is a mechanical/review stage (rule 13). Reserve inherited opus for implement/design.
    { label: `qual#${attempt + 1}`, phase: 'Review', agentType: 'claude-plugin-pnpm:team-reviewer', model: 'sonnet' })
  status = statusOf(qual)
  if (escalates(status)) { escalated = { at: `qual#${attempt + 1}`, reason: 'quality BLOCKED/NEEDS_CONTEXT — see reviewer/review.md' }; break }  // escalate, don't re-dispatch
  if (ok(status)) break
  feedback.push('quality failed — see reviewer/review.md'); attempt++
}
// A BLOCKED/NEEDS_CONTEXT escalation OR still-not-clean-at-the-cap → STOP, hand back to the human gate
// (no infinite churn, and BLOCKED never burned the budget — it broke on the first hit).
// The orchestrator captured this run's WorkflowOutput.runId (step 4); pass it as resumeFromRunId on the
// post-gate relaunch so the already-passed stages stay cached and only the contested stage re-runs (gaps-1).
if (escalated) { log(`Review BLOCKED at ${escalated.at} → human gate (reliability-3): ${escalated.reason}`)
  return { stage: 'review', attempts: attempt, blocked: true, escalated, feedback } }
if (!ok(status)) return { stage: 'review', attempts: attempt, blocked: true, feedback }

// FINALIZE — mechanical gates (heavy Bash). FREE TEXT report → <session>verifier/results.md + STATUS + failedGates line.
// tryAgent-wrapped (rule 11): a thrown verifier (stall/rate-limit/subprocess) → ERRORS_REMAINING text, not a run abort.
const verify = await tryAgent('finalize',
  `Run lint/types/knip/test on the changed packages (git diff → pnpm -F filters). knip-skeptical. ` +
  `Write <session>verifier/results.md; END with a STATUS line and a one-line "failedGates:" list.`,
  // model:'sonnet' — finalize is a mechanical gate (rule 13). Reserve inherited opus for implement/design.
  { label: 'finalize', phase: 'Finalize', agentType: 'claude-plugin-pnpm:team-verifier', model: 'sonnet' })   // NO schema

// VALIDATE (N+2) — automatable AC. FREE TEXT → <session>validation-report.md + STATUS. (Verifier runs the commands.)
// tryAgent-wrapped (rule 11): on throw → ERRORS_REMAINING text → orchestrator routes to the human gate.
const validate = await tryAgent('validate', `Verify automatable acceptance criteria with commands; write <session>validation-report.md; END with STATUS.`,
  // model:'sonnet' — validate is a mechanical gate (rule 13). Reserve inherited opus for implement/design.
  { label: 'validate', phase: 'Validate', agentType: 'claude-plugin-pnpm:team-verifier', model: 'sonnet' })   // NO schema

// SCHEMA IS FINE for LIGHT stages only — discovery/echo/tiny-verdict with little/no tool work
// (e.g. monorepo-health's DISCOVER). Heavy stages above must NOT use schema (rule 9).
```

## Output

- Structured result returned to the orchestrator (relay what matters).
- `team-session/{slug}/` artifacts: `prompt.md`, `research/*.md`, plan/review/verify outputs.
- A **human-gated checklist** of prod/irreversible items the workflow did NOT run.

## Reproducibility tiers

Most → least canned: saved `/command` workflow  >  generated + committed `plan.workflow.js`  >  ad-hoc orchestrator-authored. For recurring shapes, save the script as a `/command` (`.claude/workflows/`); for bespoke work, tier 2/3.
