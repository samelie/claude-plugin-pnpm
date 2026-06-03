---
name: team-kit-run
description: "Execute a task as a native-workflow multi-agent run over the team-kit role agents. Reproducible, single-branch, prod-safe orchestration. Triggers: team-kit-run, run the team, execute the team plan, run the workflow team, orchestrate as a workflow, run plan.workflow, execute multi-agent workflow, fan out the team"
---

# /team-kit-run — Execute work as a native-workflow multi-agent run

Companion to `team-kit-create`. `create` PLANS (interactive, human-gated). `team-kit-run` EXECUTES — it drives the team-kit role agents through the native `Workflow` tool. You stay **orchestrator**: author + launch the workflow, gate the unsafe parts, report results. You do NOT do the work inline.

Design source of truth + verification evidence: `${CLAUDE_PLUGIN_ROOT}/WORKFLOW-MERGE-PLAN.md` (spikes 1–4). The rules below are EMPIRICALLY VERIFIED — do not assume otherwise.

## When to use

Three entry modes:
1. **Approved `plan.workflow.ts`** (from `team-kit-create`) — run the full executable plan.
2. **Direct task** via the canonical invocation contract below — clear task that doesn't need the full clarify/explore planning ceremony. (Most common.)
3. **Saved template workflow** (`/monorepo-health`, etc.) — fully canned, parameterized via `args`.

NOT for: tiny 1–3 file tight-coupling fixes (single agent, no orchestration); anything still needing requirements clarification (run `team-kit-create` first).

## Hard platform rules (verified — non-negotiable)

These come from spikes 1–4 and shape EVERY workflow you author here.

| # | Rule | Consequence |
|---|------|-------------|
| 1 | **Bridge works.** `agent(p, {agentType:'claude-plugin-pnpm:team-coder', schema})` loads the role agent verbatim; composes with schema. | Reuse role agents as workers — zero rewrite. |
| 2 | **Custom agentType = FIXED toolset:** `Read, Bash, Write, Edit (only if role grants), Skill, StructuredOutput`. Frontmatter CANNOT add tools. No `mcp__*`, no `ToolSearch`, no `Glob`/`Grep`. | Role agents can't reach raw MCP. |
| 3 | **Only the DEFAULT agent (no agentType) has `ToolSearch`** → can load any MCP on demand (cocoindex/claude-mem/context-mode), no permission prompt for reads. | Knowledge stages use the default agent — see path A. |
| 4 | **No scope guard fires for workflow writers** (`check-team-scope` inactive) AND workflow agents auto-`acceptEdits`. | A workflow agent can write anywhere, unattended. Writes need a discipline, not a hook. |
| 5 | **No worktrees** (project decision). Single branch. | Same-file parallel source writes are unguarded → serialize or propose-then-apply. |
| 6 | **Resume is within-session only**; each gated stage = a separate workflow run with its own journal. No mid-run user input. | Multi-gate work = several sequential runs; human gates live BETWEEN runs. |
| 7 | **Determinism:** `Date.now()`/`Math.random()`/argless `new Date()` THROW; scripts have NO `import`/fs/Node. | Pass timestamps via `args`; inline stage code (no imports). |
| 8 | **Kill switch:** `/workflows` TUI → `x` stops a run, `p` pause. Guard loops with `budget.total`. | Human can always stop a runaway run. |

## Knowledge routing (path A — verified)

- **Research / investigation / knowledge-heavy** stages → **DEFAULT agent** (no `agentType`). Inject the role in the prompt + tell it to `Skill('investigation-methodology')` and use `ToolSearch` to load `mcp__cocoindex-code__search`, `mcp__plugin_claude-mem_mcp-search__*`, `mcp__plugin_context-mode_context-mode__*`. (Spike 4: default agents reached cocoindex + claude-mem this way.)
- **Execution** stages (implement/review/verify/finalize) → custom `agentType` directly (no raw MCP needed). In-role lookups fall back to Skill wrappers (`ccc`, `mem-search`, `context-mode`) or Bash ripgrep.

## Single-branch write model (verified)

Clobber risk is **same-FILE** writes, not parallel writes. Three write types:
- **Schema returns** — not files; always parallel-safe.
- **`team-session/` artifacts** (each agent → its OWN path, e.g. `coder-X/progress.md`) — parallel-SAFE (disjoint paths never collide; spike 4 confirmed concurrent writes).
- **Source edits** (`packages/...`) — the only constrained case:
  - disjoint file-ownership → parallel OK (but a stray out-of-lane agent clobbering a peer is UNDETECTED — no hook).
  - **single-writer** (serial pipeline, one source-writer at a time) — default, safe.
  - **propose-then-apply** — parallel coders RETURN diffs as schema data, ONE sequential apply stage writes + flags same-file collisions. Parallel reasoning, serial mutation.

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
3. **Author the workflow** by composing the stage templates below. Use `phase()` per stage; set `opts.phase` inside `parallel`/`pipeline`. Schema every handoff.
4. **Launch** via the `Workflow` tool (background). For multi-gate work, run ONLY up to the next human gate, present, then launch the next run.
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

Schemas = the 5 canonical shapes in `${CLAUDE_PLUGIN_ROOT}/team-templates/SCHEMA-CATALOG.md` (ResearchFindings / ImplResult / ReviewVerdict / VerifyReport / ACEvidence). Inline the JS-object snippet per stage; do NOT import.

