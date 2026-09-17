# Session Schema

> Canonical file system structure for team sessions. All agents MUST follow this schema.

## Session Root

```
team-session/{team-name}/
```

Where `{team-name}` = `YYYYMMDD-{slug}` (e.g., `20260424-vector-search`)

## File Structure

```
team-session/{team-name}/
│
├── [ORIGINAL REQUEST - persisted immediately, never modified]
├── prompt.md                ← lead (raw user request + initial context)
│
├── [DURABLE INDEX - living state; the resume point after /clear]
├── map.md                   ← lead (destination, notes) + team-designer (ledger, during discovery)
│
├── [DESIGNER PHASES - progressive refinement]
├── designer/
│   ├── clarify.md           ← team-designer (clarify phase, Q&A + resolved reqs)
│   ├── explore.md           ← team-designer (explore phase, reads clarify.md)
│   ├── present.md           ← team-designer (present phase, reads clarify + explore)
│   ├── discovery.md         ← team-designer (discovery phase, five-exit round log + decisions)
│   ├── frame-check.md       ← team-designer (frame-check phase — fog-drain, ONE fresh-context dispatch
│   │                          after discovery, before the planner; carries its own terminal STATUS line)
│   └── prototypes/          ← team-designer (discovery exit 3 — throwaway artifacts to react to)
│       └── {slug}.{ext}
│
├── [PLANNING PHASE - root level]
├── requirements.md          ← team-designer (write phase, updated by discovery phase)
├── design.md                ← team-planner (reads requirements.md + discovery.md)
├── team-plan.md             ← team-planner (reads requirements.md + discovery.md; ownership matrix carries disjoint globs)
├── definition-of-done.md    ← team-goal-auditor (define phase, acceptance contract — the stop condition)
├── plan-review.md           ← team-plan-reviewer
│
├── [ACCEPTANCE - goal-fidelity gate at the plan→execution seam]
├── goal-auditor/
│   ├── sat.md               ← team-goal-auditor (sat phase, one reachable passing state per blocking AC;
│   │                          NOT in the audit phase's read-set — travels with the sealed contract into run)
│   └── goal-audit.md        ← team-goal-auditor (audit phase, plan-vs-goal verdict)
│
├── [RESEARCH - subfolders by agent name]
├── researcher/
│   ├── research-findings.md          ← team-researcher (opening sweep, Step 4a)
│   └── research-findings-{id}.md     ← team-researcher (discovery exit 2 — one file per targeted question;
│                               distinct paths because the fan-out writes in parallel; named research-*
│                               to clear the subagent write guard — team-kit-run SKILL rule 16)
│
├── [EXECUTION - subfolders by agent name]
├── architect/
│   └── brief.md             ← team-architect (module deep-dive)
│
├── coder-{name}/
│   ├── progress.md          ← team-coder (each coder gets own folder)
│   └── attempts/            ← attempt-evidence protocol only (opt-in, see rule 6)
│       └── [{epoch}/]{task-key}/{attempt}/
│           ├── progress.md  ← the owning agent (early + durable, non-terminal)
│           ├── result.md    ← the owning agent (write-once terminal, immutable)
│           ├── inputs/      ← the owning agent (consumed snapshots)
│           ├── raw/         ← the owning agent (verbatim captures)
│           └── normalized/  ← the owning agent (derived values)
│
├── spec-reviewer/
│   └── spec-review-{task-id}.md  ← team-spec-reviewer
│
├── reviewer/
│   └── review-{task-id}.md  ← team-reviewer
│
├── tester/
│   └── test-plan.md         ← team-tester
│   └── test-results.md
│
├── security-auditor/
│   └── security-audit.md    ← team-security-auditor
│
├── verifier/
│   └── results.md           ← team-verifier
│
├── finisher/
│   └── cleanup-report.md    ← team-finisher
│
├── [DEBUGGING - root level]
├── investigation.md         ← team-investigator (phase 1)
├── patterns.md              ← team-investigator (phase 2)
├── hypotheses.md            ← team-investigator (phase 3)
├── root-cause.md            ← team-investigator (conclusion)
├── evidence/                ← team-investigator (raw output)
│   └── {timestamp}-{label}.txt
│
└── [VALIDATION + LEDGER]
    ├── validation-report.md ← team-verifier (phase N+2, per-AC grading vs definition-of-done.md)
    ├── build-state.md        ← lead/orchestrator (execution AC ledger — pending/passed/failed/needs-human per AC, rolled up from validation-report.md; under the attempt-evidence protocol it also carries attempt reservations + current evidence selection — same file, NOT a second ledger)
    └── runtime/             ← lead/orchestrator (attempt-evidence protocol only)
        ├── grade-inputs-{attempt}.md   ← orchestrator (immutable snapshot written BEFORE each grade attempt)
        ├── instructions-snapshot-{n}/  ← orchestrator (governing instruction bytes for the run)
        └── scripts/                    ← orchestrator (reviewed workflow script revisions, retained BEFORE overwrite/relaunch)
```

