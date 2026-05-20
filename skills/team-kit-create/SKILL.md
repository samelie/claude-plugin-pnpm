---
name: team-kit-create
description: "Scope a problem and create a multi-agent team plan with roles, task lists, and spawn prompt. Triggers: team, agent team, multi-agent, create team, team plan, orchestrate agents, team template, team-kit, parallel team, as a team, team up, work as a team, fork"
---

# /team-kit-create — Scope, Plan, and Structure a Multi-Agent Team

Turn a problem into an agent team plan. This skill handles **creation only** — scoping the problem, defining roles, building the task list, and producing a spawn prompt. Execution (TeamCreate, spawning agents, phase gating) happens after.

## Fork Mode Detection

If user's request contains **"fork"** (e.g., "as a team (fork), implement..."):
- Set `fork_mode: true` in team-plan.md frontmatter
- Lead will spawn children WITHOUT subagent_type (triggers fork caching)
- Children self-discover their agent definition via `${CLAUDE_PLUGIN_ROOT}/agents/{agent}.md`
- ~10x cost reduction for children 2-N

**Requires**: `CLAUDE_CODE_FORK_SUBAGENT=1` env var.

See `FRAMEWORK.md` → Fork Mode for full documentation.

## Core Pattern: Lead Dispatches, Designers Execute

**Lead stays lean.** Heavy lifting happens in designer agents:

```
Lead dispatches designer(phase: "clarify") → writes designer/clarify.md → returns
Lead dispatches designer(phase: "clarify") → updates designer/clarify.md → returns
  ... (loop until requirements clear)
Lead dispatches designer(phase: "explore") → reads clarify.md → writes designer/explore.md → returns
User picks approach → lead updates designer/explore.md with selection
Lead dispatches designer(phase: "present") → reads clarify + explore → writes designer/present.md → returns
  ... (loop per section until all approved)
Lead dispatches designer(phase: "write") → reads all designer/*.md → writes requirements.md → returns
Lead dispatches researcher → reads requirements.md → writes researcher/findings.md
Lead dispatches planner → reads requirements.md + findings.md → writes design.md + team-plan.md
```

**Artifact chain**: Every phase reads previous phase's file from `team-session/{team-name}/`. No in-memory-only state. See `SESSION-SCHEMA.md` for full file structure.

Lead owns: user communication, phase transitions, session path.
Designer owns: research, question generation, approach exploration, requirements writing.

## Pipeline

```
[problem] → clarify loop → explore → present loop → write → research + plan → review → spawn prompt
```

```dot
digraph team_kit_create {
  "Input received" [shape=doublecircle];
  "Is it a known template?" [shape=diamond];
  "Present template summary" [shape=box];
  "Is the problem well-scoped?" [shape=diamond];
  "Dispatch designer(clarify)" [shape=box];
  "Present question to user" [shape=box];
  "Requirements clear?" [shape=diamond];
  "Is this team-sized?" [shape=diamond];
  "Redirect to writing-plans" [shape=box];
  "Dispatch designer(explore)" [shape=box];
  "User selects approach" [shape=box];
  "Dispatch designer(present)" [shape=box];
  "Section approved?" [shape=diamond];
  "All sections approved?" [shape=diamond];
  "Dispatch designer(write)" [shape=box];
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
  "Is the problem well-scoped?" -> "Dispatch designer(clarify)" [label="no"];
  "Dispatch designer(clarify)" -> "Present question to user";
  "Present question to user" -> "Requirements clear?";
  "Requirements clear?" -> "Dispatch designer(clarify)" [label="no"];
  "Requirements clear?" -> "Is this team-sized?" [label="yes"];
  "Is the problem well-scoped?" -> "Is this team-sized?" [label="yes"];
  "Is this team-sized?" -> "Redirect to writing-plans" [label="no"];
  "Is this team-sized?" -> "Dispatch designer(explore)" [label="yes"];
  "Dispatch designer(explore)" -> "User selects approach";
  "User selects approach" -> "Dispatch designer(present)";
  "Dispatch designer(present)" -> "Section approved?";
  "Section approved?" -> "Dispatch designer(present)" [label="revise"];
  "Section approved?" -> "All sections approved?";
  "All sections approved?" -> "Dispatch designer(present)" [label="next section"];
  "All sections approved?" -> "Dispatch designer(write)" [label="yes"];
  "Dispatch designer(write)" -> "Dispatch researcher + planner";
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
| Contains "design", "spec", "requirements", "what should we build" | **Design** — dispatch designer phases, then planner |
| Clear, detailed spec | **Plan** — skip clarification, go to Step 3 |
| Vague, broad, or exploratory | **Clarify** — dispatch designer(clarify) loop |
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

## Step 2c: Clarify Loop (dispatch designer)

When problem is vague/broad, run the clarify loop.

**Follow `team-kit-clarify` skill** — it tells you HOW to dispatch.

### The Loop

```javascript
// Create session folder first
const session_path = `team-session/${team_name}/`
// mkdir -p ${session_path}designer/