```js
// RESEARCH (read-only, parallel) — DEFAULT agent + injected role (path A) → ResearchFindings
const RESEARCHER = `You are a team RESEARCHER inside a workflow. Read-only. ` +
  `Use ToolSearch to load mcp__cocoindex-code__search / claude-mem / context-mode; follow investigation-methodology. ` +
  `Do NOT modify files; do NOT run prod mutations. Write findings to <session>/research/<name>.md, then return the schema.`
const findings = await parallel(areas.map(a => () =>
  agent(`${RESEARCHER}\nInvestigate: ${a.desc}\nWrite: <session>/research/${a.name}.md`,
    { label: `research:${a.name}`, phase: 'Research', schema: ResearchFindings }))) // NO agentType

// IMPLEMENT — single-writer (default, safe on one branch) → ImplResult
let prev = null
for (const m of modules) {                                  // serial: one source-writer at a time
  prev = await agent(`Implement ${m.task} in ${m.files}. ${m.context}`,
    { label: `impl:${m.name}`, phase: 'Implement', schema: ImplResult,
      agentType: 'claude-plugin-pnpm:team-coder' })
}
// IMPLEMENT — propose-then-apply (parallel reasoning, serial mutation) → ImplResult with .diffs[]
// PROVEN (de-harness): same-path proposals are FLAGGED for manual merge, not clobbered; disjoint applied serially.
// diffs is REQUIRED (minItems 1) — an optional diffs schema let coders silently drop their work (harness run 1).
const PROPOSE = ImplResult // + required:['taskId','status','diffs']; diffs:{minItems:1, items:{required:['path','newContent']}}
const proposals = await parallel(modules.map(m => () =>
  agent(`Propose changes for ${m.task}. RETURN diffs[] (path + newContent) as data; do NOT write files.`,
    { label: `propose:${m.name}`, phase: 'Propose', schema: PROPOSE, agentType: 'claude-plugin-pnpm:team-coder' })))
// APPLY (one writer): group diffs by target path; a path with >1 proposer = COLLISION → flag, never clobber.
const byPath = {}, noDiff = []
for (const p of proposals.filter(Boolean)) {
  if (!p.diffs || !p.diffs.length) { noDiff.push(p.taskId); continue }   // never silently skip a no-diff proposer
  for (const d of p.diffs) (byPath[d.path] = byPath[d.path] || []).push({ from: p.taskId, d })
}
const collisions = Object.entries(byPath).filter(([, v]) => v.length > 1)  // → human-gated manual merge
const safe = Object.entries(byPath).filter(([, v]) => v.length === 1)      // → apply sequentially, single writer
// apply `safe` in series via one team-coder/finisher; return `collisions` + `noDiff` to the human gate.

// REVIEW + bounded reject → re-dispatch (PROVEN de-harness: reject@1 → feedback → approve@2; max-3 cap).
// spec gates quality; on reject, issues[] + incompleteImplementations[] feed back into the implement thunk.
const MAX_REDISPATCH = 3
let attempt = 0, verdict = null
const feedback = []
while (attempt < MAX_REDISPATCH) {
  const fb = feedback.length ? `\nAddress these prior review issues:\n${JSON.stringify(feedback)}` : ''
  await runImplement(fb)                                    // ← the IMPLEMENT thunk above (single-writer OR propose-apply)
  const specV = await agent(`Spec-review vs requirements. Return ReviewVerdict (reviewType:"spec").`,
    { label: `spec#${attempt + 1}`, phase: 'Review', schema: ReviewVerdict, agentType: 'claude-plugin-pnpm:team-spec-reviewer' })
  const specOk = specV.decision === 'approved' || specV.decision === 'approved_with_conditions'
  verdict = specOk                                          // spec fail → skip quality, go straight to re-dispatch
    ? await agent(`Quality-review. Return ReviewVerdict (reviewType:"quality").`,
        { label: `qual#${attempt + 1}`, phase: 'Review', schema: ReviewVerdict, agentType: 'claude-plugin-pnpm:team-reviewer' })
    : specV
  if (verdict.decision === 'approved' || verdict.decision === 'approved_with_conditions') break
  feedback.push(...(verdict.issues || []), ...(verdict.incompleteImplementations || []))
  attempt++
}
// still rejected at the cap → STOP, hand back to the human gate with accumulated feedback (no infinite churn).
if (!verdict || (verdict.decision !== 'approved' && verdict.decision !== 'approved_with_conditions'))
  return { status: 'errors_remaining', stage: 'review', attempts: attempt, blockedBy: feedback }

// FINALIZE — parallel mechanical gates → VerifyReport (re-run ONLY failedGates to converge)
const gates = await parallel(['lint','types','knip','test'].map(g => () =>
  agent(`Run pnpm -F ${pkg} ${g} on affected packages; knip → {realIssues, suspectedFalsePositives}.`,
    { label: `finalize:${g}`, phase: 'Finalize', schema: VerifyReport,
      agentType: 'claude-plugin-pnpm:team-verifier' })))

// VALIDATE (N+2) — automatable AC only → ACEvidence; automatable:false routes to in-session manual
const evidence = await agent(`Verify the automatable acceptance criteria with commands; return ACEvidence.`,
  { phase: 'Validate', schema: ACEvidence, agentType: 'claude-plugin-pnpm:team-verifier' })
```

## Output

- Structured result returned to the orchestrator (relay what matters).
- `team-session/{slug}/` artifacts: `prompt.md`, `research/*.md`, plan/review/verify outputs.
- A **human-gated checklist** of prod/irreversible items the workflow did NOT run.

## Reproducibility tiers

Most → least canned: saved `/command` workflow  >  generated + committed `plan.workflow.ts`  >  ad-hoc orchestrator-authored. For recurring shapes, save the script as a `/command` (`.claude/workflows/`); for bespoke work, tier 2/3.
