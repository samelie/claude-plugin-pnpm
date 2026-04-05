---
name: workspace-fix
description: "Fix lint, types, test, or knip errors in a single pnpm workspace package. Triggers: workspace fix, fix package, package lint, package types"
---

# /workspace-fix <target> <package>

Fix errors of a specific type in a single pnpm workspace package.

## Targets

| Target | Strategy |
|--------|----------|
| `lint` | Run `pnpm -F "<pkg>" lint:fix`, then `pnpm -F "<pkg>" lint` to verify. Fix remaining errors manually. |
| `types` | Run `pnpm -F "<pkg>" types`, read errors, fix each. Iterate until clean. |
| `knip` | Run `pnpm -F "<pkg>" knip`, evaluate findings (many false positives). Only remove genuinely unused code. |
| `test` | Run `pnpm -F "<pkg>" test`, read failures, fix each. Iterate until passing. |

## Workflow

1. **Identify package** — use the provided package name/path
2. **Run initial check** — execute the target command, capture output
3. **Parse errors** — extract file, line, message from output
4. **Fix iteratively**:
   - Read the file with the error
   - Understand the context
   - Apply the fix
   - Re-run the check
   - Repeat until clean or max iterations (5)
5. **Report** — STATUS with error count

## Rules

- Fix one error type at a time — don't scope-creep
- Read code before fixing — understand context
- Match existing patterns — don't introduce new conventions
- For knip: be skeptical of false positives (see team-verifier agent docs)
- Max 5 fix iterations per package — if still failing, report ERRORS_REMAINING

## STATUS Protocol

End with:
- `STATUS: CLEAN` — all errors fixed
- `STATUS: ERRORS_REMAINING: <count>` — <count> errors remain after max iterations
