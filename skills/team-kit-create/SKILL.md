---
name: team-kit-create
description: "Scope a problem and create a multi-agent team plan with roles, task lists, and handoff to /team-kit-run. Triggers: team, agent team, multi-agent, create team, team plan, orchestrate agents, team template, team-kit, parallel team, as a team, team up, work as a team"
---

# /team-kit-create — Scope, Plan, and Structure a Multi-Agent Team

Turn a problem into an agent team plan. This skill handles **planning only** — scoping, roles, task list, plan emission. Execution is `/team-kit-run`, handed off at Step 7. create=PLAN, run=EXECUTE.

## Core Pattern: Lead Dispatches, Designers Execute

**Lead stays lean.** Heavy lifting happens in dispatched agents. Lead owns: user communication, phase transitions, session path, the inline gates (Steps 5–6), final handoff. Lead does NOT: research code, generate questions, or make technical decisions — designer/researcher/planner do.

**Artifact chain**: every phase reads its declared inputs from `team-session/{team-name}/`. Initial clarify reads frozen `prompt.md`; repeat clarify also reads existing `designer/clarify.md`. No in-memory-only state (full file structure: `SESSION-SCHEMA.md`). Author each dispatch prompt from the contract: phase, ABSOLUTE session path, files to read, file to write, return expectation. Per-phase dispatch guides: `references/clarify.md`, `references/explore.md`, `references/discovery.md`, `references/acceptance.md`.

Read `references/runtime.md` before dispatch or question transport; it defines lane-specific tools and observer limits. Read `references/approval.md` at approval/reuse gates. These contracts apply to the phase examples below; examples do not override current tool availability or existing user authorization.

Executor split: Claude's `Workflow`, `agent(...)` and `plan.workflow.js` examples apply only to the Claude lane. Codex hands the markdown contract to `.agents/skills/team-kit-run`; that executor uses native collaboration and its existing run/state receipts, with no workflow script. Preserve both implementations.

## Pipeline

```
[problem] → persist prompt + map → clarify loop (names destination) → explore → present loop → write
         → research → DISCOVERY loop (self-resolve ⇄ research ⇄ grill ⇄ prototype ⇄ fog)
         → plan → verification approach → acceptance → SAT → goal-audit loop → present design → review → file gate → /team-kit-run (execute)
```

`map.md` is the durable low-res index — the one file a fresh session loads to reconstitute state after `/clear`, a context blowout, or a day away. Every other artifact is detail it points at.

## Remote Mode (headless / discord relay)

When the system prompt carries a remote-hitl directive (the `hitl-question` block protocol), every required user decision uses that protocol instead of plain prose: emit the complete decision card (recommendation first), end the turn, and treat the next user message as the answer. One gate per turn. Applies to material clarify questions, approach choices, uncovered section approvals (Steps 3b, 5), discovery grills/premise strikes, SAT scope decisions and material uncovered Step 7a deltas. Approval reuse and editorial notifications need no new question; apply `references/approval.md` before choosing transport.

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

On the Codex lane, apply the `context-mode` and `ccc` skills, then run `ccc doctor` through
context-mode `ctx_execute` with `language: "shell"`. Require exit 0 plus healthy indexing/query model
and index status. This single probe proves the MCP execution path and CocoIndex CLI together. Missing
tools, an approval rejection or an unhealthy doctor is BLOCKED; do not fall back to direct Bash.

Generated Codex worker homes must come from `.codex/emit-role-args.mjs`; it injects the context-mode
MCP server, preapproves its tools and links both skills. Native `spawn_agent` roles inherit the global
server and load the same role-level routing contract.

Claude observers are advisory and runtime-specific; follow `references/runtime.md`. Codex native dispatch does not run a Claude observer. Explicit artifact review and deterministic gates still run.

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

**Well-scoped test** — name evidence for affected packages/modules or assessment subject, concrete deliverables, acceptance criteria and material constraints. Resolve facts from the environment first. If these are clear, populate `designer/clarify.md` Resolved and map Destination with their sources and skip questions. Otherwise ask only the material unknown; optional presentation preferences do not block work.

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

Loop: dispatch `team-designer` (phase: clarify) — at most ONE material question per dispatch; first reads `prompt.md`, repeat also reads existing `designer/clarify.md` (prior Q&A), preserving answers and updating Resolved. If evidence resolves scope, return with zero questions and cited sources. Lead transports any question through `references/runtime.md`, collects the answer, re-dispatches. Designer is stateless — disk carries the context.

**Question craft is the `grilling` skill** (preloaded on the designer): recommended answer with every question — the user decides, not thinks; facts the environment can settle are looked up, never asked.

