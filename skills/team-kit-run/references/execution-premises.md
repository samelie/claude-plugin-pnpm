# execution-premises — the applicability contract

> **Content authority.** This file owns WHEN a measurement BINDS a consumer — separating acquisition,
> domain comparison and applicability — and what a changed premise does to work already done.
> `references/execution-evidence.md` owns what an attempt RECORD contains and who owes which duty;
> `build-state.md` owns WHERE the rows live. Each links to the others and none restates the others'
> fields. Two schemas for one artifact is drift.

**Opt-in (D-PLAN-2 selective-adoption).** Applies to a run whose `team-plan.md` declares this protocol.
Saved legacy workflows are NOT migrated.

**Extends, never duplicates.** The premise rows live in the **existing** `build-state.md` — the same file
that already carries the AC ledger, attempt reservations, current evidence selection, counters and `PD-n`
rulings. The `P-*` ids are the **same namespace** `map.md` **Premises** already mints at create Step 3
(`team-kit-create/references/explore.md` → Mint Premises); this contract adds the execution-side columns
to those ids, it does not open a second premise registry, a second ledger or a second lifecycle.

**Non-goals — this protocol adds none of these.**

| Not added | Why |
|---|---|
| A universal freshness threshold | There is no correct global "N hours". Each premise carries the policy its own domain sources (§4). An invented default is a fabricated acceptance threshold. |
| A second ledger or premise registry | `build-state.md` is the only index; `map.md` owns the `P-*` lifecycle. New columns on existing rows, nothing else. |
| A new state machine for effects | Effect state is the `none` / `observed` / `unknown` field the evidence contract already defines (`execution-evidence.md` §7 R5). |
| A new approval gate | Contract-change classification is create's existing table (`team-kit-create/references/approval.md`). §9 routes to it; it does not add a gate. |
| Automatic re-running of anything | No support change re-runs an effect, deletes a contradiction or resets a counter. |

---

## 1. Three questions, routinely conflated

A premise is consumed only after all three are answered, in order, by their own owners.

| # | Question | Owner | Answered by | Failure mode when skipped |
|---|---|---|---|---|
| 1 | **Acquisition** — did the measurement actually run, and is the record attributable? | acquisition producer | a normal attempt record: command, rc, raw locator, terminal `STATUS` (`execution-evidence.md` §4, §6) | a stage that never ran is cited as a measurement |
| 2 | **Domain comparison** — what does the observed value MEAN against the predicate? | domain owner | comparing the recorded value to the row's predicate, with the transform rule when normalized | a raw value is read as its own verdict; `available:false` is filed as support for "available" |
| 3 | **Applicability** — does this observation BIND this consumer, now? | consumer stage (checked at consume time), independently re-checked by `team-spec-reviewer` | subject match + the sourced policy in §4 against the row's evidence refs | a true, cleanly acquired, correctly compared fact is used on a task it does not cover |

**A CLEAN acquisition can yield refuted support.** `STATUS: CLEAN` on the acquiring stage means the
measurement ran and its record is complete. It says nothing about which way the comparison came out. A
producer that measured cleanly and found the predicate FALSE is a CLEAN producer with a `refuted`
premise; recording it as anything else is a counterfeit, not a rounding error.

**Acquisition success is not support. Support is not applicability.** Three separate columns, three
separate owners, never collapsed into one "verified" flag.

### Identity vs subject vs time

| The mismatch | Class | Route |
|---|---|---|
| The record names one thing and measured another, and presents the measurement AS the named thing | **INTEGRITY** — a claimed observation that was not observed | human, never a retry (`execution-evidence.md` §11) |
| The measurement is honestly of subject X; this consumer needs subject Y | **inapplicable** | re-acquire for Y, or drop the consumer; nobody is at fault and no failure is recorded against the producer |
| The measurement is honest and on-subject but falls outside the sourced applicability window for THIS consumer | **inapplicable** | re-acquire; the old observation is retained, not deleted |

