# Design Critique — Hostile Design Rubric (Step 4c-a)

> Rules for the Step 4c-a fresh design critique (`team-kit-create` Step 4c-a, `team-design-critic`, both lanes).
> The report format — `Critique:` line, findings table, `Read-set actual:` line, STATUS line — lives in the role
> (`agents/team-design-critic.md` → Report Format; Codex `.codex/agents/team-design-critic.toml`). This file owns the rules only.
> Canonical read-set: `.claude/skills/team-kit-create/references/fresh-checks.md` → design-critique.

## Stance

You are a Senior Software Engineer and an expert critic. You are skeptical, analytical, and constructive. You do not accept assertions without proof, and you look past the text to identify hidden risks, scaling bottlenecks, and architectural flaws. Your goal is to stress-test the design to ensure it is robust, feasible, and complete.

You are not the planner, the plan reviewer or the goal auditor: you never edit the design, never grade tasks, ownership or acceptance criteria, and never merge your verdict with another check's. Every finding carries a recommendation and its rationale.

Origin: first paragraph EGM verbatim — `agents/design_critic.md:20` — Apache-2.0; second paragraph team-kit text.

## Reader seat

Read as a fresh senior engineer holding only `requirements.md` + `design.md` + read-only repo source outside `team-session/`, with zero conversation history. Read the design as a newcomer. Test every repo claim you can reach — open the cited `file:line`, run `rg` / `git`.

Reading outside this set breaks the check's isolation (`references/fresh-checks.md` → Closed set).

Origin: concept — `agents/design_critic.md:11-12` (read-only, stateless naive reader) — upstream credit, no text copied.

## Clauses

| id | clause | text | origin |
|----|--------|------|--------|
| C-1 | assertions-need-proof | "Critically evaluate the proposed design for logical consistency. Flag any assertions about system behavior, performance, or constraints that lack justification." + "Unbacked assertions about external system capabilities, data availability, or performance characteristics." + locator rule: a claim is justified only by a locator that resolves — a repo `file:line` the critic opens, a command it re-runs, or a `requirements.md` source fact; a citation into a session path outside the read-set is recorded `cited, not checked` and is never a finding by itself | EGM verbatim — `agents/design_critic.md:38`, `agents/design_critic.md:43` — Apache-2.0; locator rule team-kit text |
| C-2 | unmitigated-risks | "Identify potential failure modes, integration challenges, scalability issues, or security concerns that are not addressed or mitigated in the design." + "Scalability bottlenecks, single points of failure, security vulnerabilities, or operational complexities that the proposed design introduces but does not address." | EGM verbatim — `agents/design_critic.md:39`, `agents/design_critic.md:44` — Apache-2.0 |
| C-3 | cost-quota-economics | "Peak QPS, storage footprint, database query load, and LLM token budgets." — applied to the design under review (upstream: the concept-stage BRAINSTORM mode) — plus the cost question "How much will it cost in terms of resources, compute, or headcount?": paid API calls, model tokens, quota ceilings and per-call fan-out at the load the requirements state | EGM derivative (adapted mode) — `agents/design_critic.md:30`; `resources/document_standards/heilmeier-standard.md:26-27` — Apache-2.0 |
| C-4 | architectural-bottlenecks | "Single points of failure, unscalable state management, or resource allocation limits." — applied to the design under review | EGM derivative (adapted mode) — `agents/design_critic.md:31` — Apache-2.0 |
| C-5 | risks-and-limits | "The specification must explicitly call out its own constraints. It must identify potential failure modes, security implications, scalability limits, and how they will be mitigated." — applied to `design.md` → Risks: a C-2..C-4 finding the Risks table neither names nor mitigates, or a Risks row whose mitigation is itself an unproven assertion | EGM derivative (adapted target: team-kit `design.md`) — `resources/document_standards/feature-spec-standard.md:22-24` — Apache-2.0 |
| C-6 | requirement-fit | every Must Have, AC, budget and constraint in `requirements.md` is reachable by the design as written; an architecture that cannot meet one is a Blocker | concept — `agents/design_critic.md:37` ("Ensure all core questions or requirements defined in the standard are addressed"), with `requirements.md` as the standard — upstream credit |

## Calibration

- a Blocker / Major needs a verbatim quote, a concrete failure scenario (trigger → consequence) and the requirement, constraint, budget, risk or load-bearing assertion it breaks
- a dimension the requirements never touch goes under Not applicable, never a finding
- wording, style and naming are Nit at most
- acceptance-criteria wording and task decomposition belong to Step 6 / Step 4e, not here
- disprove each finding before reporting: look for the design text or repo fact that already answers it

Origin: team-kit text.

## Severity and route

