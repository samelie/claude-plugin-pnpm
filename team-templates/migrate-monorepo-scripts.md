# Team Template: Migrate monorepo-scripts → monorepo-consistency

Consolidate all scripts from `monorepo-scripts/` into `packages/monorepo-consistency/`'s domain/command/runner architecture, then delete `monorepo-scripts/`.

**Excluded:** readme-generator, vertex-ai-client (AI readme gen skipped).

## How to Execute

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/migrate-monorepo-scripts.md`.
Create a team named "migrate-scripts" using TeamCreate.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

---

## Roles

### 1. Lead (you — the orchestrator)

- Creates team via `TeamCreate`
- Creates all tasks via `TaskCreate` with correct `blockedBy` dependencies
- Spawns all agents via `Task` tool with `team_name` and `name` params
- Assigns tasks to agents via `TaskUpdate` with `owner`
- **Does NOT implement** — only orchestrates and gates phase transitions
- Monitors `TaskList` to track progress; advances phases when dependencies resolve
- Runs final verification commands after all phases complete
- Sends `shutdown_request` to all agents when done, then calls `TeamDelete`

### 2. Quarterback (QA monitor)

- Spawned by lead as a `general-purpose` agent with `model: "opus"`
- **Primary job**: monitor implementer outputs for correctness
- Receives messages from implementers when they complete tasks
- Reviews the changed files (reads code, checks patterns, verifies requirements)
- If output is wrong or incomplete:
  - Sends message to lead explaining the issue
  - Lead can either instruct the original agent to fix, or spawn a **fresh** agent with clean context to redo the task
- If output is correct: sends confirmation to lead so lead can mark task complete and unblock dependents
- Does NOT implement code — only reviews and flags issues

### 3. Implementers (1 per task group)

- Spawned by lead as `general-purpose` agents with `model: "opus"`
- Each agent owns a **cohesive group of related tasks** (not one agent per micro-task)
- Group similar/coupled work onto the same agent to minimize cross-agent coordination
- When task is done, sends message to quarterback with summary of changes
- If quarterback flags issues, fixes them (or lead spawns fresh agent if context is polluted)
- Runs `pnpm -F "@adddog/monorepo-consistency" build` before reporting done

### 4. Finalization Agents (lint + types)

- Spawned ONLY after all implementer tasks are complete (phase-gated via `blockedBy`)
- Use dedicated subagent types — NOT general-purpose:
  - `pnpm-lint` agent for lint:fix
  - `pnpm-types` agent for typecheck
- These agents use `model: "sonnet"` (sufficient for mechanical fixes)
- Fix all errors, iterate until clean

---

## Team Structure Table

| Agent | Name | subagent_type | model | Role | Phase |
|-------|------|---------------|-------|------|-------|
| Lead | `lead` | (you) | `opus` | orchestrate, gate phases | all |
| Quarterback | `qb` | general-purpose | `opus` | review implementer output | 1+ |
| Implementer A | `impl-knip` | general-purpose | `opus` | knip domain | 1 |
| Implementer B | `impl-utils` | general-purpose | `opus` | env + build + ci + publish domains | 1 |
| Implementer C | `impl-integration` | general-purpose | `opus` | CLI wiring, exports, schema, cleanup | 2 |
| Lint | `lint-agent` | pnpm-lint | `sonnet` | lint:fix @adddog/monorepo-consistency | 3 |
| Types | `types-agent` | pnpm-types | `sonnet` | typecheck @adddog/monorepo-consistency | 3 |

---

## Orchestration Flow

```
Phase 0   [lead]             ──── TeamCreate, TaskCreate (all tasks), spawn agents
                                        │
Phase 1   [impl-knip]        ──── T1 (knip domain)  ─┐
          [impl-utils]        ──── T3 (env) + T4 (build) + T5 (ci) + T6 (publish)  ─┤ parallel
                                        │
          [qb]                ──── reviews each implementer's output as they finish
                                        │ (lead gates: all Phase 1 tasks marked complete by qb)
                                        │
