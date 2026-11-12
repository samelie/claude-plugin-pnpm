# Grade seal

A grade seal keeps the graded inputs of an effort that live only under gitignored `team-session/` in a tracked `team-kit-seals/<effort>/<grade-tag>/` dir committed on `main`, together with `_grade/` copies of the grade file and the closure record (`build-state.md`) inside the bundle. Why: on 2026-11-04 a disk cleanup deleted every json under `team-session/`, Round 8's graded inputs included, and the backup mirror carried the deletions to the bucket (`team-session/cs-round8-closeout/investigator/json-loss.md`). Recovery depended on bucket soft-delete with a deadline. A grade seal makes the graded bytes recoverable from git alone.

## When an effort is gated

An effort is gated when either holds:

- its `definition-of-done.md` carries a table row with the slug `grade-seal-gate` whose blocking cell is `true` (`.claude/team-templates/DEFINITION-OF-DONE.md` rule 8; the check finds the row by the slug, not the AC number);
- a `team-kit-seals/<effort>/*/GRADE-SEAL.md` exists in the worktree or is committed on `main`. Sealing is itself the opt-in.

Otherwise the check prints `not gated: <effort> — definition-of-done.md carries no grade-seal-gate row and team-kit-seals/<effort>/ holds no grade seal` and exits 3 (exit 3 is neither a pass nor a failure). Existing and in-flight efforts are not gated unless their owner adds the row (D-18).

## Lifecycle

The tag is derived from the frozen grade file. Nothing written after the grade touches that file, so the tag is stable for one grade attempt. A regrade writes new bytes and needs exactly one new seal. The gate verdict lives in the closure record, never in the grade file.

