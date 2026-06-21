# Definition of Done — Acceptance Contract Schema

> Canonical schema for `definition-of-done.md`. Authored by `team-goal-auditor` (define phase),
> read by the goal-audit, the handoff gate, and `/team-kit-run` (where it is the execution stop
> condition). Lives at session **root** — it is a canonical contract, peer to `requirements.md`.

## Purpose

One checkable artifact the whole pipeline converges on. Requirement discovery *produces* it,
sub-agent goals are *slices* of it, the orchestrator *tracks* it, adversarial agents *grade*
against it. It encodes the GOAL (from `prompt.md`), not a proxy.

## File Format

```markdown
# Definition of Done: {Feature Name}

Created: {date}
Author: team-goal-auditor (define phase)
Anchored to: prompt.md   ·   Derived from: requirements.md + team-plan.md

## Acceptance Criteria

| id | statement | maps_to | kind | verify | blocking |
|----|-----------|---------|------|--------|----------|
| AC-1 | API routes reject expired tokens | T-2 | deterministic | `pnpm -F @scope/api test -t auth` → exit0 | true |
| AC-2 | No new type errors introduced | T-1,T-2 | deterministic | `pnpm -F @scope/api types` → exit0 | true |
| AC-3 | No dead exports added | T-1 | deterministic | `pnpm -F @scope/api knip` → clean | true |
| AC-4 | Expired-token path also logs the attempt (audit trail) | T-2 | semantic | team-goal-auditor(audit) grades rubric below | true |

## Semantic Rubrics

### AC-4
PASS only if BOTH: (a) an expired token is rejected with 401, AND (b) the rejection is logged
with the principal id. Grader: `team-goal-auditor(audit)`, blind to coder reasoning,
disprove-own-finding required. Return `{ pass, evidence: "file:line", refutation_attempted }`.

## Coverage Check

| deliverable (requirements.md) | AC | task |
|-------------------------------|----|----|
| token rejection | AC-1 | T-2 |
| audit logging | AC-4 | T-2 |

STATUS: CLEAN | PARTIAL | ERRORS_REMAINING: N
```

## Field Reference

| field | rule |
|-------|------|
| `id` | `AC-N`, stable. Used by the run ledger (`build-state.md`) and per-agent dispatch contracts. |
| `statement` | one line, testable. "it works" is not a statement; "rejects expired tokens with 401" is. |
| `maps_to` | ≥1 task id from `team-plan.md`. An AC with no task = unaddressed goal (gate fails). |
| `kind` | `deterministic` (command-graded) or `semantic` (agent-graded). |
| `verify` | deterministic → a command + expected result. semantic → grader agent + a rubric in the Semantic Rubrics section + the **evidence artifact path** the grader reads (a task MUST produce it; see Rule 6). |
| `blocking` | `true` → run cannot finish until PASS. `false` → advisory, reported not enforced. |

## Rules

1. **Anchor to `prompt.md`.** Criteria encode the goal. Do not write AC to match what the plan
   already does — that defeats the drift check.
2. **Coverage both directions.** Every deliverable ≥1 AC; every AC `maps_to` ≥1 real task.
3. **Hybrid.** Deterministic is the floor (cheap, repeatable, hard to game). At least one
   semantic AC, but keep them few.
4. **Generator-immune.** Implementers may never edit this file. The verifier treats new
   `@ts-expect-error` / `eslint-disable` / knip-ignores / `.skip()`ed tests / weakened types as a
   FAILED AC, not a pass (gate-gaming guard).
5. **The stop condition.** In `/team-kit-run`, all `blocking` AC PASS + gates green ⇒ done. The
   contract is the stop condition, not an iteration counter.
6. **Every semantic AC needs producible evidence.** An agent-graded (semantic) AC is gradeable
   only if something actually produces its grading input. For each semantic AC, name the
   **evidence artifact** and the **known session path** a task writes it to (e.g. a verifier task
   that saves `verifier/evidence/375px.png` + `768px.png`). If NO task produces that evidence, the
   AC cannot be `blocking: true` — flag `ERRORS_REMAINING` so the planner adds the evidence-capture
   task. A blocking semantic AC with no producible evidence is ungradeable. (Learned from a dry-run
   where the audit rejected exactly this.)