Phase 2   [impl-integration] ──── T7 (wire cli/exports/schema) + T8 (delete monorepo-scripts)
          [qb]                ──── reviews integration changes
                                        │ (lead gates: Phase 2 approved by qb)
                                        │
Phase 3   [lint-agent]        ──── T9 (lint:fix)   ─┐ parallel
          [types-agent]       ──── T10 (typecheck)  ─┘
                                        │
Phase 4   [lead]              ──── final verification, shutdown, TeamDelete
```

---

## Dependency Graph

```
T1 (knip domain)       ─┐
T3 (env domain)        ─┤  Phase 1, parallel
T4 (build domain)      ─┤
T5 (ci command)        ─┤
T6 (publish domain)    ─┘
                        │
T7 (integration)       ─── blockedBy: T1, T3, T4, T5, T6
T8 (delete old)        ─── blockedBy: T7
                        │
T9  (lint)             ─── blockedBy: T8
T10 (types)            ─── blockedBy: T8
```

---

## Existing Architecture Reference

Target package: `packages/monorepo-consistency/` (`@adddog/monorepo-consistency`)

```
src/
├── cli.ts              # Commander program, registers commands
├── index.ts            # Public API exports (handlers + types + utils)
├── types/index.ts      # CommandOptions, CheckResult, Issue, FixResult, WorkspaceInfo, PackageInfo, DomainHandler
├── config/
│   ├── schema.ts       # Zod schemas: configSchema with deps/tsconfig/packageJson domains
│   ├── loader.ts       # ConfigManager singleton (init, getConfig, getConfigPath)
│   └── index.ts        # Re-exports
├── domains/
│   ├── tsconfig/index.ts    # tsconfigHandler: check, fix, generate, validate
│   ├── packagejson/index.ts # packageJsonHandler: check, fix
│   ├── deps/index.ts        # depsHandler: check, fix, update, upgrade
│   └── config/index.ts      # configHandler: check
├── commands/
│   ├── tsconfig.ts, packagejson.ts, deps.ts, config.ts, init.ts, schema.ts
├── runners/
│   ├── tsconfig.ts     # TypeScript config generation logic
│   └── taze.ts         # Dependency updater runner
└── utils/
    ├── workspace.ts    # getWorkspaceInfo(), findWorkspaceRoot(), loadPackageJson()
    └── logger.ts       # logger.info/warn/error/success + configure()
```

**Key patterns:**
- Domain handlers: `export const fooHandler = { check, fix, ... }` (plain objects, not classes)
- Commands: `export function createFooCommand(): Command` via commander
- Config access: `ConfigManager.getInstance().getConfig()?.domain`
- Workspace: `getWorkspaceInfo(cwd)` → `{ root, packages: PackageInfo[], lockfile, workspaceFile }`
- ESM imports with `.js` extensions
- Zod v4 import: `import { z } from "zod/v4"`

**Already available deps:** zx, fast-glob, yaml, lodash, chalk, commander, ora, get-tsconfig, minimatch, zod

---

## Tasks

### T1: Knip domain

**Phase:** 1
**Agent:** `impl-knip`
**blockedBy:** none

Port `generate-knip-config.mts` + `knip-defaults.ts` into monorepo-consistency. Create knip domain with generate + check capabilities.

#### Reference files to read first

- `monorepo-scripts/generate-knip-config.mts` — generation logic (227 lines): workspace scanning, framework detection, config file generation
- `monorepo-scripts/knip-defaults.ts` — shared defaults (99 lines): `defaultKnipConfig`, `defineKnipConfig()`
- `packages/monorepo-consistency/src/domains/tsconfig/index.ts` — pattern for domain handlers
- `packages/monorepo-consistency/src/utils/workspace.ts` — reuse `getWorkspaceInfo()` (replaces `workspace-tools`)
- `packages/monorepo-consistency/src/types/index.ts` — `CommandOptions`, `CheckResult`

#### Files to create

- `packages/monorepo-consistency/src/domains/knip/defaults.ts` — port `defaultKnipConfig` object + `defineKnipConfig()` merge helper
- `packages/monorepo-consistency/src/domains/knip/detectors.ts` — framework detection: `detectFramework(pkgPath)` returning config overrides for Next/Vue/Vite/CLI/Pulumi/Workers
- `packages/monorepo-consistency/src/domains/knip/index.ts` — `knipHandler` with `generate()` and `check()`
- `packages/monorepo-consistency/src/commands/knip.ts` — `createKnipCommand()`: `mono knip generate [--dry-run] [--force]`

#### Implementation sketch

```ts
// domains/knip/defaults.ts — direct port of knip-defaults.ts
import { merge } from "lodash";
export const defaultKnipConfig = { /* ... port full config object ... */ };
export function defineKnipConfig(overrides: Record<string, unknown>) {
    return merge({}, defaultKnipConfig, overrides, /* array concat logic */);
}

