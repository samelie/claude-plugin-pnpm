---
name: team-kit-create
description: "Scope a problem and create a multi-agent team plan with roles, task lists, and spawn prompt. Triggers: team, agent team, multi-agent, create team, team plan, orchestrate agents, team template, team-kit, parallel team, as a team, team up, work as a team"
---

# /team-kit-create — Scope, Plan, and Structure a Multi-Agent Team

Turn a problem into an agent team plan. This skill handles **creation only** — scoping the problem, defining roles, building the task list, and producing a spawn prompt. Execution (TeamCreate, spawning agents, phase gating) happens after.

## Pipeline

```
[problem] → clarify → explore approaches → research + plan → present → review → spawn prompt
```

```dot
digraph team-kit_create {
  "Input received" [shape=doublecircle];
  "Is it a known template?" [shape=diamond];
  "Present template summary" [shape=box];
  "Is the problem well-scoped?" [shape=diamond];
  "Invoke team-kit-clarify" [shape=box];
  "Scope + requirements clear" [shape=box];
  "Is this a team-sized problem?" [shape=diamond];
  "Redirect to writing-plans" [shape=box];
  "Invoke team-kit-explore" [shape=box];
  "Approach selected" [shape=box];
  "Dispatch researcher + planner" [shape=box];
  "Invoke team-kit-present" [shape=box];
  "Design approved?" [shape=diamond];
  "Invoke team-kit-review" [shape=box];
  "Review passed?" [shape=diamond];
  "User file review gate" [shape=box];
  "Deliver spawn prompt" [shape=doublecircle];

  "Input received" -> "Is it a known template?";
  "Is it a known template?" -> "Present template summary" [label="yes"];
  "Present template summary" -> "Deliver spawn prompt";
  "Is it a known template?" -> "Is the problem well-scoped?" [label="no"];
  "Is the problem well-scoped?" -> "Invoke team-kit-clarify" [label="no — vague/broad"];
  "Is the problem well-scoped?" -> "Is this a team-sized problem?" [label="yes — clear spec"];
  "Invoke team-kit-clarify" -> "Scope + requirements clear";
  "Scope + requirements clear" -> "Is this a team-sized problem?";
  "Is this a team-sized problem?" -> "Redirect to writing-plans" [label="no — single agent"];
  "Is this a team-sized problem?" -> "Invoke team-kit-explore" [label="yes"];
  "Invoke team-kit-explore" -> "Approach selected";
  "Approach selected" -> "Dispatch researcher + planner";
  "Dispatch researcher + planner" -> "Invoke team-kit-present";
  "Invoke team-kit-present" -> "Design approved?";
  "Design approved?" -> "Invoke team-kit-present" [label="no, revise"];
  "Design approved?" -> "Invoke team-kit-review" [label="yes"];
  "Invoke team-kit-review" -> "Review passed?";
  "Review passed?" -> "Dispatch researcher + planner" [label="major issues"];
  "Review passed?" -> "User file review gate" [label="yes"];
  "User file review gate" -> "Deliver spawn prompt";
}
```

## Usage

```
/team-kit-create                        # interactive — asks what you need
/team-kit-create <description>          # scope + plan a team for this task
/team-kit-create health                 # existing template: monorepo health
/team-kit-create deep-clean             # existing template: full sweep
/team-kit-create knip-audit             # existing template: dead code audit
/team-kit-create list                   # show available templates
```

---

## Step 0: Prerequisites

Verify agent teams are enabled:

```bash
claude config get experiments.agentTeams
```

If not enabled:
> Agent teams require the experimental flag. Enable with:
> `claude config set --global experiments.agentTeams true`

Stop until enabled.

---

## Step 1: Triage

Parse input to determine path:

| Input | Path |
|-------|------|
| `list` | **List** — show templates, stop |
| `health`, `deep-clean`, `knip-audit`, `debug` | **Template** — present existing template |
| Contains "debug", "investigate", "root cause", "why is...broken" | **Debug** — use debug template with issue extracted |
| Contains "design", "spec", "requirements", "what should we build" | **Design** — spawn team-designer first, then planner |
| Clear, detailed spec | **Plan** — skip clarification, go to Step 3 |
| Vague, broad, or exploratory | **Clarify** — invoke team-kit-clarify first |
| No args | **Interactive** — ask what they want to build |

