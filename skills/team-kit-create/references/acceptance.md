# Acceptance — Dispatch Goal-Auditor for the Acceptance Contract (Steps 4c-b/4d/4d-b/4e detail)

How the lead runs the four acceptance passes that sit between planning and execution. The lead stays lean — `team-goal-auditor` does the work.

## When to Use

After `team-planner` has written `design.md` + `team-plan.md`, BEFORE the design-present /
review gates. Four passes:

1. **approach** — name the surfaces the build will make exercisable, one measurement suggestion each.
2. **define** — turn the requirements + plan into a checkable acceptance contract.
3. **sat** — per independently-falsifiable CLAUSE of each blocking AC, show a CORRECT run can actually
   satisfy it (the dual of falsifiability).
4. **audit** — adversarially check that contract + plan faithfully satisfy the *original* goal.

`approach` runs FIRST and the order is the whole leverage: it sets the AC taxonomy, so `define` grades
a live-surface criterion off a measurement record instead of punting it to a human (SKILL.md Step
4c-b). Skip that dispatch and `test -e verification-approach.md` rc 1 ⇒ the approach phase never ran ⇒
that evidence category does not exist for this session (`team-templates/DEFINITION-OF-DONE.md` Rule 6,
third category) — every live-surface AC reverts to the punt.

This is the cheapest place to catch intent drift — fixing a plan costs nothing vs. fixing built
code. On Codex, ordinary phase boundaries are autonomous under the recorded grant. Apply
`.agents/skills/team-kit-run/references/autonomy.md`: `BLOCKED` and `NEEDS_CONTEXT` return to root for
fresh reassessment, and the two-attempt SAT/audit counts below are checkpoints, not human gates.
Preserve cumulative counters and explicit user hard ceilings. New completion-first default thresholds
are advisory; renew finite allowances after fresh assessment without approval. Declare genuinely stuck
only after independent investigation identifies no useful untried in-scope experiment or an exact
human-only dependency; continue unrelated authorized work. Claude retains the explicit human gates and cap-2
escalation examples below.

## Artifacts

| Phase | Agent writes | Location |
|-------|--------------|----------|
| approach | `verification-approach.md` | session **root** (the taxonomy `define` classifies against) |
| define | `definition-of-done.md` | session **root** (canonical contract) |
| sat | `sat.md` | `goal-auditor/` (agent scratch) — **not** in the audit's read-set |
| audit | `goal-audit.md` | `goal-auditor/` (agent scratch) |

> **Pass an ABSOLUTE `session_path`.** `team-session/` is a persistent untracked dir; a relative path fails to
> resolve from a dispatched subagent's cwd and yields a false `BLOCKED`. (Learned from a dry-run:
> `define` resolved a relative path by luck, `audit` did not.)

## Step 0 — Approach (one dispatch)

Sits between planner and define (SKILL.md Step 4c-b). Its content spec — the four loose sections, the
four per-journey guards, the measurement-not-verification doctrine — lives there and in
`.claude/agents/team-goal-auditor.md` → Phase `approach`; do not restate it here, read it into the
dispatch prompt.

```javascript
Agent({
  subagent_type: "team-goal-auditor",
  description: "Verification approach — which surfaces will be exercisable",
  prompt: `
