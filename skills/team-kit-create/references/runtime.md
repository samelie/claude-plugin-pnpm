# Runtime routing

Read before dispatching TeamKit roles or transporting a decision. This is the shared lane contract; tool examples in phase guides use Claude syntax unless marked otherwise.

| Runtime | Dispatch | Observer evidence |
|---|---|---|
| Claude Agent tool | Available `subagent_type`, plain — never `name:`: project settings no longer enable agent teams; if any settings scope enables `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, a named call launches an agent-team teammate, which skips the definition's `skills:` preload (code.claude.com/docs/en/agent-teams.md) | Observers need `CLAUDE_CODE_EXPERIMENTAL_OBSERVER_AGENTS=1` (set) and an eligible role (`intent-keeper` on `team-designer`/`team-planner`, `coder-guard` on `team-coder`); plain native dispatch arms them (re-verified 2.1.296). Named-dispatch arming unprobed at 2.1.296. See `.claude/docs/observer-agents.md`. |
| Codex native collaboration | Available `agent_type` plus required `task_name`; use `fork_turns: "none"` for a fresh reviewer | No Claude observer is supplied by naming a task. Use explicit independent review/goal audit and artifact checks; do not claim they provide live observer intervention. |
| Scripted worker/workflow | Use that executor's documented role projection | Claude workflow `agent({agentType})` never arms an observer (re-verified 2.1.296). Do not infer observer availability from native Agent behavior. Record the actual route. |

- Resolve roles from the current callable tool metadata. A task label is not an agent type. A native assessment writer may map to `agent_type: "default"` when available; record that mapping and its assignment instead of inventing a specialized role.
- Follow the phase's independent-read contract. Native fresh reviewers receive only the assignment and named raw artifacts, not the author's conclusions or inherited conversation.
- Create-lane fresh checks (frame check, Step 4c-a design critique, SAT Option A, Step 4e audit, Step 6 plan review, discovery refuter): dispatch header, declared read-set and roles live in `fresh-checks.md`.
- Native Codex probe and recorded-read audit procedure: `codex-fresh-check-validation.md`. Report behavior, role/freshness and observed-read results separately; unknown observations never prove isolation.
- Read required instructions completely, in bounded sections if needed. Discover only relevant tool metadata. If a response truncates, read the omitted section before acting on that instruction; extra output volume is not evidence of complete setup.

## Codex execution default

New Codex plans hand off to completion-first execution in `.agents/skills/team-kit-run/references/autonomy.md`. Record charter `limitPolicy: "completion-first-v1"` with dynamic-v1 and autonomous recovery. Default finite counters and time/token values trigger fresh assessment/telemetry, never approval requests; root renews finite allowances through reviewed retained revisions. Explicit user hard ceilings remain enforced. Existing ledgers keep their recorded policy. Declare genuinely stuck only after fresh independent investigation identifies no useful untried in-scope experiment or an exact human-only dependency; continue unrelated authorized work. This paragraph changes no Claude limit or approval protocol.

## Decision transport

Preserve one self-contained decision card: shared scope, question, recommended option, and each option's concrete output and principal tradeoff. Recommendation-first ordering alone is insufficient. Tool submission success proves submission, not readable rendering.

- Follow any higher-priority active remote protocol.
- Otherwise use an eligible question tool when available. Codex async questions accept complete option strings; include output and tradeoff in each string. Do not call a Plan-only tool in Default mode. Respect current tool restrictions on approval questions.
- When no eligible question tool exists, present the same card inline and ask once. Do not require earlier commentary or opening an artifact to understand the choice.
- Optional preferences do not block authorized independent work. Required decisions remain pending until answered; elapsed time is not approval.
