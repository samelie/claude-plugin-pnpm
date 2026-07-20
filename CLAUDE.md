# claude-plugin-pnpm

## Team Trigger

When the user's message starts with **"as a team"** (e.g., "as a team, refactor the auth middleware"), invoke the `/team-kit-create` skill with the rest of the message as the task description. This is the natural language entry point for multi-agent team planning.

Other trigger phrases: "team up on", "work as a team on", "let's team up", "team-kit".

**Run trigger (EXECUTE, not plan):** "team-kit-run", "run the team", "execute the plan", "run the workflow team", "orchestrate as a workflow" → invoke `/team-kit-run` (native-workflow multi-agent execution). `team-kit-create` plans; `team-kit-run` executes.

**Debug trigger:** "as a team, debug..." or "as a team, investigate..." → uses debug-investigation template.

**Design trigger:** "as a team, design..." or "as a team, spec..." → spawns team-designer first, then planner.

**Fork trigger:** "as a team (fork), ..." or "fork team, ..." → enables fork mode for ~10x cost reduction on parallel agents. Children inherit lead context via cache, self-discover their agent definitions. Requires `CLAUDE_CODE_FORK_SUBAGENT=1` env var. (NOTE: "~10x" is reverse-engineered / version-fragile — not a guarantee. Fork applies to the native-team / Agent-tool path ONLY, NEVER the `/team-kit-run` workflow path — workflow `agent()` calls have isolated caches; see team-kit-run fork-vs-workflow routing.)

## Teamkit Skills

| Skill | Purpose |
|-------|---------|
| `team-kit-create` | Orchestrator — scope problem, create team plan (PLAN only) |
| `team-kit-run` | Executor — run a task as a native-workflow multi-agent run over the role agents (EXECUTE). Single-branch, prod-safe. See `docs/teamkit-methodology.md` |

## Ultracode Policy

When **ultracode is on** (standing opt-in; the literal trigger keyword is `ultracode` as of v2.1.160 — was `workflow` before; natural language always works), author + run a workflow for every substantive span — don't hand-orchestrate. Map each span to the cheapest reproducibility tier:

- **Saved `/command` workflow** (`.claude/workflows/*.js`) — recurring shapes (health, deep-clean, knip, migrate). Most canned.
- **`team-kit-run`** — bespoke multi-agent work over the role agents. Single-branch, prod-safe.
- **Inline ad-hoc workflow** — one-off fan-out the saved set doesn't cover.

Deterministic spans that SHOULD auto-author a workflow under ultracode: migrations, audits, broad sweeps, multi-dimension review — anything that fans out then verifies.

**Team-size gate (floor, not ceiling):** scale agents to the work, not the budget. A 2-file edit is solo or one coder — NOT a 6-agent team. Reserve teams for genuinely parallel, disjoint task groups. When ultracode is off, default to solo / subagent unless the user opts into a team.

## Available Team Agents

### Artifact Chain (all disk-backed)

```
prompt.md → designer/clarify.md → designer/explore.md → designer/present.md → requirements.md → researcher/findings.md → designer/refine.md (updates requirements.md) → design.md + team-plan.md → definition-of-done.md → goal-auditor/goal-audit.md
```

Each phase reads previous phase's file from `team-session/{team-name}/`. No in-memory-only state. `prompt.md` persists the raw user request at session start — never modified, referenced for intent drift.

