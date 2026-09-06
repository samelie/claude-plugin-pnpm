---
name: pnpm-workspace-filter
description: "Run lint, types, test, or knip on changed pnpm workspace packages and fix errors. Triggers: lint, eslint, lint:fix, formatting, unused imports, types, typecheck, type error, tsc, test, vitest, jest, test failure, knip, unused exports, unused dependencies, dead code."
context: fork
agent: pnpm-workspace-filter
model: opus
---

# pnpm-workspace-filter

Run a pnpm script on changed workspace packages and fix errors.

## Package Resolution

1. `git diff --name-only HEAD` + `--cached` + `git ls-files --others --exclude-standard`
2. For each changed file, walk up to nearest `package.json`
3. Read the `name` field from each unique `package.json`
4. Run the target command for each
5. If no changed files and no args provided, ask user which package

## Commands

| Target | Script | Command |
|--------|--------|---------|
| `lint` | `lint:fix` | `pnpm -F "<name>" lint:fix` |
| `types` | `types` | `pnpm -F "<name>" types` |
| `test` | `test` | `pnpm -F "<name>" test` |
| `knip` | `knip` | `pnpm -F "<name>" knip` |

Determine target from user input or caller context. Default to `lint` if ambiguous.

---

## Fix Strategy: lint

- Remove unused imports/variables/code entirely — no dead code
- Fix root cause > `eslint-disable` comments
- Import ordering: built-in > external > internal > parent > sibling > index > object > type
- Sort members alphabetically within groups
- Prefix genuinely-needed-but-unused params with `_`
- Never suppress warnings without clear justification

## Fix Strategy: types

- Root-cause first — understand data flow before touching types
- Never `any` (use `unknown` only if truly necessary)
- Avoid `as` casts; use type guards + discriminated unions
- Use utility types: `Partial`, `Pick`, `Omit`, `Record`
- Functional TS: no classes, no enums -> `as const` POJOs, union types
- Don't create redundant/duplicate types; find existing ones first
- No `@ts-ignore`/`@ts-expect-error` without explanation

## Fix Strategy: test

- Understand failure root cause before fixing
- Fix the implementation, not the test (unless test expectation is wrong)
- Never weaken assertions to make tests pass
- Never add mock/stub data outside test files
- If test is outdated/wrong, fix the test but document why

## Fix Strategy: knip

### Pre-Fix Step

BEFORE any fixes, read the workspace's `knip.config.ts` (understand existing ignores).

### Fixing

- Categorize each finding: real unused vs false positive
- **Real unused** -> delete exports, files, dependencies entirely
- **False positive** -> add to `ignoreDependencies`/`ignore`/`ignoreUnresolved` with WHY comment in knip config
- Common FP patterns: build tool entries (unbuild/tsup), CLI deps, framework globals (`vitest/globals`), Prisma/codegen, platform-conditional code, monorepo internal deps
- If many FPs -> likely misconfigured entry points; check framework detectors
- Never ignore without justification comment

---

## Iteration

Run -> fix -> re-run until clean (0 errors / green tests).

## Critical Rules

- Never add eslint-disable / @ts-ignore without justification
- Investigate before deleting
- No `any`, no classes (types target)
- No weakened assertions, no stubs in non-test code (test target)
- Leave changes uncommitted for caller to review