Phase: approach
Session path: \`${session_path}\`

Read \`${session_path}requirements.md\`, \`${session_path}design.md\`, \`${session_path}team-plan.md\`.
Write \`${session_path}verification-approach.md\` (root) — four LOOSE sections: exercisable surfaces;
one measurement suggestion per surface; which measurements cannot share an agent; the human residual
with its reason, so needs-human is a COUNTED residual and never a default. Scaffolding, not a contract.
A rendered UI on a dev server the run starts locally is EXERCISABLE (measurer: \`spyglass\`, or
Playwright MCP for scripted steps), never a human residual; only authenticated sessions, external /
production URLs and remote-mutating steps are (SKILL.md Step 4c-b).
MEASUREMENT, never verification: every agent this approach proposes exercises a surface and records
input and output VERBATIM — no PASS, no FAIL, no "works correctly"; judgment happens later, in a
DIFFERENT agent reading the record. A measurement agent's STATUS line reports whether the MEASUREMENT
completed, never whether the product works — carry that sentence verbatim into every prompt you suggest.
Four guards per journey (the ARTIFACT never the claim, a NEGATIVE CONTROL, a CORRELATION HANDLE, and
the PROD-GATING side each surface declares) and the suggestions-MAY-BE-SUPERSEDED rule: SKILL.md Step
4c-b — read them in.
Do NOT classify ACs and do NOT author criteria here; that is define, in the next dispatch.
Close \`${session_path}verification-approach.md\` with its own terminal STATUS line — its last non-empty
line, byte-identical to the one you return, nothing after it.
`
})
```

If approach returns `STATUS: ERRORS_REMAINING` (the plan is too vague to name a single exercisable
surface) → route back to the planner with what stays unexercisable, then re-run approach.

## Step 1 — Define (one dispatch)

```javascript
Agent({
  subagent_type: "team-goal-auditor",
  description: "Author acceptance contract (definition-of-done)",
  prompt: `
Phase: define
Session path: \`${session_path}\`

Read \`${session_path}prompt.md\`, \`${session_path}requirements.md\`, \`${session_path}team-plan.md\`,
\`${session_path}verification-approach.md\` (the TAXONOMY — which surfaces are exercisable; it is the
producer check for every measurement-graded AC, so define cannot classify without it).
Author \`${session_path}definition-of-done.md\` — checkable acceptance criteria.
Every AC id carries a human slug (\`AC-3 gates-green\`, never bare \`AC-3\`) — ids surface at human
decision points downstream (team-session-writing → Readable ids).
Anchor criteria to prompt.md (the goal), not to whatever the plan happens to do.
Coverage both directions: every deliverable ≥1 AC; every AC maps_to ≥1 real task.
Third direction — DECISIONS: every ratified decision whose effect depends on an instruction REACHING
an agent or a prompt names its producing site (the task, the prompt block, or a gate over the output).
A decision with no producing site will not happen.
Fourth direction — PROMPT PRONGS, as a TABLE. The contract carries a **Prompt-prong coverage**
section: one row per distinguishable prong of prompt.md (each ask, each constraint, each *not-this*
qualifier; split a sentence carrying two), quoted verbatim, against the AC id(s) that grade it.
An empty AC cell is a define-phase defect with two legal closes: cover it with an AC, or write
\`ungraded — <reason>\` in the cell. Never omit the row. Constraint-shaped prongs ("not too
technical", "read-only", "small") are the ones that evaporate — they name no deliverable, so
deliverable-coverage never asks after them, and a prong with no AC is invisible to SAT, to the blind
audit and to the run-lane grade.
The approach sets the taxonomy — read it before classifying anything. An AC whose surface
\`verification-approach.md\` lists under **exercisable surfaces**, declared on the AUTONOMOUS side of
the prod-gating line, is \`semantic\` graded off a measurement record — never a needs-human punt. Name
that record by RESERVED SHAPE (\`measurer/attempts/[{epoch}/]{journey-key}/{attempt}/result.md\`):
COMPOSE mints the journey key and \`build-state.md\` reserves the attempt at run time, so a concrete
path invented here is a fabrication, and \`test -e\` / the \`team-plan.md\` grep REJECT the row they are
run on (\`DEFINITION-OF-DONE.md\` Rule 6, third category). needs-human is legal only for a residual the
approach already counted and justified, and the AC cites that row.
Hybrid grading: mostly deterministic (lint/types/knip/test/assertion), at least ONE semantic.
Apply this reference's Final-state review contract: grade final writer output, persist verdicts and
input/contract hashes, and explicitly include correction tasks in coverage.
`
})
```

If define returns `STATUS: ERRORS_REMAINING` (a deliverable can't be made checkable), route by class
(Finding classes): inline-fix each `silent` row whose Fix cell qualifies (the DoD closes through
`inline-fixes.md` like any verdict), copy `loud` rows to `run-watch.md`, and send only what remains back
to the planner/designer to sharpen, then re-run define.

## Final-state review

- Name the last substantive writer of each graded artifact, including correction tasks. Schedule the independent semantic grade after that writer; evaluate correction behavior when agent performance is itself in scope.
- Persist per-AC PASS/FAIL verdicts with evidence and SHA-256 hashes for the exact delivered artifacts, decisive report/fix inputs and acceptance contract. Declare the reviewed input inventory in the contract before grading; the grader cannot omit an inconvenient input. File presence or a nonempty verdict document does not prove acceptance.
- Freeze those inputs before review. Any later input or contract edit invalidates the old grade until affected validation is rerun against the new bytes. Never carry an old PASS forward by only replacing its hash. Approval classification is separate (`approval.md`).
- Put post-verdict delivery/notification notes in a separate closure record, outside the frozen inventory. If a closure event changes a substantive claim, reopen affected review; do not hide it as a notification or rewrite frozen observations after grading.
- For Codex native runs, reuse `.agents/skills/team-kit-run/scripts/check.mjs` and its `references/state-contract.md` contract/evidence receipts. Do not create a second state ledger. Adapted report-only runs may persist verdicts/hashes in their declared review artifact and compare hashes directly; label that route accurately.
- Citation checks require a nonempty inspected set when citations are required, resolvable locators and semantic support sampling (`evidence.md`). Existence checks alone cannot pass the semantic grade.
- Grade seal (DoDs carrying the `grade-seal-gate` row — `.claude/team-templates/DEFINITION-OF-DONE.md` rule 8): the grader writes the reviewed-input inventory as `shasum -a 256` lines (`<64-hex>  <path>`, path absolute under the repo root or repo-relative, never session-relative) in the grade file and grades every other row, never the gate row. The pre-grade validate stage records the gate row DEFER — post-grade seal closure. After the grade file is frozen, the plan's post-grade seal task runs `grade-seal.mjs`, the orchestrator commits every `WROTE` path path-limited on `main`, then `node .claude/skills/team-kit-run/scripts/check-grade-seal.mjs <abs session>` must exit 0; that result, recorded in the closure record (never in the grade file), marks the row passed — exit 1 fails closure, exit 3 means not gated. A regrade writes a new grade file and needs a new seal. Rule: `references/grade-seal.md`.

## Finding classes — what blocks a seal (Claude lane)

Every SAT defect, goal-audit gap, plan-review issue or readiness gap, and every plan-side finding a
define pass raises, carries one class. The class, not the count or the reviewer's word "blocking",
decides the route. Fix at create time only what the run cannot
detect itself: a loud defect costs one coder fix at run time; a create round costs a planner revision, a
define revision and the re-checks (measured 2026-11-05, `20261104-moirai-nixos-pivot`: define passes
25–70M cached input each against 7–8M for the small planner edits they followed).

| Class | Means | Examples (moirai) | Route |
|---|---|---|---|
| `silent` | a correct-looking run passes while the goal is unmet: counterfeit or hollow green, a false claim, a Destination gap, a side effect no check sees, a missing producer (no task makes the passing state, so it shows only at the final grade). A `loud` finding is `silent` too when it would first show at (a) a frozen artifact, (b) an unforgeable witness, (c) production or external state or (d) paid, one-shot or irreversible work (SKILL.md Step 4d-b → Keep it proportionate), or only after a long wait, or on a path the run never exercises that a blocking AC or the Destination needs. A Nit, or a defect no blocking AC or Destination prong needs, is a recommendation, never a finding | failed envelope passes SC-12; LightRAG data never moves; a commit sweeps unrelated dirty files; logs age out before the 90-day check reads them | fix before seal — inline when it qualifies, else one planner revision |
| `loud` | the run fails visibly at the step: missing binary, unrunnable command, an assignee without the tool it needs, task cycle, start order, wrong flag, an open choice whose wrong pick fails | host lacks `jq`; T-98/T-99 cycle; service starts before bootstrap | a `## Run watch` row; never a revision |
| `stale` | no longer true on disk | rules the plan cites were committed after the check | drop; the checker lists it under `## Stale` with the commit or `file:line`; never counts |