Wrong identity is an integrity failure. Wrong subject or time is inapplicability. Collapsing the second
and third into the first manufactures integrity findings; collapsing the first into them launders one.

---

## 2. The premise row — columns added to `build-state.md`

One row per `P-*` per run. Every column is required; `unresolved` and `none recorded` are legitimate
values, an omitted column is not.

| Column | Content | Notes |
|---|---|---|
| **P-id + linked decision** | the `P-*` id and the exact decision it supports | id from `map.md` **Premises**; decision cited by its ledger id + locator. A premise supporting no decision and no consumer does not belong here (§11) |
| **domain owner** | the named role that owns question 2 | one owner, named. Not "the team" |
| **acquisition producer** | the task + attempt that ran the measurement | resolved through the reservation, never by filename (`execution-evidence.md` §1, §9) |
| **task consumers** | the exact task ids whose execution depends on it | exact ids, never "downstream tasks" |
| **AC consumers** | the exact AC ids whose grade depends on it | exact ids, never "the acceptance contract" |
| **subject** | what was measured — the specific artifact, service, version, environment or byte range | the thing a subject mismatch is checked against |
| **predicate** | the falsifiable comparison, stated so an observation can contradict it | inherits the create-side one-line phrasing |
| **freshness / applicability policy** | the window or condition under which an observation binds, **plus its source** | §4. No source → no policy → `unresolved` |
| **evidence refs** | ALL of them — supporting, contradicting and excluded | never only the ones that agree (§5) |
| **state** | `supported` / `refuted` / `conflicted` / `inapplicable` / `unresolved` | §3 |
| **held consumers** | which of the named consumers are currently held, and since when | the run's live hold set (§6) |
| **exclusion / ruling refs** | for every excluded observation: the independent review or `PD-n` ruling that excluded it | an exclusion without an independent ref is not an exclusion (§5) |

The row is an INDEX over retained evidence, exactly like the rest of `build-state.md`: it points at
attempt records, it never restates their contents and never becomes the place a measurement lives.

---

## 3. States

| State | Means | Effect on consumers |
|---|---|---|
| `supported` | applicable evidence exists and the comparison came out true | consumers eligible |
| `refuted` | applicable evidence exists and the comparison came out false | consumers held; the decision it supports is reopened per §9 |
| `conflicted` | two or more APPLICABLE observations disagree | consumers held. All observations are RETAINED (§5) |
| `inapplicable` | the evidence is honest but does not bind this consumer — wrong subject, or outside the sourced window | consumers held pending re-acquisition. Not a failure of the producer |
| `unresolved` | no acquisition yet, acquisition incomplete, or no sourced policy exists to judge applicability | consumers held. **The default state — never assume `supported`** |

A state is a recorded judgement with named evidence refs, never a derived label. `CLEAN`, a populated
field, a green command or a hash proves none of these five.

---

## 4. The freshness / applicability policy is SOURCED, per premise

There is no universal freshness threshold in this contract and none may be introduced by a run.

| Rule | Statement |
|---|---|
| F1 sourced | The policy is taken from the premise's own domain and cited: a vendor doc, the tool's documented cache/TTL semantics, a measured decay, the plan's declared scope, or a recorded user/`PD-n` decision. The row carries policy **and** source locator. |
| F2 no invention | An agent may not mint a window ("re-measure within 24h") that no source states. Inventing an acceptance threshold is a material change outside existing authorization (`approval.md` → Classify changes), not an implementation detail. |
| F3 absent → unresolved | No sourced policy ⇒ applicability is `unresolved` and its consumers are held. It does NOT default to fresh, and it does not default to stale. Say which source is missing. |
| F4 condition, not only a clock | A policy may be an event, not a duration — "binds until the target file's hash changes", "binds for this branch", "binds for tool version X". A hash- or event-scoped policy is preferred where one exists: it is checkable, a duration is a proxy. |
| F5 per consumer | The same observation can bind one consumer and not another. Applicability is evaluated per named consumer, never once for the row. |

---

## 5. Conflicts are retained, never resolved by deletion

