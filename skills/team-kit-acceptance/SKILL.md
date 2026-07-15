---
name: team-kit-acceptance
description: "Dispatch instructions for the acceptance contract + goal-fidelity gate. Lead invokes after the planner returns: dispatch team-goal-auditor(define) to author definition-of-done.md, then team-goal-auditor(audit) in a bounded loop (cap 2) until the plan faithfully satisfies the original goal. Triggers: acceptance criteria, definition of done, goal audit, plan vs goal, intent drift."
---

# team-kit-acceptance — Dispatch Goal-Auditor for the Acceptance Contract

Tells the lead HOW to run the two acceptance phases that sit between planning and execution
(`team-kit-create` Steps 4d/4e). The lead stays lean — `team-goal-auditor` does the work.

## When to Use

After `team-planner` has written `design.md` + `team-plan.md`, BEFORE the design-present /
review gates. Two phases:

1. **define** — turn the requirements + plan into a checkable acceptance contract.
2. **audit** — adversarially check that contract + plan faithfully satisfy the *original* goal.

This is the cheapest place to catch intent drift — fixing a plan costs nothing vs. fixing built
code. It is NOT autonomy: phase boundaries stay human-gated.

## Artifacts

| Phase | Agent writes | Location |
|-------|--------------|----------|
| define | `definition-of-done.md` | session **root** (canonical contract) |
| audit | `goal-audit.md` | `goal-auditor/` (agent scratch) |

> **Pass an ABSOLUTE `session_path`.** `team-session/` is a persistent untracked dir; a relative path fails to
> resolve from a dispatched subagent's cwd and yields a false `BLOCKED`. (Learned from a dry-run:
> `define` resolved a relative path by luck, `audit` did not.)

## Step 1 — Define (one dispatch)

```javascript
Agent({
  subagent_type: "team-goal-auditor",
  model: "opus",
  description: "Author acceptance contract (definition-of-done)",
  prompt: `
Phase: define
Session path: \`${session_path}\`

Read \`${session_path}prompt.md\`, \`${session_path}requirements.md\`, \`${session_path}team-plan.md\`.
Author \`${session_path}definition-of-done.md\` — checkable acceptance criteria.
Anchor criteria to prompt.md (the goal), not to whatever the plan happens to do.
Coverage both directions: every deliverable ≥1 AC; every AC maps_to ≥1 real task.
Hybrid grading: mostly deterministic (lint/types/knip/test/assertion), at least ONE semantic.
`
})
```

If define returns `STATUS: ERRORS_REMAINING` (a deliverable can't be made checkable) → route back
to the planner/designer to sharpen it, then re-run define.

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
  model: "opus",
  description: "Adversarial plan-vs-goal audit",
  prompt: `
Phase: audit
Session path: \`${session_path}\`

FRESH CONTEXT. Read ONLY: \`${session_path}prompt.md\`, \`${session_path}definition-of-done.md\`,
\`${session_path}team-plan.md\`. Do NOT read clarify/explore/refine history or any agent reasoning.
Does plan + DoD faithfully satisfy the original goal? Find gaps / drift / scope-creep / weak AC.
Disprove each finding before reporting it. Write \`${session_path}goal-auditor/goal-audit.md\`.
`
})
```

## Exit Condition

`goal-audit.md` STATUS = CLEAN. Then proceed to `team-kit-present` (design approval). The
`definition-of-done.md` now travels with the contract into `/team-kit-run` as the execution stop
condition.

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Let the auditor read the planner's reasoning | Audit is blind — only prompt + DoD + plan |
| Anchor AC to the plan | Anchor AC to `prompt.md` (the goal) |
| All-deterministic or all-semantic AC | Hybrid: deterministic floor + ≥1 semantic |
| Loop the audit forever | Cap 2 — then escalate; the goal likely needs a human decision |
| Skip define and hand a planless contract to run | run boots from the sealed contract — DoD must exist |

## Relationship

| Skill / Agent | Relationship |
|---------------|--------------|
| `team-kit-create` | Invokes this at Steps 4d/4e, after planner, before present/review |
| `team-goal-auditor` | The agent this skill dispatches (define + audit phases) |
| `team-kit-review` | Runs after this — plan-quality review (complements goal-fidelity) |
| `team-kit-run` | Boots from the sealed contract; `definition-of-done.md` = the stop condition |