## Rules

### 1. Planning artifacts go to root

These files are read by ALL agents:
- `requirements.md` — WHAT (acceptance criteria)
- `design.md` — HOW (architecture)
- `team-plan.md` — TASKS (assignments)

Root level = high visibility, easy to find.

### 2. Agent output goes to `{agent-type}/`

Each agent writes to its own subfolder:
```
{session_path}{agent-type}/
```

Examples:
- `team-session/20260424-feature/researcher/research-findings.md`
- `team-session/20260424-feature/coder-alice/progress.md`
- `team-session/20260424-feature/verifier/results.md`

### 3. Multiple instances use `{agent-type}-{name}/`

When same agent type runs multiple times:
- `coder-alice/` — first coder
- `coder-bob/` — second coder
- `spec-reviewer/spec-review-T1.md` — one file per task

### 4. Read from known paths, write to your folder

| Agent | Reads | Writes to |
|-------|-------|-----------|
| lead | user request | `prompt.md` (root, once, never modified) |
| lead (phase boundaries) | `map.md` | `map.md` — destination after clarify, Notes, phase/plan/audit outcomes |
| team-designer (clarify) | first: frozen `prompt.md`; repeat: frozen `prompt.md` + `designer/clarify.md`; `map.md` only for named destination/ledger conflict | `designer/clarify.md` |
| team-designer (explore) | `designer/clarify.md` | `designer/explore.md` |
| team-designer (present) | `designer/clarify.md`, `designer/explore.md` | `designer/present.md` |
| team-designer (write) | all `designer/*.md` | `requirements.md` (root) |
| team-researcher | `requirements.md`, codebase, knowledge tools | `researcher/research-findings.md` |
| team-designer (discovery) | `requirements.md`, `prompt.md`, `map.md`, `designer/discovery.md`, NEW `researcher/research-findings*.md` per dispatch (prior rounds digested in discovery.md) | `designer/discovery.md`, `designer/prototypes/*` + updates `requirements.md` + `map.md` ledger |
| team-researcher (discovery exit 2) | ONE question from the round report | `researcher/research-findings-{id}.md` |
| team-planner | `requirements.md`, `researcher/research-findings*.md`, `designer/discovery.md`, `map.md` | `design.md`, `team-plan.md` (root) |
| team-plan-reviewer | `requirements.md`, `design.md`, `team-plan.md` | `plan-review.md` (root) |
| team-goal-auditor (define) | `prompt.md`, `requirements.md`, `team-plan.md` | `definition-of-done.md` (root) |
| team-goal-auditor (sat) | `definition-of-done.md`, `team-plan.md`, `design.md`, `requirements.md` (frozen/forbidden set) | `goal-auditor/sat.md` |
| team-goal-auditor (audit) | `prompt.md`, `definition-of-done.md`, `team-plan.md`, `map.md` **Destination + Out of scope ONLY** (fresh context; never `goal-auditor/sat.md`) | `goal-auditor/goal-audit.md` |
| team-architect | `design.md`, `team-plan.md` | `architect/brief.md` |
| team-coder | `design.md`, `team-plan.md`, `architect/brief.md` | `coder-{name}/progress.md` |
| team-spec-reviewer | `requirements.md`, coder output | `spec-reviewer/spec-review-{task-id}.md` |
| team-reviewer | coder output, spec-reviewer output | `reviewer/review-{task-id}.md` |
| team-tester | `design.md`, coder output | `tester/test-plan.md`, `tester/test-results.md` |
| team-verifier | all source files | `verifier/results.md`, `validation-report.md` (phase N+2) |
| team-finisher | coder output | `finisher/cleanup-report.md` |
| lead/orchestrator (execution) | `validation-report.md`, `verifier/results.md`, `definition-of-done.md` | `build-state.md` (AC ledger, re-read each gate) |
| lead/orchestrator (attempt allocation + selection) | `build-state.md`, the artifacts it selects | `build-state.md` reservation + current-evidence-selection rows; `runtime/grade-inputs-{attempt}.md`; `runtime/scripts/` retained script revisions |
| any agent under the protocol | its reserved input/dependency paths ONLY (passed in the dispatch) | its own reserved record — `{owner}/attempts/…/{attempt}/`, or `{owner}/{artifact}-{attempt}.md` plus its `{artifact}-{attempt}.inputs/` — nobody else's |
| audit owner (`team-verifier` via `auditEmpty`) | the producer's artifact + git diff of the producer's owned files | its OWN `{audit-owner}/attempts/…/{attempt}/result.md` — **never** the producer's artifact |