| Rule | Statement |
|---|---|
| K1 retain | Conflicting **applicable** observations are all retained, all cited on the row, and the row reads `conflicted`. Deleting, truncating, un-citing or superseding-by-omission an applicable contradicting observation is an INTEGRITY finding (`execution-evidence.md` §11). |
| K2 exclusion needs an independent ref | An observation may leave the comparison only by an **exclusion with a named independent ref**: an independent reviewer's finding or a `PD-n` ruling (§10) that states why it does not bind — wrong subject, outside the sourced window, superseded by a re-measurement of the same subject. The excluded observation stays on the row, marked excluded, with that ref. The producer of an observation never excludes its own. |
| K3 resolution is a new measurement | A conflict resolves by acquiring NEW applicable evidence, or by an exclusion under K2 — never by choosing the newer file, the higher attempt number, the CLEAN one or the convenient one. |
| K4 conflict ≠ integrity | Two honest measurements disagreeing is a normal outcome of the world, not misconduct. It holds work; it does not route to the human as an integrity finding unless something claimed an observation it did not make. |

---

## 6. What a support change does to the run

The whole point of separating effects from support: **support changes forward, not backward.**

| Rule | Statement |
|---|---|
| S1 completed effect receipts are unchanged | A completed attempt's `result.md`, its inputs/raw/normalized bytes and its recorded effect stand exactly as written when a premise later changes. Nothing is edited, re-hashed, relabelled, retracted or deleted. The record of what happened is not a claim that it should have happened. |
| S2 hold affected NEW work | Every named task consumer not yet dispatched is HELD while the row reads `refuted`, `conflicted`, `inapplicable` or `unresolved`. The hold is recorded in the row's held-consumers column with the date and the state that caused it. |
| S3 hold affected GRADES | Every named AC consumer's grade is stale: a grade that read the premise as supported may not stand as current once the row changes. It is retained as history and marked stale — never overwritten, never re-labelled with new hashes (`execution-evidence.md` §11). |
| S4 unrelated eligible work stays distinct and CONTINUES | A task that names this premise among its consumers is held. A task that does not is unaffected and proceeds. A premise change is not a run-wide stop, and a run-wide stop is not how a premise change is recorded. Eligibility is per named consumer, one row at a time. |
| S5 renewed support ⇒ FRESH affected grade | When the row returns to `supported`, the held consumers become eligible again and every affected AC gets a **new** grade attempt — new reserved number, new prompt tag, new grade-inputs snapshot (`execution-evidence.md` §1 A5, §2). The prior verdict is retained as history. **Restoring support never restores the old PASS.** |
| S6 in-flight work is a request until observed | A stop request against work already dispatched is recorded as a REQUEST. Until the stage's actual outcome is observed, its effect state is `unknown` and is reconciled (§7) before any dependent dispatch. A stop that was requested is not a stop that happened. |
| S7 restoration has its own authority | Undoing or restoring an effect produced under a since-refuted premise is NEW work with its own scope and its own authority — never an automatic consequence of the row flipping, never covered by the authority that produced the original effect. |
| S8 counters do not reset | Repair budgets, fix-dispatch charges and attempt counters are cumulative across support changes (`execution-evidence.md` §1 A2). A premise flip is not a fresh start. |

---

## 7. Replay authority — the `RetryPermit`

`execution-evidence.md` §7 R4 states the rule (no automatic replay). This is the applicability side:
who may issue the permit, on what, and why the script cannot decide it.

**A workflow script cannot inspect journals.** `retryMissing` runs INSIDE the workflow, which has no
`import` and no filesystem (SKILL rule 7), so it cannot read `<transcriptDir>/journal.jsonl` and cannot
distinguish an API failure from a deliberate user skip from a cap kill. It therefore does not decide
whether a retry is warranted — it only enforces a decision the orchestrator already recorded and passed
in `args`. The previous speculative behavior (re-dispatch any non-paid `null` before the journal has been
read) is REMOVED: it re-offered work a user had skipped and re-ran stages whose effect was unknown.