**Name the destination first.** Derive what "done" means from the prompt and existing answers; ask only if materially unclear. Write it into `map.md` `Destination:` with its source.

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

Dispatch `team-designer` (phase: present) for Problem, Requirements, Approach, Acceptance criteria and Constraints. Each dispatch reads `clarify.md` + `explore.md` + existing `present.md` and applies `references/approval.md`: cite existing coverage per proposition; present only uncovered material choices. Record approval/reuse per section without re-asking covered scope. Revision requested → re-dispatch with feedback. **Exit**: all 5 sections have evidenced coverage or an explicit applicable user waiver; no unseen commitment is labeled approved.

## Step 3c: Write Requirements

Dispatch `team-designer` (phase: write) — reads ALL `designer/*.md`, synthesizes `requirements.md` at session root. Complete and self-contained: this is the canonical handoff artifact.

---

## Step 4: Research + Discovery + Plan

### 4a: Researcher — opening sweep

Dispatch `team-researcher` — reads `requirements.md`; queries CocoIndex (existing implementations, key types, module boundaries), then code (entry points, data flows, coupling). Writes `researcher/research-findings.md`, focused on what a planner needs to decompose the work into agent tasks. **Wait for it — the first discovery round needs `research-findings.md` on disk.** (Parallelism pays inside discovery instead: exit-2 fan-outs run backgrounded while the human answers.)

**Codex port** (verified 0.153.4): the context-mode plugin supplies skills + hooks, but its
plugin-provided MCP entry did not project into `codex exec`. Keep the plugin installed and the explicit
global `[mcp_servers.context-mode]` entry enabled with `default_tools_approval_mode = "approve"`.
Every TeamKit role applies both skills and runs the `ccc` CLI through `ctx_execute`; `ccc` remains
CLI-only rather than attaching its reduced MCP surface.

This is the **opening sweep, not the only one**. Research is re-entrant: the discovery loop fires further targeted researchers on demand (`researcher/research-findings-{id}.md`).

Researchers and assessment writers read `references/evidence.md`: preserve current-state boundaries, product meanings, metric dimensions, milestone distinctions and source locators through synthesis. Review checks semantic support as well as path existence.

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