### 5. Phase gates check file existence

| After Phase | Required Files |
|-------------|----------------|
| Prompt | `prompt.md`, `map.md` (destination may be blank until clarify) |
| Planning | `requirements.md`, `design.md`, `team-plan.md`, `plan-review.md` |
| Acceptance | `definition-of-done.md`, `goal-auditor/sat.md` (a proportionality skip is still a one-line file), `goal-auditor/goal-audit.md` |
| Research | `researcher/research-findings.md` |
| Discovery | `designer/discovery.md`, updated `requirements.md`, `map.md` ledger current (no settled decision missing from **Decisions so far**) |
| Implementation | `coder-*/progress.md` for each assigned coder |
| Review | `spec-reviewer/spec-review-*.md`, `reviewer/review-*.md` |
| Finalization | `verifier/results.md`, `finisher/cleanup-report.md` |
| Validation | `validation-report.md`, `build-state.md` (every blocking AC resolved) |

Under the attempt-evidence protocol (rule 6) each required file above is checked at its **reserved
attempt path**, resolved from `build-state.md` — never by globbing the folder or taking the
highest-numbered filename.

### 6. Attempt-evidence paths (opt-in protocol — paths + ownership only)

A run whose `team-plan.md` declares the attempt-evidence protocol writes one record per dispatch under
its owner's folder instead of a single fixed file. **Content contract — every field, every duty:
`skills/team-kit-run/references/execution-evidence.md`. Nothing about record CONTENT is repeated here.**