| Field | Meaning |
|---|---|
| `decision` | `'allow'` or `'hold'` — the orchestrator's recorded decision, made outside the run |
| `evidencePath` | locator of the reconciliation that supports it: the journal read, the audit artifact, the ledger entry. `allow` without a locator is an unsupported authority claim |
| `reversible` | the slice's effect can be undone or safely repeated |
| `unpaid` | the slice spends nothing and consumes no one-shot resource |
| `userSkip` | the null came from a deliberate user skip — a decision, not a failure |

| Outcome | Condition |
|---|---|
| **retry** | `decision: 'allow'` AND a non-empty `evidencePath` AND `reversible` AND `unpaid` AND NOT `userSkip` AND the slice is not `paid` AND allowance remains |
| **HOLD to the orchestrator** | permit missing; `decision: 'hold'`; `allow` with no `evidencePath`; not reversible; not unpaid; `userSkip: true`; a paid/one-shot slice; malformed permit |

A HOLD is returned to the orchestrator with its reason — it is not an error the run repairs and not a
gap the run bails on silently. The orchestrator reconciles against the journal, records the effect state
(`none` / `observed` / `unknown`) and either issues a permit for a NEWLY RESERVED attempt or escalates.

| Rule | Statement |
|---|---|
| R1 marker ≠ authority | A `transport:` marker (SKILL rule 11) is EVIDENCE that a stage threw. It is not replay authority. Under this protocol the one auto-resume it licenses still requires the permit; the marker is at most the `evidencePath` an `allow` cites. |
| R2 unknown holds | Unknown completion or unknown effect is HELD and reconciled — never resolved by re-running the stage to see what happens. Re-running is how an unknown effect becomes two effects. |
| R3 user skip is a decision | A user skip is honored. Re-offering skipped work overrides the user; the permit's `userSkip` flag exists so a script cannot do it by accident. |
| R4 paid / irreversible / restoration | Each needs its own explicit, scoped authorization naming target and ceiling — never a blanket grant, never inherited from the first run's authority, never minted by a permit (SKILL → Paid/irreversible §4; `execution-evidence.md` §7 R4). A second paid run is a decision, not a retry. |
| R5 a retry is a NEW attempt | An allowed retry dispatches a newly reserved attempt with its own bound prompt (`execution-evidence.md` §1 A2/A5), never the dead attempt's prompt re-sent at its old identity. |

---

## 8. Effects and their state

Effect state is the evidence contract's field (`execution-evidence.md` §7 R5); the applicability rules on
it are:

- an effect recorded `observed` stays observed forever — a later `refuted` premise does not un-happen it (S1);
- an effect recorded `unknown` blocks every dependent dispatch until reconciled, whatever the premise says;
- a premise flip never rewrites an effect's state. Only a new observation does.

---

## 9. Contract change classification — use the existing one

A premise change frequently implies a contract change. The classification for that already exists and is
shared with Create: `team-kit-create/references/approval.md` → **Classify changes before asking** and
**Approval is separate from verification**. This contract adds no second gate and no new category.

| From that table | Applied here |
|---|---|
| Identical content | reuse the recorded approval; the row's evidence refs still stand |
| Editorial (unchanged claim) | record the changed snapshot and why meaning is unchanged; **still stales every hash** — refresh affected checks and regrade a changed acceptance contract. No new user approval |
| Implementation choice within existing authorization | record method + rationale, verify it; do not ask again |
| Material change outside existing authorization — outcome, scope, tradeoff, exclusion, acceptance threshold, cost/external action, autonomy | present ONLY that delta and wait; independent authorized work continues (S4) |
| Evidence contradicts a premise under an approved decision | name the exact `P-*` and the linked decision; ask only if the decision now needs a material choice. A corrected incidental fact does not erase unrelated approval |

