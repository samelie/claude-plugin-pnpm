---
name: team-kit-create
description: "Scope a problem and create a multi-agent team plan with roles, task lists, and handoff to /team-kit-run. Triggers: team, agent team, multi-agent, create team, team plan, orchestrate agents, team template, team-kit, parallel team, as a team, team up, work as a team"
---

# /team-kit-create — Scope, Plan, and Structure a Multi-Agent Team

Turn a problem into an agent team plan. This skill handles **planning only** — scoping, roles, task list, plan emission. Execution is `/team-kit-run`, handed off at Step 7. create=PLAN, run=EXECUTE.

## Core Pattern: Lead Dispatches, Designers Execute

**Lead stays lean.** Heavy lifting happens in dispatched agents. Lead owns: user communication, phase transitions, session path, the inline gates (Steps 5–6), final handoff. Lead does NOT: research code, generate questions, or make technical decisions — designer/researcher/planner do.

**Artifact chain**: every phase reads the previous phase's file from `team-session/{team-name}/`. No in-memory-only state (full file structure: `SESSION-SCHEMA.md`). Author each dispatch prompt from the contract: phase, ABSOLUTE session path, files to read, file to write, return expectation. Per-phase dispatch guides: `references/clarify.md`, `references/explore.md`, `references/discovery.md`, `references/acceptance.md`.

## Pipeline

```
[problem] → persist prompt + map → clarify loop (names destination) → explore → present loop → write
         → research → DISCOVERY loop (self-resolve ⇄ research ⇄ grill ⇄ prototype ⇄ fog)
         → plan → acceptance → SAT → goal-audit loop → present design → review → file gate → /team-kit-run (execute)
```

`map.md` is the durable low-res index — the one file a fresh session loads to reconstitute state after `/clear`, a context blowout, or a day away. Every other artifact is detail it points at.

## Remote Mode (headless / discord relay)

When the system prompt carries a remote-hitl directive (the `hitl-question` block protocol), every "present to user / wait for response" gate in this skill and its references presents THROUGH that protocol instead of plain prose: emit the block (options with the recommendation FIRST), end the turn, and treat the next user message as the answer. One gate per turn. Applies to clarify questions, the approach pick + key-decision confirmations, section approvals (Steps 3b, 5), discovery grills + premise strikes, the SAT scope decision (4d-b), the 7a delta presentation (only when artifacts mutated after Step 5 approval — the byte-identical notify needs no block), and BLOCKED escalations. Everything else — artifact chain, dispatches, deterministic gates — is unchanged.

## Usage

```
/team-kit-create                        # interactive — asks what you need
/team-kit-create <description>          # scope + plan a team for this task
/team-kit-create health                 # saved workflow: monorepo health
/team-kit-create deep-clean             # saved workflow: full sweep
/team-kit-create list                   # show available templates
```

---

## Step 0: Prerequisites

None blocking. Observers (`intent-keeper`) arm only when `CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS=1` is set (already in `.claude/settings.json` env) — advisory, never a reason to stop; the deterministic gates run regardless (`docs/observer-agents.md`).

## Step 0b: Persist Original Prompt

**Before any triage or dispatch**: `mkdir -p {repo_root}/team-session/{team_name}/` and write `prompt.md` — written ONCE, never modified. This is the source of truth for original intent — discovery and goal-audit reference it to catch drift.

Format (canonical): `# Original Request` + `Date:`/`Session:` header · `## Raw Prompt` (exact user input, unmodified) · `## Initial Context` (branch, recent work, what the user was doing when they asked).

> **Absolute session paths (required).** Every dispatch passes an ABSOLUTE `session_path` (`git rev-parse --show-toplevel` + `/team-session/{team_name}/`). `team-session/` is a persistent untracked dir at repo root; a relative path fails to resolve from a dispatched subagent's cwd and silently produces a false `BLOCKED`. (Surfaced by a real dry-run.)

## Step 0c: Create the Map

Write `map.md` (session root) — the **durable index**. `prompt.md` is frozen intent; `map.md` is living state. A fresh session with zero context reads `map.md` alone and knows where the effort stands.

**Index, not store.** A decision lives in exactly ONE place — the artifact that holds its detail. The map gists it in one line and links. Never restate; the map going stale is what kills it.

```markdown
# Map: {team-name}

Destination: <one line — what reaching the end looks like. Written after clarify (Step 2c). Fixes scope; every later decision is measured against it.>
Phase: <current pipeline stage>
Updated: <date>

## Notes

<domain, skills every session should consult, standing preferences for this effort>

## Decisions so far

<!-- one line per settled decision; enough to judge relevance, then open the link for detail -->
<!-- ids carry a human slug (team-session-writing → Readable ids): D-1 approach-pick, never bare D-1 -->
| Decision | Gist | Detail in |
|----------|------|-----------|

## Premises

<!-- load-bearing assumptions under ratified decisions, one falsifiable line each. minted when a -->
<!-- decision with real alternatives is ratified (approach pick, key decisions, scope calls) — skip -->
<!-- for effort with an obvious route. discovery diffs every new research finding against this table; -->
<!-- a contradiction is a PREMISE STRIKE → that round's HITL item (reopens a ratified decision — human only). -->
| Premise | Assumption (falsifiable) | Supports | Status |
|---------|--------------------------|----------|--------|
<!-- P-2 queue-supports-delay | @adddog/queue supports delayed redelivery | D-1 approach-pick | holds -->
<!-- status lifecycle: holds → STRUCK (link) → re-scoped (link) / withdrawn (link) / holds (human held) -->

## Phase deltas

<!-- take-stock line at every phase transition, written by the lead: what this phase CHANGED about our -->
<!-- understanding. entering belief → what changed it → exiting belief / premises struck / new fog. -->
<!-- one line per delta, index-not-store. this is the first thing a resumed session or the 4e auditor reads. -->

## Not yet specified

<!-- fog: in-scope questions you can tell are coming but cannot phrase sharply yet. -->
<!-- test = can you state the QUESTION precisely now? not can you ANSWER it. -->
<!-- graduates into a resolved decision or a task as the pipeline advances; delete the fog line when it does -->

## Out of scope

<!-- rejections ledger: considered and consciously ruled OUT of this effort. Never graduates. -->
<!-- prevents re-litigation next session and stops goal-audit flagging deliberate exclusions as gaps -->
| Ruled out | Why | Raised in |
|-----------|-----|-----------|
```

