# Team Template: Debug Investigation

> Systematic debugging for complex, multi-component bugs.
> Methodology adapted from [obra/superpowers](https://github.com/obra/superpowers)

---

```yaml
name: "debug-{issue-slug}"
version: 1
description: "Root cause investigation and fix for {issue}"
packages: ["{affected-packages}"]
phases: 2
delegate_mode: true
plan_approval_default: true
task_claim: lead-assigned
```

---

## Spawn Prompt

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/debug-investigation.md`.
Create a team named "YYYYMMDD-debug-{issue-slug}" using TeamCreate.
Press Shift+Tab to enable delegate mode.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT investigate or fix.
```

## Team Structure

| Name | subagent_type | Model | Role | Phase |
|------|--------------|-------|------|-------|
| lead | (you) | opus | Orchestrate, gate phases | all |
| investigator | claude-plugin-pnpm:team-investigator | opus | Root cause investigation | 1 |
| scout | claude-plugin-pnpm:team-researcher | opus | Evidence gathering | 1 |
| fixer | claude-plugin-pnpm:team-coder | sonnet | Implement fix | 2 |
| verifier | claude-plugin-pnpm:team-verifier | sonnet | Confirm fix | 2 |

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
[ ] 1. TeamCreate with name "YYYYMMDD-debug-{issue}"
[ ] 2. TaskCreate for T1, T2 (no blockedBy)
[ ] 3. Spawn scout with T1
[ ] 4. Spawn investigator with T2
[ ] 5. Wait for both to complete
[ ] 6. Review root-cause.md — is cause clear with evidence?
[ ] 7. If unclear: request clarification before Phase 2

Phase 2: Fix
[ ] 8. TaskCreate for T3 (blockedBy: [T2])
[ ] 9. TaskCreate for T4 (blockedBy: [T3])
[ ] 10. Spawn fixer with T3
[ ] 11. Wait for fixer to complete
[ ] 12. Spawn verifier with T4
[ ] 13. Wait for verifier to complete
[ ] 14. If verifier reports issues: loop fixer
[ ] 15. All clean → report success
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
- Follow debug-session skill exactly
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
