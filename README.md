# claude-plugin-pnpm

A Claude Code plugin that turns a single prompt into a coordinated multi-agent team — from requirements through implementation. Built for pnpm monorepos.

```
"as a team, build a cache layer for the API"
```

That one sentence triggers a full agentic pipeline: requirements gathering, codebase research, research-informed refinement, architecture planning, parallel implementation, code review, and verification — all coordinated by a lead agent with disk-backed artifacts at every step.

## The Pipeline

Every team follows the same artifact chain. Each phase reads the previous phase's output from disk — no context window pressure, full traceability.

```
prompt.md → clarify → explore → present → requirements.md
  → research(findings.md)
  → REFINE LOOP (semi-autonomous, grills with research findings)
  → plan(design.md + team-plan.md)
  → review → spawn → implement → verify
```

### How It Works

| Phase | Agent | What Happens |
|-------|-------|-------------|
| **Persist** | lead | Raw user request saved to `prompt.md` — source of truth for intent |
| **Clarify** | designer | One question at a time, recommended answers, codebase exploration |
| **Explore** | designer | 2-3 approaches with tradeoffs, user picks |
| **Present** | designer | Section-by-section requirement approval |
| **Write** | designer | Synthesizes `requirements.md` — canonical handoff |
| **Research** | researcher | Deep codebase investigation via CocoIndex + claude-mem + code |
| **Refine** | designer | Semi-autonomous: self-resolves code questions, asks humans only for judgment calls. Cross-references research against requirements. |
| **Plan** | planner | Produces `design.md` (architecture) + `team-plan.md` (tasks, ownership, phases) |
| **Implement** | coders | Parallel agents, file-ownership enforced, QB reviews |
| **Verify** | verifier + finisher | Lint, types, tests, cleanup |

### Semi-Autonomous Refine

The refine phase is where research meets requirements. After the researcher explores the codebase, the designer:

- **Self-resolves** questions answerable by code exploration (no lead round-trip)
- **Returns to lead** only for human-judgment questions (scope, priority, preference)
- Tracks rounds, self-resolved vs human-resolved counts
- Max 10 rounds (configurable), every round writes to disk

```
Research found existing cache layer in @scope/utils covering 80% of requirements.
→ Designer self-resolves: "extend existing" instead of "build new"
→ Updates requirements.md inline
→ Asks human: "Should we add TTL support? Recommended: yes, existing pubsub supports it."
```

## Agent Roster

Every agent has explicit tool scoping — researchers can't edit code, reviewers can't write source files.

### Planning Phase

| Agent | Role | Tools |
|-------|------|-------|
| `team-designer` | Phase-aware requirements (clarify/explore/present/write/refine) | Read, Glob, Grep, Write, Bash |
| `team-researcher` | Codebase investigation, evidence gathering | Read, Glob, Grep, Write, Bash |
| `team-planner` | Architecture + task decomposition | Read, Glob, Grep, Write, Bash |

### Execution Phase

| Agent | Role | Tools |
|-------|------|-------|
| `team-coder` | Implementation | Read, Write, Edit, Glob, Grep, Bash |
| `team-reviewer` | Code quality review | Read, Glob, Grep, Bash, Write |
| `team-spec-reviewer` | Spec compliance (runs before quality review) | Read, Glob, Grep, Bash |
| `team-tester` | Test strategy + writing | Read, Write, Edit, Glob, Grep, Bash |
| `team-verifier` | Lint, types, knip, tests | Read, Glob, Grep, Bash, Write |
| `team-finisher` | Remove logs, enforce standards (runs last) | Read, Write, Edit, Glob, Grep, Bash |
| `team-architect` | Deep-dive module analysis (mid-execution) | Read, Glob, Grep, Bash, Write |
| `team-investigator` | Root cause debugging | Read, Glob, Grep, Write, Bash |
| `team-security-auditor` | OWASP security audit | Read, Glob, Grep, Bash, Write |
| `team-codex-verifier` | Verify stage delegated to a Codex worker — **opt-in**, see below | Read, Write, Bash |

## Codex Execution Lane (opt-in)

A verify stage can run on an OpenAI Codex worker instead of a Claude subagent. It is **off unless a
plan asks for it**: delegation rides the `Agent` field a task already has — name
`team-codex-verifier` instead of `team-verifier`. There is no config file, no plan-format field and
no repo-level flag, so a plan that never names the role never touches the lane.

**Requirements**: `codex` on `PATH` and a completed `codex login`. No API key — auth rides your
local login. The upstream `openai/codex-plugin-cc` marketplace plugin must **not** be installed;
this plugin vendors the pieces it needs (installing it injects slash commands, a proactive subagent
and a Stop-hook loop that fight the run lane).

**What you get**: the worker runs the same gates and writes the same `team-session/` artifact, and
the `STATUS:` protocol classifies its output unchanged. Transport failures (dead turn, unreachable
binary, timeout, unparseable envelope) are classified apart from gate verdicts and surface as
`STATUS: BLOCKED` — they go to a human gate rather than burning re-dispatch retries on a worker
that never ran.

