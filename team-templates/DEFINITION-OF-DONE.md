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
Binding sources: this file + prompt.md (anchor) + team-plan.md + requirements.md + design.md + build-state.md PD-n rulings grade; FRAMEWORK.md → Contract Sources lists everything that instructs. Nothing else instructs or grades.

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

STATUS: CLEAN | ERRORS_REMAINING: N
```

## Field Reference

| field | rule |
|-------|------|
| `id` | `AC-N`, stable. Used by the run ledger (`build-state.md`) and per-agent dispatch contracts. |
| `statement` | one line, testable. "it works" is not a statement; "rejects expired tokens with 401" is. |
| `maps_to` | ≥1 task id from `team-plan.md`. An AC with no task = unaddressed goal (gate fails). |
| `kind` | `deterministic` (command-graded) or `semantic` (agent-graded). |
| `verify` | deterministic → a command + expected result. semantic → grader agent + a rubric in the Semantic Rubrics section + the **evidence artifact path** the grader reads (a task MUST produce it — or, for a live-surface AC, the run lane's measurement fan-out: Rule 6 third category). Either kind: every path this cell names resolves — see Rule 6. |
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
6. **Every path a blocking AC names must resolve — ANY `kind`.** Supersedes the semantic-only
   scoping this rule used to carry; the semantic half stands unchanged: an agent-graded AC is
   gradeable only if something actually produces its grading input, so name the **evidence artifact**
   and the **known session path** a task writes it to (e.g. a verifier task that saves
   `verifier/evidence/375px.png` + `768px.png`). A blocking semantic AC with no producible evidence is
   ungradeable. (Learned from a dry-run where the audit rejected exactly this.) Three checks now, chosen
   by how the path is named, run over every path and evidence artifact the row NAMES — enumerated by
   reading the `statement` and `verify` cells, never by scanning for backticks:
   - **existing surface** (frozen set, a file under diff): `test -e <path>` from the repo root → rc 0.
   - **produced evidence** (manifest, report, capture, query output): the string appears
     byte-identically — round suffix included — in a `team-plan.md` task;
     `/usr/bin/grep -c "<string>" team-plan.md` → `0` means no task writes it.
   - **run-lane measurement evidence** (a live surface exercised against the RUNNING product, per the
     taxonomy `verification-approach.md` sets): named by RESERVED SHAPE —
     `measurer/attempts/[{epoch}/]{journey-key}/{attempt}/result.md` — never a concrete path, because COMPOSE
     mints the journey key and `build-state.md` reserves the attempt, both at run time. **The other two
     checks are the wrong checks here and running them is itself the defect**: `test -e` rc 1 and
     `/usr/bin/grep -c` `0` are the CORRECT state of a record no create-lane task may write. Its producer
     check is three parts, all runnable at define time from the session root:
     (1) `/usr/bin/grep -c "<surface, quoted exactly as the approach names it>" verification-approach.md`
     → `0` ⇒ nothing proposes to exercise that surface ⇒ no journey, no record — same byte-identical
     discipline as the `team-plan.md` grep, and `test -e verification-approach.md` rc 1 ⇒ the approach
     phase never ran ⇒ this category does not exist for this session;
     (2) the hit sits under **exercisable surfaces**, never under **human residual** — a residual is a
     COUNTED human punt, and an AC citing one is needs-human, graded by the Step-7 row that pairs with
     this one;
     (3) the surface declares the AUTONOMOUS side of the prod-gating line. The run fans out only a journey
     spelled `autonomous`; gated AND undeclared alike return as human-checklist items that never run
     in-workflow, so neither produces a measurement record.

   **This category asserts a PROPOSED PRODUCER, exactly as `produced evidence` asserts a task — never a
   file**, and it is worth naming what it therefore does not buy, because a grader will otherwise read it
   as a guarantee. It does NOT guarantee the record will exist: COMPOSE builds journeys from the BUILT
   TREE and may record this suggestion superseded, dropped as not-built, or mechanism-changed — that
   deviation is correct behaviour, not a failure. It does NOT yield the path: the concrete one resolves
   only from `build-state.md` reservations, never by globbing `measurer/` and never from the mutable
   `measure/verification-plan.md` pointer (`skills/team-kit-run/references/execution-evidence.md` §9 — a
   pointer has no attempt identity). And it does NOT reach the grade in its own segment: measurement runs
   after the grade gate and feeds the NEXT grade attempt. What keeps Rule 6's principle intact is not an
   exemption but the grade contract — **missing evidence cannot pass** — so a measurement AC whose record
   never materializes grades FAIL or parks; it never goes silently green.

   Any check failing ⇒ the AC cannot be `blocking: true` — flag `ERRORS_REMAINING` so the planner
   adds the producing task or the path is corrected. Effort #1 sealed three such rows unchecked, all
   `deterministic` and so outside the old scope: AC-29's trace-chain artifact
   (`/usr/bin/grep -c "trace-chain" team-session/20260904-moirai-effort-1/team-plan.md` → `0` — it
   FAILED) — and it is the delimiter test that misses it, since the only backticked path in that row
   is `coder-epsilon/w2/`, which greps `1`, so a backtick-scoped scan grades the failing row PASS;
   3 of AC-31's 5 frozen paths (`eng-cli/src/register/`, `eng-cli/src/cli/root.ts`,
   `coverage-manifest.json`) `test -e` rc 1, so its freeze diff is empty for surfaces that do not
   exist and would stay green through a rewrite of the real ones
   (`team-session/20260904-moirai-effort-1/definition-of-done.md:58`); and AC-33 graded on
   `verifier/results.md`, which no stage ever wrote
   (`team-session/20260904-moirai-effort-1/definition-of-done.md:60`).
7. **Grade the recorded contract only.** An instruction that this file, `prompt.md` (anchor), `team-plan.md`,
   `requirements.md`, `design.md` or a `build-state.md` `PD-n` ruling does not record is not a criterion.
   Never grade for or against it; never add an AC for it without the human decision that records it.
   Canonical rule: `FRAMEWORK.md` → Contract Sources (no side-channel instructions).