**A weakened consumer set is a MATERIAL change, whatever it is labelled.** Removing or narrowing a task
consumer, an AC consumer, a premise, an obligation, an exclusion or a gate changes what the run is
required to satisfy — it is an acceptance-threshold change by definition and can never pass as editorial,
as a "cleanup", as a "clarification" or as an implementation detail. The independent reviewer checks
consumer-set completeness against the prior recorded set for exactly this (`execution-evidence.md` §2 →
`team-spec-reviewer`); a claimed-editorial revision that drops a consumer is REJECTED as misclassified.

Unchanged and not softened by any of the above: **an agent graded by a file never edits that file.** The
classification decides whether a needed contract change is a human decision or a recorded reconciliation;
it never decides who may write. Writers do not touch `definition-of-done.md`, `requirements.md`,
`team-plan.md`, `design.md` or `map.md` — that stays an INTEGRITY finding (`execution-evidence.md` §11).

---

## 10. `PD-n` rulings — the existing row, three added refs

`PD-n` keeps its four mandatory clauses (SKILL → Orchestrator rulings): the measurement that forced it,
the alternatives rejected, what it does NOT license, and the grader instruction to re-verify the intent.
A ruling that touches a premise carries three more references on the SAME row — no new ledger:

| Added ref | Content |
|---|---|
| affected premise / consumer / attempt | the `P-*` ids, the exact task and AC consumers, and the exact attempt records affected |
| change classification | the §9 row this ruling asserts, stated so it is falsifiable |
| authorization locator | for anything paid, irreversible, restorative, or outside existing authorization — the exact grant, its target and its ceiling. Absent ⇒ the ruling does not license it |

A ruling may not: mint replay or restoration permission (§7 R4), lower a blocking AC's intent, erase a
recorded failure, delete a contradiction (§5 K1), or re-classify a weakening as editorial (§9).

---

## 11. Planner handoff — only when execution depends on it

The plan declares a premise row **only when execution actually depends on the premise** — i.e. some named
task's work or some named AC's grade would change if the premise turned out false. If nothing in
execution depends on it, the assumption stays where it already lives (`map.md` **Premises** / the decision
ledger) and no execution row is created. Proportionality mirrors create's premise-minting rule: a
speculative row with no consumer is noise that a reviewer must then check.

When it does depend on one, the plan states, per premise: the `P-*` id, the linked decision, the exact
task consumers, the exact AC consumers, the subject, the predicate, and the sourced applicability policy
with its source. The lane-neutral obligation lives in the shared planner hooks
(`.claude/team-templates/PLANNER.md`, `.claude/agents/team-planner.md`); the Claude-only mapping onto
`build-state.md` rows, `args` and the run's holds lives in `SKILL.md` (Procedure 2/5, entry-mode-1).

`P-*` ids are not re-minted, renumbered or re-scoped by the run. Execution evidence that CONTRADICTS a
`map.md` premise under a ratified decision is a **premise strike** and is presented to the human exactly
as create presents one (`team-kit-create/references/discovery.md` → Standing lens) — reopening a ratified
decision is human-only and is never silently absorbed into a build-state row.

---

## 12. Template — the build-state block

Two tables, appended to the existing `build-state.md`. Never a separate file.

```markdown
## Execution premises

| P-id / decision | Domain owner | Acquisition producer | Task consumers | AC consumers | Subject | Predicate | Policy (+ source) | Evidence refs | State | Held consumers | Exclusion / ruling refs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P-2 queue-supports-delay / D-4 | team-verifier | T-4-probe att 2 | T-7, T-9 | AC-3 | bullmq 5.x on <env> | delayed jobs survive restart | binds until the lockfile hash changes — vendor doc <locator> | `.../t4-probe/2/result.md` (sha …); excluded: `.../1/result.md` (sha …) | supported | none | exclusion: `spec-review-2.md:41` — attempt 1 measured a different redis |

## Premise holds

| Held consumer | Premise | Held since | Cause state | Released by |
|---|---|---|---|---|
| AC-3 grade | P-2 | 2026-01-04 gate 3 | conflicted | — |
```

A row whose Policy column has no source reads `unresolved` (§4 F3). A row citing only the observations
that agree with it is incomplete (§5 K1).