The designer returns a **round report** (titled `Round {N} — {slug}`, ids per `team-session-writing` → Readable ids): self-resolved (done), research-needed (list — batched), prototype-or-grill (at most ONE material question; zero when resolved), **premise strikes** (a finding contradicting a `map.md` premise — outranks the queued grill as the round's HITL item), fog (list). Lead action:

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

Dispatch by `references/runtime.md`: Claude plain dispatch is a compatibility precaution; Codex uses its required `task_name` and explicit review backstops. Naming never establishes observer availability.

**What the observer is watching for here** (`agents/intent-keeper.md` → Discovery-loop lenses): discovery is the only phase that rewrites `requirements.md` in place, round after round, off research the human never read — so small reasonable edits can compound into a spec nobody agreed to. Four lenses: a research *finding* laundered into a product *decision*; an unanswerable question written as confident requirement prose instead of fog; a scope-changing decision missing from the `map.md` ledger; a rejection in **Out of scope** quietly reopened. Advisory nudges into the designer mid-round — the hard gates still sit downstream (goal-audit, Step 7).

### 4c: Planner

Declare output kind before dispatch: software, assessment, operations or a named mix. Require actual typed APIs only for code being built; assessment interfaces are artifact/evidence schemas. Resolve each task label to an available callable role. Request a bounded initial task/ownership draft after required reads, before optional elaboration; blocked writes must surface immediately. `FRAMEWORK.md` and `PLANNER.md` carry the matching templates.

Dispatch `team-planner` — reads `requirements.md`, `map.md`, `designer/clarify.md`, `designer/explore.md`, `designer/discovery.md`, ALL `researcher/research-findings*.md`. Constraints: honor the chosen approach (no re-litigating alternatives — the frame checks already confirmed it); honor discovery decisions; **plan nothing listed in `map.md` Out of scope**; treat remaining **Not yet specified** fog as out of this plan's scope, not as work to invent. Research is done — use the findings. Follows `FRAMEWORK.md`. **The plan MUST carry an `autonomy:` block** — the run lane's grant of self-drive: loop caps (verify/validate fix rounds, global fix ceiling), the escalation set (what stops the run for a human), seam policy (which inter-run seams are orchestrator decisions vs declared human gates). Ratified at Step 5; executed without re-asking (`team-kit-run` → Autonomy contract).

> **External wire shapes must derive from a CAPTURED reality.** If any part of the plan depends on the wire format of an external tool — a vendor CLI's event stream, a third-party API payload, an MCP server's result shape — the plan must name (a) **where the real capture comes from**: a persisted artifact some task writes, never a hand-authored fixture, and (b) **the production binding that persists it**, cited `file:line` — a seam that merely exists on the type persists nothing. Tests asserting that shape are generated from the capture. A synthetic fixture encodes what you imagined the vendor does: it passes, and the defect ships. (Measured twice on ONE vendor surface in one effort — model labels zipped onto steps by array index, then a begin/completed double-node that the unit proof missed because the synthetic stream carried one event per call. Both reached paid runs; the second shipped with a green proof.)

Produces:
- `design.md` — architecture summary (HOW)
- `team-plan.md` — roles, tasks, ownership matrix (disjoint globs), phases (TASKS)
- Neither executor's runtime artifacts are emitted here. Claude run mode-1 authors `plan.workflow.js`; Codex run creates its native manifest/state from the markdown contract. See PLANNER.md for lane-specific handoff.

## Step 4c-b: Verification Approach — what will actually be EXERCISED

Dispatch `team-goal-auditor` (phase: approach) — reads `requirements.md` + `design.md` + `team-plan.md`; writes `verification-approach.md` (root). Sits between planner and define.

**Why it precedes the DoD and cannot follow it.** Define classifies every AC deterministic / semantic / needs-human. Today it does that in a vacuum, so anything wanting a live system becomes a human punt by default — the run lane's escape hatch reads *"kind=semantic needing rendered evidence nobody can produce here (screenshot / running UI) → record NEEDS_HUMAN_EVIDENCE"* (`skills/team-kit-run/references/stage-templates.js:911`). That hatch is now mostly false: Playwright MCP (projects into the measurer on the run lane — round-trip measured 2026-09-12, `team-session/20260912-measure-disposition/probes/`), project CLIs and MCP servers are all exercisable surfaces. A live `spyglass` is NOT one: it is a paid human-gated call. Name the surfaces FIRST and *"a signed-out visitor reaches /pricing and sees three tiers"* becomes measurable instead of punted. **The approach determines the AC taxonomy** — that is the entire leverage, and it is why this cannot live after define.

**The artifact is SCAFFOLDING, deliberately loose — not a contract.** Four sections:

| Section | Content |
|---|---|
| Exercisable surfaces | which will EXIST and can therefore be driven: browser (Playwright MCP; a live `spyglass` is paid + human-gated, never autonomous), an MCP this plan is building, a CLI, an HTTP endpoint, a queue, logs |
| A suggestion per surface | one sketch of how it could be exercised. A sketch — the mechanism is not knowable yet |
| Separate measurement agents | which features need their OWN agent and why they cannot share one: different I/O shapes, different actors. Measuring distinct features' input/output independently is the point |
| Human residual | what genuinely needs a human, and why — so needs-human is a COUNTED residual with a reason attached, never a default |

**MEASUREMENT, NOT VERIFICATION — the distinction the artifact rests on.** You cannot prompt an agent out of sycophancy: *"did checkout work?"* returns yes regardless. That is only a problem because an OBSERVER was asked for a VERDICT — so never ask one. A measurement agent is asked to exercise a surface and **record input and output VERBATIM**: the HTTP status and body, the page text, the row id, the CLI stdout and rc, the screenshot path. It emits no PASS, no FAIL, no *"works correctly"*. Judgment happens later, in a DIFFERENT agent reading the record. Already house doctrine: `skills/team-kit-run/references/execution-evidence.md` §2 gives the **Producer** the recording duty and names the **Independent reviewer** rows that decide acceptance — a consumer may not *"treat a producer's CLEAN as its own verification"* (`:84`); §6 keeps raw separate from normalized and forbids reporting only the normalized form (`:248`).

**The STATUS-line trap, and the rule that defuses it.** Every measurement dispatch still ends with a terminal STATUS line, and for a measurer that line reports WHETHER THE MEASUREMENT COMPLETED — never whether the product works:

| Line | Means |
|---|---|
| `CLEAN` | I exercised the surface and recorded what I observed |
| `ERRORS_REMAINING` | I could not complete the measurement (surface unreachable, tool failed) |
| `BLOCKED` | the environment or a precondition was not there |
| `PARTIAL` | I measured some of the assigned surfaces and recorded which I did not |

A measurer that writes `CLEAN` because *"the feature worked"* has misunderstood its job and reintroduced the verdict. **Every measurement prompt this artifact suggests carries that sentence verbatim** — it is the single most load-bearing line in the approach.

**Four guards per journey, or it measures nothing.**

| Guard | Why |
|---|---|
| the ARTIFACT, never the claim | a capture path, the bytes, the row. Raw first, derived second |
| a NEGATIVE CONTROL | exercise it in a state where it MUST NOT succeed, and record that it did not — the analogue of the finalize gate's break-the-guard/confirm-RED. A journey that passes against a dead server is indistinguishable from one that works |
| a CORRELATION HANDLE | request id, order id, timestamp window — so independent observations of ONE transaction by DIFFERENT agents can be joined. Without it, concurrent stack-role agents produce three anecdotes nobody can reconcile |
| its PROD-GATING side | deploys, migrations, deletes, kubectl mutations, scaling and paid live calls NEVER run inside the autonomous workflow — they return as a human-gated checklist (`team-templates/FRAMEWORK.md:193`, non-negotiable). Every surface declares which side of that line it is on |

**These are SUGGESTIONS the run lane MAY SUPERSEDE with what was actually built, and the delta is RECORDED.** Authored before the build, the approach cannot know what exists; a run that finds it stale records the deviation and proceeds. **Deviation here is correct behaviour, not a failure.** So do not write a rigid journey spec: journeys are about mechanisms, mechanisms are not knowable until the thing is built, and composing them from what is on disk is the run lane's job.

## Step 4d: Acceptance Contract

**Read `references/acceptance.md`** for the full dispatch guide.

Dispatch `team-goal-auditor` (phase: define) — reads `prompt.md` + `requirements.md` + `team-plan.md` + `verification-approach.md`; authors `definition-of-done.md` (root): checkable acceptance criteria anchored to `prompt.md` (the goal, not the plan). Coverage both directions: every deliverable ≥1 AC; every AC `maps_to` ≥1 real task. Hybrid grading: mostly deterministic, at least ONE semantic. `STATUS: ERRORS_REMAINING` (a deliverable can't be made checkable) → route back to planner/designer to sharpen, re-run define.

**The approach sets the taxonomy — read it before classifying anything.** An AC whose surface Step 4c-b lists as exercisable is `semantic` graded off a measurement record, NOT a needs-human punt; its evidence artifact is that record's path, named by RESERVED SHAPE (`measurer/attempts/[{epoch}/]{journey-key}/{attempt}/result.md`) and gradeable under `DEFINITION-OF-DONE.md` Rule 6's third category — the run lane mints the journey key and the attempt, so a concrete path invented here is a fabrication, and the `test -e` / `team-plan.md` grep checks REJECT the row they are run on. needs-human is legal only for a residual `verification-approach.md` already justified, and the AC cites that row. A criterion the approach says is measurable, re-classified here as needing a human, silently restores the default the approach exists to kill.

For reviewed deliverables, `references/acceptance.md` → Final-state review governs ordering and evidence: the final independent grade follows the last substantive writer, includes corrections, and binds verdicts to final inputs and the acceptance contract. A stale draft review cannot close corrected output.

**Coverage has a third direction — DECISIONS.** Every ratified decision (`map.md` **Decisions so far**, `designer/discovery.md`) whose effect depends on an instruction **reaching an agent or a prompt** must name its **producing site**: the task that carries it, the prompt block that states it, or a gate that runs on the output. A decision with no producing site is a decision that will not happen. (Measured: a scope ruling — dogfood one half, keep the other frozen as a control — was ratified, cited in the plan, and never written into the authoring prompt; the authoring session met a broken selector, did the reasonable thing, regenerated the frozen fixtures, and failed a blocking AC on a paid run. A path-scoped diff guard cannot see a file inside an allowed path being rewritten. Three instances of this shape in one session.)

**And a fourth — PROMPT PRONGS, written as a TABLE, not claimed in prose.** `definition-of-done.md` carries a **Prompt-prong coverage** section: one row per distinguishable prong of `prompt.md` — each ask, each constraint, each *not-this* qualifier, splitting a sentence that carries two — quoted verbatim, against the AC id(s) that grade it. A prong whose AC cell is empty is a **define-phase defect**, and there are exactly two legal closes: cover it with an AC, or write `ungraded — <reason>` in that cell so the human sees it at Step 5. Never leave the row off the table. Constraint-shaped prongs are the ones that evaporate — they name no deliverable, so deliverable-coverage never asks after them. (Measured: a prompt asking for a review *"not too technical"* / *"not deeply technical"*; `grep -in 'not .*technical\|altitude'` over `requirements.md` → **zero hits** — no requirement, no task constraint, no AC. A prong with no AC is invisible to every downstream gate by construction: SAT only reaches blocking ACs, the blind audit compares plan+DoD against the ACs that exist, and the run lane re-grades that same set. Nothing could have caught it, and nothing did — the graded run reported it as a define-phase finding after the artifact shipped. Make an altitude/tone prong checkable like any other: *"every finding readable from its first two lines without opening a source file"*.)

**A splice into an AC row edits the whole DOCUMENT, not the row.** The contract restates its own rows in prose — "Notes for the run lane", grader sets, coverage tables. Every later define-phase edit (a SAT fix, a Step-6 alignment splice, an audit re-plan) must carry the change into every restatement in the SAME edit, or the contract disagrees with itself and the run lane adjudicates a contract question mid-flight. (Measured: an alignment splice moved AC-8's grader to the LEAD in the AC row, with the reason; the "Notes for the run lane" block 51 lines below still listed AC-8 in the verifier's set. The orchestrator ruled the row governs — correct, and a ruling nobody should have had to make.)

## Step 4d-b: SAT — the Satisfiability Pass

The DoD makes every criterion **falsifiable**: a wrong run must fail it. SAT asks the dual question define never asks — **can a CORRECT run SATISFY it?** For every BLOCKING AC, name one concrete world-state in which it PASSES and show that state is reachable by the plan's own tasks. A blocking AC with no reachable passing state is a gate no correct run can open; you find out by spending against it.

**Nothing downstream catches this.** The blind goal audit (4e) and the fresh-eyes plan review (Step 6) both check **coherence** — and an unsatisfiable criterion is usually perfectly coherent. Falsifiability and satisfiability are independent properties; only this pass tests the second.

### The table — one row per independently-falsifiable CLAUSE of a blocking AC

**Supersedes one-row-per-AC** (the old heading; its rows keep their evidence — the worked examples below are unchanged). A statement carrying three clauses gets three rows, because one averaged row never asks the producer question of the clause that has none. Option B fills this table itself, so the clause split is the LEAD's step too, not the auditor's private one; `.claude/agents/team-goal-auditor.md:141` (*"One row per **independently-falsifiable clause**"*) and its `produced by` field spec at `:149` are the same rule for Option A.

| AC (+ clause index when the statement carries more than one — `AC-29 c3`) | Passing state (observable at a point in time) | Produced by (task + the actual site — the repo FILE PATH that must change, inside the `files_owned` of an agent owning a task in this AC's `maps_to`) | Preconditions the state needs | Forbidden by anything frozen? | Counterfeit state also reachable? |
|----|-----------------------------------------------|--------------------------------------|-------------------------------|-------------------------------|-----------------------------------|

- **A state, not an activity.** "the seam is invoked", "the module is wired", "the agent attempts X" are activities. A state is something you could observe and record: bytes in a file, a row in a table, a returned value, a check-run conclusion, a receipt field. Can't write down what you'd observe → the AC isn't checkable; back to define.
- **Follow the wiring to the producing SITE.** A dependency-injected seam is produced by its **composition-root binding**, cited `file:line` — never by the call site. Declared-and-invoked is not produced.
- **Reachable by the plan's OWN tasks**, not by a plausible world in which someone does the obvious thing.
- **Split, count, contain, grep — in that order, before sealing.** (1) Split the AC statement at its independently-falsifiable clauses and count `produced by` entries; unequal ⇒ some clause has no producer, RED on the arithmetic alone. (2) For each clause, check its file path is a string inside the `files_owned` of an agent owning a task in that AC's `maps_to` — decidable off one `team-plan.md` line; owner ≠ writer is the same defect one notch milder. (3) Resolve the clause's writer on disk and `/usr/bin/grep -c "<its owning package dir>" team-plan.md` — `0` ⇒ owned by NO lane ⇒ mode *"the producer does not exist"*, `STATUS: ERRORS_REMAINING` before a coder is dispatched. (Measured: effort #1's only FAIL. AC-29 carried 3 clauses against 2 `produced by` entries and sealed as ONE averaged row ticking `forbidden? no` / `counterfeit? no`; clause 3's writer lives in `packages/eng-capture`, and `/usr/bin/grep -c "eng-capture" team-plan.md` → **`0`**. Cost: a BLOCKED coder with zero files edited, 4 auditor artifacts, 2 dedicated workflows and a second human scope call in a one-HITL contract. `team-session/20260904-moirai-effort-1/goal-auditor/ac29-adversary.md:186`, `…/goal-auditor/sat.md:39`.)

### The five ways an AC turns out unsatisfiable

Executor feasibility is more than a permission scan. Resolve named binaries on the target host, recognize shell builtins (`test` need not exist at `/usr/bin/test`), and inspect argument forwarding. Run exact safe read-only checks when inputs exist; otherwise contract that check to the producer and mark it unrun. Never execute a destructive or external mutation merely to preflight it. This check still runs when the rest of SAT is skipped.

| Mode | Tell | Fix before sealing |
|------|------|--------------------|
| **The frozen set forbids the pass** | the AC freezes an artifact AND requires an outcome only a change to that artifact can produce | freeze the artifact's **contract** (names, triggers, gating), not its bytes — let it change additively |
| **The producer does not exist** | the passing state needs a binding / task / prompt line nobody wrote | planner adds the producing site, or the AC drops out of blocking with the reason recorded |
| **A COUNTERFEIT passing state is also reachable** | the criterion goes green with none of the work done — a pre-warmed witness, a cached artifact, last run's leftovers | write the missing **precondition into the existing AC** (asserted, rc-checked, recorded in the evidence artifact). Not a new AC |
| **The chosen path structurally cannot get there** | the AC assumes a path the design ruled out | HUMAN scope call: change the path, or narrow the destination. Never seal it as blocking |
| **The assigned executor cannot run it** | the AC's `verify` text demands a verb or a binary the role/route it is assigned to cannot use. Two greps, both mechanical: `/usr/bin/grep -n disallowedTools .claude/agents/<assignee>.md` — any `break` / `induce RED` / `restore` / `mutate` clause needs `Edit`, and `team-verifier` denies it; and for every cell naming a host, port or cluster, `/usr/bin/grep -n 'Bash(<leading-binary>:\*)' .claude/settings.json` — a hit inside `"deny"` means the assigned lane can never run it | reassign the step to a role whose frontmatter grants the verb (or give the Edit-capable prover its own task), or name a permitted route for the denied binary; neither exists ⇒ the AC drops out of blocking with the reason recorded. Never seal a step onto a role that cannot run it |

(Mode 5 supersedes the count in the condensed mirror at `.claude/agents/team-goal-auditor.md:169`, which still lists four and already points here for the worked cases — this table governs.)

### Worked examples — all measured, all cost real money

| Failure | Why define + audit + review all passed it | The SAT question that catches it |
|---------|-------------------------------------------|----------------------------------|
| **Frozen-artifact deadlock** — a CI workflow frozen byte-unchanged AND its three checks required green; that file's own `permissions: contents: read` made the upstream filter job die *Resource not accessible by integration*, so all three contexts SKIPPED via `needs:` | "freeze this file and require its checks green" is an internally consistent sentence | *what change makes these checks green, and does the frozen set allow it?* → none does; the freeze forbids the only fix. **2 graded runs spent against a gate that could never be green** |
| **Counterfeit witness** — the contract barred an `Existing` browser profile to protect the one clause the code cannot forge, but `Fresh` resolved to a deterministic **never-wiped** path, so a re-run inherits the previous run's cookies | banning `Existing` reads as the hazard being handled | *name the passing state precisely* → forces "profile dir empty at t=0", which nothing asserted. Caught by a coder noticing 12 stale graded-origin cookies, not by a criterion |
| **Port graded, adapter unbound** — machinery graded LANDED on the seam existing and being invoked; the composition root bound nothing, so production persisted no event stream | "exists and is invoked" is true, checkable, and was checked | *what SITE produces it?* → no binding at the composition root. A wrong verdict stood signed until execution contradicted it |
| **Destination unreachable** — required a production `active` transition on a one-shot path that by design imports no DB, creates no source row, so activation can never fire | the criterion matched the destination sentence exactly — the **destination** was the thing that was wrong | *is this state reachable by the plan's own tasks?* → no. Scope call: use the path that seeds the row, or narrow the destination |
| **Unexecutable by its assignee** — a finalize gate whose break-the-guard/restore clause was assigned to `team-verifier`, whose own frontmatter reads `disallowedTools: Edit, NotebookEdit` (`.claude/agents/team-verifier.md:5`); and a ledger-baseline gate shelling `kubectl port-forward`, denied by `Bash(kubectl:*)` (`.claude/settings.json:29`) | both clauses name a real observable state produced by a real task — an AC's text never says who cannot type it, and nobody reads the assignee's frontmatter at define | *can the ASSIGNEE run this step?* → grep its `disallowedTools`, and grep the leading binary against the `deny` array. Cost: `STATUS: PARTIAL` + ruling PD-r7 + an extra Edit-capable prover dispatched mid-run; the `kubectl` half FAILED a verify pass outright (ruling PD-r2, one more verify pass) |

(Provenance: `team-session/mono-cal-codex-discovery` — `learnings.md` §1, `execution-findings.md` EF-1/EF-2/EF-3, `build-state.md` PD-17/PD-18/PD-19.) (Row 5: `team-session/20260904-moirai-effort-1` — `verifier/results-w1-initial.md:43`, `build-state.md:65` (PD-r7), `verifier/results-w0-initial.md:18`, `verifier/ledger-baseline.md:96`.)

### Keep it proportionate

Most rows are one line: a lint/types/test AC's passing state is "the command exits 0", produced by the task that writes the code. Spend additional effort on an AC that (a) grades a frozen artifact, (b) requires an unforgeable witness, (c) grades production/external state, or (d) concerns paid, one-shot or irreversible work. When none applies, record the proportionality skip in `sat.md`. **Executor feasibility is never skipped**: check permissions, host command availability and argument semantics; run exact safe checks when their inputs exist. A permission grep alone is not a passing feasibility check.

### Who runs it

| | |
|---|---|
| **Option A** (any (a)–(d) AC exists) | dispatch `team-goal-auditor` (phase: sat), FRESH CONTEXT — reads `definition-of-done.md` + `team-plan.md` + `design.md` + `requirements.md` (for the frozen/forbidden set); writes `goal-auditor/sat.md`. The agent file enumerates `sat`; dispatch per `references/acceptance.md` → Step 1b, and have it read the contract cold even if it authored it |
| **Option B** (small, all-deterministic contract) | lead fills the table inline against DoD + `team-plan.md` and writes `goal-auditor/sat.md`, closed by its own terminal STATUS line (last non-empty line, nothing after it) |

| Result | Action |
|--------|--------|
| every blocking AC reachable, no counterfeit | → Step 4e |
| unsatisfiable, fixable in plan or contract (modes 1–3, 5) | re-dispatch planner (missing producer, unexecutable assignee) or goal-auditor define (restate AC / add precondition) → re-run SAT. Cap 2 |
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

Apply `references/approval.md` per section: reuse cited authorization, record assumptions as assumptions, and ask only for material uncovered commitments. Rejection: clarify what's wrong → minor = edit inline; major = re-run planner with feedback → re-present the delta. Sections 5–6 must have evidenced coverage of the stop condition and autonomy grant before handoff; an existing scoped authorization may supply it.

## Step 6: Post-Plan Review (fresh-eyes whole-document check)

Catches what section-by-section approval misses — placeholders, cross-document inconsistency, ambiguity visible only in the whole.

**Option A (recommended)**: dispatch `team-plan-reviewer` (fresh context, no planning bias) — reads `requirements.md`, `design.md`, `team-plan.md`, `definition-of-done.md` (every AC maps to a task, every deliverable covered), `goal-auditor/goal-audit.md` (confirm CLEAN). Writes `plan-review.md` with verdict, closed by its own terminal STATUS line — its last non-empty line, byte-identical to the STATUS it returns, nothing after it.

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
| every blocking semantic AC has a producible evidence artifact — EITHER a `team-plan.md` task writes it to a known path, OR (live-surface AC) the run lane's measurement fan-out does, passing Rule 6's third-category producer check: the surface greps `>0` in `verification-approach.md` under **exercisable surfaces**, declared autonomous, and the row names the record by RESERVED SHAPE (`measurer/attempts/[{epoch}/]{journey-key}/{attempt}/result.md`), never a fabricated attempt path. Do NOT run the `test -e` / `team-plan.md` grep checks on that row — rc 1 and `0` are its correct state | ungradeable "done" |
| every AC the DoD leaves to a human traces to a residual row in `verification-approach.md`; no AC is needs-human whose surface that file lists as exercisable | a live-system punt restored by default after the approach found it measurable |
| every independently-falsifiable clause of every blocking AC has a `goal-auditor/sat.md` row (passing state + producing site inside a mapped owner's `files_owned` + preconditions) — OR `sat.md` carries the one-line proportionality skip (no blocking AC hits 4d-b (a)–(d)) | a gate no correct run can open |
| no `sat.md` row leaves a counterfeit passing state reachable — or the precondition that rules it out is written INTO the AC | a hollow green: the criterion passes with none of the work done |
| any plan dependency on an external tool's wire shape names its real-capture source AND the production binding that persists it (`file:line`) | fixtures asserting an imagined vendor shape — passes, then ships |
| every decision whose effect depends on an instruction reaching an agent or prompt names its producing site | ratified decisions that never reach the run |
| `goal-auditor/goal-audit.md` STATUS = CLEAN | intent drift vs `prompt.md` |
| every terminal verdict artifact THAT EXISTS — `verification-approach.md`, `definition-of-done.md`, `goal-auditor/sat.md`, `goal-auditor/goal-audit.md`, `plan-review.md`, `designer/frame-check.md` — carries its own STATUS line as its LAST NON-EMPTY line, equal to the status its producer returned: `/usr/bin/sed -e '/^[[:space:]]*$/d' <path> \| tail -1` must begin `STATUS: `. A line present mid-document, embedded in a sentence, or bold-wrapped (`**STATUS: …**`) FAILS — fix it by re-dispatching the producer, never by the lead editing another agent's verdict | a verdict readable only from a return message: gone at resume, at `/team-kit-run` boot, and to every later session |
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

- **artifacts unchanged** → notify final file list and handoff; no review turn.
- **artifacts changed** → classify deltas with `references/approval.md`. Editorial repairs and implementation choices inside existing authorization require recorded rationale and refreshed validation, not renewed consent. Material uncovered commitments require approval of only those deltas. Never a full re-review.

(Runtime artifacts are authored later by the matching run skill, never by Create.)

### 7b: Hand off to /team-kit-run

The handoff needs one launch action: notify the applicable `team-kit-run` entrypoint; invoking it supplies launch consent within the plan's recorded authorization and autonomy. Run boots a fresh orchestrator from the disk contract. Claude mode-1 authors `plan.workflow.js` and uses its workflow/HITL split. Codex follows `.agents/skills/team-kit-run/references/native-run.md`, preserving native task reservations, receipts and human gates; no Claude Workflow API is required. A separately gated external action still needs its scoped authorization. **Skill ends here.**

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
    ↓ reads requirements.md + design.md + team-plan.md                                   │
verification-approach.md ← team-goal-auditor(approach) writes; which surfaces will be EXERCISABLE + one
                           suggestion each (the run lane MAY supersede them — the delta is recorded)
    ↓ reads prompt.md + requirements.md + team-plan.md + verification-approach.md        │
definition-of-done.md  ← team-goal-auditor(define) writes (root, acceptance contract)   │
    ↓ reads DoD + team-plan.md + design.md + requirements.md (the frozen set)            │
goal-auditor/sat.md    ← team-goal-auditor(sat) writes; one reachable passing state per CLAUSE of each blocking AC
    ↓ reads prompt.md + DoD + team-plan.md + map.md Destination/Out-of-scope (fresh; NOT sat.md) ◄──┘
goal-auditor/goal-audit.md ← team-goal-auditor(audit) writes; gaps loop to planner (cap 2)
    ↓ contract sealed after audit CLEAN + Step 7 gate
runtime artifacts      ← matching run lane: Claude plan.workflow.js; Codex native manifest/state (md canonical)
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
| `references/runtime.md` | lane-specific dispatch, observer limits and self-contained decision transport |
| `references/approval.md` | proposition provenance, existing authorization and material delta classification |
| `references/evidence.md` | research/synthesis claims, metrics, milestones and citation verification |

## Edge Cases

| Situation | Action |
|-----------|--------|
| Not team-sized after clarification | redirect to single-agent approach |
| Researcher returns nothing useful | planner still runs — findings are additive |
| User already has a spec/design doc | skip clarification, go to approach exploration |
| User says "just run it" after plan | honor the instruction within its contextual scope, including covered DoD/autonomy; cite the user turn in map Decisions. Run mechanical gates; classify subsequent changes using `references/approval.md`. Never re-ask covered authorization or infer permission for unrelated external actions |
| Review finds major issues | re-run planner with feedback, not inline patches |
| The run lane finds `verification-approach.md` names a surface the build never produced | the run composes from what is on disk and records the delta — correct behaviour, not a create-lane defect. Never re-open the plan over it |
| SAT finds a blocking AC has no reachable passing state | fix the reachability (add the producer, unfreeze additively, add the precondition) or drop it out of blocking with the reason recorded — **never** re-word the criterion to make it passable |
| SAT's unreachability sits in the DESTINATION itself | human scope call before sealing; narrow `map.md` **Destination** + the DoD together. A criterion cannot be fixed into a destination the plan's path can't reach |
| Clarify loop won't converge | that's fog, not bad questions — chart-only mode (Step 2d) |
| Discovery still surfacing fog at the round cap | plan what IS clear; leave the rest in **Not yet specified** for a follow-up run. Never plan fog |
| Targeted researcher finds the question's premise is false | drop the question, record why in `map.md`; do not answer a question that shouldn't exist |
| A human answer makes queued research moot | cancel it — the grill redirecting the research is the loop working |
| Resuming a session with an existing `map.md` | `/team-kit-resume` — read the map FIRST, in full; it's the low-res state. Zoom into individual artifacts only as needed |
| Returning from an AFK run with UNRATIFIED gates | `/team-kit-resume` Step R3 — triage by whether the answer changes the artifact you're about to write; never flip a status without a real user turn |
| User reopens something in **Out of scope** | move it back to a live question and note the reopening — it's a scope change, not a correction |