**Inline fix.** The lead edits the artifact directly — no planner, define, SAT, audit or review
re-dispatch — when all hold: the finding's row has a Fix cell (`Fix` / `Inline fix` column) holding the
exact new text in backticks, then where it goes (`` `<new text>` → T-58 ``), with the current text
quoted elsewhere in the row, never in the Fix cell; the lead applies that text verbatim; no AC statement
or threshold is weakened (adding the precondition the finding states is allowed); only tasks or
sections the finding names change, about 10 lines or fewer. The checker authored the fix, so the repair
does not certify itself (`team-goal-auditor.md` → the `[AMENDED]` rule). A fix that needs the lead's own
wording or judgement is a planner revision. Record each in `inline-fixes.md` at the session root, one
line: `- <verdict file> <finding id> — <contract file> — was: <the quoted current text, or (insert)> —
now reads: <the new text>`. The verdict file is never edited. `scripts/check-inline-fixes.mjs` closes the
row when the new text is in its Fix cell and in the contract file (`team-plan.md`, `design.md`,
`requirements.md` or `definition-of-done.md`) and the old text is gone. A `loud` finding needs no create-time fix; the lead may still apply its
hint the same way.

**Run watch.** The lead copies every row a verdict lists under `## Run watch` into `run-watch.md` at
the session root, one line: `- <verdict file> <id> — <task> / <AC clause> — symptom: <what the run will
show> — hint: <fix>`. It sits outside `definition-of-done.md`, so the graded contract's bytes stay
fixed. `/team-kit-run` boot folds each row into the named task's coder prompt as a pre-authorized fix,
and the verifier checks the rows first; a row still failing goes to triage with its hint.

