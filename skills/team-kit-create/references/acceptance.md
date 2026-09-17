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
code. It is NOT autonomy: phase boundaries stay human-gated.

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

If define returns `STATUS: ERRORS_REMAINING` (a deliverable can't be made checkable) → route back
to the planner/designer to sharpen it, then re-run define.

## Final-state review

- Name the last substantive writer of each graded artifact, including correction tasks. Schedule the independent semantic grade after that writer; evaluate correction behavior when agent performance is itself in scope.
- Persist per-AC PASS/FAIL verdicts with evidence and SHA-256 hashes for the exact delivered artifacts, decisive report/fix inputs and acceptance contract. Declare the reviewed input inventory in the contract before grading; the grader cannot omit an inconvenient input. File presence or a nonempty verdict document does not prove acceptance.
- Freeze those inputs before review. Any later input or contract edit invalidates the old grade until affected validation is rerun against the new bytes. Never carry an old PASS forward by only replacing its hash. Approval classification is separate (`approval.md`).
- Put post-verdict delivery/notification notes in a separate closure record, outside the frozen inventory. If a closure event changes a substantive claim, reopen affected review; do not hide it as a notification or rewrite frozen observations after grading.
- For Codex native runs, reuse `.agents/skills/team-kit-run/scripts/check.mjs` and its `references/state-contract.md` contract/evidence receipts. Do not create a second state ledger. Adapted report-only runs may persist verdicts/hashes in their declared review artifact and compare hashes directly; label that route accurately.
- Citation checks require a nonempty inspected set when citations are required, resolvable locators and semantic support sampling (`evidence.md`). Existence checks alone cannot pass the semantic grade.

## Step 1b — SAT: satisfiability (one dispatch, cap 2)

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
Phase: sat
Session path: \`${session_path}\`

You did not author this contract (or if you did, in an earlier dispatch you no longer remember) —
read it cold.

Read \`${session_path}definition-of-done.md\`, \`${session_path}team-plan.md\`,
\`${session_path}design.md\`, \`${session_path}requirements.md\` (for the frozen / forbidden set).

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

Close \`${session_path}goal-auditor/sat.md\` with its own terminal STATUS line — its last non-empty line,
byte-identical to the one you return, nothing after it.

STATUS: CLEAN (every CLAUSE of every blocking AC has a reachable, non-counterfeitable passing state) /
ERRORS_REMAINING: <count> (fixable in the plan or the contract) /
BLOCKED (unreachable because the destination or the chosen path is wrong — a human scope call).
`
})
```

```
CLEAN            -> proceed to Step 2 (audit). sat.md does NOT enter the audit's read-set
ERRORS_REMAINING -> re-dispatch team-planner (missing producer) or goal-auditor(define)
                    (AC restated / precondition added), then re-run SAT. attempt += 1, cap 2
BLOCKED          -> human scope decision BEFORE sealing: change the path, or narrow map.md
                    Destination + the DoD together. Does NOT burn the cap
