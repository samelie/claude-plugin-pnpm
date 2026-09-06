# Discovery Loop — Research ⇄ Grill ⇄ Fog (Step 4b detail)

How the lead orchestrates discovery. Replaces the old one-shot `refine`. The lead stays lean — the designer resolves, the lead only routes.

## Why this shape

The old loop had one research pass up front and no way to get more. A grill answer that opened a question only external knowledge could settle had nowhere to go: the designer guessed, and the guess landed in `requirements.md` unmarked.

Discovery makes research **re-entrant and demand-driven**. Each round the designer sorts every open question into one of five exits; the lead fans out the AFK ones and spends the human's attention on exactly one HITL one. `research → grill → research` is the loop working: a human answer reshapes what is worth researching, and the next findings reshape what is worth asking.

## The five exits

| # | Exit | Type | Resolved by | Human cost |
|---|------|------|-------------|-----------|
| 1 | **self-resolve** — code answers it | AFK | designer explores, updates `requirements.md` inline | none |
| 2 | **research** — external knowledge answers it | AFK | lead fans out `team-researcher`, **parallel** | none |
| 3 | **prototype** — must see it to judge it | HITL | designer builds a cheap artifact; lead presents THAT | one round-trip |
| 4 | **grill** — only human judgment settles it | HITL | lead asks, ONE question, with recommended answer | one round-trip |
| 5 | **fog** — cannot phrase the question sharply yet | — | designer appends `map.md` **Not yet specified** | none |

**Exit-2 vs exit-1**: inside the working tree → self-resolve. Outside it (third-party docs, library behavior, prior art, knowledge base, past sessions) → research ticket.

**Exit-5 test**: can you state the QUESTION precisely right now? Not can you answer it. Sharp-but-unanswerable is exit 1/2/3/4. Unsharp is fog. Never pre-slice fog into fake questions — a vague question burns a human round-trip and returns a vague answer.

**Exit-3/4 question craft** (recommended answer, sharpened terms, concrete scenarios): the `grilling` skill — canonical home, preloaded on the designer.

## Standing lens: premise strikes (every round, not an exit)

The exits route OPEN questions. This lens guards SETTLED ones — the loop's blind spot is symmetric: it celebrates a human answer killing a queued question, but nothing notices a finding killing a ratified decision. So each round, BEFORE sorting exits, the designer diffs every NEW findings file against `map.md` **Premises** (the falsifiable assumptions under ratified decisions, minted at Step 3):

- finding contradicts a premise → **premise strike**: mark the premise `STRUCK (link)`, write it into the round report's strike section with the evidence and the decision it reopens. A strike OUTRANKS the queued grill as the round's HITL item — reopening a ratified decision is human-only (same rule as reopening **Out of scope**).
- finding merely *bears on* a premise without contradicting it → note it on the premise row, no strike.

No premise table (proportionality skipped at Step 3) → lens is a no-op.

## Frame checks — entry and fog-drain

The approach was picked at minimum knowledge (Step 3, before research). Two nearly-free checks keep it licensed to fail:

| When | Question | Contract |
|---|---|---|
| round 1 (entry) | given the opening research sweep, is the chosen approach still the recommendation? yes / no + one line | the `Frame:` line in the designer's round-1 report (on disk in `designer/discovery.md`) |
| fog-drain (before handing to planner) | one FRESH-context dispatch — `team-designer`, reads ONLY `prompt.md` + `requirements.md` + `map.md` Premises + `designer/explore.md` approaches (NO discovery history, never `fork`): (a) still the right approach given everything now known? (b) which "settled" `requirements.md` statements would you challenge — where is the prose more specific than its cited evidence? | writes `designer/frame-check.md` + STATUS — the artifact the Step 7 gate checks |

A "yes" costs nothing. A "no" is presented like a premise strike — evidence + the decision it reopens — at the cheapest possible moment to change course (nothing downstream is built yet). The fog-drain check doubles as early fresh-eyes: the designer is stateless but `requirements.md` is not — the artifact carries its own anchor, and the same lens re-reading it every round reads new findings as confirming.

