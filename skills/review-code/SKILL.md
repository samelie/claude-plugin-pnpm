---
name: review-code
description: "Structured code review checklist for quality, security, and correctness. Triggers: review code, code review, review changes, review implementation"
---

# /review-code

Perform a structured code review on recently changed files.

## Review Checklist

### 1. Correctness
- Does the code do what the requirements/design specify?
- Are edge cases handled?
- Are error paths handled correctly?
- Do types match the data flow?

### 2. Security
- Input validation at system boundaries?
- No injection vectors (SQL, XSS, command)?
- No hardcoded secrets or credentials?
- Auth/authz checks in place where needed?

### 3. Patterns & Conventions
- Does the code match existing codebase patterns?
- Are naming conventions followed?
- Is the code organized like similar modules?
- Are imports organized consistently?

### 4. Maintainability
- Is the code readable without excessive comments?
- Are abstractions appropriate (not premature, not missing)?
- Is coupling between modules reasonable?
- Would a new developer understand this code?

### 5. Performance
- Any obvious O(n²) or worse in hot paths?
- Unnecessary allocations or copies?
- Missing early returns or short-circuits?

## Steps

1. **Identify changed files** — from coder progress reports or `git diff`
2. **Read each file** — understand the full context, not just the diff
3. **Apply checklist** — evaluate each section systematically
4. **Classify findings**:
   - **Critical** — must fix before merge (bugs, security, data loss)
   - **Warning** — should fix (patterns, maintainability)
   - **Suggestion** — nice to have (style, minor improvements)
5. **Write review** — structured output with file, line, category, description, fix

## Rules

- Be specific — cite files and line numbers
- Don't manufacture issues — if code is good, say so
- Focus on what matters, not style nitpicks
- One finding per issue, not one finding per file