```

The **five** unsatisfiability modes and their measured worked examples live in SKILL.md Step 4d-b — read
them into the dispatch prompt if the contract is large; they are what makes the pass concrete. That table
governs the count; the condensed mirror in `.claude/agents/team-goal-auditor.md` tables four and says so.

> **Stale siblings this amendment may not reach** (it is scoped to this file). Superseded per-AC
> granularity still stands at `.claude/agents/team-goal-auditor.md:3` (frontmatter description, against
> its own body at `:144`), `.claude/skills/team-kit-run/SKILL.md:229`, `.claude/team-templates/SESSION-SCHEMA.md:42`.
> Line cites into the agent file have drifted: `skills/team-kit-create/SKILL.md:274` (`:141`/`:149` → now
> `:144`/`:152`), `:294` (`:169` → now `:180`) — each quotes its anchor, so grep the quote, not the number.
> The proportionality skip is restated WITHOUT mode 5's carve-out at `.claude/agents/team-goal-auditor.md:211`
> and `.claude/skills/team-kit-run/SKILL.md:233`, `:324` (the run lane's seal check) — a one-line skip whose
> mode-5 greps never ran is not a legal skip under Step 4d-b, whatever those three say.
> And the reconcile-by-grep at `.claude/agents/team-goal-auditor.md:161` scans `SKILL.md` ONLY: it could
> not have found THIS file, which is how the executed dispatch prompt went stale in the first place.
> Re-derive before trusting any per-AC phrasing — `/usr/bin/grep -rn --include='*.md' "per blocking AC" .claude`
> returns exactly those three, that grep's own text, and this line. Anything else is new drift.

## Step 2 — Audit loop (cap 2)

```
attempt = 0
while attempt < 2:
    dispatch team-goal-auditor(phase: audit)   # fresh context: reads ONLY prompt + DoD + team-plan
    if STATUS: CLEAN        -> break, proceed to design present/review
    if STATUS: BLOCKED      -> escalate to human gate (goal ambiguous); does NOT burn the cap
    if STATUS: ERRORS_REMAINING:
        re-dispatch team-planner with goal-audit.md findings (fix plan and/or DoD)
        attempt += 1
# not CLEAN after 2 -> escalate to human: the goal itself likely needs a decision
```

```javascript
Agent({
  subagent_type: "team-goal-auditor",
  description: "Adversarial plan-vs-goal audit",
  prompt: `
Phase: audit
Session path: \`${session_path}\`

FRESH CONTEXT. Read ONLY: \`${session_path}prompt.md\`, \`${session_path}definition-of-done.md\`,
\`${session_path}team-plan.md\`, and from \`${session_path}map.md\` the **Destination and Out of scope
sections ONLY**. Do NOT read clarify/explore/discovery history, map.md Decisions-so-far, or any agent
reasoning.
Does plan + DoD faithfully satisfy the original goal? Find gaps / drift / scope-creep / weak AC.
Enumerate the prongs of prompt.md YOURSELF first (asks, constraints, *not-this* qualifiers), THEN
read the DoD's **Prompt-prong coverage** table against your own list — a prong you found that the
table does not carry is a gap; one marked \`ungraded — <reason>\` is reported once, not re-litigated.
Never grade that table for internal consistency: the prong define never saw is the one missing from it.
Anything listed in Out of scope is NOT a gap — the user ruled it out. If you believe an exclusion is
itself wrong, that is BLOCKED (a goal question for the human), not ERRORS_REMAINING.
Disprove each finding before reporting it. Write \`${session_path}goal-auditor/goal-audit.md\`, closed by
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
| Loop the audit forever | Cap 2 — then escalate; the goal likely needs a human decision |
| Skip approach and let define classify in a vacuum | `test -e verification-approach.md` rc 1 deletes the third evidence category for the session — every live-surface AC reverts to a human punt |
| Skip define and hand a planless contract to run | run boots from the sealed contract — DoD must exist |

## Relationship

| Skill / Agent | Relationship |
|---------------|--------------|
| main SKILL.md | Reads this at Steps 4c-b/4d/4d-b/4e, after planner, before present/review |
| `team-goal-auditor` | The agent this reference dispatches (approach + define + sat + audit — all enumerated in the agent file; the prompt-carried phases are the run-lane `grade` and `persona`) |
| SKILL.md Step 4c-b | The approach's four sections, its four per-journey guards and the measurement-not-verification doctrine — it governs the artifact's shape |
| SKILL.md Step 4d-b | The five unsatisfiability modes + worked examples SAT is looking for — it governs the count |
| Step 6 (post-plan review) | Runs after this — plan-quality review (complements goal-fidelity); checks coherence, so it cannot catch an unsatisfiable AC |
| `team-kit-run` | Boots from the sealed contract; `definition-of-done.md` = the stop condition. Its VALIDATE loop re-grades: deterministic ACs via `team-verifier`, blocking SEMANTIC ACs via `team-goal-auditor` phase `grade` (prompt-carried like `sat`) — the impl-vs-goal drift check at execution end |
