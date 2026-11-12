# Fresh checks — declared read-sets (create lane, both lanes)

Canonical declared read-set for each of the 6 create-lane fresh checks: frame check, SAT, plan-vs-goal audit, post-plan review, discovery refuter, design critique. Every restatement — `SKILL.md` Steps 4b / 4c-a / 4d-b / 4e / 6, `references/discovery.md`, `references/acceptance.md`, `.claude/team-templates/SESSION-SCHEMA.md` and the role files of both lanes (`.claude/agents/team-*.md`, `.codex/agents/team-*.toml`) — lists the same files as this file. A restatement that disagrees with this file is drift; this file wins. The JSON block under Machine block is the machine-readable source; the table below is its human view and agrees with it entry for entry. Codex reads this file through the symlink `.agents/skills/team-kit-create` → `.claude/skills/team-kit-create`.

## Checks

| id | Step | Claude `subagent_type` | Codex `agent_type` | `Phase:` line | Session read-set | Writes | Outside the session |
|----|------|------------------------|--------------------|---------------|------------------|--------|---------------------|
| `frame-check` | 4b fog-drain frame check | `team-designer` | `team-designer` | `Phase: frame-check` | `prompt.md`, `requirements.md`, `map.md#Premises`, `designer/explore.md` | `designer/frame-check.md` | read-only repo source + declared runtime instruction entrypoints |
| `sat` | 4d-b SAT Option A | `team-goal-auditor` | `team-goal-auditor` | `Phase: sat` | `definition-of-done.md`, `team-plan.md`, `design.md`, `requirements.md` | `goal-auditor/sat.md` | read-only repo source + declared runtime instruction entrypoints |
| `goal-audit` | 4e plan-vs-goal audit | `team-goal-auditor` | `team-goal-auditor` | `Phase: audit` | `prompt.md`, `definition-of-done.md`, `team-plan.md`, `map.md#Destination`, `map.md#Out of scope` | `goal-auditor/goal-audit.md` | read-only repo source + declared runtime instruction entrypoints |
| `plan-review` | 6 post-plan review, Option A, incl. S-1 readiness | `team-plan-reviewer` | `team-plan-reviewer` | none | `prompt.md`, `requirements.md`, `design.md`, `team-plan.md`, `definition-of-done.md`, `map.md#Destination`, `map.md#Not yet specified`, `map.md#Out of scope` | `plan-review.md` | read-only repo source + declared runtime instruction entrypoints |
| `refuter` | 4b discovery refuter (TK-5) | `team-researcher` | `team-researcher` | none | `researcher/research-findings*.md`, except (deny) `researcher/research-findings-refute-*.md` | `researcher/research-findings-refute-*.md` | read-only repo source + declared runtime instruction entrypoints |
| `design-critique` | 4c-a design critique (hostile, fresh) | `team-design-critic` | `team-design-critic` | none | `requirements.md`, `design.md` | `design-critic/design-critique.md` | read-only repo source + declared runtime instruction entrypoints |

Paths are session-relative (`team-session/<id>/`). A `none` in the `Phase:` column means the role has no phases and the dispatch carries no `Phase:` line.

## Dispatch header

Every fresh-check dispatch, both lanes, opens with:

```text
Fresh-check: <frame-check|sat|goal-audit|plan-review|refuter|design-critique>
Phase: <phase>                       # only when the role is phase-dispatched (designer, goal-auditor)
Session path: `<absolute session path>/`
```

- The `Fresh-check: <id>` line names the declaration that binds the dispatch; the check is identified from its dispatch, never inferred from its `Phase:` line.
- Claude: plain `subagent_type` from the declaration — never `fork`, never `name:`.
- Codex: `spawn_agent` with the declared `agent_type`, a `task_name`, and `fork_turns: "none"`.
- Refuter: the prompt also names its output path `researcher/research-findings-refute-{slug}.md`.

## Section-scoped entries

- An entry `map.md#<Name>` grants one section of `map.md`, not the file. Read it by line range or by section extraction; a whole-file read of `map.md` is a breach.
- `#Destination` = the header block of `map.md` before its first `## ` heading (title, Destination, Phase, Updated, Budget, Rigor lines).
- Every other `#<Name>` = the `## <Name>` section, from its heading to the next `## ` heading.

## Closed set

Inside the session:

- Everything outside `allow` ∪ the check's own `writes` is out of set.
- `deny` is subtracted from `allow`: deny wins over allow, never over the check's own writes.
- `writes` names what the check produces and never grants a read.
- `expectArtifact` = the artifact whose presence shows the check ran.
- `skipWhenArtifactLine` = the line, or list of lines, that marks a check as not dispatched — the SAT Option B runner line (`Runner: lead-inline (Option B)`), the critic skip forms (`Runner: skipped — team-design-critic not installed`, Claude lane `Runner: skipped — rigor low: no cross-lane seam`), the Claude-lane frame-check skip form (`Runner: skipped — rigor below high: no premises minted`, `rigor.md`); `null` when the check has no skip form.