// domains/knip/detectors.ts
interface FrameworkDetector { name: string; detect: (pkgPath: string) => Promise<boolean>; config: object; }
export const FRAMEWORK_DETECTORS: FrameworkDetector[] = [ /* Next, Vue+Vite, Vite, CLI, Pulumi, Workers */ ];
export async function detectFramework(pkgPath: string): Promise<{ name: string; config: object } | null> { ... }

// domains/knip/index.ts
import { getWorkspaceInfo } from "../../utils/workspace.js";
import { detectFramework } from "./detectors.js";
import { defaultKnipConfig, defineKnipConfig } from "./defaults.js";

const generate = async (options: CommandOptions & { dryRun?: boolean; force?: boolean }) => {
    const workspace = await getWorkspaceInfo(options.cwd);
    let generated = 0;
    for (const pkg of workspace.packages) {
        const framework = await detectFramework(pkg.path);
        const content = generateKnipConfigContent(framework); // template string with import from "@adddog/monorepo-consistency"
        // Write knip.config.ts to pkg.path
        // Add "knip": "knip" script to pkg package.json if missing
        generated++;
    }
    return { success: true, generated };
};
export const knipHandler = { generate, check };
```

**Key change:** Generated `knip.config.ts` files import from package name:
```ts
import { defineKnipConfig } from "@adddog/monorepo-consistency";
```

#### Verify

```bash
pnpm -F "@adddog/monorepo-consistency" build
```

---

### T3: Env domain

**Phase:** 1
**Agent:** `impl-utils`
**blockedBy:** none

Port `env-encoder.mts` (126 lines) — encode/decode .env files to base64 with clipboard support.

#### Reference files to read first

- `monorepo-scripts/env-encoder.mts` — source
- `packages/monorepo-consistency/src/domains/deps/index.ts` — pattern reference for simple domain

#### Files to create

- `packages/monorepo-consistency/src/domains/env/index.ts` — `envHandler.encode()`, `envHandler.decode()`, clipboard util
- `packages/monorepo-consistency/src/commands/env.ts` — `mono env encode <file> [--copy]`, `mono env decode <base64> [--output file]`

#### Implementation sketch

```ts
// domains/env/index.ts
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

async function copyToClipboard(text: string): Promise<void> {
    const platform = process.platform;
    const cmd = platform === "darwin" ? "pbcopy" : platform === "win32" ? "clip" : "xclip -selection clipboard";
    execSync(cmd, { input: text });
}

const encode = async (options: { filePath: string; copy?: boolean }): Promise<string> => {
    const content = await readFile(resolve(options.filePath), "utf-8");
    const encoded = Buffer.from(content).toString("base64");
    if (options.copy) await copyToClipboard(encoded);
    return encoded;
};