**Sealing.** A plan seals when no `silent` finding is open:
`node "$REPO/.claude/skills/team-kit-create/scripts/check-inline-fixes.mjs" "$ABS_SESSION"` exits 0.
Each verdict file (`definition-of-done.md`, `goal-auditor/sat.md`, `goal-auditor/goal-audit.md`,
`plan-review.md`) ends `STATUS: CLEAN` or `STATUS: ERRORS_REMAINING: <n>`, and every `silent` row it lists
is closed in `inline-fixes.md`, by an inline fix or by `- <verdict file> <id> — accepted: D-n`, where
map.md row `D-n` names that finding id and is a live user decision (`Source: user`; never a waiver,
`prompt.md` or afk). Every `## Run watch` row must also reach `run-watch.md` with its symptom and hint.
`loud` and `stale` findings never block a seal, never fire a revision and never reach a Loop budgets
checkpoint. Run boot runs the same script; it applies the older rule (goal-audit CLEAN, sat CLEAN or
skipped) to efforts whose session id is dated before 2026-11-06 and that carry neither `inline-fixes.md`
nor `run-watch.md`.

## Step 1b — SAT: satisfiability (one dispatch; Codex checkpoint 2, Claude cap 2)

define proves every criterion is **falsifiable**. SAT proves each blocking one is **satisfiable** — the
question no downstream gate asks, because both the blind audit and the plan review check coherence, and an
unsatisfiable criterion is usually perfectly coherent. Skip the REST only if NO blocking AC grades a frozen
artifact, an unforgeable witness, a production/external state, or paid-irreversible work (SKILL.md 4d-b →
Keep it proportionate); mode 5 (the assignee cannot run the step) is **never** skipped — it fires on plain
deterministic gates. Check permissions, host command availability and argument semantics even on a contract
you skip the rest for; run exact safe read-only checks when their inputs exist.

