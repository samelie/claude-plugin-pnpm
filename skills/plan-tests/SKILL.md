---
name: plan-tests
description: "Test strategy planning — analyze coverage gaps, design test plan, identify edge cases. Triggers: plan tests, test strategy, test coverage, test gaps"
---

# /plan-tests

Analyze existing test coverage and design a test strategy for new or changed code.

## Steps

### 1. Inventory existing tests
- Glob for test files: `**/*.test.{ts,tsx,js}`, `**/*.spec.{ts,tsx,js}`, `**/__tests__/**`
- Identify the test framework in use (vitest, jest, mocha, etc.)
- Read test config files if they exist

### 2. Map coverage
- For each changed/new source file, check if a corresponding test file exists
- Read existing tests to understand what's covered
- Identify the testing patterns used (unit, integration, e2e)

### 3. Identify gaps
- Source files with no test file
- Functions/exports with no test coverage
- Error paths not tested
- Edge cases not covered (null, empty, boundary values, concurrent access)

### 4. Design strategy
For each gap, determine:
- **What to test** — specific function, component, or flow
- **How to test** — unit, integration, or e2e
- **Test cases** — happy path + edge cases + error paths
- **Fixtures needed** — mock data, test doubles, setup/teardown

### 5. Prioritize
- Critical paths first (auth, data mutation, financial calculations)
- Then high-traffic paths
- Then edge cases
- Then nice-to-have coverage

## Output

Write a test plan with:
- Coverage summary table (file → has tests? → gaps)
- Prioritized list of tests to write
- Specific test cases per file
- Framework/pattern to follow (match existing)

## Rules

- Match existing test patterns — don't introduce a new framework
- Test behavior, not implementation details
- Include edge cases: null, empty, max values, concurrent operations
- Don't over-test — focus on what matters
