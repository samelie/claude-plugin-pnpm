# Rigor — how much of create runs (Claude lane)

Claude lane only. Codex writes no `Rigor:` line, ignores this file and runs every gate.

One skill, three levels. Nobody estimates a task up front: `scripts/assess-rigor.mjs` computes the level after the opening research sweep, when evidence exists. After that the level only moves up on its own. Steps before the assessment always run in full.

## Levels

| | low | medium | high |
|---|---|---|---|
| Plan contract | `latitude:` per lane (→ Plan latitude) | `latitude:` per lane (→ Plan latitude) | zero-decision, R-1 as written |
| Discovery rounds / plan revisions / dispatches | 2 / 1 / 16 | 4 / 2 / 24 | 6 / 3 / 30 |
| Reasoning for `team-designer`, `team-planner`, `team-goal-auditor` | `effort: "high"` on each dispatch | `effort: "high"` on each dispatch | frontmatter (`max`) |
| Frame check | skip form when no premises minted | skip form when no premises minted | runs |
| Design critique | skip form | runs | runs |
| Clean-pass floor, clarify included | 11 dispatches | 12-13 | 14 |
| Every other gate | as written | as written | as written |

SAT needs no level: Option A/B already follows the 4d-b (a)–(d) test. Frame-check and critique budgets are the same at every level. One blind goal audit and one fresh plan review always run.

The floors sit close together on purpose. Most create cost is revision loops, not gates, so the saving comes from thinner plans leaving less to revise.

## Signals

The Step 4a dispatch tells the researcher to append this block after §8 of `researcher/research-findings.md`. Facts only, never a level. Every line carries evidence after ` — `; a missing line or missing evidence reads as high.

```markdown
## Rigor signals

packages: <count> — <the workspace packages or top-level modules this change must edit, not merely read>
risk-class: <none | comma-separated classes, no spaces> — <evidence; for none, what was checked>
cross-lane-seam: <yes|no> — <two packages must agree on a new or changed interface>
persisted-data: <yes|no> — <a schema, file format or stored state changes>
external-behavior: <yes|no> — <a CLI, API, UI or output another actor sees changes>
unverified-wire-shape: <yes|no> — <the plan depends on an external format with no captured sample>
```

| Risk class | Means | SAT test |
|---|---|---|
| `frozen-artifact` | the work must not change an artifact that acceptance grades | (a) |
| `unforgeable-witness` | acceptance needs evidence the code cannot fake | (b) |
| `live-state` | it touches a running service, production data, deployed infrastructure, real hardware or an external account | (c) |
| `paid-irreversible` | it spends money, runs once, or cannot be undone | (d) |

## Step 4a-b: assess

1. `Rigor:` pinned at start (`--rigor=<level>`): the script still runs, for the risk floor.
2. Run `node "$REPO/.claude/skills/team-kit-create/scripts/assess-rigor.mjs" "$ABS_SESSION"`. It prints `RIGOR: <level> — <reasons>` and a `BUDGET:` line.
3. Replace the `map.md` line with `Rigor: <level>`, or `Rigor: <pinned level> (pinned by user)`. A risk floor above the pin replaces the pin: `Rigor: high (raised from <pin>: <risk class>)`.
4. Rewrite the limits on the `map.md` `Budget:` line to the level's values. Counters stay cumulative.
5. Add `| D-n rigor-pick | <level>: <reasons>; Source: assessed | researcher/research-findings.md#rigor-signals |` to **Decisions so far**.
6. Tell the user one line and keep going: `Rigor: medium (6 packages, 24 rows, no risk class). Say "go high" to change it.` Never wait on it. It adds no question, so `references/afk.md` §Gates is unchanged.

