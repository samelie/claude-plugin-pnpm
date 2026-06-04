---
name: team-kit-run
description: "Execute a task as a native-workflow multi-agent run over the team-kit role agents. Reproducible, single-branch, prod-safe orchestration. Triggers: team-kit-run, run the team, execute the team plan, run the workflow team, orchestrate as a workflow, run plan.workflow, execute multi-agent workflow, fan out the team"
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

The 5 canonical shapes in `${CLAUDE_PLUGIN_ROOT}/team-templates/SCHEMA-CATALOG.md` (ResearchFindings / ImplResult / ReviewVerdict / VerifyReport / ACEvidence) describe the on-disk artifact CONTENT each stage writes. Per **rule 9**, heavy stages do NOT force them as a return — they write the artifact to `team-session/` and end with a `STATUS:` line the orchestrator parses (`statusOf` below). `schema:` is for LIGHT stages only.

```js
// Heavy agents do real tool work → they reliably FINISH but skip a forced StructuredOutput (rule 9).
// Heavy stages take NO schema: they WRITE their artifact to team-session/ + end with a STATUS line the
// orchestrator parses. statusOf() reads it. Schema is reserved for LIGHT stages (discovery/echo).
const statusOf = (t) => /STATUS:\s*CLEAN/i.test(t || '') ? 'clean'
  : /STATUS:\s*ERRORS_REMAINING/i.test(t || '') ? 'errors' : 'partial'
const ok = (s) => s === 'clean'

// RESEARCH (read-only, parallel) — DEFAULT agent + injected role (path A). FREE TEXT + writes findings.md.
const RESEARCHER = `You are a team RESEARCHER. Read-only. Use ToolSearch to load ` +
  `mcp__cocoindex-code__search / claude-mem / context-mode; follow investigation-methodology. ` +
  `Do NOT modify files. Write findings to <session>research/<name>.md, then END with a STATUS line.`
const research = await parallel(areas.map(a => () =>
  agent(`${RESEARCHER}\nInvestigate: ${a.desc}\nWrite: <session>research/${a.name}.md`,
    { label: `research:${a.name}`, phase: 'Research' })))        // NO agentType, NO schema → free text
// orchestrator reads <session>research/*.md for detail; gate on statusOf(research[i]).

// IMPLEMENT — single-writer (default, safe on one branch). FREE TEXT + writes coder-{name}/progress.md.
const runImplement = (fb) => agent(
  `Implement ${task} in ${files}. ${context}${fb || ''}\n` +
  `Edit ONLY your owned files. Write progress to <session>coder-${name}/progress.md; END with a STATUS line.`,
  { label: `impl:${name}`, phase: 'Implement', agentType: 'claude-plugin-pnpm:team-coder' })   // NO schema
await runImplement()
// IMPLEMENT — propose-then-apply (parallel reasoning, serial mutation). PROVEN logic (de-harness): same-path = FLAG.
// Coders WRITE a unified diff to <session>proposals/{name}.diff (FILE handoff — robust vs schema diff-fidelity) +
// state target path(s) + STATUS. NO schema. The apply stage reads the patches; grouping/collision is pure JS.
await parallel(modules.map(m => () =>
  agent(`Propose ${m.task}. Do NOT edit source. Write a unified diff to <session>proposals/${m.name}.diff, ` +
    `state the target path(s), END with STATUS.`,
    { label: `propose:${m.name}`, phase: 'Propose', agentType: 'claude-plugin-pnpm:team-coder' })))
// APPLY (one writer): read <session>proposals/*.diff (Bash), group by target path; a path with >1 proposer =
// COLLISION → flag for manual merge (never clobber); apply the rest serially. Pure file + JS, no schema.

// REVIEW + bounded reject → re-dispatch (PROVEN de-harness: reject@1 → feedback → approve@2; max-3 cap).
// spec gates quality; STATUS drives the loop (NO schema — reviewers do real diff-reading work, rule 9).
const MAX_REDISPATCH = 3
let attempt = 0, status = null
const feedback = []
while (attempt < MAX_REDISPATCH) {
  const fb = feedback.length ? `\nAddress prior review feedback (detail in <session>reviewer/*.md): ${feedback.join(' | ')}` : ''
  await runImplement(fb)                                    // ← the IMPLEMENT thunk above (single-writer OR propose-apply)
  const spec = await agent(`Spec-review vs requirements; read the git diff. Write <session>spec-reviewer/spec-review.md; END with STATUS.`,
    { label: `spec#${attempt + 1}`, phase: 'Review', agentType: 'claude-plugin-pnpm:team-spec-reviewer' })
  if (!ok(statusOf(spec))) { feedback.push('spec failed — see spec-reviewer/spec-review.md'); attempt++; continue }  // spec gates quality
  const qual = await agent(`Quality-review (structure/quality/security). Write <session>reviewer/review.md; END with STATUS.`,
    { label: `qual#${attempt + 1}`, phase: 'Review', agentType: 'claude-plugin-pnpm:team-reviewer' })
  status = statusOf(qual)
  if (ok(status)) break
  feedback.push('quality failed — see reviewer/review.md'); attempt++
}
// still not clean at the cap → STOP, hand back to the human gate (no infinite churn).
if (!ok(status)) return { stage: 'review', attempts: attempt, blocked: true, feedback }

// FINALIZE — mechanical gates (heavy Bash). FREE TEXT report → <session>verifier/results.md + STATUS + failedGates line.
const verify = await agent(
  `Run lint/types/knip/test on the changed packages (git diff → pnpm -F filters). knip-skeptical. ` +
  `Write <session>verifier/results.md; END with a STATUS line and a one-line "failedGates:" list.`,
  { label: 'finalize', phase: 'Finalize', agentType: 'claude-plugin-pnpm:team-verifier' })   // NO schema

// VALIDATE (N+2) — automatable AC. FREE TEXT → <session>validation-report.md + STATUS. (Verifier runs the commands.)
const validate = await agent(`Verify automatable acceptance criteria with commands; write <session>validation-report.md; END with STATUS.`,
  { label: 'validate', phase: 'Validate', agentType: 'claude-plugin-pnpm:team-verifier' })   // NO schema

// SCHEMA IS FINE for LIGHT stages only — discovery/echo/tiny-verdict with little/no tool work
// (e.g. monorepo-health's DISCOVER). Heavy stages above must NOT use schema (rule 9).
```

## Output

- Structured result returned to the orchestrator (relay what matters).
- `team-session/{slug}/` artifacts: `prompt.md`, `research/*.md`, plan/review/verify outputs.
- A **human-gated checklist** of prod/irreversible items the workflow did NOT run.

## Reproducibility tiers

Most → least canned: saved `/command` workflow  >  generated + committed `plan.workflow.js`  >  ad-hoc orchestrator-authored. For recurring shapes, save the script as a `/command` (`.claude/workflows/`); for bespoke work, tier 2/3.