## Round protocol

```
loop:
    dispatch team-designer(phase: discovery)     ← PLAIN dispatch, see arming trap
    designer sorts open questions into 5 exits, returns round report
    lead: fan out team-researcher per exit-2 question (parallel, background)
    lead: present the ONE exit-3/4 item to the user while research runs
    lead: collect answer; re-dispatch designer with answer + new findings paths
until STATUS: CLEAN (fog-drained)
```

### Round report (designer → lead)

Question ids carry a slug + a parent pointer (`Q-7 dedupe-visibility ← A-3`) — genealogy is the convergence instrument, and bare ids are unreadable at the decision point (`team-session-writing` → Readable ids).

```markdown
STATUS: PARTIAL
Round: {N} — {slug}
Convergence: {open count last round → this round} | deepest root: {Q-id slug, generation depth}
Frame: {round 1 only — approach still recommended? yes / no + one line. fog-drain gets its own dispatch → designer/frame-check.md}

## Premise strikes (standing lens — outranks the grill below)
| Premise | Contradicting evidence | Decision it reopens |

## Self-resolved this round
| Question | Answer | Evidence | requirements.md § updated |

## Research needed (AFK — fan out in parallel)
| id (slug ← parent) | Question | Decision it informs / premise at risk | What would settle it | Blocks |

## For the human (exactly ONE — strike > prototype/grill)
Type: strike | prototype | grill
<the strike with evidence; or the question, with recommended answer; or the artifact + what to react to>
**Why this matters**: <1 sentence — what changes if answered differently>

## Fog (appended to map.md Not yet specified)
- <the area, as loosely as the view allows>

## Ledger written
| map.md section | Line added |
```

### Lead action table