| | |
|---|---|
| Directory shape | `{owner}/attempts/[{epoch}/]{task-key}/{attempt}/` — for owners whose evidence is a directory (coders, live workers; a measurement's `{task-key}` is its journey key — `measurer/attempts/[{epoch}/]{journey-key}/{attempt}/`, one per journey per dispatch) |
| Numbered-file shape | `{owner}/{artifact}-{attempt}.md` — for owners whose evidence is one file per attempt (`spec-reviewer/spec-review-{n}.md`, `reviewer/review-{n}.md`, `verifier/results-{n}.md`, `finisher/cleanup-report-{n}.md`, `goal-auditor/final-grade-{n}.md`, `goal-auditor/disposition-{n}.md`, `measurer/verification-plan-{n}.md`, `runtime/preflight-{n}.md`) |
| Numbered-file snapshot slot | `{owner}/{artifact}-{attempt}.inputs/` — sibling directory of the numbered file, same owner + artifact + attempt; where that owner copies consumed mutable bytes. The directory shape's equivalent is `{attempt}/inputs/`; every evidence-producing role has exactly one of the two. Reserved with its terminal, owner-local |
| Who resolves the path | The **orchestrator**, before dispatch, into `build-state.md`. That reservation is decisive. An agent never invents, shifts or guesses a path; a missing reservation is `STATUS: BLOCKED`, not a guess |
| `{attempt}` | A per-task monotonic integer, never reset or reused. `{n}` in one owner's filename is that task's own counter — not a shared round number |
| `[{epoch}/]` | Present only when the reservation includes it; the epoch is always a recorded field |
| Immutability | `result.md` (and the numbered-file equivalent) is write-once; its snapshot slot is immutable once written. Owner-local: an agent writes only under its own folder. Retained failed attempts are evidence — never deleted, edited or renumbered |
| Collision | Writing to a reserved-but-unconsumed path is an INTEGRITY finding routed to the human, never permission to overwrite |
| Script revisions | `runtime/scripts/{script-stem}.rev{k}.{ext}` — orchestrator-owned; each REVIEWED workflow script revision is retained there BEFORE it is overwritten or relaunched, SHA-256 in `build-state.md` |

**Latest pointers are not evidence.** The fixed unnumbered paths above — `coder-{name}/progress.md`,
`verifier/results.md`, `finisher/cleanup-report.md`, `reviewer/review-{task-id}.md`, `spec-reviewer/spec-review-{task-id}.md`,
`validation-report.md` — remain valid for runs that do not declare the protocol, and under it they may
persist only as a convenience pointer to the currently selected record. A pointer has no attempt
identity and is mutable: it may never be cited as a dependency, selected in `build-state.md`, or graded.

**No second ledger.** Reservations and the current evidence selection live in the existing
`build-state.md`. Do not add a parallel index, manifest or receipts file.

## Template Ownership (drift guard — NO content templates in this file)

Each artifact's content template lives ONCE, in its WRITER's always-loaded definition. This file owns WHERE files go and WHO reads/writes them — never WHAT's inside. Update the writer's file, not this one.

| Artifact | Canonical template |
|----------|--------------------|
| `prompt.md` | `skills/team-kit-create/SKILL.md` → Step 0b |
| `map.md` | `skills/team-kit-create/SKILL.md` → Step 0c (ledger duty during discovery: `skills/team-kit-create/references/discovery.md`) |
| `designer/{clarify,explore,present,discovery,frame-check}.md`, `requirements.md` | `agents/team-designer.md` → per-phase File format |
| `researcher/research-findings.md` | `agents/team-researcher.md` → §1-§7 contract (stable § numbers — downstream cites `research-findings.md §N`) |
| `design.md` | `agents/team-planner.md` → design.md required sections |
| `team-plan.md` | `agents/team-planner.md` (section list) + `PLANNER.md` + `FRAMEWORK.md` → Task Definition Format |
| `definition-of-done.md` | `DEFINITION-OF-DONE.md` (this dir) — AC fields: id/statement/maps_to/kind/verify/blocking |
| `tester/test-plan.md`, `tester/test-results.md` | `agents/team-tester.md` → Report early / test-plan skeleton |
| `goal-auditor/sat.md` | `agents/team-goal-auditor.md` → Phase `sat` row spec (AC / passing state / produced by / preconditions / forbidden? / counterfeit?) |
| `goal-auditor/goal-audit.md` | `agents/team-goal-auditor.md` → Report Format |
| `plan-review.md` | `agents/team-plan-reviewer.md` → Report Format |
| `coder-{name}/progress.md` | `agents/team-coder.md` → Writing Your Output |
| `{owner}/attempts/**`, attempt-numbered evidence files and their `.inputs/` slots, `runtime/grade-inputs-{attempt}.md`, `runtime/scripts/` retention, and `build-state.md`'s reservation + current-evidence-selection rows | `skills/team-kit-run/references/execution-evidence.md` — attempt identity, per-record fields, snapshot/lineage rules, reconstruction, write-denial fallback, named duties |
| `build-state.md` | `skills/team-kit-run/SKILL.md` → Procedure step 5 (AC ledger: AC id → pending/passed/failed/needs-human + grader + verdict; done = every blocking AC `passed` + mechanical gates green; re-read each gate, never trust recollection) |

Writing style for ALL artifacts: `team-session-writing` skill (compression rules only — no templates there either).

## Using This Schema

Every team agent prompt MUST include an absolute session path. The lead resolves `session_path` and
`repo_root` before dispatch; repo-relative paths in the schema tree above are display conventions only.

```markdown
## Session Path

Session path: `${session_path}` (absolute)

Read schema: `${repo_root}/.claude/team-templates/SESSION-SCHEMA.md`
Write your output to: `${session_path}/{your-folder}/`
```

Agents use `write-findings` and `read-findings` skills for I/O.