**Measured, on a free plan**: ≈1.4 percentage points of a 30-day window per turn. Verdict parity
against the Claude path was identical on a seeded 4-failure set — same file, line, column and error
text. A *failed* turn cost more than the passing turn and the smoke turn combined, so the lane
front-loads zero-cost preconditions rather than retrying.

**Licensing**: `codex-lane/vendor/codex-plugin-cc/**` is Apache-2.0, © OpenAI, vendored verbatim at
`v1.0.6 @ db52e28` and never patched; `LICENSE` and `NOTICE` ship beside it. Everything else in this
plugin is MIT.

## Natural Language Triggers

No special syntax. The lead interprets intent:

| What You Say | What Happens |
|-------------|-------------|
| "as a team, build X" | Full pipeline: persist → clarify → plan → implement |
| "that's clear" / "move on" | Exit clarify → explore approaches |
| "option A" / "go with B" | Selection recorded → present requirements |
| "approved" / "looks good" | Approve section → next |
| "plan it" / "let's plan" | Exit refine → planning |
| "skip refine" | Bypass refine, straight to planner |
| "as a team (fork), build X" | Fork mode — ~10x cost reduction on parallel agents |

## Structured Coordination

### Disk-Backed Artifacts

All state lives on disk in `team-session/{team-name}/`. No in-memory-only state. Agents are stateless — they read previous phases from disk, write their output, return. Context windows don't limit history.

### STATUS Protocol

Every agent ends with a structured status:

```
STATUS: CLEAN                              — done, no issues
STATUS: PARTIAL — completed 3/5 tasks      — progress, more to do
STATUS: ERRORS_REMAINING: 2 in @scope/api  — tried, issues remain
STATUS: BLOCKED — missing API schema       — can't proceed
```

### Interrupt Protocol

Lead can interrupt long-running agents:

```
INTERRUPT: scope changed
Action: pause | abort | report_status
```

Agents complete their current atomic operation, write progress to disk, respond with status.

### Phase Gating

Phases are sequential. Tasks within a phase run in parallel. `blockedBy` enforces ordering. QB reviews gate phase transitions.

## Skills

| Skill | Purpose |
|-------|---------|
| `team-kit-create` | Full pipeline: scope → plan → spawn prompt |
| `team-kit-run` | Execute a task as a native-workflow multi-agent run |
| `workspace-fix` | Fix lint/types/knip in workspace packages |
| `changeset` | Generate changesets from git diff |
| `ship` | Changeset + knowledge refresh + git workflow |

## Fork Mode (Cost Optimization)

For ~10x cost reduction on parallel agents:

```bash
export CLAUDE_CODE_FORK_SUBAGENT=1
```

Children inherit the lead's context via prompt cache. First child pays full price, children 2-N pay ~10%.

```
"as a team (fork), implement the auth refactor"
```

## Dependencies

This plugin integrates with four open-source tools. Use `/third-party-manager` to check versions, update, and verify.

| Tool | Purpose | Repo |
|------|---------|------|
| context-mode | Context window protection via FTS5 | [mksglu/context-mode](https://github.com/mksglu/context-mode) |
| claude-mem | Cross-session memory | [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) |
| caveman | Token-optimized communication | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) |
| cocoindex-code | AST-based code search | [cocoindex-io/cocoindex-code](https://github.com/cocoindex-io/cocoindex-code) |

<details>
<summary>Dependency install instructions</summary>

### claude-mem

Cross-session memory and observation capture.

- **Repo**: https://github.com/thedotmack/claude-mem
- **Docs**: https://claude-mem.ai

```bash
npx claude-mem install
# Or: curl -fsSL https://install.cmem.ai/openclaw.sh | bash
```

### cocoindex-code

AST-based semantic code search — 70% token savings vs grep.

- **Repo**: https://github.com/cocoindex-io/cocoindex-code

```bash
# [full] extra ships torch + sentence-transformers for local embeddings.
# The slim package makes search silently return zero results.
uv tool install --upgrade 'cocoindex-code[full]'
ccc init && ccc index
```

### context-mode

Context window protection via FTS5 knowledge base.

- **Repo**: https://github.com/mksglu/context-mode

Installed via Claude Code marketplace.

### caveman

Token-optimized communication mode (~75% reduction).

- **Repo**: https://github.com/JuliusBrussee/caveman

Installed via Claude Code marketplace. Enable with `/caveman full`.

</details>

## Install

```bash
# add the marketplace (clones the GitHub repo), then install the plugin
/plugin marketplace add samelie/claude-plugin-pnpm
/plugin install claude-plugin-pnpm@adddog-tools
```

## Known Issues

<details>
<summary>claude-mem port mismatch (2026-04-22)</summary>

Hook health check uses hardcoded port calc `37700 + $(id -u) % 100`, but service default is `37777`.

**Fix**: Set port in `~/.claude-mem/settings.json`:

```json
{
  "CLAUDE_MEM_WORKER_PORT": "37701"
}
```

Then restart: `pkill -f worker-service`

</details>