| Step | Who (Claude lane) | Who (Codex lane) | Action | Records |
|---|---|---|---|---|
| L-0 plan | planner | planner | the plan carries a post-grade seal task `T-<n> grade-seal-closure` (blockedBy the final grade task; owner orchestrator; verify = the DoD row's verify); the DoD row's `maps_to` names it. Missing task ⇒ DoD Rule 2/6 flags `ERRORS_REMAINING` at define and the planner adds it | `team-plan.md`, DoD row |
| L-1 validate | `team-verifier` validate stage | deterministic evidence before the grade | the gate row is not run: recorded `DEFER — post-grade seal closure` | validate record |
| L-2 grade | fresh `team-goal-auditor` (grade phase) | fresh `team-goal-auditor` | grades every other row; writes the inventory as `shasum -a 256` lines with absolute-under-repo or repo-relative paths; does not grade the gate row | `goal-auditor/final-grade.md` (frozen from here) |
| L-3 seal | orchestrator (in-session seam) | root (in-session) | `node .claude/skills/team-kit-run/scripts/grade-seal.mjs <abs session> --disposition "<text>"` → exit 0 | seal files (worktree) |
| L-4 commit | orchestrator | root | `git commit -m "chore(team-kit-seals): grade seal <effort> <tag>" -- <every WROTE path>`; `git show --stat HEAD` = those paths; INDEX.md foreign row → `.claude/rules/git-shared-tree.md` §Shared files with foreign hunks | commit on `main` |
| L-5 check | `team-verifier` native seam dispatch | the criterion's deterministic grader task | `node .claude/skills/team-kit-run/scripts/check-grade-seal.mjs <abs session>` → exit 0 | verifier record |
| L-6 mark | orchestrator | root | gate row `passed` in `build-state.md` AC ledger (Claude) / criterion evidence receipt (Codex `check.mjs` state contract) — closure record, outside the grade inventory | closure record |
| L-7 DONE | orchestrator | root | every blocking AC `passed` | — |

Both lanes:

- The validate stage records the gate row `DEFER — post-grade seal closure`; it never runs the check before the grade exists.
- The plan carries a post-grade seal task blockedBy the final grade task.
- The grade never grades the gate row.
- Order after the grade: seal → path-limited commit on `main` → check.
- The check verdict is recorded in the closure record, never in the grade file.
- A regrade → new grade bytes → new tag → new seal (L-3..L-6 again; the old seal dir stays as history). The check reads the current grade, so it fails until the new seal is committed.

Claude-lane mode-1 authoring: exclude the gate row from the validate stage's AC list and run L-3..L-6 as seams after the grade stage, outside `plan.workflow.js`.

## Inventory format

The grader writes the graded inputs as `shasum -a 256` lines anywhere in the grade file: `<64-hex>  <path>` (64 lowercase hex, two spaces, path). Every line of that shape is an inventory entry. Same path with the same sha twice is deduplicated.

Path base:

- absolute under the repo root (the repo root prefix is stripped), or repo-relative. A leading `./` is stripped.
- session-relative paths fail with the fix named: run `shasum -a 256` from the repo root, or on absolute paths.
- inputs outside the repo fail: copy them into the session dir before grading and inventory the copy.
- the same path twice with two different shas fails.
- a `..` segment fails; the `_grade/` prefix is reserved for the bundle's grade copies and fails.

A gated effort whose grade file holds no parseable `shasum -a 256` line never passes (exit 1).

## Seal layout

Path: `team-kit-seals/<effort>/<grade-tag>/`. Tag rule (PL-3): `<grade file basename without .md>-<first 12 hex of its sha-256>`, e.g. `final-grade-611b76150240`. The tag is content-addressed: a regrade forces one new seal.

Three files per seal:

- `MANIFEST.sha256` — the inventory, `<sha>  <repo-relative path>` per entry, sorted in `LC_ALL=C` byte order, trailing newline. Inputs only.
- `inputs.tar.zst` — pax tar (mtree spec: mode 0644, uid/gid 0, time 0, no xattrs/ACLs/AppleDouble), zstd -19. Holds every bundled input under its repo-relative path, plus `_grade/<grade file>` and, when present, `_grade/<closure record>`. The bundle always exists, even when every input is tracked.
- `GRADE-SEAL.md` — one `Key: value` per line: `Effort`, `Grade file`, `Grade file sha256`, `Grade copy`, `Disposition`, `Closure record`, `Closure record sha256` (or `absent`), `Closure copy` (or `absent`), `Sealed at (UTC)`, `Sealed HEAD`, `Inputs: <n> (bundled <b>, tracked <t>)`, `Bundle`, `Bundle sha256`, `Bundle bytes`, `Bundle cap bytes`, `Manifest sha256`, `Method`, `Tool versions`; then `## Verify` (the two check commands) and `## Tracked inputs` (a `tracked` code block of `<commit>\t<sha256>\t<path>` rows).

Inputs whose exact bytes are already committed (at `merge-base(origin/main, HEAD)`, at `HEAD`, or in the last 50 commits touching the path) are recorded as tracked rows, not bundled. Everything else must match its inventory sha on disk and goes into the bundle.

`team-kit-seals/INDEX.md` lists every sealed effort: `| effort | grade tag | sealed (UTC) | seal |`, one row per seal, sorted by effort then tag. It is the one shared mutable file in the seal store.

## Size cap

`MAX_BUNDLE_BYTES` = 50000000 (50 MB). A bundle over it makes `grade-seal.mjs` exit 1 and write nothing: re-present storage (D-4) instead of sealing. `--max-bundle-bytes N` may only lower the cap (1..50000000; anything else exits 2). The check fails a committed bundle over the cap: do not push it. Why: a file over 100 MB on shared `main` blocks every session's push, and `git reset` is denied (`.claude/rules/git-shared-tree.md`).

## Commands

Seal (after the final grade):

```
node .claude/skills/team-kit-run/scripts/grade-seal.mjs <abs session> --disposition "<text>" [--grade <rel>] [--reseal] [--max-bundle-bytes N]
```

Check:

```
node .claude/skills/team-kit-run/scripts/check-grade-seal.mjs <abs session> [--grade <rel>] [--from-seal [<tag>]]
```

`--grade` is session-relative (default `goal-auditor/final-grade.md`). Codex path: `.agents/skills/team-kit-create/scripts/<same>`. The scripts live in `.claude/skills/team-kit-create/scripts/`; `.claude/skills/team-kit-run/scripts/` holds relative symlinks.

| Exit | `grade-seal.mjs` | `check-grade-seal.mjs` |
|---|---|---|
| 0 | sealed: `WROTE <path>` lines + one `NEXT: git commit …` line | gated, sealed, verified: `OK: grade seal verified …` |
| 1 | cannot seal, nothing written | gated and failing: `FAIL:` lines (first 20 offending paths + count) |
| 2 | usage / environment | usage / environment |
| 3 | — | not gated (`not gated: …`) |

## Commit and push

- Commit every `WROTE` path, path-limited, on `main` (the `NEXT:` line prints the command). The check reads only the `main` tree: an untracked or staged-only seal fails.
- `team-kit-seals/INDEX.md` is a hot file. A foreign row from another session → commit around it per `.claude/rules/git-shared-tree.md` §Shared files with foreign hunks.
- Read `git show --stat HEAD` before any push; it must list exactly the `WROTE` paths.
- Push is a separate human step. The check never requires it and reports origin containment as INFO only (D-14, C-10).
- Before push, the off-machine copy is the L3 mirror of the worktree `team-kit-seals/` (the mirror excludes `.git`). Never add `team-kit-seals/` to a mirror exclude.

## Verify from the seal

When the session files are gone, verify from git alone:

```
node .claude/skills/team-kit-run/scripts/check-grade-seal.mjs <abs session> --from-seal [<tag>]
```

The tag may be omitted when the effort holds exactly one committed seal. The grade bytes come from the bundle's `_grade/` copy; nothing under the session dir is read.

Restore the session files without overwriting any existing file:

```
git -C <repo> show main:<seal dir>/inputs.tar.zst | zstd -dc | /usr/bin/tar -xkf - -C <repo> -s ',^\./_grade/,./,'
```

`-k` keeps existing files; `-s` puts the `_grade/` copies back at their original paths. Then run the normal check (no `--from-seal`); it must exit 0.

## Reseal

- Any grade-file change → new tag → new seal. Run `grade-seal.mjs` again and commit; the old seal stays.
- A closure-record change after sealing is INFO drift: the check prints `INFO: closure record sha drift …` and still exits 0. Writing the gate verdict into `build-state.md` causes exactly this.
- Reseal the same tag with `--reseal` plus a new commit only when the closure record must be re-anchored. R8 does this under C-12.

## Secret scan

Before writing, `grade-seal.mjs` scans every bundled input and both `_grade/` copies line by line for 3 value-shaped patterns: `sk-ant-` followed by 8+ key characters, `AKIA` + 16 uppercase alphanumerics, and a PEM armor header (`-----BEGIN <LABEL>-----`). Any hit exits 1, prints `SECRET-SCAN HIT <path>:<line> <pattern name>` (never the value) and writes nothing.

## Not covered

Legacy markdown or `grade-inputs` inventories are not parsed: only `shasum -a 256` lines count. Converting older efforts is owner-driven (fog).
