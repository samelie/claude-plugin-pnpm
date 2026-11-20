# SAVED-WORKFLOW-RECIPE.md — Authoring saved `/command` workflows

How to turn a recurring team shape into a tier-1 reproducible saved workflow (`/<name>`), executed by the Workflow runtime via `/team-kit-run` patterns. Script API: code.claude.com/docs/en/workflows.md + the bundled `workflow-authoring` skill. Team-kit rules: `../skills/team-kit-run/SKILL.md` + `SCHEMA-CATALOG.md` (rationale: `../docs/teamkit-methodology.md`).

> **Validation gate:** every mutating saved workflow MUST get a supervised first run (human present, `/workflows` open with `x` ready) before it's trusted. Do NOT auto-create + run mutating workflows unattended. Scripts shipped here start as NEEDS-VALIDATION.

## Where saved workflows live

Project (shared/committed): `.claude/workflows/<name>.js` at the REPO ROOT. Becomes `/<name>`; hand-placed files register without the `/workflows` save flow (the three below appear in the session's command listing, 2026-10-11). Project wins name collisions over `~/.claude/workflows/`.

## Universal shape

```js
export const meta = { name: '<name>', description: '...', phases: [{ title: '...' }] }
// args = parameters passed at invocation. NO Date.now/Math.random/import (they throw / unavailable).
// Knowledge/discovery → DEFAULT agent, or research-side agentType (they carry ToolSearch+MCP globs, deferred). Execution → custom agentType.
// Writes: single-writer (serial) or propose-then-apply. team-session/ artifact writes parallel-safe (disjoint).
// Schemas: inline the canonical shapes from SCHEMA-CATALOG.md.
```

## Shipped saved workflows + safety class

| Workflow | Shape | Write model | Safety class | Gate / exclude |
|----------|-------|-------------|--------------|----------------|
| **`/monorepo-health`** | discover changed pkgs (read) → pkg×{lint,types,knip,test} read-only checks, `parallel()` in batches of `args.concurrency` (default 8), coverage-asserted → serial single-writer fix per failed check, only if `args.fix` | serial single-writer fix per failure | LOW (git-changed pkgs; report-only unless `args.fix`) | none — exemplar below |
| **`/monorepo-fix`** | same over ALL (or filtered) packages, batched | single-writer per package | MED (whole-repo edits) | report-only unless `args.fix`; supervised first run |
| **`/market-scout-onboard`** | brief.yaml → terms gate → recon → design → build → review → gates | single-writer | MED | deploy is a human checklist (`market-scout-site` skill) |

`debug-investigation.md` stays a template doc (gated mid-stream — root-cause gate before the fix). New shapes: classify by the same columns; anything DESTRUCTIVE or EXTERNAL (`rm` a dir, `gh repo create`, deploys, `pnpm install` into a fenced lockfile) is a prod-gated human step — exclude it from the script into a checklist; defer `pnpm install` to ONE final lead step, never per agent.

## Syntax check

Workflow scripts use top-level `await` + `return` — the runtime wraps the body in an async function. So `node --check <file>` **falsely** reports `SyntaxError: Illegal return` / `await is only valid in async functions…` (it parses the body as a standalone script/CJS, not the wrapped body). Do NOT use `node --check` to validate a workflow.

Correct local check — evaluate the body inside an `AsyncFunction` with the runtime's injected globals (replace `F` with the file path):

```sh
node -e "const fs=require('fs');let s=fs.readFileSync(F,'utf8').replace(/^export const meta/m,'const meta');new (Object.getPrototypeOf(async()=>{}).constructor)('agent','parallel','pipeline','phase','log','args','budget','workflow',s)"
```

Strips the `export` (illegal inside a function body), then constructs — but does NOT call — the async body. Exit 0 = parses clean; a real `SyntaxError` throws with a non-zero exit. Then run the advisory structural lint `node .claude/scripts/validate-workflow.mjs <file>`.

## Acceptance gate = re-run check exit code

For every write template, the workflow accept condition between propose/fix and "done" is the **exit code of the re-run check** (`pnpm -F <pkg> <check>` exit 0 / build / root check / test pass). Reuse `VerifyReport.failedGates` to re-run ONLY what failed.

## Exemplar

See `.claude/workflows/monorepo-health.js` (this repo's root — NOT shipped in the plugin package). It's the LOW-risk reference implementation; `monorepo-fix.js` is its all-packages sibling. Clone its shape for a new recurring workflow.
