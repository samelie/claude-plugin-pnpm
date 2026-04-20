---
name: debug-session
description: "Use when encountering any bug, test failure, or unexpected behavior. Triggers: debug, bug, investigate, root cause, why is, broken, failing, not working, debug-session"
---

# Debug Session

> Methodology adapted from [obra/superpowers](https://github.com/obra/superpowers)

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

---

## Session Setup

Before starting, create debug session folder:

```bash
mkdir -p team-session/$(date +%Y%m%d)-debug-{issue-slug}
```

Replace `{issue-slug}` with kebab-case description (e.g., `auth-token-expired`, `queue-race-condition`).

All investigation artifacts go here. Persists across Claude Code sessions.

---

## The Four Phases

Complete each phase before proceeding to next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

Write findings to `team-session/{debug-folder}/investigation.md`

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components:**

   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   ```

   Save diagnostic output to `team-session/{debug-folder}/evidence/`

5. **Trace Data Flow**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

Write findings to `team-session/{debug-folder}/patterns.md`

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - If implementing pattern, read reference implementation COMPLETELY
   - Don't skim - read every line

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?

### Phase 3: Hypothesis and Testing

Write findings to `team-session/{debug-folder}/hypotheses.md`

Format each hypothesis:

```markdown
## Hypothesis {N}: {title}

**Theory:** I think {X} is the root cause because {Y}

**Test:** {minimal change to verify}

**Result:** CONFIRMED / REJECTED

**Evidence:** {what happened}
```

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis
   - DON'T add more fixes on top

### Phase 4: Implementation

Write findings to `team-session/{debug-folder}/solution.md`

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - MUST have before fixing

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time
   - No "while I'm here" improvements

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **If Fix Doesn't Work**
   - STOP
   - If < 3 attempts: Return to Phase 1
   - **If >= 3 attempts: Question architecture (see below)**

5. **If 3+ Fixes Failed: Question Architecture**

   Pattern indicating architectural problem:
   - Each fix reveals new shared state/coupling
   - Fixes require massive refactoring
   - Each fix creates new symptoms elsewhere

   **STOP and discuss with user before attempting more fixes**

---

## Red Flags - STOP and Return to Phase 1

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "One more fix attempt" (when already tried 2+)

**ALL of these mean: STOP. Return to Phase 1.**

---

## Quick Reference

| Phase | Key Activities | Output File |
|-------|---------------|-------------|
| 1. Root Cause | Read errors, reproduce, check changes, gather evidence | `investigation.md` |
| 2. Pattern | Find working examples, compare | `patterns.md` |
| 3. Hypothesis | Form theory, test minimally | `hypotheses.md` |
| 4. Implementation | Create test, fix, verify | `solution.md` |

---

## Team Escalation

For complex multi-component bugs, escalate to debug team:

```
As a team, debug {issue description}
```

This spawns:
- `team-investigator` — Phases 1-3
- `team-researcher` — Evidence gathering across components
- `team-coder` — Phase 4 implementation
- `team-verifier` — Confirm fix

All agents share `team-session/{team-name}/` folder.

---

## Session Folder Structure

```
team-session/YYYYMMDD-debug-{issue}/
├── investigation.md   # Phase 1 findings
├── evidence/          # Diagnostic logs, screenshots
├── patterns.md        # Phase 2 analysis
├── hypotheses.md      # Phase 3 theories + results
└── solution.md        # Phase 4 root cause + fix
```
