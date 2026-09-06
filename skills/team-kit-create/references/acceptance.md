# Acceptance — Dispatch Goal-Auditor for the Acceptance Contract (Steps 4d/4d-b/4e detail)

How the lead runs the three acceptance passes that sit between planning and execution. The lead stays lean — `team-goal-auditor` does the work.

## When to Use

After `team-planner` has written `design.md` + `team-plan.md`, BEFORE the design-present /
review gates. Three passes:

1. **define** — turn the requirements + plan into a checkable acceptance contract.
2. **sat** — per blocking AC, show a CORRECT run can actually satisfy it (the dual of falsifiability).
3. **audit** — adversarially check that contract + plan faithfully satisfy the *original* goal.

This is the cheapest place to catch intent drift — fixing a plan costs nothing vs. fixing built
code. It is NOT autonomy: phase boundaries stay human-gated.

## Artifacts

| Phase | Agent writes | Location |
|-------|--------------|----------|
| define | `definition-of-done.md` | session **root** (canonical contract) |
| sat | `sat.md` | `goal-auditor/` (agent scratch) — **not** in the audit's read-set |
| audit | `goal-audit.md` | `goal-auditor/` (agent scratch) |

> **Pass an ABSOLUTE `session_path`.** `team-session/` is a persistent untracked dir; a relative path fails to
> resolve from a dispatched subagent's cwd and yields a false `BLOCKED`. (Learned from a dry-run:
> `define` resolved a relative path by luck, `audit` did not.)

## Step 1 — Define (one dispatch)

```javascript
Agent({
  subagent_type: "team-goal-auditor",
  description: "Author acceptance contract (definition-of-done)",
  prompt: `
Phase: define
Session path: \`${session_path}\`

Read \`${session_path}prompt.md\`, \`${session_path}requirements.md\`, \`${session_path}team-plan.md\`.
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
Hybrid grading: mostly deterministic (lint/types/knip/test/assertion), at least ONE semantic.
`
})
```

If define returns `STATUS: ERRORS_REMAINING` (a deliverable can't be made checkable) → route back
to the planner/designer to sharpen it, then re-run define.

## Step 1b — SAT: satisfiability (one dispatch, cap 2)

define proves every criterion is **falsifiable**. SAT proves each blocking one is **satisfiable** — the
question no downstream gate asks, because both the blind audit and the plan review check coherence, and an
unsatisfiable criterion is usually perfectly coherent. Skip only if NO blocking AC grades a frozen
artifact, an unforgeable witness, a production/external state, or paid-irreversible work (SKILL.md 4d-b →
Keep it proportionate).

```javascript
Agent({
  subagent_type: "team-goal-auditor",
  description: "SAT — reachable passing state per blocking AC",
  prompt: `
Phase: sat
Session path: \`${session_path}\`

You did not author this contract (or if you did, in an earlier dispatch you no longer remember) —
read it cold.

Read \`${session_path}definition-of-done.md\`, \`${session_path}team-plan.md\`,
\`${session_path}design.md\`, \`${session_path}requirements.md\` (for the frozen / forbidden set).

For EVERY blocking AC answer the dual of falsifiability: can a CORRECT run SATISFY this?
Write \`${session_path}goal-auditor/sat.md\`, one row per blocking AC:
AC | passing state (observable at a point in time) | produced by (task + the ACTUAL site — for a
dependency-injected seam cite the composition-root BINDING file:line, never the call site) |
preconditions that state needs | forbidden by anything the contract freezes? | is a COUNTERFEIT
passing state also reachable (green with none of the work done)?

Rules:
- A state is something you could observe and record. "the seam is invoked", "the module is wired",
  "the agent attempts X" are activities, not states — return those as un-checkable.
- Reachable by the plan's OWN tasks, not by a plausible world where someone does the obvious thing.
- Counterfeit reachable ⇒ the fix is a PRECONDITION written into the existing AC (asserted, rc-checked,
  recorded in its evidence artifact) — never a new AC.
- NEVER propose weakening a criterion to make it satisfiable. Legal moves: make the passing state
  reachable, or move the AC out of blocking with the reason recorded.

STATUS: CLEAN (every blocking AC has a reachable, non-counterfeitable passing state) /
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

The four unsatisfiability modes and their measured worked examples live in SKILL.md Step 4d-b — read
them into the dispatch prompt if the contract is large; they are what makes the pass concrete.

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
Disprove each finding before reporting it. Write \`${session_path}goal-auditor/goal-audit.md\`.
`
})
```

> **Dispatch PLAIN — no `name:`.** Same arming constraint as every native-lane team dispatch (`docs/observer-agents.md` → hard constraint 2).

**Why the map is split for this agent**: **Destination** and **Out of scope** are goal statements — same class as `prompt.md`, and safe. **Decisions so far** is the maker's route; feeding it to the auditor destroys the independence that makes the audit worth running.

## Exit Condition

`sat.md` STATUS = CLEAN **and** `goal-audit.md` STATUS = CLEAN. Then proceed to Step 5 (design
presentation). The `definition-of-done.md` now travels with the contract into `/team-kit-run` as the
execution stop condition; `sat.md` travels with it as the record of what each blocking AC's passing
state was believed to be — the first thing to re-read when a criterion refuses to go green in execution.

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
| Skip define and hand a planless contract to run | run boots from the sealed contract — DoD must exist |

## Relationship

| Skill / Agent | Relationship |
|---------------|--------------|
| main SKILL.md | Reads this at Steps 4d/4d-b/4e, after planner, before present/review |
| `team-goal-auditor` | The agent this reference dispatches (define + sat + audit — all enumerated in the agent file; only the run-lane `grade` phase is prompt-carried) |
| SKILL.md Step 4d-b | The four unsatisfiability modes + worked examples SAT is looking for |
| Step 6 (post-plan review) | Runs after this — plan-quality review (complements goal-fidelity); checks coherence, so it cannot catch an unsatisfiable AC |
| `team-kit-run` | Boots from the sealed contract; `definition-of-done.md` = the stop condition. Its VALIDATE loop re-grades: deterministic ACs via `team-verifier`, blocking SEMANTIC ACs via `team-goal-auditor` phase `grade` (prompt-carried like `sat`) — the impl-vs-goal drift check at execution end |