| Stage | Agent | Reads | Writes | Focus |
|-------|-------|-------|--------|-------|
| 0. Prompt | lead | — | `prompt.md` | Persist raw user request |
| 1a. Clarify | `team-designer` (clarify) | — | `designer/clarify.md` | Q&A loop, resolve requirements |
| 1b. Explore | `team-designer` (explore) | `designer/clarify.md` | `designer/explore.md` | Approaches + user selection |
| 1c. Present | `team-designer` (present) | `designer/clarify.md`, `explore.md` | `designer/present.md` | Section-by-section approval |
| 1d. Write | `team-designer` (write) | all `designer/*.md` | `requirements.md` | Canonical handoff artifact |
| 2. Research | `team-researcher` | `requirements.md` | `researcher/findings.md` | Deep codebase context |
| 3. Refine | `team-designer` (refine) | `requirements.md`, `findings.md`, `prompt.md` | `designer/refine.md` + updates `requirements.md` | Research-informed grilling, sharpen requirements |
| 4. Design + Plan | `team-planner` | `requirements.md`, `findings.md`, `refine.md` | `design.md`, `team-plan.md` | HOW + TASKS |
| 4b. Acceptance | `team-goal-auditor` (define) | `prompt.md`, `requirements.md`, `team-plan.md` | `definition-of-done.md` | Author acceptance contract |
| 4c. Goal-audit | `team-goal-auditor` (audit) | `prompt.md`, `definition-of-done.md`, `team-plan.md` | `goal-auditor/goal-audit.md` | Adversarial plan-vs-goal (cap 2) |
| 5. Review | `team-plan-reviewer` | `requirements.md`, `design.md`, `team-plan.md` | `plan-review.md` | Completeness, consistency |

### Planning phase (used by team-kit-create skill)

| Agent | subagent_type | Role |
|-------|--------------|------|
| `team-designer` | `claude-plugin-pnpm:team-designer` | Phase-aware requirements specialist. 5 phases: clarify→explore→present→write→refine. Stateless — reads/writes disk artifacts. Refine phase is semi-autonomous: self-dispatches for code exploration, returns to lead for human judgment. Max 10 rounds. |
| `team-planner` | `claude-plugin-pnpm:team-planner` | Design + planning — reads `requirements.md`, produces `design.md` (HOW) + `team-plan.md` (TASKS). |
| `team-researcher` | `claude-plugin-pnpm:team-researcher` | Read-only investigation via CocoIndex + claude-mem + code. Reads `requirements.md` for context. |
| `team-plan-reviewer` | `claude-plugin-pnpm:team-plan-reviewer` | Plan critic — reviews `requirements.md` + `design.md` + `team-plan.md` with fresh context. |
| `team-goal-auditor` | `claude-plugin-pnpm:team-goal-auditor` | Acceptance contract owner. 2 phases: `define` (author `definition-of-done.md` from requirements + plan, anchored to `prompt.md`) → `audit` (adversarial plan-vs-goal, fresh context, disprove-own-finding, cap 2). Distinct from `team-auditor` (post-impl `[AUDIT]` logging). |

### Execution phase (dispatched by team lead)

| Agent | subagent_type | Role |
|-------|--------------|------|
| `team-investigator` | `claude-plugin-pnpm:team-investigator` | Root cause investigation — systematic debugging Phases 1-3. Used by debug-investigation template. |
| `team-architect` | `claude-plugin-pnpm:team-architect` | Deep-dive module analyst — used mid-execution when a specific subsystem needs investigation before coders start. NOT for initial planning. |
| `team-coder` | `claude-plugin-pnpm:team-coder` | Implement assigned subtasks |
| `team-spec-reviewer` | `claude-plugin-pnpm:team-spec-reviewer` | Spec compliance review — runs BEFORE quality review |
| `team-reviewer` | `claude-plugin-pnpm:team-reviewer` | Code quality review — runs AFTER spec review |
| `team-tester` | `claude-plugin-pnpm:team-tester` | Write + run tests |
| `team-security-auditor` | `claude-plugin-pnpm:team-security-auditor` | OWASP security audit |
| `team-verifier` | `claude-plugin-pnpm:team-verifier` | Run lint/types/knip/tests |
| `team-finisher` | `claude-plugin-pnpm:team-finisher` | Remove logs, enforce comment standards |

## Team Session

All agents communicate via `team-session/` (created by session-start hook). Use `read-findings` and `write-findings` skills for I/O.

## STATUS Protocol

Every team agent must end with: `STATUS: CLEAN`, `STATUS: PARTIAL`, or `STATUS: ERRORS_REMAINING: <count>`.
