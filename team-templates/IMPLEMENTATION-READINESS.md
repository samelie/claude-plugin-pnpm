# Implementation Readiness — Plan Rubric (S-1)

> Rules for the Step 6 fresh plan review (`team-kit-create` Step 6 Option A, `team-plan-reviewer`, both lanes).
> The report format — `## Implementation Readiness`, the `Readiness:` line, the gap fields — lives in the role
> (`agents/team-plan-reviewer.md` → Report Format; Codex `.codex/agents/team-plan-reviewer.toml`). This file owns the rules only.

## Reader seat

Read as the implementer: the `plan-review` read-set (`skills/team-kit-create/references/fresh-checks.md` → plan-review) plus read-only repo source. The repo closes a gap only when it fixes exactly one answer at a cited `file:line`.

- "follow the existing retry helper" and the repo holds exactly one retry helper, cited at its `file:line` → closed
- the same sentence and the repo holds two candidate helpers → gap
- never close a gap from what the planner probably meant — an answer the contract files and the repo do not fix is a gap

## Core principle

A plan passes if a competent engineer (or fresh AI session) who is unfamiliar with the codebase can execute the plan and produce the correct changes on the first attempt, without guessing, asking clarifying questions, or making independent design choices.

## What counts as a gap

A gap is a choice left to the implementer that changes an interface, persisted data, external behavior, error semantics, or a contract another task or AC depends on. Local naming, the split into private helpers, loop or syntax shape and internal collections are implementer latitude — never a gap.

## Rules

| id | rule | applies to | origin |
|----|------|------------|--------|
| R-1 zero-decision | The plan must leave **zero design or architectural choices to the implementer**. If the implementer must make design choices (including, but not limited to, choosing a database schema, designing an API path, selecting a dependency, or deciding how to handle a new edge case), the plan **fails** this standard. All such decisions must be pre-determined and documented in the plan. Reviewer question: *"Do I know exactly what to code, where, and how, based on this text?"* Identify any instructions that require the developer to make independent design choices (e.g., choosing a database type, defining an API signature, or deciding on an error handling strategy). These choices must be documented, not left to the implementer. | every task step and every contract entry the implementer codes from | EGM verbatim — `resources/document_standards/implementation-readiness-standard.md:14-18`; `agents/implementation_readiness.md:37-38` — Apache-2.0 |
| R-2 zero-assumption | The document fails if the reader must guess parameter defaults, assume error handling, choose design patterns, or infer output schemas. Every behaviorally significant contract must be explicit. | the plan's contracts: interfaces, task inputs and outputs, defaults, error handling, output schemas — adapted target: upstream applies it to documents of codebase state (`re-implementation-standard.md:3`) | EGM derivative (adapted target) — `resources/document_standards/re-implementation-standard.md:14-16` — Apache-2.0 |
| R-3a every-field-written | every non-optional field or state the design declares has a named producing task | every field and state declared in the contract files | team-kit text — refuter P1 `researcher/research-findings-refute-s1-value-link.md:37` (session `20261025-elephant-goldfish-eval`); PD-11 `:64` |
| R-3b every-state-reachable | every declared state or status value has a transition in some task that produces it | every state / status enum, verdict line and lifecycle the contract files declare | team-kit text — refuter P1 `:37` |
| R-3c every-mapping-specified | every "translate / map / convert / migrate / normalize" names its rule per field or case, incl. unmapped and invalid inputs | every transform the plan asks for | team-kit text — refuter P1 `:37`; PD-56 `:66` |

## Reading by output kind

| `output_kind` | the contract the rules read |
|---------------|-----------------------------|
| software | `design.md` Interfaces + each task's steps |
| assessment | the artifact / evidence schema fields: source, locator, format |
| operations | the procedure contract: trigger, owner, action, evidence, escalation / rollback |
| mixed | each task by the kind of its output |

## Lane latitude (Claude lane)

Applies only when the `map.md` header reads `Rigor: low` or `Rigor: medium` and `team-plan.md` carries a `latitude:` block (`skills/team-kit-create/references/rigor.md` → Plan latitude). Otherwise R-1 and R-2 apply as written.

- A choice listed under a lane's `open` is not a gap: that lane's coder makes it and records it.
- Each of these is still a gap, even when listed under `open`: an interface another lane uses, persisted data or a stored format, external behavior, error semantics another task depends on, a new dependency, or anything a blocking AC's `verify` relies on.
- A lane owning a `type: HITL` task, or a task mapped to a blocking AC that grades a frozen artifact, an unforgeable witness, production or external state, or paid or irreversible work, with a `latitude:` entry is a gap.
- A choice left open and not listed under `open` is a gap.
- R-3a, R-3b and R-3c apply to everything pinned, at every level.

Reviewer question: *"Can this lane be built without asking anyone, and could another lane or an AC break on anything left open?"*

## Verdict

- **READY** — 0 `silent` gaps (`loud` / `stale` gaps are listed and do not block; `team-kit-create/references/acceptance.md` → Finding classes)
- **NOT READY** — ≥1 `silent` gap; each is a blocking issue (verdict `❌ ISSUES FOUND`, `STATUS: ERRORS_REMAINING: <silent issues incl. gaps>`)
- the role's approval-leaning calibration (`agents/team-plan-reviewer.md` → Calibration) never softens a gap into a recommendation

## Provenance

Adapted from the Elephant-Goldfish Model (`egm` v0.1.0), https://github.com/google/elephant-goldfish-model @ `3d0b34821ce88ad328b0c9bf0e06d7eb5f1cd669`. Upstream copyright line as carried by its source headers: `Copyright 2026 Google LLC.` (e.g. `tests/unit/test_harnesses.py:1`; the adapted standard files carry no per-file notice). Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0; upstream `LICENSE:1-3`, no `NOTICE` at the pin). R-1 and the core principle (`resources/document_standards/implementation-readiness-standard.md:7-10`) are verbatim; R-2 is a derivative with an adapted target. Modifications: rules re-scoped from design documents to team-kit plans; R-3a..c, the gap calibration and Lane latitude are team-kit text (the origin column marks each rule). Concept credit: the implementer-seat reader (`agents/implementation_readiness.md:19-20`) and the gap calibration (`re-implementation-standard.md:18-23` scope list), no text copied. Concept source: Dave Rensin, "Elephants, Goldfish, and the New Golden Age of Software Engineering" (upstream `README.md:49`). Format precedent: `.claude/skills/grilling/SKILL.md:31-33`.
