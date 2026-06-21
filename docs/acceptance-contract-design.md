# Acceptance Contract & Goal Auditor — Orchestration Tightening Design

Status: PROPOSED (design only, no code)
Date: 2026-06-20
Origin: "loop engineering" discussion (Osmani / Zyte / Fable-5 Lance Martin). We adopt the
maker/checker + rubric ideas, but **explicitly reject unattended autonomy.** Every phase
boundary stays human-gated. The win we want = tighter requirement→goal fidelity, crisper
sub-agent goals, and a lean orchestrator that drives our existing review/impl/adversarial
process from up-to-date documents instead of from a bloated context.

---

## 1. Problem

Three concrete gaps in the current team-kit:

1. **"Done" is implicit.** Acceptance criteria live as prose scattered in `requirements.md`.
   Nothing is the single checkable contract the whole pipeline converges on.
2. **Sub-agent goals are loose.** Dispatch prompts are hand-written. A reviewer told "review
   this" produces a different artifact than one told "grade AC-3 + AC-7, PASS/FAIL + evidence."
3. **Orchestrator bloat + intent drift.** `team-kit-create` runs ~8 phases
   (clarify→explore→present→write→research→refine→plan→review). By the time it hands to
   `team-kit-run`, (a) the orchestrator's own context is heavy, and (b) the original goal in
   `prompt.md` has survived 8 transformations with no explicit re-check.

## 2. Goals / Non-goals

**Goals**
- One sealed, checkable **acceptance contract** crosses the create→run boundary.
- A dedicated adversarial agent that guards goal-fidelity (plan-vs-goal, later impl-vs-goal).
- Hybrid grading: deterministic gates **for sure**, plus ≥1 soft/semantic criterion.
- Keep the run orchestrator **lean** — boots from disk, not from create's context.

**Non-goals**
- No unattended run-until-done. No removal of human gates.
- No new planning phases beyond the two acceptance phases.
- No rewrite of existing agents — extend the seam, reuse existing machinery.

## 3. Core concept — sealed contract + context firebreak