const decode = async (options: { encoded: string; output?: string }): Promise<string> => {
    const decoded = Buffer.from(options.encoded, "base64").toString("utf-8");
    if (options.output) await writeFile(options.output, decoded, "utf-8");
    return decoded;
};

export const envHandler = { encode, decode };
```

No new deps.

#### Verify

```bash
pnpm -F "@adddog/monorepo-consistency" build
```

---

### T4: Build domain

**Phase:** 1
**Agent:** `impl-utils`
**blockedBy:** none

Port `build-packages.mts` (27 lines) — build packages in configured order.

#### Reference files to read first

- `monorepo-scripts/build-packages.mts` — source (hardcoded package order)
- `packages/monorepo-consistency/src/runners/taze.ts` — runner pattern

#### Files to create

- `packages/monorepo-consistency/src/domains/build/index.ts` — `buildHandler.run()`
- `packages/monorepo-consistency/src/commands/build.ts` — `mono build [--dry-run]`

#### Implementation sketch

```ts
// domains/build/index.ts
import { $ } from "zx";
import { ConfigManager } from "../../config/loader.js";
import { logger } from "../../utils/logger.js";

interface BuildOptions { packages?: string[]; dryRun?: boolean; cwd?: string; }

const run = async (options: BuildOptions): Promise<{ success: boolean; built: string[] }> => {
    $.env = { ...process.env, FORCE_COLOR: "1" };
    const config = ConfigManager.getInstance().getConfig();
    const packages = options.packages ?? config?.build?.orderedPackages ?? [];
    if (!packages.length) { logger.warn("No packages configured in build.orderedPackages"); return { success: true, built: [] }; }

    const built: string[] = [];
    for (const pkg of packages) {
        if (options.dryRun) { logger.info(`[DRY RUN] pnpm --filter="${pkg}" build`); continue; }
        await $`pnpm --filter=${pkg} build`;
        built.push(pkg);
    }
    return { success: true, built };
};

