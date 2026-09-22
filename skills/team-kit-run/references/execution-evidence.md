# execution-evidence — the attempt evidence contract

> **Content authority.** This file owns WHAT an attempt record contains and WHO owes which duty.
> `team-templates/SESSION-SCHEMA.md` owns WHERE those files sit and WHO writes them — it links here and
> never restates a field. Two schemas for one artifact is drift; there is exactly one, and it is this file.

**Opt-in (D-PLAN-2 selective-adoption).** Applies to a run whose `team-plan.md` declares this protocol —
canonical new or re-authored workflows. Saved legacy workflows and their fixed evidence paths are NOT
migrated and stay valid as written.

**Non-goals — this protocol adds none of these.**

| Not added | Why |
|---|---|
| A second ledger | `build-state.md` is the only index. Reservations, selections and counters extend the sections already there. An attempt record is evidence, never an index of other evidence. |
| Repository-wide hashing | Snapshot and hash only the bytes an attempt actually consumed or produced. No tree-wide manifest, no baseline re-hash of unread files. |
| A new executor / receipt agent | No runtime, no daemon, no per-stage receipt subagent. These are artifact fields plus duties on stages that already run. |
| Migration of old evidence | Existing sessions keep their bytes and paths untouched. |

---

## 1. Attempt identity

An **attempt** is one dispatch of one task by one owner. Its identity is `{owner, task-id, epoch, attempt}`
and it is allocated by the orchestrator **before** dispatch, never by the agent that runs it.

| Rule | Statement |
|---|---|
| A1 reservation-first | The orchestrator persists the reservation in `build-state.md` before the dispatch: task id, attempt number, owner, exact output paths, input/contract paths + SHA-256, dependency task/attempt/result paths + SHA-256, authority reference, state `reserved`. No dispatch may be the first thing that names its own path. |
| A2 monotonic | One counter per task id, starting at 1. Allocate `1 + max previously reserved`, counting failed, abandoned and still-reserved numbers. Never reset, reuse or renumber — on correction, re-authoring or resume. Counters are per task, not one shared round number. |
| A3 epoch | `epoch` is supplied by the orchestrator in `args` and persisted in `build-state.md`. Never wall-clock, never random (rule 7 bans both inside a workflow script anyway). It is always a recorded FIELD; it is a path segment only when the reservation says so. |
| A4 fresh path | Every reserved terminal output path must be verified absent before reservation. A collision with a reserved-but-unconsumed path is an **INTEGRITY finding routed to the human**, never permission to overwrite. Source files, contract files and the ledger are excluded from the absence rule — they are not attempt outputs. |
| A5 cache keeps identity | Completed work replayed from cache on resume without a new dispatch **retains its original attempt number and evidence**. A genuine rerun, correction or regrade reserves a NEW number and path first, with a new prompt tag and its own dependency references. |
| A6 allocation ≠ authority | A reserved number grants no replay authority. Unknown effects, completed effects, user skips, paid/irreversible actions and restoration still obey their own holds and authority gates (§7). |

### Path grammar

```
directory shape — coders, live workers
{session}/{owner}/attempts/[{epoch}/]{task-key}/{attempt}/
    progress.md      early, durable, mutable until terminal — never a verdict     (§3)
    result.md        write-once terminal record                                    (§4)
    inputs/          snapshots of consumed mutable bytes                           (§5)
    raw/             verbatim observation captures, when any                       (§6)
    normalized/      derived values + the transform rule that produced them        (§6)

numbered-file shape — spec-reviewer, reviewer, verifier, goal auditor, orchestrator, runtime preflight
{session}/{owner}/{artifact}-{attempt}.md          write-once terminal record       (§4)
{session}/{owner}/{artifact}-{attempt}.inputs/     snapshots of consumed mutable bytes (§5)
```