### How to judge "well-scoped"

A problem is well-scoped when you can answer ALL of:
- What packages/modules are affected?
- What are the concrete deliverables?
- What are the acceptance criteria?

If any are unclear → clarify first.

---

## Step 2a: List mode

Read `${CLAUDE_PLUGIN_ROOT}/team-templates/` and present:

```
Available team templates:
  health             — lint/types/knip/test on changed packages
  deep-clean         — full workspace sweep, all checks
  knip-audit         — dead code audit across workspace
  debug              — systematic debugging for complex bugs
  k8s-jobs-migration — migrate k8s job definitions
  migrate-scripts    — migrate monorepo scripts

Usage:
  /team-kit-create <name>           — use a template
  /team-kit-create <description>    — plan a custom team
  /team-kit-create debug <issue>    — debug investigation team
```

Stop after listing.

## Step 2b: Template mode

Map shortcut to file:

| Shortcut | Template |
|----------|---------|
| `health` | `${CLAUDE_PLUGIN_ROOT}/team-templates/monorepo-health.md` |
| `deep-clean` | `${CLAUDE_PLUGIN_ROOT}/team-templates/monorepo-deep-clean.md` |
| `knip-audit` | `${CLAUDE_PLUGIN_ROOT}/team-templates/knip-config-audit.md` |
| `debug` | `${CLAUDE_PLUGIN_ROOT}/team-templates/debug-investigation.md` |

1. Read the template
2. Present summary (name, agents, phases, cost estimate)
3. Generate the spawn prompt (see Step 7)
4. **Done** — skill ends here

## Step 2c: Clarify (invoke team-kit-clarify)

When problem is vague/broad, invoke clarification:

```
Skill tool: team-kit-clarify
```

This skill handles one-question-at-a-time requirements extraction:
- Purpose, constraints, success criteria
- Affected packages
- Concrete deliverables

After clarification completes, evaluate: **is this actually a team-sized problem?**

### Team-size decision

| Signal | Verdict |
|--------|---------|
| 1-3 files, single module, sequential work | **Not a team** — redirect to single-agent planning |
| 3+ files across multiple independent modules | **Team candidate** |
| Parallel exploration adds value (competing hypotheses, cross-layer) | **Team candidate** |
| Same-file edits, heavy dependencies between tasks | **Not a team** — single session is better |

If not team-sized:
> This looks like a single-agent task. Use standard implementation approach.

If team-sized: proceed to Step 3.

---

## Step 3: Approach Exploration (invoke team-kit-explore)

Before committing to a design, explore alternatives:

```
Skill tool: team-kit-explore
```

This skill handles:
- Codebase exploration via investigation-methodology
- Proposing 2-3 approaches with tradeoffs
- Getting user selection
- Recording chosen approach for planner

After user selects approach, proceed to Step 4.

---

## Step 4: Research + Plan (parallel dispatch)

### 4a: Researcher — deep context gathering (background)

Dispatch `team-researcher` agent in background:

```
Agent(
  subagent_type = "claude-plugin-pnpm:team-researcher",
  model = "opus",
  run_in_background = true,
  name = "scout",
  prompt = """
  Investigate the following for an upcoming team planning session:

  Task: {task description}
  Chosen approach: {approach from Step 3}
  Affected packages: {package list}

  Your job:
  1. Query Arcana for prior work, gotchas, architecture decisions
  2. Query CocoIndex for existing implementations, key types, module boundaries
  3. Explore code to map: entry points, data flows, coupling between modules
  4. Document everything in findings.md — the planner will read this

  Focus on what a planner needs to decompose this into agent tasks.
  """
)
```

### 4b: Invoke planner

After researcher completes, invoke planner with chosen approach:

```
Agent(
  subagent_type = "claude-plugin-pnpm:planner",
  model = "opus",
  prompt = """
  Task: {task description}

  **Chosen approach**: {approach from Step 3}
  **Key decisions**: {decisions from approach exploration}

  Affected packages: {list}
  Constraints: {from clarification}

  ## Researcher findings
  {paste or summarize the researcher's findings.md here}

  Generate a complete team plan following FRAMEWORK.md.
  Output to team-session/{team-name}/

  The researcher already queried Arcana and CocoIndex — use their findings
  as your starting point.
  """
)
```

