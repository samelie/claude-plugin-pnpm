# Team Template: Debug Investigation

> Systematic root-cause-first debugging for complex, multi-component bugs (no fixes before evidence).

---

```yaml
name: "debug-{issue-slug}"
version: 2
description: "Root cause investigation and fix for {issue}"
packages: ["{affected-packages}"]
phases: 2
dispatch: agent-tool   # lead dispatches subagents via the Agent tool (interactive, human-gated)
```

---

## How the lead runs this

The lead orchestrates via the **Agent tool** (plain `subagent_type` dispatch — interactive, human-gated; no TeamCreate/delegate). Dispatch each agent, read its returned artifact + STATUS line, gate the phase, then dispatch the next. You are lead — orchestrate and gate phases only. Do NOT investigate or fix.

Session dir: the session-start hook creates `team-session/`; use `team-session/YYYYMMDD-debug-{issue-slug}/` and pass the ABSOLUTE path into every dispatch.

## Team Structure

| Name | subagent_type | Model | Role | Phase |
|------|--------------|-------|------|-------|
| lead | (you) | opus | Orchestrate, gate phases | all |
| investigator | team-investigator | opus | Root cause investigation | 1 |
| scout | team-researcher | opus | Evidence gathering | 1 |
| fixer | team-coder | sonnet | Implement fix | 2 |
| verifier | team-verifier | sonnet | Confirm fix | 2 |

## Phases

### Phase 1: Investigation (Parallel)

**Goal:** Identify root cause with evidence.

**Agents:** investigator + scout (parallel)

**Gate:** Root cause documented in `root-cause.md` with:
- Clear cause statement
- Supporting evidence
- Recommended fix approach

### Phase 2: Fix (Sequential)

**Goal:** Implement and verify fix.

**Agents:** fixer → verifier (sequential)

**Gate:** All checks pass, fix verified

---

## Tasks

### T1: Evidence Gathering (scout)

```yaml
id: T1
title: "Gather diagnostic evidence across components"
agent: scout
phase: 1
blockedBy: []
acceptance:
  - Diagnostic logs captured in evidence/
  - Component boundaries identified
  - Data flow traced
```

### T2: Root Cause Investigation (investigator)

```yaml
id: T2
title: "Investigate root cause through systematic debugging"
agent: investigator
phase: 1
blockedBy: []
acceptance:
  - investigation.md complete
  - patterns.md complete  
  - hypotheses.md with confirmed hypothesis
  - root-cause.md with clear cause + evidence
```

### T3: Implement Fix (fixer)

```yaml
id: T3
title: "Implement fix for identified root cause"
agent: fixer
phase: 2
blockedBy: [T2]
acceptance:
  - Failing test created first
  - Single fix addressing root cause
  - No unrelated changes
```

### T4: Verify Fix (verifier)

```yaml
id: T4
title: "Verify fix resolves issue"
agent: verifier
phase: 2
blockedBy: [T3]
acceptance:
  - New test passes
  - No regression in existing tests
  - Lint/types clean
```

---

## File Ownership

| Agent | Files |
|-------|-------|
| investigator | `team-session/{team-name}/investigation.md`, `patterns.md`, `hypotheses.md`, `root-cause.md` |
| scout | `team-session/{team-name}/evidence/**` |
| fixer | Source files identified in root-cause.md |
| verifier | None (read-only) |

---

## Lead Orchestration Checklist

```
Phase 1: Investigation
[ ] 1. Ensure session dir team-session/YYYYMMDD-debug-{issue}/ (hook-created); write prompt.md (the issue)
[ ] 2. Dispatch scout (Agent subagent_type: team-researcher) with T1 AND
       investigator (Agent subagent_type: team-investigator) with T2 — send both in ONE message (parallel)
[ ] 3. Both return; read root-cause.md — is cause clear with evidence?
[ ] 4. If unclear: re-dispatch investigator with feedback, or ask user, before Phase 2

Phase 2: Fix
[ ] 5. Dispatch fixer (Agent subagent_type: team-coder) with T3 (reads root-cause.md)
[ ] 6. fixer returns; dispatch verifier (Agent subagent_type: team-verifier) with T4
[ ] 7. verifier returns; if STATUS ERRORS_REMAINING → re-dispatch fixer with the feedback
[ ] 8. All clean → report success to user
```

---

## Agent Prompts

### Scout Prompt

```
You are scout for team "{team-name}".

Your task: T1 — Gather diagnostic evidence

Instructions:
- Read the issue description in team-plan.md
- Identify component boundaries in the affected system
- Add diagnostic instrumentation to trace data flow
- Capture logs/output to team-session/{team-name}/evidence/
- Document what you find — don't analyze, just gather

Report to lead when evidence collected.

STATUS: CLEAN when evidence gathered, PARTIAL if blocked.
```

### Investigator Prompt

```
You are investigator for team "{team-name}".

Your tasks: T2 — Root cause investigation

Instructions:
- Read team-session/{team-name}/team-plan.md for context
- Follow your systematic phases exactly (investigation → patterns → hypotheses; no fixes before evidence)
- Write to investigation.md, patterns.md, hypotheses.md
- When root cause confirmed, write root-cause.md
- Do NOT propose code fixes — describe what fixer should do

Report to lead when root cause identified.

STATUS: CLEAN when root cause documented, PARTIAL if still investigating.
```

### Fixer Prompt

```
You are fixer for team "{team-name}".

Your task: T3 — Implement fix

Instructions:
- Read team-session/{team-name}/root-cause.md
- Create failing test FIRST
- Implement single fix addressing root cause
- No unrelated changes or "while I'm here" improvements
- Run tests to verify fix works

Report to lead when fix implemented.

STATUS: CLEAN when fix complete + tests pass, PARTIAL if blocked.
```

### Verifier Prompt

```
You are verifier for team "{team-name}".

Your task: T4 — Verify fix

Instructions:
- Read team-session/{team-name}/root-cause.md for context
- Run full test suite on affected packages
- Run lint and type checks
- Verify the specific issue is resolved
- Check for regressions

Report findings to lead.

STATUS: CLEAN when all checks pass, ERRORS_REMAINING: {N} if issues found.
```

---

## Escalation: 3+ Failed Hypotheses

If investigator reports 3+ rejected hypotheses:

1. **STOP Phase 1**
2. Review hypotheses.md — is this an architectural problem?
3. Discuss with user before continuing
4. May need to pivot to refactoring team instead of debug team

---

## Session Folder Structure

```
team-session/YYYYMMDD-debug-{issue}/
├── team-plan.md         # This template filled in
├── investigation.md     # Phase 1: error analysis, repro, changes
├── evidence/            # Diagnostic logs, screenshots
├── patterns.md          # Phase 2: working vs broken comparison
├── hypotheses.md        # Phase 3: theory log
├── root-cause.md        # Confirmed cause + recommended fix
└── verification.md      # Phase 4: verifier output
```