export const buildHandler = { run };
```

Source hardcodes: `@adddog/*`, `@rad/*`, `@park-app/*`, `@dnd-3.5/*`, `@pessl/*`. Migration makes this configurable via `build.orderedPackages` in monorepo.config.json.

#### Verify

```bash
pnpm -F "@adddog/monorepo-consistency" build
```

---

### T5: CI command

**Phase:** 1
**Agent:** `impl-utils`
**blockedBy:** none

Port `mirror-ci-checks.mts` (8 lines) — run typecheck + lint at workspace root.

#### Reference files to read first

- `monorepo-scripts/mirror-ci-checks.mts` — source
- `packages/monorepo-consistency/src/commands/init.ts` — simple command pattern

#### Files to create

- `packages/monorepo-consistency/src/commands/ci.ts` — `mono ci mirror`

#### Implementation sketch

```ts
// commands/ci.ts
import { Command } from "commander";
import { $ } from "zx";
import { findWorkspaceRoot } from "../utils/workspace.js";
import { logger } from "../utils/logger.js";

export function createCiCommand(): Command {
    const cmd = new Command("ci").description("CI-related commands");
    cmd.command("mirror")
        .description("Run typecheck + lint locally (mirrors CI)")
        .action(async () => {
            const root = await findWorkspaceRoot();
            logger.info("Running typecheck...");
            await $({ cwd: root })`pnpm types`;
            logger.info("Running lint:fix...");
            await $({ cwd: root })`pnpm lint:fix`;
            logger.success("CI mirror complete");
        });
    return cmd;
}
```

No domain handler needed — too trivial.

#### Verify

```bash
pnpm -F "@adddog/monorepo-consistency" build
```

---

### T6: Publish domain (init-public-package)

**Phase:** 1
**Agent:** `impl-utils`
**blockedBy:** none

Convert `init-public-package.sh` (148 lines bash) to TypeScript. Creates public GitHub repo + updates sync config.

#### Reference files to read first

- `monorepo-scripts/init-public-package.sh` — source bash script
- `packages/monorepo-consistency/src/commands/init.ts` — existing init command pattern

#### Files to create

- `packages/monorepo-consistency/src/domains/publish/index.ts` — `publishHandler.initPublic()`
- `packages/monorepo-consistency/src/commands/publish.ts` — `mono publish init <name> <source-path> [--yes]`

#### Implementation sketch

```ts
// domains/publish/index.ts
import { $ } from "zx";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { findWorkspaceRoot, loadPackageJson } from "../../utils/workspace.js";
import { logger } from "../../utils/logger.js";

interface InitPublicOptions { packageName: string; sourcePath: string; yes?: boolean; }

const initPublic = async (options: InitPublicOptions): Promise<{ success: boolean }> => {
    const root = await findWorkspaceRoot();
    const pkgJsonPath = resolve(root, options.sourcePath, "package.json");
    const pkgJson = await loadPackageJson(pkgJsonPath);
    const npmName = pkgJson.name;
    const description = pkgJson.description ?? "";

    // Create GitHub repo
    logger.info(`Creating GitHub repo: ${options.packageName}`);
    await $`gh repo create ${options.packageName} --public --description ${description}`;

    // Update sync-config.yaml
    const syncConfigPath = join(root, ".github", "sync-config.yaml");
    const syncConfig = parseYaml(await readFile(syncConfigPath, "utf-8"));
    syncConfig[options.packageName] = { source: options.sourcePath };
    await writeFile(syncConfigPath, stringifyYaml(syncConfig), "utf-8");

    logger.success(`Initialized public repo for ${npmName}`);
    return { success: true };
};

export const publishHandler = { initPublic };
```

Uses `zx` (for gh CLI) + `yaml` — both already deps.

#### Verify

```bash
pnpm -F "@adddog/monorepo-consistency" build
```

---

### T7: Integration wiring

**Phase:** 2
**Agent:** `impl-integration`
**blockedBy:** T1, T3, T4, T5, T6

Wire all new domains into CLI, public exports, and config schema.

#### Reference files to read first

- `packages/monorepo-consistency/src/cli.ts` — current command registrations
- `packages/monorepo-consistency/src/index.ts` — current exports
- `packages/monorepo-consistency/src/config/schema.ts` — current Zod schemas
- All new files created in T1-T6

#### Files to modify

- `packages/monorepo-consistency/src/cli.ts` — add 5 new commands:
  ```ts
  import { createKnipCommand } from "./commands/knip.js";
  import { createEnvCommand } from "./commands/env.js";
  import { createBuildCommand } from "./commands/build.js";
  import { createCiCommand } from "./commands/ci.js";
  import { createPublishCommand } from "./commands/publish.js";
  // ... program.addCommand() for each
  ```

- `packages/monorepo-consistency/src/index.ts` — add exports:
  ```ts
  export { knipHandler, defaultKnipConfig, defineKnipConfig } from "./domains/knip/index.js";
  export { envHandler } from "./domains/env/index.js";
  export { buildHandler } from "./domains/build/index.js";
  export { publishHandler } from "./domains/publish/index.js";
  ```

- `packages/monorepo-consistency/src/config/schema.ts` — add new domain schemas:
  ```ts
  const knipConfigSchema = z.object({
      enabled: z.boolean().default(true),
      frameworkDetection: z.boolean().default(true),
      addScriptToPackageJson: z.boolean().default(true),
  });

  const buildConfigSchema = z.object({
      orderedPackages: z.array(z.string()).default([]),
  });

  const publishConfigSchema = z.object({
      githubUsername: z.string().optional(),
      syncConfigPath: z.string().default(".github/sync-config.yaml"),
  });

  // Add to configSchema:
  export const configSchema = z.object({
      // ... existing ...
      knip: knipConfigSchema.optional(),
      build: buildConfigSchema.optional(),
      publish: publishConfigSchema.optional(),
  });
  ```

#### Verify

```bash
pnpm -F "@adddog/monorepo-consistency" build
```

---

### T8: Delete monorepo-scripts

**Phase:** 2
**Agent:** `impl-integration`
**blockedBy:** T7

Remove `monorepo-scripts/` directory and all references.

#### Steps

1. Search repo for imports/references to `@monorepo-scripts/root` or `monorepo-scripts/`
2. Remove `monorepo-scripts/` from `pnpm-workspace.yaml` if listed
3. Update any root `package.json` scripts referencing monorepo-scripts
4. Delete entire `monorepo-scripts/` directory
5. Run `pnpm install` to update lockfile

#### Verify

```bash
pnpm install
pnpm -F "@adddog/monorepo-consistency" build
```

---

### T9: Lint fix

**Phase:** 3
**Agent:** `lint-agent`
**blockedBy:** T8

Run lint:fix on `@adddog/monorepo-consistency` and fix all errors. Iterate until clean.

```bash
pnpm -F "@adddog/monorepo-consistency" lint:fix
```

---

### T10: Typecheck

**Phase:** 3
**Agent:** `types-agent`
**blockedBy:** T8

Run typecheck on `@adddog/monorepo-consistency` and fix all type errors. Iterate until clean.

```bash
pnpm -F "@adddog/monorepo-consistency" types
```

---

## Quarterback Protocol

1. **Receive** completion message from implementer
2. **Read** all files the implementer changed/created
3. **Check**:
   - Does code match task requirements?
   - Does it follow existing patterns (handler objects, commander factories, Zod v4 schemas, ESM .js imports)?
   - Are there obvious bugs, missing imports, or type issues?
   - Were verify commands run successfully?
   - Do generated knip configs import from `@adddog/monorepo-consistency` (NOT relative path)?
4. **If OK**: message lead with approval → lead marks task complete
5. **If NOT OK**: message lead with specific issues → lead instructs fix or spawns fresh agent

### When to spawn fresh agent vs. fix in place

- **Fix in place**: missing import, typo, wrong variable name
- **Fresh agent**: wrong architectural approach, accumulated bad assumptions

---

## Lead Orchestration Checklist

```
[ ] 1. TeamCreate with team name "migrate-scripts"
[ ] 2. TaskCreate for ALL tasks (T1-T10) with correct blockedBy deps
[ ] 3. Spawn quarterback agent (qb)
[ ] 4. Spawn Phase 1 implementers: impl-knip + impl-utils (parallel)
[ ] 5. Assign tasks: T1 → impl-knip, T3+T4+T5+T6 → impl-utils
[ ] 6. Monitor TaskList — wait for qb approval on each task
[ ] 7. When all Phase 1 approved: spawn impl-integration
[ ] 8. Assign T7+T8 → impl-integration
[ ] 9. Wait for qb approval on Phase 2
[ ] 10. Spawn Phase 3 agents: lint-agent + types-agent (parallel)
[ ] 11. Wait for Phase 3 completion
[ ] 12. Run final: pnpm -F "@adddog/monorepo-consistency" build
[ ] 13. Send shutdown_request to all agents
[ ] 14. TeamDelete
```

---

## Agent Prompt Templates

### Quarterback prompt

```
You are the quarterback (QA monitor) for team "migrate-scripts".

Your job:
- Receive completion messages from implementer agents
- Read and review their code changes
- Verify changes match task requirements and follow existing codebase patterns
- Send approval or rejection (with specific issues) to lead

You do NOT write code. You only review and report.

Key patterns to verify:
- Domain handlers: plain objects (`export const fooHandler = { ... }`), NOT classes
- Commands: `export function createFooCommand(): Command`
- Config: Zod v4 (`import { z } from "zod/v4"`)
- ESM: all imports use `.js` extensions
- Workspace: use getWorkspaceInfo(), NOT workspace-tools
- Generated knip configs: import from "@adddog/monorepo-consistency", NOT relative paths

Rules:
- pnpm -F "<pkg>" for all commands
- Don't modify tsconfig (auto-generated)
- Read existing code before judging — match patterns already in use
- Code snippets in tasks are sketches — implementations may differ and that's fine if correct
```

### impl-knip prompt

```
You are implementer "impl-knip" for team "migrate-scripts".

Your tasks: T1 (knip domain)

Instructions:
- Read `${CLAUDE_PLUGIN_ROOT}/team-templates/migrate-monorepo-scripts.md` for full task details
- Read ALL reference files listed in each task before modifying anything
- Match existing code patterns in packages/monorepo-consistency/src/
- Run `pnpm -F "@adddog/monorepo-consistency" build` before reporting done
- When done with each task, send message to "qb" with summary of changes made
- If qb flags issues, fix them

Rules:
- pnpm -F "<pkg>" for all commands
- Don't modify tsconfig (auto-generated)
- Use `import { z } from "zod/v4"` for Zod
- All imports use .js extensions
- Use getWorkspaceInfo() from utils/workspace.ts, NOT workspace-tools
```

### impl-utils prompt

```
You are implementer "impl-utils" for team "migrate-scripts".

Your tasks: T3 (env domain), T4 (build domain), T5 (ci command), T6 (publish domain)

Instructions:
- Read `${CLAUDE_PLUGIN_ROOT}/team-templates/migrate-monorepo-scripts.md` for full task details
- Read ALL reference files listed in each task before modifying anything
- Match existing code patterns in packages/monorepo-consistency/src/
- Run `pnpm -F "@adddog/monorepo-consistency" build` before reporting done
- When done with each task, send message to "qb" with summary of changes made
- If qb flags issues, fix them

Rules:
- pnpm -F "<pkg>" for all commands
- Don't modify tsconfig (auto-generated)
- Use `import { z } from "zod/v4"` for Zod
- All imports use .js extensions
```

### impl-integration prompt

```
You are implementer "impl-integration" for team "migrate-scripts".

Your tasks: T7 (integration wiring), T8 (delete monorepo-scripts)

Instructions:
- Read `${CLAUDE_PLUGIN_ROOT}/team-templates/migrate-monorepo-scripts.md` for full task details
- Read ALL new files created by other implementers before wiring them
- Wire new commands into cli.ts, exports into index.ts, schemas into config/schema.ts
- After wiring, delete monorepo-scripts/ directory and clean up references
- Run `pnpm -F "@adddog/monorepo-consistency" build` and `pnpm install` before reporting done
- When done, send message to "qb" with summary of changes made

Rules:
- pnpm -F "<pkg>" for all commands
- Don't modify tsconfig (auto-generated)
- Use `import { z } from "zod/v4"` for Zod
- All imports use .js extensions
```

### Lint agent prompt

```
Run lint:fix on @adddog/monorepo-consistency and fix all errors:
pnpm -F "@adddog/monorepo-consistency" lint:fix
Iterate until `pnpm -F "@adddog/monorepo-consistency" lint` exits 0.
```

### Types agent prompt

```
Run typecheck on @adddog/monorepo-consistency and fix all type errors:
pnpm -F "@adddog/monorepo-consistency" types
Iterate until `pnpm -F "@adddog/monorepo-consistency" types` exits 0.
```

---

## Critical Rules

1. `pnpm -F "<pkg>"` for all commands
2. Don't modify tsconfig (auto-generated)
3. Branch prefix: `sam/`
4. All implementer + qb agents use `model: "opus"`
5. Lint/types agents use `model: "sonnet"` with dedicated subagent types
6. Lead does NOT implement — only orchestrates
7. Quarterback does NOT implement — only reviews
8. Group similar tasks onto the same implementer agent
9. Code snippets in tasks are sketches — agents adapt to real types/signatures
10. Read existing code before modifying — match patterns already in use
11. Each implementer runs build/verify before reporting done
12. Generated knip configs import from `@adddog/monorepo-consistency`, NOT relative paths