| Level | Rule (the script's constants govern) |
|---|---|
| high | any risk class, an unverified wire shape, 10+ packages, or 50+ rows across §3 and §4. Unreadable signals or zero rows also read as high |
| low | at most 3 packages, at most 20 rows, and no cross-lane seam, persisted data or external behavior |
| medium | everything else |

## Plan latitude

Below high the planner pins what crosses a lane and leaves the rest to that lane's coder. It does not write lane-internal signatures, data structures, module layouts or step-by-step code: a task in a `latitude:` entry states its outcome, files and the pinned contract it codes against. Ownership globs, tasks, ACs and `produced by` sites stay as strict as at high.

`team-plan.md` frontmatter carries one entry per lane that gets latitude. A lane is an owner in the File Ownership Matrix:

```yaml
latitude:
  coder-cli:
    tasks: [T-2 parser-core, T-3 parser-errors]
    open: internal module shape, lane-private types and helpers, data structures, algorithm choice
    pinned: parse() signature (design.md Interfaces), error codes AC-4 greps
```

Never `open`, at any level:

- an interface another lane uses
- persisted data or a stored format
- external behavior: a CLI, API, UI or output another actor sees
- error semantics another task depends on
- a new dependency
- anything a blocking AC's `verify` relies on

A lane owning a `type: HITL` task, or a task mapped to a blocking AC that hits the SAT (a)–(d) test, gets no entry. That is the slice D-33 keeps at full rigor. `design.md` names each lane's delegated area in one line, so the critic and the auditors can see the gap is deliberate. Step 5 §6 presents the block with the autonomy grant, and plan review checks it (`IMPLEMENTATION-READINESS.md` → Lane latitude).

## Raising

Raise the level as soon as a trigger fires, without asking:

| Trigger | Effect |
|---|---|
| any budget limit reached below high with a `silent` finding open (`references/acceptance.md` → Finding classes) | next level up, instead of the Loop budgets checkpoint. With none open, seal as SKILL.md § Loop budgets says. At high the checkpoint runs as written, and afk §Budget applies only there |
| a premise strike | high |
| the planner's ownership matrix or design shows more packages, a seam, persisted data or external behavior than the signals reported | the level those facts give under the same rule |
| a blocking AC hits the SAT (a)–(d) test, or a task is typed HITL, after the plan exists | its lane loses latitude through one planner revision; `Rigor: low` rises to medium so the critique runs |
| the user asks | what the user asked for |

Then:

1. Rewrite the line: `Rigor: medium (raised from low: <trigger>)`.
2. Rewrite the `Budget:` limits to the new level's values. Counters stay cumulative.
3. Add `D-n rigor-raise` to **Decisions so far**.
4. Use the new level's reasoning from the next dispatch.
5. Run every gate the new level owes before the next step, replacing its skip form. Reaching high after a plan exists also owes one planner revision that removes `latitude:` and pins what it left open. These revisions spend the normal budget.

Only a user instruction lowers a level, recorded as pinned, and never below the risk floor. An assessment-time risk class raises the whole effort because no lanes exist yet to carve; once lanes exist, risk costs only the affected lane.

## Skip forms

A skipped gate still writes its artifact, so `/team-kit-resume` R4 and the Step 7 rows find it. Exactly three nonempty lines, written by the lead:

`design-critic/design-critique.md` (`Rigor: low`; `check-design-critique.mjs` rejects it at any other level):

```text
# Design Critique: <team-name>
Runner: skipped — rigor low: no cross-lane seam
STATUS: DONE_WITH_CONCERNS — design critique skipped: rigor low, no cross-lane seam
```

`designer/frame-check.md` (`Rigor: low` or `medium`, and `map.md` **Premises** holds no row):

```text
# Frame Check: <team-name>
Runner: skipped — rigor below high: no premises minted
STATUS: DONE_WITH_CONCERNS — frame check skipped: rigor below high, no premises minted
```

## Seal

Step 7 runs `node "$REPO/.claude/skills/team-kit-create/scripts/assess-rigor.mjs" "$ABS_SESSION" --check`. It fails when `Rigor:` reads `pending`, sits below the assessment, a pin sits below the risk floor, or `team-plan.md` carries `latitude:` at high or with no `Rigor:` line. A map with no `Rigor:` line and no `latitude:` (a session older than this file) passes and runs every gate.

## Run lane

Only a plan with a `latitude:` block changes anything. It adds no stage, prompt template bytes or human stop.

1. **Coders decide.** `team-coder` already reads `team-plan.md`. Choices under its lane's `open` are its own, listed in its terminal record under `## Lane decisions` as `| <task> | <slug> | <choice> | <alternatives rejected> |`.
2. **Out of reach stays out of reach.** Anything on the never-open list above is not a lane decision. The coder returns `STATUS: BLOCKED`, and the existing triage and `PD-n` route handles it.
3. **Ledger.** At each round's ledger update, copy the rows into `build-state.md` → `## Lane decisions`, numbered `DD-n <slug>`. They are records, not rulings, and carry no authority over other lanes. VALIDATE already re-measures `build-state.md` claims.
4. **Grade.** Copy those rows into each `runtime/grade-inputs-{n}.md` under `## Lane decisions`, so the grader can weigh the choices against `prompt.md`. The grade prompt is unchanged.
5. **Final message.** List each `DD-n` under `Found`, one line each.

## Evidence

Back-test 2026-11-03, read-only: 27 sealed sessions with a `Budget:` line and an opening sweep, 16 with a run ledger. Features came from `prompt.md` and `researcher/research-findings.md` only, because `requirements.md` is rewritten during discovery. Cost is dispatches. Need is run-time `PD-n` rulings in `build-state.md`.

| Signal | ρ with dispatches | ρ with run rulings |
|---|---|---|
| §3 rows | 0.53 | 0.71 |
| §4 rows | 0.36 | 0.71 |
| packages in prompt and sweep | 0.54 | 0.45 |
| risk keyword count | 0.18 | 0.07 |
| researcher's High or Critical labels | -0.13 | -0.34 |

| Level under the rule | Sessions | Median dispatches | Median run rulings |
|---|---|---|---|
| low | 3 | 28 | 1 |
| medium | 7 | 26.5 | 3 |
| high | 17 | 33 | 19 |

All 8 sessions with 13 or more rulings land in high. Limits: the thresholds were chosen on this same sample, every session actually ran at high, and the low band holds 3 sessions (1 of them has zero countable rows, which the script now reads as high). The back-test used a path regex for packages and could not test agent risk classification. Budgets are estimates from the floors, not measurements, and nothing here has measured latitude. Recalibrate once efforts record a level: `map.md` `Rigor:` and `Budget:` plus `build-state.md` `DD-n` and `PD-n` rows carry what a re-run needs.
