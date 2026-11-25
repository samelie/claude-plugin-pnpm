---
name: changeset
description: "Generate @changesets/cli changeset from git diff. Triggers: changeset, add changeset, describe changes. Accepts an optional path argument to scope to a specific package (e.g. `/changeset paradocx/apps/webui`)."
---

# /changeset [path]

Generate a `.changeset/<id>.md` file describing current changes using @changesets/cli conventions.

An optional `path` argument narrows the scope to a single package. The path can be absolute or relative to the repo root, and can point anywhere inside a package directory — the skill resolves it to the nearest ancestor with a `package.json` or `pyproject.toml`.

## Step 1: Resolve target packages

### If a path argument was provided

1. Normalize the path relative to the repo root (strip absolute prefix if needed)
2. Walk up from that path to find the nearest `package.json` or `pyproject.toml`
3. Read the `name` field as the package identifier (for Python packages without `package.json`, use directory name)
4. Scope all subsequent git diffs to that package's directory
5. If no `package.json`/`pyproject.toml` is found, tell the user the path doesn't resolve to a workspace package and stop

### If no path argument was provided (default — scan all changes)

1. Determine diff scope:
   - Feature branch (not `main`): `git diff --name-only main...HEAD`
   - On `main`: `git diff --name-only HEAD`
   - Include unstaged/staged: also check `git diff --name-only` and `git diff --name-only --cached`
2. Map changed files -> workspace packages:
   - Read `pnpm-workspace.yaml` for package globs
   - For each changed file, find the nearest ancestor `package.json` or `pyproject.toml`
   - Use the `name` field as package identifier; for Python packages (no `package.json`), use directory name
3. If no packages detected, inform user and stop

## Step 2: Determine bump types and draft descriptions

For each affected package:

1. Read the relevant diff (`git diff` scoped to that package's directory)
2. Analyze the diff to classify the bump type. Use these signals:

   **major** (breaking) — high confidence when you see:
   - Removed or renamed public exports, functions, types, or CLI commands
   - Changed function signatures (removed params, changed return types)
   - Removed fields from public interfaces/schemas
   - Migration files that alter existing data structures

   **minor** (new functionality) — high confidence when you see:
   - New exported functions, components, types, or commands
   - New optional parameters added to existing APIs
   - New files that add capabilities without touching existing interfaces

   **patch** (fix/tweak) — high confidence when you see:
   - Bug fixes (conditional logic changes, null checks, error handling)
   - Internal refactors that don't change public API
   - Dependency updates, docs, config, tests

3. If the signals are mixed or ambiguous (e.g., a new feature that also changes an existing interface, or a refactor that might affect consumers), present the user with your best guess and reasoning, and ask them to pick:
   > "I'd lean **minor** — new `retryPolicy` option on `createPipeline()`, but it also changes the default timeout from 30s→60s which could break callers relying on the old default. Should this be **minor** or **major**?"

4. Draft a concise description focused on "what changed and why" — one line per package

## Step 3: Check for existing changesets

1. List `.changeset/*.md` files (excluding `README.md`)
2. If any pending changeset mentions the same packages, warn the user:
   > "Existing changeset `<file>` already covers `<pkg>`. Add to it or create a new one?"

## Step 4: Present for review

Show the user the proposed changeset:

```
---
"@scope/package-a": minor
"@scope/package-b": patch
---

Add retry logic to ingestion pipeline.
Fix form validation edge case.
```

Ask: "Write this changeset? (edit/confirm/cancel)"

## Step 5: Write changeset

1. Generate a random ID (lowercase alphanumeric, 8-12 chars — match @changesets/cli convention)
2. Write `.changeset/<id>.md` with the confirmed content
3. Report the file path

## Notes

- One changeset file can cover multiple packages (standard @changesets/cli behavior)
- Python packages without `package.json` use directory name as identifier
- Descriptions should be terse — these feed into CHANGELOG.md
- Do NOT commit the changeset file — `/ship` or the user handles that