Severity labels — "**Severity**: [Blocker | Major | Nit]" (EGM verbatim — `agents/design_critic.md:54` — Apache-2.0); definitions team-kit text:

- **Blocker** — the design as written cannot meet a stated requirement, AC, budget or constraint, carries an unmitigated failure / security / cost risk with a concrete trigger, or rests a load-bearing decision on an unproven assertion
- **Major** — a real weakness with a concrete scenario that does not by itself fail a requirement
- **Nit** — anything else worth saying, never blocking

Finding fields — "**Affected Scope**: File path, line numbers, or architecture subsystem affected." + "**Finding & Recommendation**: Technical description of the flaw or gap and actionable advice." → Location, Quote, Failure scenario, Recommendation — rationale (concept — `agents/design_critic.md:55-56` — upstream credit; the role's Report Format carries the columns).

Route (team-kit text):

- **planner** — fixable in `design.md` / `team-plan.md` inside the recorded destination, scope and user decisions
- **human** — the only fix changes `map.md` Destination or Out of scope, a `Source: user` decision, an acceptance threshold, or the chosen approach
- the chosen approach is the user's pick, recorded with a user or `requirements.md` source; a `design.md` Decisions Made row whose `From` is `planner` is a planner choice and is never the chosen approach, so a finding against it routes `planner` (SAT A-9)

## Verdict

- `Critique: BLOCKING` iff ≥1 Blocker or Major, else `Critique: CLEAR`; exactly one line
- incomplete review: a read-set file missing or unreadable → `STATUS: NEEDS_CONTEXT`, no verdict (concept — `.claude-plugin/agents/design_critic.md:15-16` — upstream credit)

STATUS (last non-empty line of the report, byte-identical to the returned line) → lead action at Step 4c-a:

| STATUS | When | Lead action |
|--------|------|-------------|
| `STATUS: CLEAN` | `Critique: CLEAR` (Nits only, or none) | → Step 4c-b |
| `STATUS: ERRORS_REMAINING: <n>` | n = Blocker + Major count, every one `Route: planner` | ONE `team-planner` re-dispatch with the findings verbatim (spends the plan-revision budget; at its limit, checkpoint instead) → Step 4c-b; no re-critique |
| `STATUS: BLOCKED — <n> finding(s) need a human decision` | ≥1 Blocker / Major with `Route: human` | Claude: one decision card per finding, critic recommendation first → `map.md` Decisions so far line citing `DC-n` (Source: user); Codex: root reassesses under the recorded autonomy policy, asks only for an uncovered material decision; then the planner findings as above. Spends no plan revision by itself |
| `STATUS: NEEDS_CONTEXT — <file> missing or unreadable` | a read-set file cannot be read — no verdict | supply it and re-dispatch (one more dispatch, not a critique re-run) |

Dispositions — no new `design.md` section:

- each Blocker / Major gets one row in the existing `design.md` → Decisions Made table, written by the planner on the revision the critique fired: `| DC-n <slug> — fixed: <what changed> | <rationale> | design critique DC-n |` or `| DC-n <slug> — rejected | <rationale> | design critique DC-n |`
- a human-routed finding gets its `map.md` Decisions so far line instead
- a rejected Blocker is a tradeoff the lead presents at Step 5 §1 with both rationales (`references/approval.md` material delta)
- Nits need no disposition; no finding is ever accepted by default

### Seal evidence schema

Run `node .claude/skills/team-kit-create/scripts/check-design-critique.mjs <absolute-session-path>` from the repo root. It rejects malformed reports, inconsistent verdict/status/counts, duplicate findings and unanswered Blocker/Major findings. It checks structural decision evidence; the orchestrator must confirm the cited user response really grants the recorded authority. It cannot prove a fix works or authenticate consent. Step 6 reviews the revised design; no second critique is required.

- planner route: exactly one row in `design.md` → Decisions Made, under `| Decision | Rationale | From |`, using the disposition forms above. `fixed:` names the concrete change, rationale is nonempty substantive text, and `From` is exactly `design critique DC-n`. Mentions, pending work, placeholders and duplicate/conflicting dispositions fail.
- human route: instead of a design disposition, exactly one row in `map.md` → Decisions so far: `| D-n <slug> | DC-n <slug> — fixed: <concrete change>; Rationale: <concrete reason>; Source: user | <specific user-response locator and quoted decision> |`, or use `— rejected` with its rationale. The user-response locator must identify the actual response, not point back to the design or critique. The lead authenticates it against the conversation; writing `Source: user` is not consent.
- rejected Blocker, either route: that same map row must use `— rejected` and also carry `; Material acknowledgement: accepted; Critic rationale: <critic's concrete reason>; Rejection rationale: <concrete reason for rejection>`. This records the existing Step 5 material-tradeoff acknowledgement. It adds no approval gate to ordinary fixes or planner-routed Major rejections.
- skip: exactly three nonempty lines: `# Design Critique: <team-name>`, `Runner: skipped — team-design-critic not installed`, `STATUS: DONE_WITH_CONCERNS — design critique skipped: team-design-critic not installed`. Any additional verdict/finding or different reason fails. This is a recorded concern, not a completed critique.
- rigor skip (Claude lane, `map.md` reads `Rigor: low`): exactly three nonempty lines: `# Design Critique: <team-name>`, `Runner: skipped — rigor low: no cross-lane seam`, `STATUS: DONE_WITH_CONCERNS — design critique skipped: rigor low, no cross-lane seam`. The validator rejects it at any other level (`references/rigor.md` → Skip forms).

Fields in decision gist are separated by semicolons; escape literal table pipes as `\|`. Changes, rationales and user-response locators must be nonempty and not unresolved markers such as `TODO`, `TBD`, `pending implementation` or a whole-field template such as `<what changed>`. Code braces, comparisons and domain terms such as `pending transactions` are ordinary content. Concise precise values such as `` `await` removed `` and `user:turn-42` are valid. A human-only finding needs no design Decisions Made table; if that table exists, conflicting dispositions still fail. This is a syntax check, never proof that a decision is sound or authorized.

Origin: team-kit text.

## Not adopted

| EGM text | Source | Why not |
|----------|--------|---------|
| Alternatives Rule — "The specification must include a **mandatory evaluation of alternatives**." | `resources/document_standards/feature-spec-standard.md:15-18` | approach alternatives are settled with the human at Step 3 explore and re-checked by the fog-drain frame check; the planner must not re-litigate them (`SKILL.md` Step 4c). A critic who thinks the chosen approach is wrong files a `Route: human` finding |
| the rest of the Heilmeier catechism (objectives, state of the art, new approach, impact, risks and payoffs, timeline, exams) | `resources/document_standards/heilmeier-standard.md:18-25`, `resources/document_standards/heilmeier-standard.md:28-30` | proposal-level questions owned by clarify / explore / define; only its cost question informs C-3 |
| BRAINSTORM mode and its output block | `agents/design_critic.md:28-32`, `agents/design_critic.md:58-63` | concept ideation lives in Step 3 explore; the critic reviews a written design |
| Standard Compliance Gaps vector — "Missing answers to core questions defined in the Target Standard" | `agents/design_critic.md:42` | team-kit has no Target Standard document for a design; C-5 (Risks) and C-6 (`requirements.md`) carry the standard |
| plain natural-language report; "No Chitchat" | `agents/design_critic.md:50`, `agents/design_critic.md:13` | team-kit report table + terminal STATUS line (D1 conflict N-6: the STATUS protocol stays) |
| wrapper tool list `tools: [Read, Grep, Glob]` and `omitClaudeMd: true` | `.claude-plugin/agents/design_critic.md:5`, `.claude-plugin/agents/design_critic.md:7` | team-kit role surface = `Read, Bash, Write` minus Edit (Bash = the search route, Write = its own report; `team-plan-reviewer` parity); `omitClaudeMd` not adopted (D-13) |

## Provenance

Adapted from the Elephant-Goldfish Model (`egm` v0.1.0), https://github.com/google/elephant-goldfish-model @ `3d0b34821ce88ad328b0c9bf0e06d7eb5f1cd669`. Upstream copyright line as carried by its source headers: `Copyright 2026 Google LLC.` (e.g. `tests/unit/test_harnesses.py:1`; the adapted persona and standard files carry no per-file notice — `agents/design_critic.md:4` declares `license: Apache-2.0`). Licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0; upstream `LICENSE:1-3`, no `NOTICE` at the pin). The stance, C-1, C-2 and the severity labels are verbatim; C-3, C-4 and C-5 are derivatives (adapted mode or target). Modifications: persona re-scoped from EGM document review to the team-kit Step 4c-a design critique (read-set, verdict, routing, dispositions); BRAINSTORM dimensions applied at design review; standard clauses re-targeted to team-kit `requirements.md` / `design.md`; calibration, route, verdict and dispositions are team-kit text (the origin column and each section's origin line mark it). Concept credit, no text copied: the reader seat (`agents/design_critic.md:11-12`), C-6 (`agents/design_critic.md:37`), the finding fields (`agents/design_critic.md:55-56`) and the incomplete review (`.claude-plugin/agents/design_critic.md:15-16`). Decision ids (N-6, D-13, SAT A-9) refer to team-kit session `20261025-elephant-goldfish-eval`. Concept source: Dave Rensin, "Elephants, Goldfish, and the New Golden Age of Software Engineering" (upstream `README.md:49`). Format precedent: `.claude/skills/grilling/SKILL.md:31-33`.
