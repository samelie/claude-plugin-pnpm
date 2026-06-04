# SAVED-WORKFLOW-RECIPE.md — Converting templates → saved `/command` workflows

How to turn the 5 standalone `team-templates/*.md` into tier-1 reproducible saved workflows (`/<name>`), executed by the native Workflow runtime via `/team-kit-run` patterns. Source of truth for rules: `../WORKFLOW-MERGE-PLAN.md` + `../skills/team-kit-run/SKILL.md` + `SCHEMA-CATALOG.md`.

> **Validation gate:** every mutating saved workflow MUST get a supervised first run (human present, `/workflows` open with `x` ready) before it's trusted. Do NOT auto-create + run mutating workflows unattended. Scripts shipped here start as NEEDS-VALIDATION.

## Where saved workflows live

Project (shared/committed): `.claude/workflows/<name>.js` at the REPO ROOT. Becomes `/<name>`. Project wins name collisions over `~/.claude/workflows/`. (Confirm hand-placed files auto-register vs requiring the `/workflows` → `s` save flow during the supervised pass.)

## Universal shape

```js
export const meta = { name: '<name>', description: '...', phases: [{ title: '...' }] }
// args = parameters passed at invocation. NO Date.now/Math.random/import (they throw / unavailable).
// Knowledge/discovery → DEFAULT agent (ToolSearch→MCP). Execution → custom agentType.
// Writes: single-writer (serial) or propose-then-apply. team-session/ artifact writes parallel-safe (disjoint).
// Schemas: inline the canonical shapes from SCHEMA-CATALOG.md.
```

## Per-template conversion + safety class

| Template | Shape | Write model | Safety class | Gate / exclude |
|----------|-------|-------------|--------------|----------------|
| **monorepo-health** | discover changed pkgs (read) → sequential lint→types→knip→test, parallel-per-pkg fix | single-writer per package (disjoint) | LOW (scoped to git-changed pkgs; CLEAN if none) | none — exemplar below |
| **monorepo-deep-clean** | same as health but ALL packages | single-writer per package | MED (whole-repo edits) | supervised first run; large blast radius |
| **knip-config-audit** | discover ~146 knip.config.ts → propose edits → verify `pnpm -F knip` exit 0 | propose-then-apply | MED (edits configs + package.json deps) | DEFER `pnpm install` to ONE final lead step; never auto-install per-agent |
| **debug-investigation** | P1 investigate (parallel, READ-ONLY) → gate → P2 fix (single-writer) | read → single-writer | LOW-MED (P2 writes a fix) | P1 fully safe; P2 fix behind the root-cause gate |
| **migrate-monorepo-scripts** | consolidate + DELETE a dir + create remote repo | write + DESTRUCTIVE + EXTERNAL | **HIGH** | **DO NOT auto-author.** `gh repo create --public` (external) + `rm dir` + `pnpm install` are prod-gated human steps. Keep template-only or workflow with these steps EXCLUDED → human checklist. |

## Syntax check

Workflow scripts use top-level `await` + `return` — the runtime wraps the body in an async function. So `node --check <file>` **falsely** reports `SyntaxError: Illegal return` / `await is only valid in async functions…` (it parses the body as a standalone script/CJS, not the wrapped body). Do NOT use `node --check` to validate a workflow.

Correct local check — evaluate the body inside an `AsyncFunction` with the runtime's injected globals (replace `F` with the file path):

```sh
node -e "const fs=require('fs');let s=fs.readFileSync(F,'utf8').replace(/^export const meta/m,'const meta');new (Object.getPrototypeOf(async()=>{}).constructor)('agent','parallel','pipeline','phase','log','args','budget','workflow',s)"
```

Strips the `export` (illegal inside a function body), then constructs — but does NOT call — the async body. Exit 0 = parses clean; a real `SyntaxError` throws with a non-zero exit.

## Acceptance gate = re-run check exit code

For every write template, the workflow accept condition between propose/fix and "done" is the **exit code of the re-run check** (`pnpm -F <pkg> <check>` exit 0 / build / root check / test pass). Reuse `VerifyReport.failedGates` to re-run ONLY what failed.

## Exemplar

See `.claude/workflows/monorepo-health.js` (this repo root) — the LOW-risk reference implementation. Validate it on a supervised run, then clone its shape for deep-clean (all packages) and adapt knip/debug per the table. Leave migrate as template-only until a dedicated supervised session.