**Who updates it**:

| When | Owner |
|------|-------|
| Step 0c creation, Notes, destination after clarify, plan + audit outcomes, phase transitions **+ a Phase-deltas line per transition** (entering belief → what changed → exiting belief) | **lead** |
| every discovery round — decisions, fog, out-of-scope, **premise strikes** | **`team-designer`** (Step 4b) |
| premises minted at approach ratification (Step 3) | **lead** (from `designer/explore.md` → Premises) |

Discovery ownership sits with the designer, not the lead, because `intent-keeper` injects its reports into the *observed agent* — a "you didn't record that decision" nudge has to land on someone who can fix it. One line per event, never prose.

---

## Step 1: Triage

| Input | Path |
|-------|------|
| `list` | show templates, stop |
| `health`, `deep-clean` | point at saved workflow `/monorepo-health` / `/monorepo-fix`, stop |
| `debug` / "investigate" / "root cause" | debug-investigation template |
| "design" / "spec" / "what should we build" | designer phases, then planner |
| Clear, detailed spec | skip clarification → Step 3 |
| Vague, broad, exploratory | clarify loop (Step 2c) |
| **Foggy AND bigger than one plan** | **chart-only mode (Step 2d)** — do NOT push through the full pipeline |
| No args | ask what they want to build |

**Well-scoped test** — must be able to answer all three: affected packages/modules? concrete deliverables? acceptance criteria? Any unclear → clarify first.

**Chart-only test** — is this one plan, or a campaign? Signals it's a campaign: the destination itself is contested; whole subsystems are unnamed; early decisions will invalidate later ones so a full plan would be fiction; you cannot state most of the open questions sharply enough to answer them. Symptom to watch for: clarify running long without converging — that is fog, not a bad question, and more clarify rounds will not fix it.

## Step 2d: Chart-Only Mode

The pipeline assumes the route is knowable at plan time. When it isn't, forcing a plan produces a confident-looking fiction. Chart instead:

1. Clarify **only until the destination is nameable** (Step 2c) — not until fully scoped.
2. Write `map.md` with the destination, the fog in **Not yet specified**, anything already ruled out in **Out of scope**.
3. Name the **first clearable patch** of fog — the question whose resolution unblocks the most others.
4. **Stop.** Tell the user this is a campaign: run `/team-kit-create` per patch as each becomes specifiable, each producing a real plan against a now-clear route. `map.md` carries state between them.

Each subsequent run reads the same `map.md`, appends its decisions, and graduates the fog it cleared.

## Step 2a: List mode

Read `${CLAUDE_PLUGIN_ROOT}/team-templates/` and present: saved workflows (`health` → `/monorepo-health`, `deep-clean` → `/monorepo-fix`) + template docs (`debug` → `debug-investigation.md`). Stop after listing.

## Step 2b: Template mode

Saved-workflow shortcut (health/deep-clean): name the workflow, stop — user runs it directly. Template-doc shortcut (debug): read `${CLAUDE_PLUGIN_ROOT}/team-templates/debug-investigation.md`, present summary (name, agents, phases, cost), hand off to `/team-kit-run` (Step 7). Done.

## Step 2c: Clarify Loop

**Read `references/clarify.md`** for the full dispatch guide.

Loop: dispatch `team-designer` (phase: clarify) — ONE focused question per dispatch; it reads existing `designer/clarify.md` (prior Q&A) and updates it. Lead presents the question, collects the answer, re-dispatches. Designer is stateless — disk carries the context.

**Question craft is the `grilling` skill** (preloaded on the designer): recommended answer with every question — the user decides, not thinks; facts the environment can settle are looked up, never asked.

**Name the destination first.** The opening question fixes what "done" looks like — the destination is what all later scope is measured against, so it is settled before anything else. Write it into `map.md` `Destination:` as soon as the user answers.

**Exit**: lead can answer packages/modules, deliverables, acceptance criteria, constraints. Questions the loop surfaces but cannot phrase sharply go to `map.md` **Not yet specified** — do not grind on fog. Anything the user rules out goes to **Out of scope** with its reason.

**Team-size decision** (after clarify):

| Signal | Verdict |
|--------|---------|
| 1–3 files, single module, sequential | NOT a team — redirect to single-agent planning |
| 3+ files across independent modules, or parallel exploration adds value | team candidate |
| Same-file edits, heavy inter-task dependencies | NOT a team — single session better |

## Step 3: Approach Exploration

**Read `references/explore.md`** for the full dispatch guide.

Dispatch `team-designer` (phase: explore) — reads `designer/clarify.md`, explores the codebase, proposes 2–3 approaches with tradeoffs + a recommendation, writes `designer/explore.md`. Lead presents; user picks; selection recorded in `explore.md`.

**The pick is PROVISIONAL until discovery's frame checks confirm it** — it is made before deep research exists (research is 4a/4b), i.e. at minimum knowledge. Ratifying it here fixes the frame that directs research; discovery is licensed to challenge it (Step 4b frame check + premise strikes), and a strike re-presents the pick with evidence rather than silently absorbing it. On ratification the designer decomposes the pick's rationale into **premises** — falsifiable, one line each (`P-2 queue-supports-delay`) — and the lead copies them to `map.md` **Premises** (`references/explore.md` → Premises). Skip premise-minting when the route is obvious and alternatives were not real.