while (!requirements_clear) {
  // Dispatch designer for ONE question
  Agent({
    subagent_type: "claude-plugin-pnpm:team-designer",
    description: `Clarify requirements - question ${N}`,
    prompt: `
Phase: clarify
Session path: \`${session_path}\`

Problem: ${problem_description}

Read existing \`${session_path}designer/clarify.md\` if it exists (contains previous Q&A).
Generate ONE focused question to clarify requirements.
Update \`${session_path}designer/clarify.md\` with any new Q&A entries and resolved requirements.
`
  })
  
  // Designer returns question + writes/updates designer/clarify.md
  // Present question to user
  // Collect answer
  // On next dispatch, designer reads its own previous output from disk
  // Evaluate: are ALL requirements clear?
}
```

### Exit Condition

Requirements clear when lead can answer ALL:

| Question | Answer |
|----------|--------|
| What packages/modules? | [list] |
| What deliverables? | [list] |
| What acceptance criteria? | [list] |
| Any constraints? | [list or none] |

### Team-size decision

After clarification, evaluate: **is this actually a team-sized problem?**

| Signal | Verdict |
|--------|---------|
| 1-3 files, single module, sequential work | **Not a team** — redirect to single-agent planning |
| 3+ files across multiple independent modules | **Team candidate** |
| Parallel exploration adds value | **Team candidate** |
| Same-file edits, heavy dependencies between tasks | **Not a team** — single session is better |

If not team-sized:
> This looks like a single-agent task. Use standard implementation approach.

If team-sized: proceed to Step 3.

---

## Step 3: Approach Exploration (dispatch designer)

Before committing to a design, explore alternatives.

**Follow `team-kit-explore` skill** — it tells you HOW to dispatch.

### Dispatch

```javascript
Agent({
  subagent_type: "claude-plugin-pnpm:team-designer",
  description: "Explore implementation approaches",
  prompt: `
Phase: explore
Session path: \`${session_path}\`

Read \`${session_path}designer/clarify.md\` for resolved requirements and Q&A context.
Explore codebase. Propose 2-3 approaches with tradeoffs and recommendation.
Write output to \`${session_path}designer/explore.md\`.
`
})
```

### User Selection

Present approaches, ask user to pick. Designer writes chosen approach to `designer/explore.md`.

Proceed to Step 3b.

---

## Step 3b: Present Requirements (dispatch designer)

After approach selected, present requirements section-by-section for user approval.

### Dispatch Loop

```javascript
// Present sections one at a time: Problem, Requirements, Approach, Criteria, Constraints
const sections = ['Problem', 'Requirements', 'Approach', 'Acceptance criteria', 'Constraints'];

for (const section of sections) {
  Agent({
    subagent_type: "claude-plugin-pnpm:team-designer",
    description: `Present ${section} for approval`,
    prompt: `
Phase: present
Session path: \`${session_path}\`
Section: ${section}

Read \`${session_path}designer/clarify.md\` and \`${session_path}designer/explore.md\`.
Read existing \`${session_path}designer/present.md\` if it exists (contains previous approvals).
Present the "${section}" section for user approval.
Update \`${session_path}designer/present.md\` with approval status.
`
  })

  // Designer returns section content for user
  // Present to user, collect approval or revision feedback
  // If revised: re-dispatch with feedback, designer updates present.md
  // If approved: proceed to next section
}
```

### Exit Condition

All 5 sections approved in `designer/present.md`. Proceed to Step 3c.

---

## Step 3c: Write Requirements (dispatch designer)

Final designer phase. Synthesizes all previous phases into the canonical `requirements.md`.

### Dispatch

```javascript
Agent({
  subagent_type: "claude-plugin-pnpm:team-designer",
  description: "Write requirements.md from approved design",
  prompt: `
Phase: write
Session path: \`${session_path}\`

Read ALL previous phase outputs:
- \`${session_path}designer/clarify.md\` — Q&A and resolved requirements
- \`${session_path}designer/explore.md\` — chosen approach and key decisions
- \`${session_path}designer/present.md\` — approved sections and any revisions

Synthesize into \`${session_path}requirements.md\`.
This is the handoff artifact to the planner. It must be complete and self-contained.
`
})
```

### Exit Condition

`requirements.md` written to session root. All decisions from clarify + explore + present captured. Proceed to Step 4.

---

## Step 4: Research + Plan (parallel dispatch)

### 4a: Researcher — deep context gathering (background)

Dispatch `team-researcher` agent in background:

```javascript
// First, create session folder
const session_path = `team-session/${team_name}/`
// mkdir -p ${session_path}