Outside the session: read-only repo source is in set (`repo: "any"`, DP-6) — the firewall protects the maker's route, which lives in the session dir.

Required runtime instruction entrypoints are separate from session inputs. A role requiring a skill
may read that skill's `SKILL.md` from the active skill registry even when installed outside the repo.
For Codex recorded-read validation, the lead freezes an exact path/name/SHA-256 manifest before
dispatch; only names in Machine block `instructionSkills` qualify. This exception grants no directory,
referenced file or session read. Session and other-session exclusions always take precedence.
Other external instruction files require a separate narrow policy before use; this entrypoint
exception never follows references automatically.

Reading outside this set breaks the check's isolation (`references/fresh-checks.md` → Closed set).

## Machine block

The only json-tagged code fence in this file. Section names resolve as in Section-scoped entries.

```json
{
  "version": 1,
  "instructionSkills": ["context-mode:context-mode", "ccc"],
  "checks": [
    { "id": "frame-check", "step": "4b fog-drain frame check", "agentType": { "claude": "team-designer", "codex": "team-designer" }, "phase": "frame-check",
      "allow": ["prompt.md", "requirements.md", "map.md#Premises", "designer/explore.md"], "deny": [],
      "writes": ["designer/frame-check.md"], "repo": "any", "expectArtifact": "designer/frame-check.md", "skipWhenArtifactLine": "Runner: skipped — rigor below high: no premises minted" },
    { "id": "sat", "step": "4d-b SAT Option A", "agentType": { "claude": "team-goal-auditor", "codex": "team-goal-auditor" }, "phase": "sat",
      "allow": ["definition-of-done.md", "team-plan.md", "design.md", "requirements.md"], "deny": [],
      "writes": ["goal-auditor/sat.md"], "repo": "any", "expectArtifact": "goal-auditor/sat.md", "skipWhenArtifactLine": "Runner: lead-inline (Option B)" },
    { "id": "goal-audit", "step": "4e plan-vs-goal audit", "agentType": { "claude": "team-goal-auditor", "codex": "team-goal-auditor" }, "phase": "audit",
      "allow": ["prompt.md", "definition-of-done.md", "team-plan.md", "map.md#Destination", "map.md#Out of scope"], "deny": [],
      "writes": ["goal-auditor/goal-audit.md"], "repo": "any", "expectArtifact": "goal-auditor/goal-audit.md", "skipWhenArtifactLine": null },
    { "id": "plan-review", "step": "6 post-plan review, Option A, incl. S-1 readiness", "agentType": { "claude": "team-plan-reviewer", "codex": "team-plan-reviewer" }, "phase": null,
      "allow": ["prompt.md", "requirements.md", "design.md", "team-plan.md", "definition-of-done.md", "map.md#Destination", "map.md#Not yet specified", "map.md#Out of scope"], "deny": [],
      "writes": ["plan-review.md"], "repo": "any", "expectArtifact": "plan-review.md", "skipWhenArtifactLine": null },
    { "id": "refuter", "step": "4b discovery refuter (TK-5)", "agentType": { "claude": "team-researcher", "codex": "team-researcher" }, "phase": null,
      "allow": ["researcher/research-findings*.md"], "deny": ["researcher/research-findings-refute-*.md"],
      "writes": ["researcher/research-findings-refute-*.md"], "repo": "any", "expectArtifact": "researcher/research-findings-refute-*.md", "skipWhenArtifactLine": null },
    { "id": "design-critique", "step": "4c-a design critique (hostile, fresh)", "agentType": { "claude": "team-design-critic", "codex": "team-design-critic" }, "phase": null,
      "allow": ["requirements.md", "design.md"], "deny": [],
      "writes": ["design-critic/design-critique.md"], "repo": "any", "expectArtifact": "design-critic/design-critique.md", "skipWhenArtifactLine": ["Runner: skipped — team-design-critic not installed", "Runner: skipped — rigor low: no cross-lane seam"] }
  ]
}
```

## Provenance

Native Codex observation and probe procedure: `codex-fresh-check-validation.md`. The recorded-read
auditor consumes the Machine block above; it does not turn a declared read-set into a sandbox fence.

Concept credit: declared fresh-reader isolation, after the Elephant-Goldfish Model's live isolation tests — [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model) @ `3d0b348`, Apache-2.0 — `tests/integration/test_claude.py:41-108`, `tests/integration/test_codex.py:76`, `tests/integration/test_codex.py:97-133`. Concept only, no text copied.