The create→run boundary is where we **want** a context reset. create accumulates ~8 phases of
conversation; if run inherits that, it is born bloated (gap #3). So:

> **Rule: `team-kit-run` does NOT inherit `team-kit-create`'s context. run is a fresh
> orchestrator that boots from the contract files on disk, nothing else.**

Completeness test for the handoff:

> **Could a fresh agent with zero memory of planning execute from the contract alone?**
> Yes → clean handoff, lean orchestrator. No → something lives only in create's head and must
> be written to disk before the seam.

This makes the orchestrator light *by construction* — anything it would "remember" is forced
onto disk. It is already the stated philosophy ("no in-memory-only state",
`skills/team-kit-create/SKILL.md` ~L689); this names the seam where it is enforced.

### The contract (what crosses the boundary)

```
prompt.md              original goal     immutable anchor          (exists)
requirements.md        WHAT                                        (exists)
design.md              HOW                                         (exists)
team-plan.md           TASKS                                       (exists)
team-scope.json        file ownership                              (exists)
definition-of-done.md  ACCEPTANCE        the rubric / keystone     (NEW)
```

## 4. New artifact — `definition-of-done.md`

Lives at `team-session/{team-name}/definition-of-done.md`. The keystone the pipeline converges
on. Each criterion is a row:

| field | meaning |
|---|---|
| `id` | `AC-1`, `AC-2`, … stable handle used in the ledger + dispatch contracts |
| `statement` | one-line, testable assertion of done-ness |
| `maps_to` | task id(s) from `team-plan.md` that satisfy it (coverage link) |
| `kind` | `deterministic` \| `semantic` |
| `verify` | how it is graded (see §10) |
| `blocking` | `true` = run cannot finish until PASS; `false` = advisory |

Authored by the new agent in its `define` phase (§5). Derived from `requirements.md` +
`team-plan.md`, **anchored to `prompt.md`** so criteria encode the goal, not a proxy (Goodhart
guard).

## 5. New agent — `team-goal-auditor`

File: `packages/claude-plugin-pnpm/agents/team-goal-auditor.md`. Phase-aware + stateless +
disk-backed, mirroring `team-designer` (which has 5 phases). One agent owns the single concern
"is this what we actually asked for, and how will we know." Two phases:

### Phase `define`
- Reads: `prompt.md`, `requirements.md`, `team-plan.md`.
- Writes: `definition-of-done.md` (§4).
- Exit: every deliverable has ≥1 checkable AC; ≥1 AC is `semantic`; the rest `deterministic`.

### Phase `audit` (adversarial — the plan-vs-goal check)
- **Fresh context. Reads ONLY** `prompt.md` + `definition-of-done.md` + `team-plan.md`. Blind
  to clarify/explore/refine history — independence is what makes the check work
  (Fable-5 verifier result: independent grader 89% vs self-critique 62%).
- Question: *does plan + AC faithfully satisfy the original goal? Gaps? Drift? Scope creep?*
- **Disprove-own-finding:** must attempt to refute each gap it raises before reporting, to kill
  false positives that would waste reiteration budget.
- Writes: `goal-auditor/goal-audit.md` (verdict + per-finding evidence) — agent scratch under its
  own `{agent-type}/` subfolder (`team-` prefix stripped, per schema convention). (The contract itself,
  `definition-of-done.md`, lives at session **root** — it is canonical, not agent scratch.)
- STATUS contract: `STATUS: CLEAN` (plan faithfully encodes goal) | `STATUS: ERRORS_REMAINING`
  (gaps listed → back to planner) | `STATUS: BLOCKED` (needs human judgment → escalate).

Tools: `Read, Glob, Grep, Bash, Write, Skill` (+ knowledge MCP, used in `define` only). **No
`Edit`** — it grades, it does not fix. Review-only, same toolset as `team-plan-reviewer`. The
`audit` phase's blindness (reads only prompt + DoD + plan) is enforced by the dispatch prompt, not
by withholding tools.

> Maker/checker note: the auditor authors the AC then audits the *plan* (authored by
> `team-planner`) — it never grades its own artifact, and the audit is anchored to `prompt.md`,
> not to the AC, so it cannot rubber-stamp by writing AC to match the plan. See open Q2 for the
> purist two-agent split if we want it.

## 6. New phases in `team-kit-create`

Insert after Plan (current Step 4c) and before the existing Present/Review gates:

```
... Step 4c Plan (team-planner → design.md + team-plan.md + team-scope.json)
    Step 4d  [NEW] AC-define     → team-goal-auditor(phase: define)  → definition-of-done.md
    Step 4e  [NEW] plan-vs-goal  → team-goal-auditor(phase: audit) ⇄ team-planner  (reiterate)
    Step 5   Present design      (team-kit-present, unchanged)
    Step 6   Review              (team-kit-review, unchanged)
    Step 7   Handoff gate        [TIGHTENED] validate contract, then SEAL → team-kit-run
══════════════════ context firebreak ══════════════════
    team-kit-run boots fresh from the sealed contract
```

Dispatch orchestration codified in a new dispatch-guide skill
`skills/team-kit-acceptance/SKILL.md` (same style as `team-kit-clarify` / `team-kit-explore`).

## 7. Handoff gate (completeness critic) — tighten Step 7

Before the contract seals, validate (mostly mechanical):

| check | catches |
|---|---|
| every `team-plan.md` task maps to ≥1 AC | orphan work (building unasked things) |
| every AC `maps_to` ≥1 task | **unaddressed goal** (the dangerous direction) |
| every AC has a `verify` method | un-checkable "done" |
| `goal-audit.md` STATUS = CLEAN | intent drift |
| `team-scope.json` disjoint (reuse `disjoint()`, run ~L237-258) | parallel write collisions |
| human gate | kept |

## 8. `team-kit-run` consumption

- **Boot-from-contract firebreak** (§3): run reads only the sealed contract files. New explicit
  rule in `skills/team-kit-run/SKILL.md`.
- **`plan.workflow.js` is generated from the contract**; the AC list **parameterizes the
  verify/validate stages** (N+1 lint/types/knip/test, N+2 AC-validation already exist at run
  ~L347-359 — they now grade named criteria, not vibes).
- **AC = the stop condition.** All `blocking` AC PASS + gates green ⇒ done. This is the "loop"
  we wanted, but the stop condition is the goal (not a counter), and phase boundaries stay
  human-gated.
- **Gate-gaming guard** (oversight): the verifier diffs for evasion — new `@ts-expect-error`,
  `eslint-disable`, `knip` ignores, `.skip()`ed tests, weakened types — and fails the AC if the
  generator tried to edit its way past the checker. (`team-verifier` is already "knip-skeptical";
  extend that skepticism.) **The generator may never edit `definition-of-done.md`.**

## 9. `build-state.md` ledger (lean orchestrator)

File: `team-session/{team-name}/build-state.md`. The orchestrator's externalized memory — it
**re-reads this each phase and never trusts its own recollection** (maker/checker applied to the
orchestrator's memory). Keyed on AC ids:

| AC | status | last verdict | grader | open notes |
|---|---|---|---|---|
| AC-1 | passed | exit0 `pnpm -F x test` | team-verifier | — |
| AC-2 | failed | "missing rate-limit on /login" | team-goal-auditor | re-dispatch coder-auth |
| AC-3 | pending | — | — | blocked by AC-2 |

Fed by the existing `_observability/{failures,lifecycle}.ndjson` ledgers (run path). Per-turn
orchestrator job becomes deterministic: **read ledger → next blocked-on item → dispatch right
agent with its AC-slice contract → record verdict → re-evaluate.**

## 10. Grading methods — hybrid (deterministic + ≥1 semantic)

**Deterministic** (the floor, most AC):
```
verify:
  type: command
  cmd: "pnpm -F <pkg> test"      # or lint / types / knip / a specific assertion
  expect: exit0
```
Graded mechanically by `team-verifier`. Cheap, repeatable, ungameable (modulo the §8 guard).

**Semantic** (≥1, kept few to control cost/noise):
```
verify:
  type: agent
  grader: team-goal-auditor        # audit phase, fresh context
  rubric: "Does the auth flow reject expired tokens AND log the attempt? PASS only if both."
  return: { pass: bool, evidence: "file:line", refutation_attempted: true }
```
Graded by an adversarial sub-agent, **blind to the coder's reasoning** (grade the artifact, not
the justification), **disprove-own-finding** required. Start with **one** semantic AC; expand
later once the pattern is proven (Zyte built a minimal version and measured before scaling).

## 11. Reiteration loop pattern (one shape, reused)

Same bounded, human-gated adversarial-grader ⇄ generator loop in two placements:

1. **Handoff (plan-vs-goal):** `team-goal-auditor(audit)` ⇄ `team-planner`, until CLEAN or
   escalate. Cheapest place to catch drift — fixing a plan costs nothing vs. fixing built code.
2. **Execution end (impl-vs-goal):** `team-goal-auditor(audit)` reads built code + `prompt.md`
   + `definition-of-done.md`, grades each AC, ⇄ `team-coder` until CLEAN or escalate. (Makes the
   existing one-shot N+2 AC-validation a bounded loop.)

Bounds (asymmetric — plans are cheap to fix, code is not):
- **plan-vs-goal: cap 2.** Tight on purpose — a long adversarial back-and-forth on the plan is a
  signal the goal itself needs human judgment. Not CLEAN after 2 → escalate to the human gate.
- **impl-vs-goal: cap 3.** Reuse the existing `MAX_REDISPATCH = 3` convention (run ~L316-345).

`BLOCKED` escalates to the human gate and does **not** burn the retry budget (reuse
`statusOf()`, run ~L190-199) in both placements.

## 12. Files — created / modified

**New**
- `agents/team-goal-auditor.md` — the agent (§5)
- `skills/team-kit-acceptance/SKILL.md` — dispatch guide for `define` + `audit` phases (§6)
- `team-templates/DEFINITION-OF-DONE.md` — artifact template/schema (§4)
- `docs/acceptance-contract-design.md` — this doc

**Modified**
- `skills/team-kit-create/SKILL.md` — insert Steps 4d/4e; tighten Step 7 handoff gate (§6,§7)
- `skills/team-kit-run/SKILL.md` — boot-from-contract rule; AC-parameterized verify/validate;
  build-state ledger; gate-gaming guard (§8,§9). [impl-vs-goal reiteration loop = Phase 3, §11]
- `team-templates/SCHEMA-CATALOG.md` — add `definition-of-done` + `goal-audit-verdict` schemas *(Phase 4 — deferred)*
- `team-templates/SESSION-SCHEMA.md` — add `definition-of-done.md` + `build-state.md` to layout
- `team-templates/FRAMEWORK.md` — document context-firebreak principle + handoff gate + cap *(Phase 4 — deferred)*
- `CLAUDE.md` (package) — add `team-goal-auditor` to roster; note new phases
- `docs/teamkit-methodology.md` — ADR entry for this change

## 13. Phased build order

- **Phase 1 — the seam (highest leverage).** `definition-of-done.md` template +
  `team-goal-auditor` agent + `team-kit-acceptance` skill + create Steps 4d/4e + tightened Step 7
  handoff gate. Delivers crisp goals + plan-vs-goal adversarial + the contract.
- **Phase 2 — lean run consumption.** Boot-from-contract firebreak + AC-parameterized
  verify/validate + `build-state.md` ledger + gate-gaming guard.
- **Phase 3 — impl-vs-goal loop.** Reuse the reiteration pattern at execution end.
- **Phase 4 — polish.** Expand semantic AC; SCHEMA-CATALOG/SESSION-SCHEMA/FRAMEWORK + ADR docs.

## 14. Resolved decisions (judgment calls)

1. **Name = `team-goal-auditor`.** Kept. The `goal-` qualifier disambiguates from `team-auditor`
   (which instruments diagnostic logging). Roster entry must state the distinction explicitly:
   *team-goal-auditor = guards goal-fidelity (plan/impl vs original `prompt.md`) + authors the
   acceptance contract; team-auditor = post-impl `[AUDIT]` diagnostic logging.*
2. **Single phase-aware agent (`define` + `audit`).** The independence that matters (Fable-5) is
   the auditor being blind to the *generator's reasoning* — satisfied because `audit` is a fresh
   stateless dispatch reading only `prompt.md` + `definition-of-done.md` + `team-plan.md`. It
   never grades its own artifact (the plan is `team-planner`'s) and is anchored to `prompt.md`.
   Matches the existing `team-designer` multi-phase pattern; avoids roster bloat. (If a purist
   split is ever wanted, the `define` phase splits out cleanly later — non-breaking.)
3. **`definition-of-done.md` at session root** (canonical contract, peer to `requirements.md` /
   `team-plan.md`). Agent scratch (`goal-audit.md`) under `goal-auditor/` (`team-` prefix stripped).
4. **Caps asymmetric: plan-vs-goal = 2, impl-vs-goal = 3** (see §11 rationale).
5. **Semantic-AC grader = `team-goal-auditor(audit)`.** It is goal-anchored and already does
   disprove-own-finding; `team-reviewer` stays focused on code quality. Deterministic AC →
   `team-verifier`. Clean role split.
6. **Phase 1 only first, then validate on a real feature before Phases 2-4.** Mirrors Zyte:
   build minimal, measure, scale. Phase 1 (the seam) is independently valuable.

## 15. Dry-run findings (folded into Phase 1)

First dry-run: nzb webui mobile-CSS pass. `define` → `definition-of-done.md` (CLEAN, 8 ACs,
caught no-op stub gates + the SearchBar no-op, added the generator-immune guard itself). `audit`
→ ERRORS_REMAINING:1, refuted 5 weak findings, surfaced 1 real gap. Two fixes folded in:

- **H1 — absolute session paths.** `team-session/` is a symlink; a relative path failed to
  resolve from the `audit` subagent's cwd → false `BLOCKED`. Fixed: `team-kit-create` Step 0b now
  defines an absolute `session_path` + a required-absolute note; `team-goal-auditor` has a
  path-resolution note; `team-kit-acceptance` warns to pass absolute. (Latent across ALL team-kit
  dispatches, not just the new ones.)
- **H2 — semantic AC needs producible evidence.** The audit caught that blocking semantic ACs
  (AC-1/5/7) graded against rendered screenshots had no task producing them → ungradeable. Fixed:
  new Rule 6 in `DEFINITION-OF-DONE.md`, a self-check bullet in `team-goal-auditor` define phase,
  and a new row in the Step-7 handoff gate. (Maker missed it, checker caught it — working as
  designed; now the maker self-checks and the gate backstops.)

## 16. Phase 2 — run consumption (built)

`team-kit-run` now consumes the sealed contract (§8/§9 realized):

- **Context firebreak.** New "Sealed contract + context firebreak" section: run boots from
  `{prompt, requirements, design, team-plan, team-scope, definition-of-done}` on disk, does NOT
  inherit create's context; absolute session paths; completeness test stated.
- **AC = stop condition.** VALIDATE (N+2) stage now reads `definition-of-done.md` and grades each
  blocking AC (deterministic by command); CLEAN only when every blocking AC PASS.
- **Workflow-can't-render reality.** Blocking semantic AC needing rendered evidence → routed to the
  human-gated checklist as `NEEDS_HUMAN_EVIDENCE` (sandbox has no browser/MCP) — honest, not faked.
- **build-state.md ledger.** Orchestrator's externalized memory keyed on AC ids; rolled up from
  validate+verifier artifacts; re-read each gate. Added to SESSION-SCHEMA (layout, reads/writes,
  phase gate, template).
- **Gate-gaming guard.** FINALIZE + `team-verifier` now scan the diff for new suppressions
  (`eslint-disable`/`@ts-expect-error`/knip-ignore/`.skip()`/weakened types) and flag any edit to
  the contract files — a gate passing only via a new suppression is FAILED. Contract is immutable to
  writers (write-model note).

Still deferred: **Phase 3** (impl-vs-goal reiteration loop — the execution-end adversarial cycle
that grades built code against the contract, reusing the cap-bounded pattern).
