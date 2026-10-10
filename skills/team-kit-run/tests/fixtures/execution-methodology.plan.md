# SYNTHETIC team plan — execution-methodology fixture

> **SYNTHETIC FIXTURE. NOT A REAL PLAN.** Every task id, agent name, file glob, hash and acceptance
> criterion below is fabricated for `execution-methodology.test.mjs` and for the independent spec
> review of scenario **C6**. No team ever ran this plan; no agent was ever dispatched from it; no
> hash in it was computed from real bytes. It exists so the C6 obligation matrix has something to
> project, and so a deliberately defective projection has a correct control to fail against.
>
> **This fixture claims nothing about live Claude Workflow runtime behavior.** It is data.

Session (synthetic): `/SYNTHETIC/team-session/20260910-fixture/`
Epoch (synthetic, orchestrator-supplied): `e1`

## Protocol opt-in

This plan DECLARES the attempt-bound evidence protocol
(`.claude/skills/team-kit-run/references/execution-evidence.md`) and the premise-applicability
contract (`.claude/skills/team-kit-run/references/execution-premises.md`). Consequences a faithful
projection must carry:

- mode-1 fidelity review is **mandatory before dependent execution**, not optional;
- mechanical verification and semantic grade are **two explicit stages on two agent types**;
- `type: HITL` tasks are **excluded** from the executable graph onto the human checklist;
- every dependency edge is carried as an exact `{taskId, attempt, resultPath, sha256}` reference.

## autonomy

```
autonomy:
  maxReviewRounds: 2
  maxVerifyRounds: 2
  maxValidateRounds: 2
  globalFixCeiling: 2
```

Caps are the plan's; a run spends against them and never raises one.

## Tasks

Machine-readable. `result_sha256` values are SYNTHETIC placeholders standing in for the hash the
orchestrator would SELECT for that task's accepted terminal.

| task_id | agent_type | phase | owner | attempt | path_shape | files_owned | blockedBy | evidence_producer | type | result_sha256 |
|---|---|---|---|---|---|---|---|---|---|---|
| X-1-impl | team-coder | Implement | coder-alpha | 1 | directory | fixture/src/alpha/** | — | X-1-impl → coder-alpha/attempts/X-1-impl/1/result.md | AFK | 11111111111111111111111111111111111111111111111111111111111111a1 |
| X-2-verify | team-verifier | Validate | verifier | 1 | numbered-file:mech | — | X-1-impl | X-2-verify → verifier/mech-1.md | AFK | 22222222222222222222222222222222222222222222222222222222222222a2 |
| X-3-grade | team-goal-auditor | Grade | goal-auditor | 1 | numbered-file:grade | — | X-1-impl, X-2-verify | X-3-grade → goal-auditor/grade-1.md | AFK | 33333333333333333333333333333333333333333333333333333333333333a3 |
| X-4-live | team-coder | Implement | live-worker | 1 | directory | fixture/src/live/** | X-1-impl | X-4-live → live-worker/attempts/X-4-live/1/result.md | HITL | 44444444444444444444444444444444444444444444444444444444444444a4 |

`X-4-live` is `type: HITL` — a live, per-run-authorized observation. It is **excluded** from the
executable graph and parked on the human checklist; a projection that dispatches it autonomously has
invented an obligation the plan does not grant.

## Acceptance criteria

| ac | kind | blocking | maps_to | evidence |
|---|---|---|---|---|
| AX-1 | deterministic | true | X-2-verify | command + rc + suites/skips in `verifier/mech-1.md` |
| AX-2 | semantic | true | X-3-grade | independent grade record in `goal-auditor/grade-1.md` |
| AX-3 | deterministic | false | X-2-verify | advisory only |

**AX-2 is a blocking semantic AC.** It must map to a stage that is a DIFFERENT stage id from every
deterministic AC's stage, and whose `agent_type` is NOT `team-verifier`. Commands are the verifier's
evidence; they are never the grader's verdict. Collapsing the two is the historical failure this
fixture reproduces on purpose in the `semanticGradeOnVerifier` projection variant.

## Human checklist (excluded from the executable graph)

| item | why excluded |
|---|---|
| X-4-live | `type: HITL` — needs per-run live authority the plan does not carry |

## What a faithful projection owes

O1 stage coverage · O2 no invention · O3 HITL excluded · O4 agent_type parity ·
O5 dependency binding (the bound prompt carries exactly the blockedBy edges' selected hashes) ·
O6 grade stage distinct in id AND agent type from the mechanical verifier ·
O7 same-batch `files_owned` disjoint.

The obligation ids, their rules and the per-variant expected verdicts live in
`execution-methodology.cases.json` → `scenarios.C6`. The projections they are evaluated against live
in `execution-methodology.workflow.js` → `PROJECTIONS`.