## Step 3b: Present Requirements

Dispatch `team-designer` (phase: present) once per section — Problem, Requirements, Approach, Acceptance criteria, Constraints. Each dispatch reads `clarify.md` + `explore.md` + existing `present.md`, presents ONE section, records approval status. Approved → next section; revision requested → re-dispatch with the feedback. **Exit**: all 5 sections approved in `designer/present.md`.

## Step 3c: Write Requirements

Dispatch `team-designer` (phase: write) — reads ALL `designer/*.md`, synthesizes `requirements.md` at session root. Complete and self-contained: this is the canonical handoff artifact.

---

## Step 4: Research + Discovery + Plan

### 4a: Researcher — opening sweep

Dispatch `team-researcher` — reads `requirements.md`; queries claude-mem (prior work, gotchas, decisions), CocoIndex (existing implementations, key types, module boundaries), then code (entry points, data flows, coupling). Writes `researcher/research-findings.md`, focused on what a planner needs to decompose the work into agent tasks. **Wait for it — the first discovery round needs `research-findings.md` on disk.** (Parallelism pays inside discovery instead: exit-2 fan-outs run backgrounded while the human answers.)

This is the **opening sweep, not the only one**. Research is re-entrant: the discovery loop fires further targeted researchers on demand (`researcher/research-findings-{id}.md`).

> **Write guard (resolved 2026-08-04).** The harness denies subagent Writes to `findings*`/`report*` basenames (`team-kit-run` SKILL rule 16); researcher artifacts are named `research-findings*.md` to stay clear of it (rename-probed writable). Standing backstop for EVERY phase writer: a write-guard denial → the agent returns the artifact as text (write-denial protocol, `team-session-writing`) and the lead persists it to the contracted path before the next dispatch — an artifact never remains lead-context-only.

### 4b: Discovery Loop (the key differentiator)

