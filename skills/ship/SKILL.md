---
name: ship
description: "Ship feature: generate changeset + optional knowledge refresh + git workflow. Triggers: ship, ship it, feature complete, wrap up, done with feature"
---

# /ship

Meta-skill for "feature complete" — generates a changeset (for humans/changelogs) and optionally refreshes knowledge (for AI/vector DB). One command keeps both humans and AI current.

## Prerequisites

- Changes exist (staged, unstaged, or committed on branch)
- `@changesets/cli` installed (workspace devDep)

## Step 1: Scope detection

1. Detect changed files:
   - Feature branch: `git diff --name-only main...HEAD` + uncommitted changes
   - On main: `git diff --name-only HEAD` + uncommitted changes
2. Map files -> workspace packages (read `pnpm-workspace.yaml`, find nearest `package.json`/`pyproject.toml`)
3. Present to user:
   > "Changed packages: `pkg-a`, `pkg-b`. Proceed?"
4. If no changes detected, inform user and stop

## Step 2: Changeset

Invoke the `/changeset` skill with each detected package path so it skips re-scanning:

- **Single package**: `Skill tool: changeset, args: "<package-path>"`
- **Multiple packages**: invoke once per package, or omit the path arg to let `/changeset` scan all changes itself

The changeset skill will:
- Read diffs scoped to the package directory
- Classify bump type (major/minor/patch) with interactive confirmation when ambiguous
- Draft descriptions and present for user review
- Write `.changeset/<id>.md`

## Step 3: Git workflow

1. Stage the new/updated files:
   - `.changeset/<id>.md`
2. Branch logic:
   - **Feature branch**: Commit, then offer to create/update PR via `gh pr create`
   - **Main branch**: Commit directly
3. Commit message format: `changeset: <brief summary>`

## Edge cases

| Situation | Action |
|-----------|--------|
| No package changes detected | Skip changeset, inform user |
| Multiple packages changed | One changeset covers all |
| Python packages (no package.json) | Use directory name for changeset |