Owners whose evidence is a single file per attempt use the numbered-filename shape their reservation
names — `{owner}/{artifact}-{attempt}.md` — with the same fields. Its snapshot slot is the **sibling
directory `{owner}/{artifact}-{attempt}.inputs/`**: same owner, artifact and attempt, so it carries the
terminal's identity and needs no reservation scheme of its own. It is reserved with the terminal (A1),
verified absent with it (A4), and holds exactly what `inputs/` holds in the directory shape — copies of
consumed mutable bytes (§5), nothing else. Progress, raw and normalized stay inside the single record
as separate sections (§6); `.inputs/` is its only sibling. **The reservation in `build-state.md` is the
decisive resolution of any path in either shape.** The `[{epoch}/]` segment is present only when the
reservation includes it; the epoch is recorded as a field in every case. An agent that cannot find its
reserved path stops `STATUS: BLOCKED` — it does not invent, shift or guess one.

### Immutability

`result.md` — or the numbered file — and the `inputs/`, `raw/`, `normalized/` bytes it names, or the
numbered file's `{artifact}-{attempt}.inputs/`, are **immutable once written** and
**owner-local**: an agent writes only under its own owner directory. No later attempt, audit,
correction, review or grade may edit, delete, truncate, rename or re-hash them. To supersede a finding,
produce a NEW attempt that cites the old one — never edit the old one. A failed attempt is retained
exactly as it failed; the retained failure is part of the evidence, not litter.

---

## 2. Named duties

Every duty below has exactly one named owner. "MAY NOT" clauses are as binding as the duty.