Dispatch `team-designer` (phase: discovery) — reads `requirements.md` + `prompt.md` (intent-drift check) + `map.md` + existing `designer/discovery.md` + the NEW `researcher/research-findings*.md` paths named in the dispatch (prior rounds are digested in `discovery.md`; a big task accumulates many findings files — don't re-read them all each round). Cross-references research against requirements and grills toward a plannable spec.

**Full guide: `references/discovery.md`.** Each round, every open question takes exactly one of five exits:

| Exit | Type | Resolved by | Cost |
|------|------|-------------|------|
| **self-resolve** — code answers it | AFK | designer explores, updates `requirements.md` inline | free, no round-trip |
| **research** — external knowledge answers it (docs, third-party API, prior art, knowledge base) | AFK | lead fans out `team-researcher` per question, **in parallel** | cheap, no human |
| **prototype** — you have to see it to judge it | HITL | designer writes a cheap concrete artifact (outline, stub, sample payload, fake response) → lead presents THAT as the question | one round-trip, high fidelity |
| **grill** — only human judgment settles it | HITL | lead asks the user, ONE question, with recommended answer | one round-trip |
| **fog** — cannot phrase the question sharply yet | — | designer appends to `map.md` **Not yet specified** | free |

The designer returns a **round report** (titled `Round {N} — {slug}`, ids per `team-session-writing` → Readable ids): self-resolved (done), research-needed (list — batched, they cost no human attention), prototype-or-grill (exactly ONE, the human's attention is the scarce resource), **premise strikes** (a finding contradicting a `map.md` premise — outranks the queued grill as the round's HITL item), fog (list). Lead action:

| Round report contains | Lead does |
|---|---|
| research-needed | fan out one `team-researcher` per question **in parallel**, background — dispatch carries the DECISION the question informs + any premise it might strike (`references/discovery.md` → Research fan-out) |
| one HITL question | present it while research runs — do not serialize the human behind the agents |
| **premise strike** | present the strike as the round's HITL item (evidence + the ratified decision it reopens); the human re-decides or holds — never silently absorb it |
| fog | verify the designer wrote it to `map.md`; never grind on it |
| `STATUS: CLEAN` | fog-drained → **frame check + fresh-eyes** (one dispatch: still the right approach? which "settled" prose outruns its evidence?) → Step 4c |

**Load-bearing findings get a refuter before they graduate.** A finding that becomes a Decision, settles what a blocking AC will grade, or strikes a premise gets ONE fresh-context refute dispatch ("disprove this claim, cite `file:line` or a command") — AFK, parallel, costs no human time. Everything else enters `requirements.md` unrefuted; proportionality mirrors SAT (a)–(d).

**A NEGATIVE is a claim about the whole search space — refute it like any other.** *"No implementation exists"*, *"could not verify statically"*, *"nothing references it"* read as observations but assert a swept space, and a sweep is only as good as the paths it walked. So a load-bearing negative carries the SEARCH that produced it (the command + the roots it covered) and takes the same refute dispatch — whose job is to find the one hit, not to re-run the same grep. Downstream this matters more than a positive: a positive gets re-derived when someone resolves its citation; a negative is inherited whole, because there is nothing to resolve. (Measured: a research sweep's *"could not verify statically"* was a false negative from a grep that missed `packages/eng-db/`. Two lanes were pre-loaded with it — one re-derived and caught the fix commit plus its regression test, the other inherited the negative and shipped a verdict on a false basis, costing the run its only fix round.)

**`research → grill → research` falls out of this.** A grill answer routinely opens a question only external knowledge settles; that fires the next research fan-out, whose findings open the next grill. That is the loop working, not thrashing.

**Termination is fog-drain, not a round cap**: exit when no exit-1/2/3/4 questions remain — everything left is fog or out of scope. Safety cap 10 rounds, plus a per-thread signal: questions carry ids with parent pointers (`Q-7 dedupe-visibility ← A-3`), and a root spawning 3+ generations without one resolution is fog wearing a question costume — route it to fog, don't burn rounds (`references/discovery.md` → Genealogy). If the lead's context gets heavy before then: update `map.md`, stop, resume in a fresh session — `map.md` is the resume point, so a long discovery costs sessions, not fidelity. User can exit any time ("plan it", "move on") or steer ("dig deeper into X").

**Ledger duty each round — the designer owns `map.md` here**: settled decision → **Decisions so far** (one line + link). Ruled out → **Out of scope** with reason. Fog cleared → delete the graduated line from **Not yet specified**. Written in the same beat as the `requirements.md` update, never batched. (Outside discovery, the lead owns the map.)

> **⚠ Dispatch the designer PLAIN — no `name:`.** `intent-keeper` observes `team-designer` and is the live guard on this loop. The named-dispatch DISARM is **obsolete as of 2.1.233** (named dispatches now arm) — plain dispatch is kept as a **precaution**: change window unbisected, failure mode is a silently missing guard. Round number goes in `description`, never `name`. See `references/discovery.md` → Observer arming trap; `docs/observer-agents.md` HC2.

**What the observer is watching for here** (`agents/intent-keeper.md` → Discovery-loop lenses): discovery is the only phase that rewrites `requirements.md` in place, round after round, off research the human never read — so small reasonable edits can compound into a spec nobody agreed to. Four lenses: a research *finding* laundered into a product *decision*; an unanswerable question written as confident requirement prose instead of fog; a scope-changing decision missing from the `map.md` ledger; a rejection in **Out of scope** quietly reopened. Advisory nudges into the designer mid-round — the hard gates still sit downstream (goal-audit, Step 7).

### 4c: Planner

Dispatch `team-planner` — reads `requirements.md`, `map.md`, `designer/clarify.md`, `designer/explore.md`, `designer/discovery.md`, ALL `researcher/research-findings*.md`. Constraints: honor the chosen approach (no re-litigating alternatives — the frame checks already confirmed it); honor discovery decisions; **plan nothing listed in `map.md` Out of scope**; treat remaining **Not yet specified** fog as out of this plan's scope, not as work to invent. Research is done — use the findings. Follows `FRAMEWORK.md`. **The plan MUST carry an `autonomy:` block** — the run lane's grant of self-drive: loop caps (verify/validate fix rounds, global fix ceiling), the escalation set (what stops the run for a human), seam policy (which inter-run seams are orchestrator decisions vs declared human gates). Ratified at Step 5; executed without re-asking (`team-kit-run` → Autonomy contract).

> **External wire shapes must derive from a CAPTURED reality.** If any part of the plan depends on the wire format of an external tool — a vendor CLI's event stream, a third-party API payload, an MCP server's result shape — the plan must name (a) **where the real capture comes from**: a persisted artifact some task writes, never a hand-authored fixture, and (b) **the production binding that persists it**, cited `file:line` — a seam that merely exists on the type persists nothing. Tests asserting that shape are generated from the capture. A synthetic fixture encodes what you imagined the vendor does: it passes, and the defect ships. (Measured twice on ONE vendor surface in one effort — model labels zipped onto steps by array index, then a begin/completed double-node that the unit proof missed because the synthetic stream carried one event per call. Both reached paid runs; the second shipped with a green proof.)

Produces:
- `design.md` — architecture summary (HOW)
- `team-plan.md` — roles, tasks, ownership matrix (disjoint globs), phases (TASKS)
- `plan.workflow.js` is NOT emitted here — `/team-kit-run` mode-1 authors it from `team-plan.md` (md is ground truth; re-author on change). See PLANNER.md → `### 3. plan.workflow.js`.

## Step 4d: Acceptance Contract

**Read `references/acceptance.md`** for the full dispatch guide.

Dispatch `team-goal-auditor` (phase: define) — reads `prompt.md` + `requirements.md` + `team-plan.md`; authors `definition-of-done.md` (root): checkable acceptance criteria anchored to `prompt.md` (the goal, not the plan). Coverage both directions: every deliverable ≥1 AC; every AC `maps_to` ≥1 real task. Hybrid grading: mostly deterministic, at least ONE semantic. `STATUS: ERRORS_REMAINING` (a deliverable can't be made checkable) → route back to planner/designer to sharpen, re-run define.

**Coverage has a third direction — DECISIONS.** Every ratified decision (`map.md` **Decisions so far**, `designer/discovery.md`) whose effect depends on an instruction **reaching an agent or a prompt** must name its **producing site**: the task that carries it, the prompt block that states it, or a gate that runs on the output. A decision with no producing site is a decision that will not happen. (Measured: a scope ruling — dogfood one half, keep the other frozen as a control — was ratified, cited in the plan, and never written into the authoring prompt; the authoring session met a broken selector, did the reasonable thing, regenerated the frozen fixtures, and failed a blocking AC on a paid run. A path-scoped diff guard cannot see a file inside an allowed path being rewritten. Three instances of this shape in one session.)

**And a fourth — PROMPT PRONGS, written as a TABLE, not claimed in prose.** `definition-of-done.md` carries a **Prompt-prong coverage** section: one row per distinguishable prong of `prompt.md` — each ask, each constraint, each *not-this* qualifier, splitting a sentence that carries two — quoted verbatim, against the AC id(s) that grade it. A prong whose AC cell is empty is a **define-phase defect**, and there are exactly two legal closes: cover it with an AC, or write `ungraded — <reason>` in that cell so the human sees it at Step 5. Never leave the row off the table. Constraint-shaped prongs are the ones that evaporate — they name no deliverable, so deliverable-coverage never asks after them. (Measured: a prompt asking for a review *"not too technical"* / *"not deeply technical"*; `grep -in 'not .*technical\|altitude'` over `requirements.md` → **zero hits** — no requirement, no task constraint, no AC. A prong with no AC is invisible to every downstream gate by construction: SAT only reaches blocking ACs, the blind audit compares plan+DoD against the ACs that exist, and the run lane re-grades that same set. Nothing could have caught it, and nothing did — the graded run reported it as a define-phase finding after the artifact shipped. Make an altitude/tone prong checkable like any other: *"every finding readable from its first two lines without opening a source file"*.)

**A splice into an AC row edits the whole DOCUMENT, not the row.** The contract restates its own rows in prose — "Notes for the run lane", grader sets, coverage tables. Every later define-phase edit (a SAT fix, a Step-6 alignment splice, an audit re-plan) must carry the change into every restatement in the SAME edit, or the contract disagrees with itself and the run lane adjudicates a contract question mid-flight. (Measured: an alignment splice moved AC-8's grader to the LEAD in the AC row, with the reason; the "Notes for the run lane" block 51 lines below still listed AC-8 in the verifier's set. The orchestrator ruled the row governs — correct, and a ruling nobody should have had to make.)

## Step 4d-b: SAT — the Satisfiability Pass

The DoD makes every criterion **falsifiable**: a wrong run must fail it. SAT asks the dual question define never asks — **can a CORRECT run SATISFY it?** For every BLOCKING AC, name one concrete world-state in which it PASSES and show that state is reachable by the plan's own tasks. A blocking AC with no reachable passing state is a gate no correct run can open; you find out by spending against it.

**Nothing downstream catches this.** The blind goal audit (4e) and the fresh-eyes plan review (Step 6) both check **coherence** — and an unsatisfiable criterion is usually perfectly coherent. Falsifiability and satisfiability are independent properties; only this pass tests the second.

### The table — one row per blocking AC

| AC | Passing state (observable at a point in time) | Produced by (task + the actual site) | Preconditions the state needs | Forbidden by anything frozen? | Counterfeit state also reachable? |
|----|-----------------------------------------------|--------------------------------------|-------------------------------|-------------------------------|-----------------------------------|

- **A state, not an activity.** "the seam is invoked", "the module is wired", "the agent attempts X" are activities. A state is something you could observe and record: bytes in a file, a row in a table, a returned value, a check-run conclusion, a receipt field. Can't write down what you'd observe → the AC isn't checkable; back to define.
- **Follow the wiring to the producing SITE.** A dependency-injected seam is produced by its **composition-root binding**, cited `file:line` — never by the call site. Declared-and-invoked is not produced.
- **Reachable by the plan's OWN tasks**, not by a plausible world in which someone does the obvious thing.

### The four ways an AC turns out unsatisfiable

| Mode | Tell | Fix before sealing |
|------|------|--------------------|
| **The frozen set forbids the pass** | the AC freezes an artifact AND requires an outcome only a change to that artifact can produce | freeze the artifact's **contract** (names, triggers, gating), not its bytes — let it change additively |
| **The producer does not exist** | the passing state needs a binding / task / prompt line nobody wrote | planner adds the producing site, or the AC drops out of blocking with the reason recorded |
| **A COUNTERFEIT passing state is also reachable** | the criterion goes green with none of the work done — a pre-warmed witness, a cached artifact, last run's leftovers | write the missing **precondition into the existing AC** (asserted, rc-checked, recorded in the evidence artifact). Not a new AC |
| **The chosen path structurally cannot get there** | the AC assumes a path the design ruled out | HUMAN scope call: change the path, or narrow the destination. Never seal it as blocking |

### Worked examples — all measured, all cost real money

| Failure | Why define + audit + review all passed it | The SAT question that catches it |
|---------|-------------------------------------------|----------------------------------|
| **Frozen-artifact deadlock** — a CI workflow frozen byte-unchanged AND its three checks required green; that file's own `permissions: contents: read` made the upstream filter job die *Resource not accessible by integration*, so all three contexts SKIPPED via `needs:` | "freeze this file and require its checks green" is an internally consistent sentence | *what change makes these checks green, and does the frozen set allow it?* → none does; the freeze forbids the only fix. **2 graded runs spent against a gate that could never be green** |
| **Counterfeit witness** — the contract barred an `Existing` browser profile to protect the one clause the code cannot forge, but `Fresh` resolved to a deterministic **never-wiped** path, so a re-run inherits the previous run's cookies | banning `Existing` reads as the hazard being handled | *name the passing state precisely* → forces "profile dir empty at t=0", which nothing asserted. Caught by a coder noticing 12 stale graded-origin cookies, not by a criterion |
| **Port graded, adapter unbound** — machinery graded LANDED on the seam existing and being invoked; the composition root bound nothing, so production persisted no event stream | "exists and is invoked" is true, checkable, and was checked | *what SITE produces it?* → no binding at the composition root. A wrong verdict stood signed until execution contradicted it |
| **Destination unreachable** — required a production `active` transition on a one-shot path that by design imports no DB, creates no source row, so activation can never fire | the criterion matched the destination sentence exactly — the **destination** was the thing that was wrong | *is this state reachable by the plan's own tasks?* → no. Scope call: use the path that seeds the row, or narrow the destination |

(Provenance: `team-session/mono-cal-codex-discovery` — `learnings.md` §1, `execution-findings.md` EF-1/EF-2/EF-3, `build-state.md` PD-17/PD-18/PD-19.)

### Keep it proportionate

Most rows are one line and take seconds: a lint/types/test AC's passing state is "the command exits 0", produced by the task that writes the code. Spend real thought only on an AC that (a) grades an artifact the contract **freezes** or forbids touching, (b) grades an **unforgeable witness** / anti-fabrication clause, (c) grades a **production state transition**, an external system or a third-party check, or (d) grades **paid, one-shot or irreversible** work. A contract of a dozen deterministic ACs is a five-minute desk pass — do it inline and move on. Skipping SAT entirely is defensible only when NO AC hits (a)–(d); say so in one line in `sat.md`.

### Who runs it

| | |
|---|---|
| **Option A** (any (a)–(d) AC exists) | dispatch `team-goal-auditor` (phase: sat), FRESH CONTEXT — reads `definition-of-done.md` + `team-plan.md` + `design.md` + `requirements.md` (for the frozen/forbidden set); writes `goal-auditor/sat.md`. The agent file enumerates `sat`; dispatch per `references/acceptance.md` → Step 1b, and have it read the contract cold even if it authored it |
| **Option B** (small, all-deterministic contract) | lead fills the table inline against DoD + `team-plan.md` and writes `goal-auditor/sat.md` |

| Result | Action |
|--------|--------|
| every blocking AC reachable, no counterfeit | → Step 4e |
| unsatisfiable, fixable in plan or contract (modes 1–3) | re-dispatch planner (missing producer) or goal-auditor define (restate AC / add precondition) → re-run SAT. Cap 2 |
| unreachable because the destination or chosen path is wrong (mode 4) | `BLOCKED` — human scope decision **before sealing**; narrowing updates `map.md` **Destination** and the DoD. Does NOT burn the cap |

**Never resolve a SAT failure by weakening the criterion.** Deleting the hard clause trades a gate that cannot pass for one that cannot fail — strictly worse, because it looks green. Two legal moves only: make the passing state reachable, or move the AC out of blocking with the reason recorded.

`goal-auditor/sat.md` is the maker's reachability work — it stays **out of** the 4e audit's read-set, which is unchanged.

## Step 4e: Plan-vs-Goal Audit (cap 2)

Dispatch `team-goal-auditor` (phase: audit) with FRESH CONTEXT — reads ONLY `prompt.md` + `definition-of-done.md` + `team-plan.md` + `map.md` **Destination and Out of scope sections only** (no clarify/explore/discovery history, no **Decisions so far**, no agent reasoning — those are the maker's route and would contaminate it). **Never pass `subagent_type: "fork"` on ANY fresh-context dispatch** (audit, SAT, Step 6 plan review, discovery refuters, the fog-drain frame check): fork inherits the ENTIRE planning conversation and silently defeats the contamination firewall these stages exist for. Cheapest place to catch intent drift: does plan + DoD faithfully satisfy the original goal? Finds gaps / drift / scope-creep / weak AC; disproves each finding before reporting; writes `goal-auditor/goal-audit.md`.

**Re-derive the prompt prongs — never grade the define phase's own list.** The auditor enumerates the prongs of `prompt.md` itself (asks, constraints, *not-this* qualifiers), THEN reads the DoD's **Prompt-prong coverage** table against its own list. A prong the auditor found and the table does not carry is a `gap` finding; a prong the table marks `ungraded — <reason>` is reported once, not re-litigated. Checking the table for internal consistency instead of re-deriving it re-runs define's blind spot — the one prong define never saw is exactly the one missing from its table.

**Out of scope kills the auditor's false positives.** A deliverable absent because the user deliberately excluded it is not a gap — previously the auditor could not tell the difference and burned a re-plan cycle rediscovering a decision already made. If it thinks an exclusion is itself wrong, that is `BLOCKED` (human goal question), never `ERRORS_REMAINING` — a planner cannot fix a scope call the user made.

| Result | Action |
|--------|--------|
| `STATUS: CLEAN` | proceed to Step 5 |
| `STATUS: BLOCKED` | escalate to human (goal ambiguous) — does NOT burn the cap |
| `STATUS: ERRORS_REMAINING` | re-dispatch planner with the findings, attempt++ |
| not CLEAN after 2 attempts | escalate — the goal itself likely needs a human decision |

---

## Step 5: Present Design (inline — approval gates)

Lead presents the planner's output section-by-section, inline (no dispatch). Distinct from Step 3b (that presented REQUIREMENTS). Purpose: incremental approval = incremental correction.

| # | Section | Source |
|---|---------|--------|
| 1 | Components / Architecture | `design.md` |
| 2 | Data Flow / Interfaces | `design.md` |
| 3 | File Ownership (matrix — no overlaps, one owner per file) | `team-plan.md` |
| 4 | Task List (id + slug, title, phase, agent, type HITL/AFK, blockedBy) | `team-plan.md` |
| 5 | **Definition of Done** — the blocking ACs (id + slug + verify), i.e. the execution STOP CONDITION | `definition-of-done.md` |
| 6 | **Autonomy grant** — loop caps, escalation set, seam policy: what the run does WITHOUT you, what stops it | `team-plan.md` `autonomy:` block |

Explicit approval per section before the next. Rejection: clarify what's wrong → minor = edit inline; major = re-run planner with feedback → re-present showing the change. Scannable tables, not prose walls; reference the files for full detail. Sections 5–6 are what make Step 7a a formality instead of a second review: the stop condition and the autonomy grant get their approval HERE, where correction is incremental.

## Step 6: Post-Plan Review (fresh-eyes whole-document check)

Catches what section-by-section approval misses — placeholders, cross-document inconsistency, ambiguity visible only in the whole.

**Option A (recommended)**: dispatch `team-plan-reviewer` (fresh context, no planning bias) — reads `requirements.md`, `design.md`, `team-plan.md`, `definition-of-done.md` (every AC maps to a task, every deliverable covered), `goal-auditor/goal-audit.md` (confirm CLEAN). Writes `plan-review.md` with verdict.

**Option B (simple plans)**: inline 5-check rubric against `design.md` + `team-plan.md`:

| Check | Catches |
|-------|---------|
| 1. Placeholder scan | TBD / TODO / `...` / empty sections / vague reqs ("appropriate error handling") |
| 2. Internal consistency | every design component ↔ ≥1 task; every task file ↔ an owner; blockedBy ↔ phase ordering |
| 3. Type consistency | same function/type/module names across `design.md` and `team-plan.md` |
| 4. Ambiguity | any requirement interpretable two ways → make explicit (exact behavior, file:line refs). Also: requirement text **more specific than its cited evidence** — discovery writing confident prose over a question it never actually answered |
| 5. Scope | 10+ tasks → consider splitting; multiple independent features → separate plans |

**Decision**: clean / minor fixed inline → Step 7. Issues needing revision → re-run planner with findings → re-review. Zero tolerance for placeholders; block on real issues only, not style.

---

## Step 7: File Review Gate + Handoff

### 7-gate: Seal the contract (mechanical validation)

| Check | Catches |
|-------|---------|
| every `team-plan.md` task maps to ≥1 AC in `definition-of-done.md` | orphan work |
| every AC `maps_to` ≥1 task | unaddressed goal (the dangerous direction) |
| every AC has a `verify` method (command or grader agent) | un-checkable "done" |
| every distinguishable prong of `prompt.md` has a row in the DoD's **Prompt-prong coverage** table, carrying an AC id or an explicit `ungraded — <reason>` — re-derive the prongs from `prompt.md`, don't audit the table against itself | a prompt prong with NO AC: invisible to SAT, to the blind audit and to the run-lane grade |
| no prose in `definition-of-done.md` restates an AC row it now contradicts (grader, `verify`, `blocking`, the run-lane notes) | a spliced row the document's own summary still describes the old way — a contract disagreeing with itself |
| every blocking semantic AC has a producible evidence artifact (a task writes it to a known path) | ungradeable "done" |
| every blocking AC has a `goal-auditor/sat.md` row (passing state + producing site + preconditions) — OR `sat.md` carries the one-line proportionality skip (no blocking AC hits 4d-b (a)–(d)) | a gate no correct run can open |
| no `sat.md` row leaves a counterfeit passing state reachable — or the precondition that rules it out is written INTO the AC | a hollow green: the criterion passes with none of the work done |
| any plan dependency on an external tool's wire shape names its real-capture source AND the production binding that persists it (`file:line`) | fixtures asserting an imagined vendor shape — passes, then ships |
| every decision whose effect depends on an instruction reaching an agent or prompt names its producing site | ratified decisions that never reach the run |
| `goal-auditor/goal-audit.md` STATUS = CLEAN | intent drift vs `prompt.md` |
| ownership-matrix globs disjoint (the `disjoint(owners)` pre-flight input) | parallel write collisions |
| every task carries `type: HITL` or `type: AFK` (HITL = prod-mutating / irreversible / paid-live / needs human evidence) | run-lane human-gating decided by heuristic instead of by the plan |
| every decision in `designer/discovery.md` has a line in `map.md` **Decisions so far** | decisions that vanish at the session boundary |
| every scope-touching row in the `discovery.md` Q&A log (`requirements.md §` = Approach / Must Have / Out of Scope) carries `Source: user` | a research finding laundered into a scope decision nobody made |
| nothing planned that sits in `map.md` **Out of scope** | re-litigated rejections |
| remaining **Not yet specified** fog is out of THIS plan's scope, not silently absorbed into it | fog planned as if it were understood |
| no `map.md` premise reads STRUCK-unresolved; frame checks ran (round-1 `Frame:` line in `designer/discovery.md` + `designer/frame-check.md` from the fog-drain dispatch) | a plan built on a frame the evidence already killed |
| `team-plan.md` carries the `autonomy:` block (loop caps, escalation set, seam policy) and it was presented at Step 5 §6 — or ratified wholesale by an explicit user waiver recorded in `map.md` Decisions | run-lane autonomy seized by heuristic instead of granted by the ratified plan |
| minted ids carry human slugs (AC / T / P / PD / D / Q per `team-session-writing` → Readable ids) | bare ids unreadable at every downstream decision point |

Any check fails → fix (re-dispatch planner or goal-auditor) before proceeding. These files are the contract `/team-kit-run` boots from: a **fresh orchestrator with zero planning context must be able to execute from them alone**. If it can't, something lives only in the lead's head — write it down before sealing.

### 7a: File review — delta-gated notify, not a second review

Every artifact was already section-approved at Step 5 (incl. DoD §5 and the autonomy grant §6) and fresh-eyes-reviewed at Step 6 — but Step 6 and the 7-gate can RE-DISPATCH the planner/goal-auditor, mutating artifacts after the user's approval. So:

- **artifacts byte-identical to what Step 5 approved** → NOTIFY: final file list + one Phase-deltas line + "next: `/team-kit-run` — invoking it is the launch consent; request changes instead of invoking if anything's off". No review turn.
- **anything mutated since approval** → present ONLY the deltas (which sections, what changed, why) for approval. Never a full re-review.

(`plan.workflow.js` is authored later by `/team-kit-run` mode-1.)

### 7b: Hand off to /team-kit-run

The handoff is ONE user action, not two confirmations: the 7a notify names `/team-kit-run` as the next command; invoking it IS the launch consent (the plan's ratification + the autonomy grant carry the approval). The seal survives — run boots a FRESH orchestrator from the disk contract, never from create's conversation (the context firebreak + observer lane-split are why create never launches the run itself). Mode-1 authors `plan.workflow.js` from `team-plan.md`, lints + saves, then runs; `type: AFK` tasks run as a background workflow driven by the `autonomy:` block; `type: HITL` tasks come back as a human-gated checklist — the run lane's prod/irreversible/paid heuristic stays as backstop for anything mistyped. For template mode, name the saved `/{template}` workflow if one exists. **Skill ends here.**

---

## Artifact Chain (all on disk)

```
prompt.md              ← lead persists immediately (raw user request, never modified)
    ↓ referenced by all phases
map.md                 ← lead creates at Step 0c; DURABLE INDEX, updated throughout ────┐
    ↓ referenced by all phases                                                          │
designer/clarify.md    ← designer(clarify) writes, each invocation appends              │
    ↓ reads                                            → destination lands in map.md ───┤
designer/explore.md    ← designer(explore) writes    → premises land in map.md ─────────┤
    ↓ reads both                                                                        │
designer/present.md    ← designer(present) writes, each section appends                 │
    ↓ reads all three                                                                   │
requirements.md        ← designer(write) writes (root, canonical handoff)               │
    ↓ reads                                                                             │
researcher/research-findings.md ← team-researcher writes (opening sweep)                         │
    ↓ reads requirements.md + research-findings*.md + prompt.md + map.md                          │
designer/discovery.md  ← designer(discovery) writes, each round appends ────────────────┤
    ↕ exit 2 fans out targeted researchers → researcher/research-findings-{id}.md   (re-entrant)  │
    ↕ exit 3 writes designer/prototypes/{slug}                                           │
    ↓ also updates requirements.md inline + map.md ledger as decisions resolve ─────────┤
design.md + team-plan.md ← team-planner writes (honors map.md Out of scope)             │
    ↓ reads prompt.md + requirements.md + team-plan.md                                   │
definition-of-done.md  ← team-goal-auditor(define) writes (root, acceptance contract)   │
    ↓ reads DoD + team-plan.md + design.md + requirements.md (the frozen set)            │
goal-auditor/sat.md    ← team-goal-auditor(sat) writes; one reachable passing state per blocking AC
    ↓ reads prompt.md + DoD + team-plan.md + map.md Destination/Out-of-scope (fresh; NOT sat.md) ◄──┘
goal-auditor/goal-audit.md ← team-goal-auditor(audit) writes; gaps loop to planner (cap 2)
    ↓ contract sealed after audit CLEAN + Step 7 gate
plan.workflow.js       ← authored by /team-kit-run mode-1 from team-plan.md (md canonical)
```

Handoff data shapes: `team-templates/SCHEMA-CATALOG.md`. **Traceability**: every decision in `team-plan.md` traces back through this chain to the original prompt, a user answer, a research finding, or a present revision.

**`map.md` is the only artifact that spans the whole chain.** Everything else is a phase's detail; the map is the index over all of it, and the one file that makes the chain resumable — a fresh session reads it and knows the destination, what's settled, what's foggy, and what was ruled out, without replaying the pipeline.

## What This Skill Does NOT Do

- **Execute** — planning only; execution is `/team-kit-run`
- **Implement code** — lead delegates all implementation
- **Skip clarification for vague problems** — always clarify when scope unclear
- **Commit to an approach without user input** — always explore alternatives first
- **Do codebase research itself** — dispatches designer/researcher for that

## Relationship to Other Skills

| Skill / Reference | Relationship |
|-------|-------------|
| `team-kit-run` | EXECUTOR — Step 7 handoff target. create=PLAN, run=EXECUTE |
| `team-kit-resume` | RETURN PATH — re-enters this pipeline from an existing `map.md` after `/clear`, a context blowout or an AFK run. Owns resume mechanics only (hazard sweep, corrections precedence, unratified-gate reconciliation, resume-point table); every step definition stays here |
| `references/clarify.md` / `explore.md` / `discovery.md` / `acceptance.md` | per-phase dispatch guides (Steps 2c, 3, 4b, 4d/4d-b/4e) |
| `investigation-methodology` | used by designer and researcher for codebase exploration |
| `team-session-writing` | compressed doc style for all team-session artifacts |
| `agents/intent-keeper.md` | observer armed on `team-designer`/`team-planner`; discovery-loop lenses guard the map ledger + scope. Dispatch plain (precautionary — named-disarm obsolete at 2.1.233; `docs/observer-agents.md` HC2) |

## Edge Cases

| Situation | Action |
|-----------|--------|
| Not team-sized after clarification | redirect to single-agent approach |
| Researcher returns nothing useful | planner still runs — findings are additive |
| User already has a spec/design doc | skip clarification, go to approach exploration |
| User says "just run it" after plan | honor the waiver — it is blanket ratification of Step 5 §§5–6 too (DoD + autonomy grant): record one `map.md` Decisions line as the presentation event (the 7-gate accepts that record). Run the mechanical 7-gate (agent-side, no human turn); ZERO artifact mutation after the waiver → hand off with a notify. Any mutation → present only the deltas (consent predates them). Never re-ask what was just explicitly waived |
| Review finds major issues | re-run planner with feedback, not inline patches |
| SAT finds a blocking AC has no reachable passing state | fix the reachability (add the producer, unfreeze additively, add the precondition) or drop it out of blocking with the reason recorded — **never** re-word the criterion to make it passable |
| SAT's unreachability sits in the DESTINATION itself | human scope call before sealing; narrow `map.md` **Destination** + the DoD together. A criterion cannot be fixed into a destination the plan's path can't reach |
| Clarify loop won't converge | that's fog, not bad questions — chart-only mode (Step 2d) |
| Discovery still surfacing fog at the round cap | plan what IS clear; leave the rest in **Not yet specified** for a follow-up run. Never plan fog |
| Targeted researcher finds the question's premise is false | drop the question, record why in `map.md`; do not answer a question that shouldn't exist |
| A human answer makes queued research moot | cancel it — the grill redirecting the research is the loop working |
| Resuming a session with an existing `map.md` | `/team-kit-resume` — read the map FIRST, in full; it's the low-res state. Zoom into individual artifacts only as needed |
| Returning from an AFK run with UNRATIFIED gates | `/team-kit-resume` Step R3 — triage by whether the answer changes the artifact you're about to write; never flip a status without a real user turn |
| User reopens something in **Out of scope** | move it back to a live question and note the reopening — it's a scope change, not a correction |