```javascript
Agent({
  subagent_type: "team-goal-auditor",
  description: "SAT — reachable passing state per blocking-AC clause",
  prompt: `
Fresh-check: sat
Phase: sat
Session path: \`${session_path}\`

You did not author this contract (or if you did, in an earlier dispatch you no longer remember) —
read it cold.

Read \`${session_path}definition-of-done.md\`, \`${session_path}team-plan.md\`,
\`${session_path}design.md\`, \`${session_path}requirements.md\` (for the frozen / forbidden set).
Read-set: \`references/fresh-checks.md\` → \`sat\`.
Reading outside this set breaks the check's isolation (\`references/fresh-checks.md\` → Closed set).

For EVERY blocking AC answer the dual of falsifiability: can a CORRECT run SATISFY this?
Write \`${session_path}goal-auditor/sat.md\`, one row per independently-falsifiable CLAUSE of a
blocking AC — a statement carrying three clauses gets three rows, because one averaged row never asks
the producer question of the clause that has none:
AC (+ clause index when the statement carries more than one — \`AC-29 c3\`) | passing state
(observable at a point in time) | produced by (task + the ACTUAL site — the repo FILE PATH that must
change, which must be a string inside the \`files_owned\` of an agent owning a task in this AC's
\`maps_to\`; for a dependency-injected seam cite the composition-root BINDING file:line, never the
call site) | preconditions that state needs | forbidden by anything the contract freezes? | is a
COUNTERFEIT passing state also reachable (green with none of the work done)?

Rules:
- A state is something you could observe and record. "the seam is invoked", "the module is wired",
  "the agent attempts X" are activities, not states — return those as un-checkable.
- Reachable by the plan's OWN tasks, not by a plausible world where someone does the obvious thing.
- Executor feasibility includes command availability and argument semantics, not only permission text.
  Resolve external binaries on the actual host; recognize shell builtins such as test. Run the exact
  safe read-only verification command when its inputs exist, recording exit status. Never execute a
  destructive or external mutation to preflight it; validate its permitted route and prerequisites.
  For future inputs, assign the exact-command check to the producing task and do not claim it ran.
- Split, count, contain, grep — in that order, before you return. Clause count vs \`produced by\`
  entry count: unequal ⇒ a clause has no producer, RED on the arithmetic alone. Then each clause's
  path contained in a mapped owner's \`files_owned\`; then resolve that clause's writer on disk and
  \`/usr/bin/grep -c "<its owning package dir>" team-plan.md\` — \`0\` ⇒ owned by NO lane ⇒ mode "the
  producer does not exist", ERRORS_REMAINING before a coder is dispatched. Column-existence is not
  reachability.
- Counterfeit reachable ⇒ the fix is a PRECONDITION written into the existing AC (asserted, rc-checked,
  recorded in its evidence artifact) — never a new AC.
- NEVER propose weakening a criterion to make it satisfiable. Legal moves: make the passing state
  reachable, or move the AC out of blocking with the reason recorded.
- Class every defect \`silent\`, \`loud\` or \`stale\` (\`references/acceptance.md\` → Finding classes, which
  also says when a \`loud\` one counts as \`silent\`). Give each \`silent\` defect a Fix cell: the exact new
  text (10 lines or fewer) and where it goes, or \`none\` when it needs a planner revision. List the
  \`loud\` ones under \`## Run watch\`: \`<id> | AC clause / task | symptom the run will show | fix hint\`,
  and the \`stale\` ones under \`## Stale\`. Neither counts below.

Close \`${session_path}goal-auditor/sat.md\` with its own terminal STATUS line — its last non-empty line,
byte-identical to the one you return, nothing after it.

STATUS: CLEAN (no \`silent\` defect: every CLAUSE of every blocking AC has a reachable, non-counterfeitable
passing state, or its only defect is \`loud\` and listed under Run watch) /
ERRORS_REMAINING: <count of silent defects> (fixable in the plan or the contract) /
BLOCKED (unreachable because the destination or chosen path is wrong; root assesses whether an
in-scope path change resolves it or an actual human scope choice is required).
`
})
```

```
CLEAN            -> lead copies sat.md Run watch rows into run-watch.md, then Step 2 (audit).
                    sat.md does NOT enter the audit's read-set
