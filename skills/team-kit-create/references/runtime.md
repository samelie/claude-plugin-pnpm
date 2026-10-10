# Runtime routing

Read before dispatching TeamKit roles or transporting a decision. This is the shared lane contract; tool examples in phase guides use Claude syntax unless marked otherwise.

| Runtime | Dispatch | Observer evidence |
|---|---|---|
| Claude Agent tool | Available `subagent_type`; plain dispatch remains a compatibility precaution | `intent-keeper` requires the observer environment flag and an eligible role. Named-dispatch disarm was reported obsolete at 2.1.233; do not repeat it as an unconditional rule. See `.claude/docs/observer-agents.md` for measured version scope. |
| Codex native collaboration | Available `agent_type` plus required `task_name`; use `fork_turns: "none"` for a fresh reviewer | No Claude observer is supplied by naming a task. Use explicit independent review/goal audit and artifact checks; do not claim they provide live observer intervention. |
| Scripted worker/workflow | Use that executor's documented role projection | Do not infer observer availability from native Agent behavior. Record the actual route. |

- Resolve roles from the current callable tool metadata. A task label is not an agent type. A native assessment writer may map to `agent_type: "default"` when available; record that mapping and its assignment instead of inventing a specialized role.
- Follow the phase's independent-read contract. Native fresh reviewers receive only the assignment and named raw artifacts, not the author's conclusions or inherited conversation.
- Read required instructions completely, in bounded sections if needed. Discover only relevant tool metadata. If a response truncates, read the omitted section before acting on that instruction; extra output volume is not evidence of complete setup.

## Decision transport

Preserve one self-contained decision card: shared scope, question, recommended option, and each option's concrete output and principal tradeoff. Recommendation-first ordering alone is insufficient. Tool submission success proves submission, not readable rendering.

- Follow any higher-priority active remote protocol.
- Otherwise use an eligible question tool when available. Codex async questions accept complete option strings; include output and tradeoff in each string. Do not call a Plan-only tool in Default mode. Respect current tool restrictions on approval questions.
- When no eligible question tool exists, present the same card inline and ask once. Do not require earlier commentary or opening an artifact to understand the choice.
- Optional preferences do not block authorized independent work. Required decisions remain pending until answered; elapsed time is not approval.
