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

Invoke the `/changeset` skill:

```
Skill tool: changeset
```

This will:
- Read diffs per package
- Draft bump types + descriptions
- Present for user review
- Write `.changeset/<id>.md`

## Step 3: Knowledge refresh (optional)

If the `/arcana-absorb` skill is available, invoke it for each changed package that has source files (not just config/docs):

```
Skill tool: absorb <package-path>
```

- Generates/updates `<package>/knowledge/*.md`
- Indexes into knowledge store

If `/arcana-absorb` is not available, skip this step.

If a package has no meaningful source changes (only config, lockfiles, etc.), skip absorb for it.

## Step 4: Git workflow

1. Stage the new/updated files:
   - `.changeset/<id>.md`
   - Any updated `knowledge/**/*.md` files (if Step 3 ran)
2. Branch logic:
   - **Feature branch**: Commit, then offer to create/update PR via `gh pr create`
   - **Main branch**: Commit directly
3. Commit message format: `changeset: <brief summary>`

## Edge cases

| Situation | Action |
|-----------|--------|
| No package changes detected | Skip changeset + absorb, inform user |
| Knowledge already current (hashes match) | Absorb skips automatically |
| Multiple packages changed | One changeset covers all; absorb each independently |
| Python packages (no package.json) | Use directory name for changeset; absorb works the same |
| User cancels changeset | Still offer to run absorb alone (if available) |
| Absorb fails for one package | Continue with others, report failure |
