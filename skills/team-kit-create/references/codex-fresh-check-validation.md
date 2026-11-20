# Codex fresh-check validation

`fresh-checks.md` owns dispatch roles, reads and writes. Native probes must exercise the declared
`agent_type` with `fork_turns: "none"`; a default agent supplied the role text is not a native-role
test. Resolve callable roles from the host's current tool metadata. A new role on disk requires a
fresh host if the current registry predates it. Do not claim a role was hot-reloaded.

## Recorded-read audit

```sh
node "$REPO/.claude/skills/team-kit-create/scripts/audit-codex-fresh-check.mjs" \
  --parent "$PARENT_ROLLOUT" --child "$CHILD_ROLLOUT" \
  --session "$ABS_SESSION" --check plan-review
```

Use absolute rollout paths from `~/.codex/sessions/`, not `codex exec --json` stdout. Preserve the
rollouts before retention expiry when authorized. The CLI prints JSON and returns 0 for PASS, 1 for
FAIL, 2 for INDETERMINATE. `--declaration <file>` binds an explicitly retained declaration snapshot.

When a required skill entrypoint lives outside the repo, pass `--instructions <manifest.json>`.
Before dispatch, the lead creates this manifest from the active skill registry, not from the child's
self-reported reads. It contains exact canonical absolute paths and actual content hashes:

```json
{"version":1,"source":"active-skill-registry","entries":[{"skill":"context-mode:context-mode","path":"/absolute/installed/skills/context-mode/SKILL.md","sha256":"<actual SHA-256>"}]}
```

Only declared required skill names and exact `SKILL.md` entrypoints qualify. No directory grant,
neighbor file, recursive reference or session artifact is included; other external instruction files
require a separate narrow policy before use. The auditor checks current bytes
against the manifest and records its hash; before/after input hashes still establish temporal equality.
Missing or mismatched instruction evidence never proves a clean read. Retain original results when
correcting the contract and run a new probe; do not rewrite historical evidence to claim an earlier
dispatch used the corrected policy.

- `roleFreshness`: parent/child first-record IDs, native role, task path, exact matching parent spawn
  and explicit fresh fork. Exclude inherited records using the child's history boundary.
- `observedReads`: nonempty supported recorded read calls checked against the declaration. Explicit
  denied paths override allowed paths; an output path grants no read. Another effort's artifacts
  are not repository source. Map grants are section ranges, not whole-file access.
- `observedWrites`: supported literal Add File patches must target declared outputs. Unknown or
  dynamic executions, descendants, unsupported tools and opaque processing remain INDETERMINATE.
- `dispatchHeader`: UNOBSERVABLE where the native rollout encrypts message bodies. The caller binds
  the check and session; the audit cannot independently prove the plaintext header.

PASS covers supported submitted calls. It is not an OS filesystem trace, proof of successful file
access, proof of the encrypted prompt, or absence of unrecorded platform reads. Record those limits
beside results; never label a self-reported read list as transcript-verified isolation.

## Reproducible probes

Retain the assignment, input hashes, declaration and role/config hashes, native handles, rollout
paths, report, audit JSON and expected/actual verdict separately from the child. Hash inputs before
dispatch and after completion. Resolve map ranges from that frozen input; the CLI's current-map
snapshot alone does not prove historical equality. Never put expected verdicts or prior reviews in
a child's assignment or allowed inputs. Do not reopen an output as input.

For auditable literal file reads through context-mode:

```js
text(await tools.mcp__context_mode__ctx_execute_file({path: "/absolute/input.md", language: "python", code: "print(FILE_CONTENT)"}));
```

`ctx_execute_file` can be limited to project paths. Use the role's supported literal shell read for
a declared external instruction entrypoint when that tool's project-path argument cannot address it:

```js
text(await tools.mcp__context_mode__ctx_execute({language: "shell", code: "cat '/absolute/registered/SKILL.md'", cwd: "/absolute/repo"}));
```

This changes no read grant or sandbox. Preserve any failed attempt and its result; an actual
filesystem/capability denial remains a denial, never permission to escalate.

For a declared map section, replace the example range with its actual frozen lines:

```js
text(await tools.mcp__context_mode__ctx_execute({language: "shell", code: "sed -n '1,5p' '/absolute/map.md'", cwd: "/absolute/repo"}));
```

These deliberately narrow forms expose reads without evaluating arbitrary agent code. Other valid
workflows can yield INDETERMINATE; investigate or improve the observer rather than count missing
evidence as a clean pass. Check both behavior (clean plan/design accepted, planted gap rejected) and
recorded role/freshness/reads. Neither result substitutes for the other. Include a plan probe whose
DoD has a mandatory block outside its AC table and whose plan omits that block.

For `codex exec`, follow repository operational pins: explicit `approval_policy="never"`, stdin
`< /dev/null`, one auth lane, no worktree/branch changes, and rollout-based accounting. New probes
must not modify old sealed evidence or adopt another effort's approval as authority.
