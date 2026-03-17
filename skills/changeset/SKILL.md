---
name: changeset
description: "Generate @changesets/cli changeset from git diff. Triggers: changeset, add changeset, describe changes"
---

# /changeset

Generate a `.changeset/<id>.md` file describing current changes using @changesets/cli conventions.

## Step 1: Detect changed packages

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
2. Determine bump type from change nature:
   - `patch`: bug fix, tweak, dependency update, docs
   - `minor`: new feature, new export, new command
   - `major`: breaking change, removed API, renamed export
3. Draft a concise description focused on "what changed and why" — one line per package

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