ERRORS_REMAINING -> Claude: inline-fix each silent defect whose Fix cell qualifies (Finding classes),
                    recorded in inline-fixes.md; all closed -> Step 2, no re-run. Only what remains:
                    re-dispatch team-planner (missing producer) or goal-auditor(define) (AC restated /
                    precondition added), then re-run SAT on the changed rows. attempt += 1
                    Codex: fresh reassessment at 2; renew advisory allowances. Claude: cap 2
BLOCKED          -> Codex: root reassesses an in-scope path repair; do not narrow the destination
                    or weaken acceptance to escape the blocker. Ask only for a material uncovered
                    scope choice. Claude: human scope decision BEFORE sealing. Does NOT burn the cap
```

The **five** unsatisfiability modes and their measured worked examples live in SKILL.md Step 4d-b — read
them into the dispatch prompt if the contract is large; they are what makes the pass concrete. That table
governs the count; the condensed mirror in `.claude/agents/team-goal-auditor.md` tables four and says so.

## Step 2 — Audit loop (Codex checkpoint 2; Claude cap 2)

Codex routes each failed audit to root, repairs in scope and re-audits with fresh context. After two
attempts, obtain a fresh assessment and record the changed approach plus next finite interval; continue
within explicit user hard ceilings; source-default completion-first thresholds are advisory, not
approval gates. A worker's `BLOCKED` label alone does not prove a human dependency or that the run is stuck.
The pseudocode below is the Claude cap-and-escalate policy, not the Codex loop.

```
attempt = 0
while attempt < 2:
    dispatch team-goal-auditor(phase: audit)   # fresh context: reads ONLY prompt + DoD + team-plan
    if STATUS: CLEAN        -> break, proceed to design present/review
    if STATUS: BLOCKED      -> escalate to human gate (goal ambiguous); does NOT burn the cap
    if STATUS: ERRORS_REMAINING:                    # counts silent gaps only (Finding classes)
        inline-fix each gap whose Fix cell qualifies -> inline-fixes.md; none remain -> break, proceed
        re-dispatch team-planner with the remaining goal-audit.md findings (fix plan and/or DoD)
        attempt += 1
    loud gaps -> lead copies them into run-watch.md; never a revision