| Role | Duty | MAY NOT |
|---|---|---|
| **Orchestrator** (allocation) | Reserve the attempt before dispatch (A1); pass the exact resolved output, input and dependency paths into the prompt; record dispatch/run/journal locator, outcome and every selection transition in `build-state.md` history. | Write, fix or grade source; infer an observed event from a reservation; release, reuse or renumber a reservation. |
| **Orchestrator** (selection) | Maintain the explicit **current evidence selection** rows: consumer/AC, selected producer task + attempt, result path + SHA-256, input/contract hashes, dependency hashes, acceptance locator, applicability. Before selecting a terminal, READ it and confirm its own last non-empty line is its STATUS line (§4) and equals the status the producer returned — `/usr/bin/sed -e '/^[[:space:]]*$/d' {result path} \| tail -1 \| /usr/bin/grep -E '^[[:space:]]*\**[[:space:]]*STATUS:'` (the LAST non-empty line, tolerating the bold markers the runtime classifier tolerates — *The selection gate* below). Empty output, rc 1, IS the refusal. Record the matched line in the selection row **verbatim, bold markers kept** (§6: the row records the bytes, never a tidied reading of them). Record the prior selection and reason on any change and stale affected dependents. | Select by highest filename, newest timestamp, latest pointer or CLEAN text alone; select a terminal whose own bytes carry no STATUS line, or whose STATUS line contradicts the returned one — that is a fresh attempt for the producer, never an orchestrator edit to the record (§1 Immutability); refuse a terminal whose last non-empty line IS its STATUS line solely because that line is bold-wrapped — the runtime classifier already read those same bytes (*The selection gate* below); silently restore an older PASS when a newer attempt fails or is unresolved. |
| **Orchestrator** (script revisions) | Retain every REVIEWED Workflow script revision — exact bytes + SHA-256 under `runtime/scripts/` — BEFORE overwriting, re-authoring or relaunching it (*Script revisions* below). | Overwrite a reviewed revision in place; launch bytes that match no retained revision; let a verdict speak for bytes no one can reproduce. |
| **Producer** (any stage agent) | Write `progress.md` before substantive work (§3); snapshot the bytes it consumes (§5); write `result.md` ONCE at the end with every §4 field; keep raw and normalized separate (§6); return the full text on a write refusal (§8). | Write outside its owned paths; edit a prior terminal; claim a route, run id, tool result or authority it did not observe; write a terminal verdict into `progress.md`. |
| **Consumer** (a stage that reads another stage's evidence) | Before consuming: read the named result at the path the orchestrator selected, re-hash it and compare to the selected SHA-256, and check the premise applicability the selection records. Cite the exact producer task/attempt/result path + hash in its own `result.md` dependencies. | Consume by directory listing or filename search; accept a hash without reading the bytes; treat a producer's CLEAN as its own verification. |
| **Independent reviewer — `team-spec-reviewer`** | Check that every obligation in the plan has a producing site and every produced claim has a plan obligation; check consumer membership completeness, exclusions and retained history; verdict `{covered, missing, invented}`. An acceptance-material omission BLOCKS; it is not relabelled advisory. | Repair source; accept text presence or a populated field as semantic support. |
| **Independent reviewer — `team-reviewer`** | Review the evidence failure paths: stale cached identities, path collisions, self-reported support, replay permits without evidence, observation overwrite, unbounded snapshots, duplicated schemas. Record file:line. | Edit source. |
| **`team-verifier`** (mechanical) | Re-run the declared commands; record command, rc, executed suites, skips; re-hash the exact input/output files the records name; report byte or count mismatch. | Convert mechanical success into semantic PASS; alter source or tests to get green. |
| **`team-verifier`** (audit owner, dispatched by `auditEmpty`) | Reconstruct a STATUS for an empty return into its OWN separate audit artifact (§7). | Write, re-write or overwrite the producer's `artifact`; assert non-execution from a missing file. |
| **`team-goal-auditor`** (`Phase: grade`) | Grade against the original prompt and the acceptance contract; independently verify the orchestrator's grade-inputs snapshot against the selected artifacts and the retained affected history; hash the contract, the selected evidence and every decisive historical input. | Read design/discovery/prior-verdict conclusions as behavioral proof; attach new hashes to an older PASS; grade evidence chosen by filename. |
| **Human** | Owns INTEGRITY findings, BLOCKED/NEEDS_CONTEXT after triage fails (`SKILL.md` → Autonomy contract → Triage-first), cap exhaustion, paid/irreversible authority, restoration and any material contract delta. | — |

### The selection gate — strict about WHICH line, tolerant of how that line is dressed

Two independent properties. Conflating them is what made this gate refuse artifacts the run itself had
already classified, on the same bytes.

| Property | Statement |
|---|---|
| WHICH line — strict | The LAST non-empty line, nothing else. `sed` drops blank and whitespace-only lines first, so a trailing newline cannot shift it. This is why the gate is not `grep '^STATUS: ' \| tail -1`: that returns the last MATCHING line and passes an artifact whose verdict sits mid-document with `failedACs: …` after it — trailing content, violating both this duty and the producer's "nothing after it". Widening the SHAPE does not reintroduce that: the pattern is applied to the last line, never used to search for one. |
| WHAT shape — exactly the classifier's tolerance | `^[[:space:]]*\**[[:space:]]*STATUS:` is the ERE of `statusLineOf`'s `/^\**\s*STATUS:/i` (`references/stage-templates.js:229`). Bold is presentation, not content: `**STATUS: CLEAN**` is still the verdict, still last, still with nothing after it — all this duty requires. A gate that refuses what the runtime accepts makes one artifact two verdicts. |
| the case fold is deliberately NOT carried | The classifier folds case; this gate does not. Measured: zero artifacts under `team-session/` end on a status line that is not the literal `STATUS:`. Widening past what was measured is how a gate quietly stops catching things — a lowercase terminal line stays a producer defect to re-dispatch, and the residual is NAMED here rather than silently closed. |
| recorded verbatim | The selection row keeps the matched bytes, markers included. Rewriting `**STATUS: CLEAN**` to `STATUS: CLEAN` in the row records a line the artifact does not contain (§6 — raw is not tidied on the way into a record). |

Motivating record: bold-wrapping is OBSERVED producer behaviour, not a hypothetical — verifier reports emit
the marker bold-wrapped (`SKILL.md:73`, harvested from
`team-session/20260904-moirai-effort-1/verifier/results-w0-initial.md:44`), which is why `statusOf` carries
`\**`. Twenty-nine artifacts under `team-session/` end on a bold STATUS line, among them
`20260902-moirai-gap-closure/goal-auditor/sat.md` (`**STATUS: ERRORS_REMAINING: 17**`),
`20260904-nzb-backend-orchestration/verifier/h15-ac14.md` and `mono-cal-b2b-run-s0/preflight.md`: every one
classified by the runtime and REFUSED by the strict form of this duty. A disagreement over how much of a
class was non-compliant was that unnamed conflict, not a measurement error. The gate's real target is
untouched — `20260910-claude-teamkit-adaptation/goal-auditor/final-grade-1.md` and `-2.md` carry
`STATUS: CLEAN` at `:486` and `:431` with `failedACs: …` after it, and the widened command refuses both
(rc 1, empty output) exactly as the strict one did. Origin: PD-5
(`team-session/20260911-teamkit-runlane-autonomy/build-state.md:217`), whose own proposed check was the
`grep '^STATUS: ' \| tail -1` form this row rejects.

**Divergence, recorded not resolved.** The create lane's gate (`team-kit-create/SKILL.md:425`) rules a
bold-wrapped line a FAIL for create-lane verdict artifacts. This row governs run-lane SELECTION only and
answers only that: a bolded terminal is not refused at selection. Whether bold is additionally an authoring
defect there — repaired by re-dispatching the producer, never by editing another agent's verdict — is that
file's call, not this one's. Producers on both lanes still write the plain form (§4, §10 template).

### Script revisions — retained before overwrite or relaunch

A Workflow script a fidelity review read is a reviewed input (SKILL entry-mode-1 step 3): the verdict is
evidence about those exact bytes. Edit the file in place and the verdict speaks for bytes no one can
reproduce. The orchestrator owns:

| Rule | Statement |
|---|---|
| S1 retain first | Before overwriting, re-authoring or relaunching a REVIEWED revision, copy its exact bytes to `{session}/runtime/scripts/{script-stem}.rev{k}.{ext}` (e.g. `plan.workflow.rev2.js`) and record its SHA-256. The copy precedes the change — a copy taken after it holds different bytes. Already retained with a matching SHA-256 → nothing to copy. `rev{k}` is monotonic per script, never reused. |
| S2 one ledger | `build-state.md` *Script revision history* — the same ledger, not a second one — records per revision: rev, SHA-256, retained path, the review attempt that read it and its verdict, whether and under which runId it launched, why it was superseded. |
| S3 launch = retained | Every launch's script bytes equal a retained revision whose SHA-256 matches its row, and the fidelity review that launch relies on names that same SHA-256. A launch matching no retained, reviewed revision is unreviewed. |
| S4 immutable | Retained revisions are orchestrator snapshots (§5 pointer class): never edited, renamed or deleted. A superseded or never-launched revision stays — it is history, not litter. |

Motivating record: the 2026-09-10 teamkit-adaptation effort overwrote `plan.workflow.js` in place and
three reviewed revisions (rev1–rev3) became unrecoverable, so a CLEAN projection review rests on bytes
no one can reproduce (`team-session/20260910-claude-teamkit-adaptation/closure.md:76`, defect 9).

### Hash-bound dependencies bind only across a seam

A dependency reference carries the producer terminal's SHA-256 (§5), and only the orchestrator selects
and hashes a terminal (selection duty above). Inside a running workflow nobody can: the script has no
filesystem (SKILL rule 7) and the orchestrator holds no turn until the run returns. No one can know a
producer's terminal hash before an in-run consumer dispatches. So a dependent stage has exactly two
legal shapes:

| The consumer needs | Legal shape |
|---|---|
| the producer's CLAIM — its verdict or terminal record | **Split the run at a seam** after the producer. The run returns; the orchestrator reads, hashes and selects the terminal (a current-evidence-selection row); the consumer dispatches in the NEXT launch with that dependency bound. |
| only the producer's SOURCE effects — the files it wrote | **Same launch is fine.** The consumer snapshots those files as its OWN consumed mutable inputs (§5: copied, hashed at read time) and records NO dependency on the producer's terminal. It cites bytes, never the producer's claim about them. |

**Failure otherwise:** a consumer told to read a prior attempt's terminal while its binding says it
consumes none — e.g. a grade prompt saying "read the attempt record the snapshot selects", rendered with
an empty dependency list. The dispatch contradicts itself: the consumer can obey only by resolving the
terminal on its own — listing, filename, "latest" pointer, the consumer MAY-NOT above — or by trusting an
unhashed claim. Either way its record cites a dependency no one selected. It is an authoring defect, for
the fidelity review to reject; a consumer handed one does not go find the terminal — it stops
`STATUS: BLOCKED` naming the contradiction.

---

## 3. `progress.md` — early, durable, never a verdict

Written **before** the substantive work and updated as it proceeds. Its purpose is that a killed agent
leaves evidence: a `maxTurns` kill or lost return destroys the last thing written, so the record must
exist before it can be lost (SKILL rule 15 addendum, mitigation (c)).

| Field | Note |
|---|---|
| task, attempt, stage key, epoch, owner | Identity, copied from the reservation — never minted. |
| planned input paths | What this attempt intends to consume. |
| dependency attempt paths | Task/attempt/result path of each dependency it was given. |
| progress state | Completed / in progress / blocked, with what was actually done. |

**`progress.md` carries no terminal verdict.** It may end with a non-terminal marker
(`STATUS: IN_PROGRESS`) or none at all. A `STATUS: CLEAN` in a progress file is not a verdict, must not
be selected as one, and a consumer or grader that treats it as one has read the wrong artifact. The
terminal verdict exists in exactly one place: `result.md`.

---

## 4. `result.md` — the write-once terminal

Written once, after terminal work. Fields:

| Group | Fields |
|---|---|
| identity | task id, attempt, owner, epoch, stage key, reservation locator (`build-state.md` row), prompt tag, `correction-of` reference when this attempt corrects an earlier one |
| observed role / route | agentType actually used; model/route/version, run id and journal locator **when observed** — otherwise the literal `unobserved`. Never inferred from the dispatch. |
| terminal status | the single STATUS line, matching the agent's returned final line |
| consumed inputs | per input: original path, snapshot path, SHA-256 (§5) |
| contract files | path + SHA-256 of each acceptance/plan/contract file actually read |
| dependencies | per dependency: task id, attempt, result path, SHA-256 |
| outputs | path + SHA-256 of every file this attempt wrote, **excluding `result.md` itself** — a verdict file does not hash itself; the orchestrator hashes it into the selection row |
| raw observation locator | where the verbatim capture lives (§6) |
| normalization | input, output and the transform RULE, when any normalization was applied (§6) |
| commands | command, rc, executed suites, skips — for any command actually run |
| explicit limits | what this attempt did NOT establish; every unobserved thing named as unobserved |

**Claim / support / limit.** A producer's `result.md` is a CLAIM. It becomes accepted evidence only
after a consumer checks it (§2) and an independent applicable review passes. **Hashes establish bytes,
never truth, correctness or consent.** A populated field, a CLEAN label, `exit 0` and a matching hash
are each necessary-at-most; none of them is semantic support.

---

## 5. Consumed input snapshots — exact, and bounded

Every input the attempt's claim depends on is recorded as the triple `original path / snapshot path /
SHA-256`. This binds **every evidence-producing role** — coders and live workers, and equally the
numbered-file producers: spec-reviewer, reviewer, verifier, goal auditor, runtime preflight. A copy
lands in the attempt's snapshot slot (§1): `{attempt}/inputs/` in the directory shape, the sibling
`{owner}/{artifact}-{attempt}.inputs/` in the numbered-file shape; `snapshot path` points into it. A
verdict resting on mutable bytes that were never copied rests on bytes no one can reproduce. How the
snapshot is taken depends on whether the bytes are already immutable:

| Input class | Snapshot rule |
|---|---|
| Another attempt's terminal (`result.md`, its `inputs/`, `raw/`, `normalized/`) | **Pointer, not copy.** Already immutable (§1). `snapshot path` = the original path; record the SHA-256 read at consume time and compare it to the selection row. |
| Sealed session contract + orchestrator snapshots (adopted contract files, instruction snapshot dirs, retained script revisions under `runtime/scripts/` — §2) | Pointer + SHA-256. They are contractually frozen; duplicating them is the unbounded-snapshot failure. |
| Tracked repo source, **unmodified** vs the run's recorded baseline commit | Pointer `{baseline-commit}:{path}` + SHA-256. Those exact bytes are recoverable with `git show`, so copying a 76 KB skill file to prove you read four regions of it is the unbounded-snapshot failure. Record which regions were consumed. |
| Mutable bytes — dirty or untracked source, working tree, ledger rows, tool output | **Copy** into the attempt's snapshot slot — `inputs/` (directory shape) or `{artifact}-{attempt}.inputs/` (numbered-file shape) — then hash the copy. A ledger section is copied verbatim with its heading: `build-state.md` changes, so a later read cannot reproduce what was consumed. |

Bounds: snapshot ONLY what this attempt actually consumed and could be challenged on. No
repository-wide hashing, no snapshot of unread files, no copy of bytes that are already immutable under
`{session}/`. An unbounded snapshot is a quality finding, not thoroughness.

Dependency references are **pointers with hashes**, always: `{task, attempt, resultPath, sha256}`. A
dependency named without a hash is not a dependency reference.

**A dependency reference exists only across a seam** (§2 *Hash-bound dependencies*): no one can hash a
producer's terminal before an in-run consumer dispatches. Within one launch, a dependent stage consumes
the producer's SOURCE effects — the files on disk — as its own mutable inputs (last row above: copied
and hashed by the consumer at read time). That is an input triple, not a dependency reference, and it
carries none of the producer's claims. A consumer told to read the producer's terminal while its
binding lists no dependency is the failure §2 names — it stops; it never goes looking.

---

## 6. Raw and normalized stay separate

Two files, two records, one rule between them.

| Requirement | Statement |
|---|---|
| separation | The verbatim observation goes to `raw/` untouched — the exact tool output, response body or file bytes. Any derived value goes to `normalized/`. Never overwrite raw with normalized; never write only the normalized form. |
| transform retained | Whenever a normalized value exists, `result.md` records its **input, its output and the RULE that produced it**. The rule is retained text, not a description of intent — a reader must be able to re-apply it to the raw bytes and get the same output. |
| contradiction rejected | A support claim contradicted by its own raw bytes is REJECTED, regardless of hashes, field completeness or a CLEAN label. Raw `available:false` cannot support `available:true`. |
| normalization is reviewable, not exculpatory | An explicit raw→normalized transform with retained lineage is reviewed **on its actual semantics**. A retained rule makes the claim checkable; it does not make it true. Missing lineage is a rejection, not an advisory. |
| no silent lossy capture | If the raw form could not be captured, say so in `explicit limits` and mark the derived value's support accordingly. Absent raw is a stated limit, never an implied one. |

---

## 7. Reconstruction is a separate artifact

An agent can FINISH — edit its owned files, write its artifact — and still lose its return text
(SKILL rule 15). The repair for that is a reconstruction, and a reconstruction is **never** the
original observation.

| Rule | Statement |
|---|---|
| R1 separate file | The audit stage writes its own `auditArtifact` under the **audit owner's** directory. It never writes, re-writes or overwrites the producer's `artifact`. The producer's record — including its absence — stays exactly as the producer left it. |
| R2 never impersonates | A reconstruction is labelled as one and records: the original attempt pointer it reconstructs, the observed journal/return/diff locators it read, its reconstruction steps, its certainty, and every unresolved effect. It is not selectable as the producer's terminal and cannot be cited as a producer claim. |
| R3 absence proves nothing | **Neither an empty return nor a missing artifact proves no work happened.** Empty + no artifact is the cap-kill signature, not a non-execution proof — dead agents' source edits survive. Unknown completion is recorded `unknown`, reconciled against the journal and the diff, and held. |
| R4 no automatic replay | A reconstruction grants no repeat authority. A retry requires an explicit **RetryPermit**: an observed transport marker, reversible and unpaid scope, no user skip, remaining allowance, and a recorded authority locator. Missing, held, paid, irreversible or user-skip → HOLD to the orchestrator. A user skip is a decision, not a failure. |
| R5 effect state | Every attempt whose effect could not be confirmed carries effect state `none` / `observed` / `unknown` in the ledger. `unknown` is reconciled before any dependent dispatch — never resolved by re-running. |

---

## 8. Write-denial fallback — return the full text

The subagent Write guard denies `findings*` / `report*` basenames (precautionary: `summary*` /
`analysis*`) in both lanes (SKILL rule 16). `progress.md` and `result.md` are outside that set, but any
write can be refused, and the protocol is the same for every refusal:

1. **Return the ENTIRE intended artifact text, verbatim, in the final message** — full content, no
   truncation, no summary — plus the refusal text and the exact absolute path it was intended for.
2. **Do not bypass the refusal.** No rename to evade the guard, no heredoc workaround, no writing it
   somewhere else. The guard may harden; evasion is an INTEGRITY finding.
3. **The orchestrator transcribes** the returned text to the reserved path and hashes it, then records
   in `build-state.md`: the returning agent as author, `transcribed-by-orchestrator`, the refusal
   reason, and the transcription event in history. The attempt keeps its identity and its number.
4. A transcription is **not** a reconstruction (§7): the bytes came from the producer verbatim. It is
   still labelled, because the author and the writer differ.
5. Until transcribed, the returned text is evidence **without a hash**. A consumer may not cite an
   untranscribed artifact as a hashed dependency; it either waits for the transcription or records the
   limit explicitly.

---

## 9. Latest pointers are not evidence

Fixed, unnumbered legacy paths — `coder-{name}/progress.md`, `verifier/results.md`,
`reviewer/review-{task-id}.md`, `spec-reviewer/spec-review-{task-id}.md`, `validation-report.md` — may
continue to exist as a **latest pointer**: a convenience copy or link to whatever the orchestrator most
recently selected.

**A latest pointer is never decisive evidence.** It has no attempt identity, it is mutable, and it is
last-writer-wins by construction. It may not be selected in a current-evidence-selection row, cited as
a dependency, or graded. Decisive evidence is always the reserved, immutable, attempt-numbered record
resolved through `build-state.md` (§1, §2). A run that declares this protocol writes the attempt record
first; the pointer, if it keeps one, is refreshed from it afterwards.

---

## 10. Templates

Copy these shapes verbatim; keep field names stable so a reviewer can diff records across attempts.

**`progress.md`**

```markdown
# Progress: {owner} — {task-id} attempt {n}

Task: {task-id} | Attempt: {n} | Stage: {stage-key} | Epoch: {epoch} | Owner: {owner}
Reservation: build-state.md -> Attempt reservations, row `{task-id} | {owner} | {n}`

## Planned inputs
- {original path}   (snapshot -> inputs/{name} | pointer)

## Dependency attempts
- {task-id} attempt {n} -> {result path}

## Completed / In Progress / Blocked
- {what actually happened}

## Files Modified
- `{path}` — {what changed}

STATUS: IN_PROGRESS   (non-terminal; the verdict lives in result.md)
```

**`result.md`**

```markdown
# Result: {owner} — {task-id} attempt {n}

## Identity
| Field | Value |
|---|---|
| task / attempt / epoch / owner | {…} |
| stage key | {…} |
| reservation | build-state.md -> Attempt reservations, row `{…}` |
| prompt tag | {…} |
| correction-of | {task-id} attempt {n} | none |
| observed role / route | agentType {…}; model/route/runId/journal: {…} | unobserved |

## Consumed inputs
| Original path | Snapshot path | SHA-256 |

## Contract files read
| Path | SHA-256 |

## Dependencies
| Task | Attempt | Result path | SHA-256 |

## Outputs written
| Path | SHA-256 |          (result.md does not hash itself)

## Raw / normalized
| Raw locator | Normalized locator | Transform rule |

## Commands
| Command | rc | Suites | Skips |

## Limits
- {what this attempt did NOT establish; every unobserved thing named}

STATUS: {CLEAN | PARTIAL | BLOCKED | NEEDS_CONTEXT | ERRORS_REMAINING: n}
```

**Audit / reconstruction `result.md`** — same header, plus:

```markdown
## Reconstruction
| Field | Value |
|---|---|
| reconstructs | {producer task-id} attempt {n} -> {its result path} |
| observed locators | journal: {…}; return: {…}; diff: {…} |
| steps | {what was read, in order} |
| certainty | {what is established vs inferred} |
| unresolved effects | {effect state: none/observed/unknown, per effect} |

This artifact is a RECONSTRUCTION. It does not replace, overwrite or speak for the producer's terminal.
```

---

## 11. INTEGRITY findings — human, never a retry

Route to the human, never back to the producing agent: overwriting or editing a terminal result;
consuming a reserved-but-unconsumed path; reusing or renumbering an attempt; an audit artifact written
over a producer's; a claimed observation (route, run id, tool result, authority) that was not observed;
evading a write refusal; deleting or truncating a retained failed attempt; editing the acceptance
contract, plan, design, requirements or map to pass a gate; attaching new hashes to an older PASS.
