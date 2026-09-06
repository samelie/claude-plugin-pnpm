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
│   └── progress.md          ← team-coder (each coder gets own folder)
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
    └── build-state.md        ← lead/orchestrator (execution AC ledger — pending/passed/failed/needs-human per AC, rolled up from validation-report.md)
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
| team-designer (clarify) | (prompt only) | `designer/clarify.md` |
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

## Template Ownership (drift guard — NO content templates in this file)

Each artifact's content template lives ONCE, in its WRITER's always-loaded definition. This file owns WHERE files go and WHO reads/writes them — never WHAT's inside. Update the writer's file, not this one.

| Artifact | Canonical template |
|----------|--------------------|
| `prompt.md` | `skills/team-kit-create/SKILL.md` → Step 0b |
| `map.md` | `skills/team-kit-create/SKILL.md` → Step 0c (ledger duty during discovery: `skills/team-kit-create/references/discovery.md`) |
| `designer/{clarify,explore,present,discovery}.md`, `requirements.md` | `agents/team-designer.md` → per-phase File format |
| `researcher/research-findings.md` | `agents/team-researcher.md` → §1-§7 contract (stable § numbers — downstream cites `research-findings.md §N`) |
| `design.md` | `agents/team-planner.md` → design.md required sections |
| `team-plan.md` | `agents/team-planner.md` (section list) + `PLANNER.md` + `FRAMEWORK.md` → Task Definition Format |
| `definition-of-done.md` | `DEFINITION-OF-DONE.md` (this dir) — AC fields: id/statement/maps_to/kind/verify/blocking |
| `tester/test-plan.md`, `tester/test-results.md` | `agents/team-tester.md` → Report early / test-plan skeleton |
| `goal-auditor/sat.md` | `agents/team-goal-auditor.md` → Phase `sat` row spec (AC / passing state / produced by / preconditions / forbidden? / counterfeit?) |
| `goal-auditor/goal-audit.md` | `agents/team-goal-auditor.md` → Report Format |
| `plan-review.md` | `agents/team-plan-reviewer.md` → Report Format |
| `coder-{name}/progress.md` | `agents/team-coder.md` → Writing Your Output |
| `build-state.md` | `skills/team-kit-run/SKILL.md` → Procedure step 5 (AC ledger: AC id → pending/passed/failed/needs-human + grader + verdict; done = every blocking AC `passed` + mechanical gates green; re-read each gate, never trust recollection) |

Writing style for ALL artifacts: `team-session-writing` skill (compression rules only — no templates there either).

## Using This Schema

Every team agent prompt MUST include:

```markdown
## Session Path

Session path: `team-session/{team-name}/`

Read schema: `${CLAUDE_PLUGIN_ROOT}/team-templates/SESSION-SCHEMA.md`
Write your output to: `{session_path}{your-folder}/`
```

Agents use `write-findings` and `read-findings` skills for I/O.