# not CLEAN after 2 -> escalate to human: the goal itself likely needs a decision
```

```javascript
Agent({
  subagent_type: "team-goal-auditor",
  description: "Adversarial plan-vs-goal audit",
  prompt: `
Fresh-check: goal-audit
Phase: audit
Session path: \`${session_path}\`

FRESH CONTEXT. Read ONLY: \`${session_path}prompt.md\`, \`${session_path}definition-of-done.md\`,
\`${session_path}team-plan.md\`, and from \`${session_path}map.md\` the **Destination and Out of scope
sections ONLY**. Do NOT read clarify/explore/discovery history, map.md Decisions-so-far, or any agent
reasoning.
Read-only repo source outside \`team-session/\` is allowed for disproof probes.
Read the two map.md sections by line range or section extraction — never the whole file.
Reading outside this set breaks the check's isolation (\`references/fresh-checks.md\` → Closed set).
Does plan + DoD faithfully satisfy the original goal? Find gaps / drift / scope-creep / weak AC.
Enumerate the prongs of prompt.md YOURSELF first (asks, constraints, *not-this* qualifiers), THEN
read the DoD's **Prompt-prong coverage** table against your own list — a prong you found that the
table does not carry is a gap; one marked \`ungraded — <reason>\` is reported once, not re-litigated.
Never grade that table for internal consistency: the prong define never saw is the one missing from it.
Anything listed in Out of scope is NOT a gap — the user ruled it out. If you believe an exclusion is
itself wrong, that is BLOCKED (a goal question for the human), not ERRORS_REMAINING.
Disprove each finding before reporting it. Class each surviving one \`silent\`, \`loud\` or \`stale\`
(\`references/acceptance.md\` → Finding classes). Each \`silent\` one gets a Fix cell: the exact new text,
or \`none\`. \`loud\` ones go under \`## Run watch\`, \`stale\` ones under \`## Stale\`; neither counts
toward ERRORS_REMAINING. Write \`${session_path}goal-auditor/goal-audit.md\`, closed by
its own terminal STATUS line — last non-empty line, byte-identical to the one you return, nothing after it.
`
})
```

Dispatch and fresh-context isolation follow `runtime.md`; Claude examples above are not Codex call signatures.

**Why the map is split for this agent**: **Destination** and **Out of scope** are goal statements — same class as `prompt.md`, and safe. **Decisions so far** is the maker's route; feeding it to the auditor destroys the independence that makes the audit worth running.

## Exit Condition

`sat.md` STATUS = CLEAN **and** `goal-audit.md` STATUS = CLEAN. Then proceed to Step 5 (design
presentation). The `definition-of-done.md` now travels with the contract into `/team-kit-run` as the
execution stop condition; `sat.md` travels with it as the record of what each blocking clause's passing
state was believed to be — the first thing to re-read when a criterion refuses to go green in execution.
`verification-approach.md` travels too: the run lane's COMPOSE reads it for the journeys and records
every suggestion it supersedes against the built tree
(`skills/team-kit-run/references/stage-templates.js:1073`).

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Let the auditor read the planner's reasoning | Audit is blind — only prompt + DoD + plan |
| Feed `sat.md` to the audit | SAT is the maker's reachability work; the audit's read-set is unchanged |
| Ask only "can a wrong run fail this?" | Ask both — SAT is the dual, and nothing downstream asks it |
| Weaken an AC so SAT passes | Make the passing state reachable, or drop it out of blocking with the reason recorded |
| Anchor AC to the plan | Anchor AC to `prompt.md` (the goal) |
| Cover only the prongs that name a deliverable | Every prong gets a coverage row — an AC id, or `ungraded — <reason>`. Constraints and *not-this* qualifiers are prongs |
| Audit the prong table for internal consistency | Re-derive the prongs from `prompt.md`, then read the table against your own list |
| All-deterministic or all-semantic AC | Hybrid: deterministic floor + ≥1 semantic |
| Repeat the same failed audit indefinitely | Codex: fresh assessment at checkpoint 2, changed approach and advisory-allowance renewal. Claude: cap 2, then escalate |
| Skip approach and let define classify in a vacuum | `test -e verification-approach.md` rc 1 deletes the third evidence category for the session — every live-surface AC reverts to a human punt |
| Skip define and hand a planless contract to run | run boots from the sealed contract — DoD must exist |

## Relationship

| Skill / Agent | Relationship |
|---------------|--------------|
| main SKILL.md | Reads this at Steps 4c-b/4d/4d-b/4e, after planner, before present/review |
| `team-goal-auditor` | The agent this reference dispatches (approach + define + sat + audit — all enumerated in the agent file; the prompt-carried phases are the run-lane `grade` and `persona`) |
| SKILL.md Step 4c-b | The approach's four sections, its four per-journey guards and the measurement-not-verification doctrine — it governs the artifact's shape |
| SKILL.md Step 4d-b | The five unsatisfiability modes + worked examples SAT is looking for — it governs the count |
| Step 6 (post-plan review) | Runs after this — plan-quality review + implementation readiness (S-1) — complements goal-fidelity; checks coherence and completeness, so it cannot catch an unsatisfiable AC |
| `team-kit-run` | Boots from the sealed contract; `definition-of-done.md` = the stop condition. Its VALIDATE loop re-grades: deterministic ACs via `team-verifier`, blocking SEMANTIC ACs via `team-goal-auditor` phase `grade` (prompt-carried like `sat`) — the impl-vs-goal drift check at execution end |