| Report contains | Lead does |
|---|---|
| research-needed | one `team-researcher` per question, **parallel**, background; each writes `researcher/research-findings-{id}.md` |
| one HITL item | present it immediately — do NOT serialize the human behind the research fan-out |
| **premise strike** | refute FIRST, present second: fire the fresh-context refuter on the striking finding (fast, AFK — a wrong strike re-opens a ratified decision on bad evidence); only a SURVIVING strike is presented as THE HITL item (evidence + reopened decision). Refuted → premise reverts to holds, the queued prototype/grill presents instead. On a surviving strike the human re-decides (update premise + decision + affected requirements) or holds (record why the evidence doesn't overturn it). Never silently absorb |
| a finding graduating to a Decision / settling a blocking-AC subject | fire ONE fresh-context refuter, **parallel**, background: "disprove this claim, cite file:line or a command". Survives → graduates; refuted → back to open question. Everything else graduates unrefuted (proportionality mirrors SAT (a)–(d)) |
| fog | verify the designer wrote it to `map.md`; never grind on it |
| `STATUS: CLEAN` | fog-drained → **frame check + fresh-eyes dispatch** (see Frame checks above) → Step 4c (planner) |
| `STATUS: BLOCKED` | escalate to human — never re-dispatch |

Fire research and ask the human **concurrently**. The whole point of typing exits AFK/HITL is that agent time and human time are different budgets; serializing them wastes the cheap one.

## ⚠ Observer arming trap

`intent-keeper` is armed on `team-designer` and watches discovery for scope drift and ledger gaps (the highest-drift surface in the skill). Dispatch plain:

```javascript
// ✅ the kept convention
Agent({ subagent_type: "team-designer", description: "Discovery round 3", prompt: ... })

// ❌ named dispatch — obsolete DISARM at ≤2.1.220; named dispatches ARM as of 2.1.233. kept as a
// precaution: the change window is unbisected and the failure mode is a silently missing guard
Agent({ subagent_type: "team-designer", name: "designer-r3", prompt: ... })
```

Discovery dispatches the designer many times, so the instinct to name the rounds is strong. **Keep the rule: never pass `name:` to a designer dispatch** — round number goes in `description` and in the prompt body. (The historical "falls out of activeAgents" mechanism was disproven; the precaution stands on the unbisected window, not on that mechanism.) Observers also do not arm on the workflow lane — structural — which is why `create` stays native. (Mechanics + hard constraints: `.claude/docs/observer-agents.md` HC2.)

## Observers are advisory — the loop must hold without them

`intent-keeper` is a nice-to-have, not a dependency. It only arms on the native lane, only on a plain dispatch, its reports are advisory, and they are **dropped entirely if the observed agent already returned** — so on a fast round it may never land. Assume it is off and the loop still has to be correct. Every lens has a deterministic backstop that runs regardless:

| Observer lens | Deterministic backstop (always runs) |
|---|---|
| ledger gap | Step 7 gate: every decision in `discovery.md` has a `map.md` **Decisions so far** line · designer self-review · Discovery phase gate |
| reopened rejection | Step 7 gate: nothing planned that sits in **Out of scope** · `team-planner` forbidden pattern · designer self-review |
| finding laundered into a decision | Step 7 gate: every scope-touching row in the `discovery.md` Q&A log carries `Source: user` · designer self-review |
| fog laundering | Step 6 plan-review ambiguity check: requirement text more specific than its cited evidence · designer self-review |

The observer's value is **timing** — it can catch drift mid-round, before it compounds into three more rounds built on it. The gates catch the same things later and more expensively. If the gates ever depend on the observer having fired, the design is wrong: fix the gate, not the observer.

## Research fan-out

Per exit-2 question, dispatch `team-researcher` with:
- the ONE question, verbatim from the round report (id + slug)
- **the DECISION it informs and any premise at risk** — sufficiency is "enough to decide", not "everything about the topic", and the researcher must know what settled beliefs its findings might touch
- the license, verbatim: *"if you find evidence the question's premise, the linked decision, or a `map.md` premise is wrong, report that FIRST — before answering the letter of the question"* (the best reframing evidence arrives as a side observation a narrow researcher would otherwise politely omit)
- absolute `session_path`
- output path `researcher/research-findings-{id}.md` (distinct per question — parallel writers must not collide)
- what a good answer looks like, so it stops when it has it

Targeted researchers are narrow by construction — they answer one question, not "everything about X". Re-dispatch the designer with the new findings paths in the prompt.

**Write guard:** the `research-findings-{id}.md` naming stays clear of the guard's `findings*`/`report*` triggers (probed 2026-08-04). Backstop unchanged: on any denial the researcher returns the answer as text and the LEAD writes the file before re-dispatching the designer.

## Prototype exit

Reach for it when the question is "how should this look / behave / read" — prose alternatives make the user arbitrate an abstraction. Cheapest artifact that makes the choice concrete: an outline, a stub signature, a sample payload, a faked response, a CLI transcript. Designer writes it under `designer/prototypes/{slug}.{ext}` and links it; the lead presents the artifact as the question. Throwaway by default — it exists to be reacted to, not kept.

## Ledger duty — the designer owns `map.md` during discovery

Same beat as the `requirements.md` update, never batched to the end:

| Event | `map.md` section |
|---|---|
| decision settled (any exit) | **Decisions so far** — one line + link to the detail |
| something ruled out | **Out of scope** — gist + why + where raised |
| unsharp question surfaced | **Not yet specified** |
| fog became specifiable | delete the graduated line from **Not yet specified** |

Ownership sits with the designer here (not the lead) because `intent-keeper` reports into the *observed agent* — a ledger-gap nudge must land on someone who can fix it. Outside discovery, the lead owns the map.

**Index, not store**: one line and a link. A map that restates decisions goes stale and stops being trustworthy, which is the only way this artifact fails.

## Termination

Fog-drain, not a round cap: exit when no exit-1/2/3/4 questions remain — everything left is fog or out of scope. Safety cap 10 rounds, refined by genealogy: the round-report Convergence header tracks open count + deepest root, and a root at generation ≥3 with zero resolutions is fog wearing a question costume — route the whole thread to fog (or chart-only if it's the destination itself), don't spend rounds on it. `research → grill → research` with RESOLUTIONS along the way is the loop working; the same chain without them is thrashing, and the genealogy is what tells those apart.

Exit runs through the fog-drain frame check + fresh-eyes dispatch (see Frame checks) BEFORE handing to the planner.

If the lead's context gets heavy first: have the designer flush `map.md`, stop, resume in a fresh session. `map.md` is the resume point, so a long discovery costs sessions, not fidelity. The user can exit any time ("plan it", "move on") or steer ("dig deeper into X").

## Anti-patterns

| Don't | Do |
|-------|-----|
| Pass `name:` to a designer dispatch | Plain `subagent_type` — anything else disarms `intent-keeper` |
| Ask the user something docs or code could settle | Exit 1 or 2 first; ask only for judgment |
| Batch several questions to the user | ONE HITL item per round |
| Serialize the human behind the research fan-out | Fire research background, ask concurrently |
| Turn a research *finding* into a product *decision* | Findings inform; humans decide scope |
| Absorb a finding that contradicts a ratified decision | Premise strike — the human re-decides; silence launders it |
| Let a load-bearing finding graduate unrefuted | One fresh-context refuter first (Decision / blocking-AC subject / strike) |
| Grind rounds on a question thread that never resolves | Genealogy: generation ≥3 with zero resolutions → fog |
| Write an unanswerable question into `requirements.md` as confident prose | Exit 5 — it goes to fog |
| Batch `map.md` updates to the end of the loop | Write the ledger line in the same beat as the decision |
| Grind extra rounds on fog | Record it, move on; it graduates or it doesn't |
| One fat researcher for "everything about X" | One narrow researcher per question, parallel |

## Example flow

```
Round 1 — payment-semantics
    designer → frame: approach still recommended (yes). self-resolved 3 (code); research:
               Q-1 stripe-retry "Stripe webhook retry semantics?",
               Q-2 delayed-redelivery "does @adddog/queue support delayed redelivery?"
               (informs D-1 approach-pick; premise at risk: P-2 queue-supports-delay);
               grill: Q-3 delivery-guarantee "at-least-once or exactly-once for payment
               events?" (rec: at-least-once + idempotency key)
    lead     → 2 researchers fired parallel; Q-3 presented while they run
    user     → "at-least-once, but dedupe must be visible to support"

Round 2 — dedupe-visibility
    designer → PREMISE STRIKE: research-findings-2 shows @adddog/queue delayed redelivery
               is at-most-once under restart — contradicts P-2 queue-supports-delay,
               reopens D-1 approach-pick. Strike outranks the queued grill.
    lead     → refuter on the striking finding first (AFK, survives) → presents the
               strike (evidence + what D-1 assumed)
    user     → "keep the approach, add a redelivery journal" → P-2 re-scoped, D-1 holds
               amended

Round 3 — support-surface
    designer → reads the answer + refuter (finding survived). Q-1 moot (dropped — genealogy
               notes the root closed). New: Q-4 support-view ← Q-3 → self-resolved (code).
               New prototype: 2 sample dedupe-log rows to react to
    lead     → presents the artifact
    user     → picks shape B, "add attempt count"

Round 4 — seal
    designer → requirements updated; map.md Decisions +3, Out of scope +1
               ("exactly-once via ledger — cost not justified"); fog: "replay tooling
               shape" (unsharp — depends on a decision not yet made)
             → STATUS: CLEAN, fog-drained
    lead     → fog-drain frame check + fresh-eyes (approach holds; one over-specified
               requirement line flagged, softened) → Step 4c (planner)
```

Round 3: the human's answer **changed what was worth researching** — one queued question died, a new one was born. Round 2 is the same force running the OTHER direction: a finding changed what was worth *believing*, and the strike protocol made that a decision instead of a silent absorption. Both are the loop earning its keep.