Agent({
  subagent_type: "claude-plugin-pnpm:team-researcher",
  model: "opus",
  run_in_background: true,
  name: "scout",
  prompt: `
Investigate the following for an upcoming team planning session:

## Session Path
Session path: \`${session_path}\`
Write output to: \`${session_path}researcher/\`

## Task
Task: ${task_description}
Chosen approach: ${explore_result.chosen_approach}
Affected packages: ${clarify_context.resolved.packages}

Your job:
1. Query Arcana for prior work, gotchas, architecture decisions
2. Query CocoIndex for existing implementations, key types, module boundaries
3. Explore code to map: entry points, data flows, coupling between modules
4. Document everything in findings.md — the planner will read this

Focus on what a planner needs to decompose this into agent tasks.
`
})
```

### 4b: Invoke planner

After researcher completes, invoke planner. Planner reads from disk — no inline context needed.

```javascript
Agent({
  subagent_type: "claude-plugin-pnpm:team-planner",
  model: "opus",
  prompt: `
## Session Path
Session path: \`${session_path}\`
Write output to: \`${session_path}\`

## Read These Files (all on disk)
- \`${session_path}requirements.md\` — approved requirements (from designer)
- \`${session_path}designer/clarify.md\` — Q&A context
- \`${session_path}designer/explore.md\` — chosen approach + key decisions
- \`${session_path}researcher/findings.md\` — codebase research

## Task
Task: ${task_description}

Generate a complete team plan following FRAMEWORK.md.
Honor the chosen approach in explore.md — do not propose alternatives.
The researcher already queried Arcana and CocoIndex — use their findings.
`
})
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

Lead orchestrates, does NOT implement. Lead dispatches:

| Agent | Role | When dispatched | Writes |
|-------|------|-----------------|--------|
| `team-designer` (clarify) | Q&A loop, resolve requirements | Step 2c (multiple dispatches) | `designer/clarify.md` |
| `team-designer` (explore) | Propose approaches, user selects | Step 3 | `designer/explore.md` |
| `team-designer` (present) | Section-by-section approval | Step 3b (per section) | `designer/present.md` |
| `team-designer` (write) | Synthesize requirements | Step 3c | `requirements.md` |
| `team-researcher` | Deep context via Arcana + CocoIndex + code | Step 4a (background) | `researcher/findings.md` |
| `team-planner` | Generate design.md + team-plan.md | Step 4b (after researcher) | `design.md`, `team-plan.md` |

Lead owns:
- User communication (presenting questions, getting approvals)
- Phase transitions (deciding when clarify is complete, when to proceed)
- Context accumulation (building clarify_context, explore_result)
- Skill invocation (team-kit-present, team-kit-review)
- Final spawn prompt delivery

Lead does NOT:
- Do codebase research (designer/researcher do this)
- Generate questions (designer does this)
- Make technical decisions (planner does this)

---

## Artifact Chain (all on disk)

```
designer/clarify.md    ← designer(clarify) writes, each invocation appends
    ↓ reads
designer/explore.md    ← designer(explore) writes
    ↓ reads both
designer/present.md    ← designer(present) writes, each section appends
    ↓ reads all three
requirements.md        ← designer(write) writes (root, canonical handoff)
    ↓ reads
researcher/findings.md ← team-researcher writes
    ↓ reads requirements.md + findings.md
design.md + team-plan.md ← team-planner writes
```

**No in-memory-only state.** Every phase's output is a file in `team-session/{team-name}/`. Lead passes `session_path` to each dispatch — agents read previous phases from disk.

---

## What This Skill Does NOT Do

- **Execute teams** — no TeamCreate, no spawning agents, no phase gating
- **Implement code** — lead delegates all implementation
- **Skip clarification for vague problems** — always clarify when scope unclear
- **Commit to approach without user input** — always explore alternatives first
- **Do codebase research itself** — dispatches designer/researcher for that

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `team-kit-clarify` | Dispatch guide for designer(phase: clarify) loop |
| `team-kit-explore` | Dispatch guide for designer(phase: explore) |
| `team-kit-present` | Invoked in Step 5 for planner output approval (design.md sections) |
| `team-kit-review` | Invoked in Step 6 for post-plan review |
| `investigation-methodology` | Used by designer and researcher for codebase exploration |
| `team-session-writing` | Compressed doc style for all team-session artifacts |
| `context-mode:grill-with-docs` | Used by designer during clarify for domain challenges |

## Related Agents

| Agent | Phases | Writes | When |
|-------|--------|--------|------|
| `team-designer` | clarify, explore, present, write | `designer/*.md`, `requirements.md` | Steps 2c, 3, 3b, 3c |
| `team-planner` | — | `design.md`, `team-plan.md` | Step 4b (reads requirements.md) |
| `team-researcher` | — | `researcher/findings.md` | Step 4a (background, reads requirements.md) |
| `team-architect` | — | `architect/brief.md` | Mid-execution only (NOT initial planning) |

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