Planner produces:
- `design.md` — human-readable architecture summary
- `team-plan.md` — full plan with roles, tasks, ownership, phases
- `team-scope.json` — scope config for hook enforcement

---

## Step 5: Present Design (invoke team-kit-present)

After planner returns, present design section-by-section:

```
Skill tool: team-kit-present
```

This skill handles incremental approval:
1. Components/Architecture → approve
2. Data Flow/Interfaces → approve
3. File Ownership → approve
4. Task List → approve

If any section rejected → revise → re-present.

After all sections approved, proceed to Step 6.

---

## Step 6: Post-Plan Review (invoke team-kit-review)

Run review checklist on design.md + team-plan.md:

```
Skill tool: team-kit-review
```

This skill checks:
- Placeholder scan (no TBD/TODO)
- Internal consistency
- Type consistency
- Ambiguity check
- Scope check

If review passes → proceed to Step 7.
If issues found → fix or re-run planner → re-review.

---

## Step 7: File Review Gate + Spawn Prompt

### 7a: User file review

Before delivering spawn prompt, ask user to review actual files:

> "Plan complete. Please review these files before proceeding:
> - `team-session/{team-name}/design.md` — architecture summary
> - `team-session/{team-name}/team-plan.md` — full execution plan
>
> Let me know if you want any changes."

Wait for user approval. If changes requested → edit → re-present relevant sections.

### 7b: Deliver spawn prompt

After user approves files, generate ready-to-paste prompt:

```
Read `team-session/{team-name}/team-plan.md`.
Create a team named "{team-name}" using TeamCreate.
Press Shift+Tab to enable delegate mode.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

For template mode, point to template file instead:

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/{template}.md`.
Create a team named "{team-name}" using TeamCreate.
Press Shift+Tab to enable delegate mode.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

Present to user:

> **Team plan ready.** Paste this to start execution:
>
> ```
> {spawn prompt}
> ```
>
> This will create the team and begin orchestration.

**Skill ends here.** Do not execute the team — that's a separate action.

---

## Lead's Role: Delegation Model

Lead orchestrates, does NOT implement. Lead delegates to subagents:

| Subagent | Role | When dispatched |
|----------|------|-----------------|
| `team-researcher` | Deep context via Arcana + CocoIndex + code | Step 4a (background) |
| `planner` | Generate design.md + team-plan.md | Step 4b (after researcher) |
| `team-architect` | Deep-dive specific module | Mid-execution if needed |

Lead owns:
- User communication (clarification, approach selection, approvals)
- Skill invocation (team-kit-clarify, team-kit-explore, team-kit-present, team-kit-review)
- Synthesizing subagent findings
- Final spawn prompt delivery

---

## What This Skill Does NOT Do

- **Execute teams** — no TeamCreate, no spawning agents, no phase gating
- **Implement code** — lead delegates all implementation
- **Skip clarification for vague problems** — always clarify when scope unclear
- **Commit to approach without user input** — always explore alternatives first

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `team-kit-clarify` | Invoked in Step 2c for requirements extraction |
| `team-kit-explore` | Invoked in Step 3 for approach exploration |
| `team-kit-present` | Invoked in Step 5 for section-by-section approval |
| `team-kit-review` | Invoked in Step 6 for post-plan review |
| `investigation-methodology` | Used by team-kit-explore and researcher for codebase exploration |
| (execution phase) | After spawn prompt, lead follows FRAMEWORK.md orchestration checklist |

## Related Agents

| Agent | When to use |
|-------|-------------|
| `planner` | Initial planning — produces design.md + team-plan.md |
| `team-researcher` | Deep context gathering before planner |
| `team-architect` | Mid-execution module deep-dive (NOT initial planning) |

## Edge Cases

| Situation | Action |
|-----------|--------|
| Agent teams not enabled | Show enable command, stop |
| No template matches shortcut | Fall through to custom/clarify path |
| Researcher returns nothing useful | Planner still runs — researcher findings are additive |
| Planner fails | Show error, offer retry |
| User wants to modify plan | Edit and re-present relevant sections |
| Not team-sized after clarification | Redirect to single-agent approach |
| User already has a spec/design doc | Skip clarification, go to approach exploration |
| User says "just run it" after plan | Present spawn prompt, remind execution is separate |
| Review finds major issues | Re-run planner with feedback, not just inline fixes |
