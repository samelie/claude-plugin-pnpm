# Experiments — run it before arguing about it (Step 1 shape `experiment`; Step 4b exit 2 kind `run`)

One card format, two uses: a whole effort whose next decision hangs on a measurement nobody has (shape `experiment`), and a single discovery question only a run can answer (exit 2, kind `run`).

## When a run beats a read

| Signal | Route |
|---|---|
| the answer is in the tree or in docs | exit 1, or exit 2 `read`. Never a run |
| a premise under the approach pick has no `read:` basis, and the effort can reach a surface that settles it | `run`, before the planner |
| `unverified-wire-shape: yes` in the rigor signals | `run`: capture one real sample (SKILL.md Step 4c → captured reality) |
| which engine, is it feasible, does it hold on real data | shape `experiment` |
| paid, irreversible, production, authenticated or remote-mutating | card with `Side: human-gated`: it returns as a checklist and never runs autonomously (`team-templates/FRAMEWORK.md` → Prod-gating) |

Measured: five probes on real audio "each changed the design or retired a risk within an hour", inside an effort whose contract took 12 h and 500 KB (`team-session/20261112-dnd35-speaker-attribution/HANDOFF.md:183-185`).

## The card

`experiments/X-{n}-{slug}.md`, written BEFORE the dispatch by whoever owns the question: the designer in discovery, the lead in an `experiment` effort. Raw captures and throwaway code go under `experiments/X-{n}-{slug}/`, never in a source tree.

```markdown
# X-1 pg17-tmpfs
Question: <one sentence a run can answer>
Decides: <the D-n or P-n it settles, and what happens on each outcome>
Measures: <what is recorded, on which surface or data, how many samples>
Stop rule: <the threshold, or the time and cost box — fixed before any result>
Side: autonomous | human-gated — <why>

## Commands
| # | command | rc | artifact |

## Results
<raw first: paths, counts, bytes. derived second>

## Reading
<what this settles, what it does not, the next card if any>

STATUS: CLEAN | PARTIAL — <what was not measured> | BLOCKED — <the missing precondition>
```

| Rule | Why |
|---|---|
| stop rule before results | a threshold chosen after the output is a description, not a test |
| the runner records, the owner reads | the runner fills Commands and Results; its `CLEAN` means the measurement completed, never that the idea works (SKILL.md Step 4c-b → measurement, not verification). The owner of the question writes Reading |
| one negative control where it is cheap | run it in a state that must fail and record that it did |
| box it | default 60 minutes and no spend per card; a larger box is written on the card. Over the box: stop, record what exists, `PARTIAL` |

Runner: `team-researcher` (experiment mode), also when the surface is a running product. Plain dispatch; cards with disjoint directories run in parallel.

## Shape `experiment`

`prompt.md` + `map.md` (`Shape: experiment`) + cards. No `requirements.md`, plan, DoD, SAT or audit.

1. Clarify only until the Destination names the DECISION to be made.
2. Write the first card, dispatch, read the result, write the next card. A card's `Decides` line says what follows each outcome, so a ladder needs no approval between rungs unless a card is human-gated.
3. A result that will carry a Decision gets ONE fresh refuter (SKILL.md Step 4b → refuter), like any load-bearing finding.
4. Close with `decision.md`: the decision (when it is the owner's to make: the recommendation and the one question), the cards behind it, what stays unmeasured, and the effort it unblocks (usually a `build`). `map.md` **Decisions so far** gets one line per card that settled something.
5. `node "$REPO/.claude/skills/team-kit-create/scripts/check-contract.mjs" "$ABS_SESSION" --seal` exits 0.

Budget: 12 dispatches, 6 cards. At the limit, close with what is known; a further ladder is a new effort.

Provenance: the shape dnd35 worked in after it left the pipeline — numbered experiments with "Measures | Decides" columns, a stop rule fixed first, a command ledger, results ending in decisions for the owner (`team-session/20261116-dnd35-parakeet-x1/`, `team-session/20261116-dnd35-truth-bench/`).
