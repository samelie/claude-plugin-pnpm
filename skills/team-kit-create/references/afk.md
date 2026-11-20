# afk + autoRun — Claude-lane reference (`.claude/team-kit.local.json`)

Claude lane only — Codex ignores this file and the config. Read it when the skill's banner shows `afk=true`, or when it shows `autoRun=true` at create Step 7b or at `/team-kit-resume` continuing create. While it applies it outranks every ask / wait / present / escalate-to-human instruction in the loaded skill, its `references/` and `.claude/team-kit.md`.

## §Config

- **Path**: `.claude/team-kit.local.json` at the project root, gitignored by the repo `.gitignore` line `/.claude/team-kit.local.json`. Start from `.claude/team-kit.local.example.json`.
- **Keys**: `afk` and `autoRun`, booleans, default `false`. A `"//"` key holds documentation and is ignored, any value.
- **Sole source**: the file is the only switch — no CLI argument and no prompt keyword overrides it, for one invocation or any other.
- **Load-time vs live**: the banner and the lead's afk / autoRun behavior are the values resolved when the skill loaded; the hooks (`ask-gate`, `stop-nudge`, `banner-gate`) read the file live on every call. Flipping the file mid-session changes the hooks only.
- **One config per checkout**: flipping the file reaches every session in this checkout that loaded a TeamKit skill — `afk: true` set for an unattended effort makes the hooks deny and nudge an interactive session too, and `afk: false` silences an afk session's backstops. The hook cannot tell sessions apart; the per-session signal is the banner. A session whose banner line 1 showed `afk=false` (or whose banner did not run) keeps asking in plain text and ends the turn, whatever the file says now.

Resolution (every case yields a banner; nothing aborts the skill):

| Input | afk / autoRun | Banner warning line |
|---|---|---|
| file absent (`ENOENT` / `ENOTDIR`) | false / false | none — source line reads `(absent — defaults)` |
| other read error (`EACCES`, `EISDIR`, …) | false / false | `WARNING: unreadable (<code>) — both flags forced false` |
| leading U+FEFF | stripped, then parsed | — |
| not valid JSON | false / false | `WARNING: not valid JSON (<parser message, one line>) — both flags forced false` |
| top level null / array / string / number / boolean | false / false | `WARNING: top level is <null\|array\|string\|number\|boolean>, expected an object — both flags forced false` |
| object, `afk` or `autoRun` not a boolean | false / false (both forced) | `WARNING: "<key>" is <value> (<type>), expected true or false — both flags forced false` |
| object, unknown key | known keys keep their values | `WARNING: unknown key "<key>" ignored` (+ ` — did you mean "<known>"?` when it differs from a known key only by case) |
| object, known keys absent | absent key = false | none — source line names them `(<keys> absent — default false)` |
| object, valid | `afk === true`, `autoRun === true` | none |

Warnings are listed in file key order; any warning drops the banner's suffix and its afk `note:` line.

Reader: `.claude/skills/team-kit-create/scripts/teamkit-config.mjs` (run and resume reach it through their `scripts/teamkit-config.mjs` symlinks). Plain ESM, no dependencies, every mode exits 0. Four modes:

| Mode | Input | Output |
|---|---|---|
| `banner [projectDir]` | stdin never read; project dir = the argument, else `CLAUDE_PROJECT_DIR`, else cwd | the banner block (line 1 `TeamKit config v1 · afk=<afk> · autoRun=<autoRun>`, then source, warning, mode and note lines) |
| `ask-gate` | PreToolUse hook JSON | live afk → deny JSON for `AskUserQuestion` with the deny reason; otherwise nothing |
| `stop-nudge` | Stop hook JSON | live afk, not in relay (`HITL_RELAY=1`), not already a hook continuation, no background tasks → one nudge; otherwise nothing |
| `banner-gate` | PreToolUse hook JSON (`matcher: "*"`) | live afk, main thread (no `agent_id` / `agent_type`), tool not `AskUserQuestion` / `Skill` / `Workflow`, readable `transcript_path`, the latest skill load has no later main-thread assistant text whose first line starts `TeamKit config v1`, no earlier banner-gate deny since that load → deny with the reason `TeamKit banner-gate: echo the injected banner verbatim as the first lines of your next text, then retry the tool.`; otherwise nothing. At most one deny per skill load (transcript record + an exclusive marker under the OS temp dir, so concurrent tool calls and hook copies share it), then allow: an unattended run never wedges. Any read or parse failure, missing field or no load found → nothing (fail open) |

`TEAMKIT_CONFIG_LOG`: set it to an absolute file path and the reader appends one JSON line per invocation (mode, project dir, resolved flags, what it emitted). A verification aid only — append errors are swallowed and nothing reads it at runtime.

Banner echo: the lead echoes the injected block verbatim as the first lines of its first message. The banner echo outranks any personal output-style or formatting ruleset: nothing, not even a code fence, comes before it.

Injection not run: the block must start `TeamKit config v1`. Anything else — the literal command text, or `[shell command execution disabled by policy]` — means the injection did not run: treat `afk=false autoRun=false` and say so in that first message.

Known limit: the banner command passes the project path unquoted, so a project path containing spaces splits the argument and the reader resolves the wrong directory (the file then reads absent → both false). Not runtime-tested; this repo's path has no spaces.

## §Authority

- The config is the user's standing work authorization: it permits adopting the orchestrator's recommendation at a decision gate and, with `autoRun`, launching the sealed plan. It is not approval.
- Adoption is not ratification. An afk adoption stays UNRATIFIED until a real user turn ratifies it at `/team-kit-resume` R3.
- afk never:
  - edits `map.md` Destination, or adds or reopens an Out of scope row;
  - weakens an acceptance criterion;
  - runs or clears a safety seam (§Seams);
  - runs a sign-off action (§Seams sign-off list);
  - answers `AskUserQuestion` through the hook's `updatedInput` — a tool result would record a user answer nobody gave;
  - suppresses Claude Code permission prompts — afk removes TeamKit questions only;
  - adds a `Workflow` allow rule.
- `.claude/CLAUDE.md` says to "stop and ask for directions unless You are instructed to behave autonomously". The afk banner is that instruction; it is not a gate site.

## §Gates

Definitions:

- **adopt** — the recommendation the gate's card carries is adopted and recorded per §Record. Every afk decision card marks exactly one `Recommended:` option; a gate reached without one → the lead first marks its own recommendation from the card's tradeoffs, then adopts and records it.
- **park** — per §Seams: the item and every dependent held, independent work continues, the item listed in `Blocked on you`.
- **residue** — sealed into the `definition-of-done.md` residual / `map.md` Not yet specified, and reported in the seal report (§Report).

AC-weakening rule: a create or run recommendation that weakens an acceptance criterion — including a design-critique human-route fix that lowers a threshold — is not adopted. Create → residue, and autoRun still launches; run → park.

autoRun launch gate: every "autoRun still launches" below passes the §autoRun launch gate. Rows 10, 15 and 33 (goal-audit / SAT residue) read: residue, and autoRun launches only through that gate — held while run boot's seal check (`scripts/check-inline-fixes.mjs`) fails, the gate named in `Blocked on you` (§autoRun step 0). A design-critique-only residue (row 9) still launches.

Run `PD-n` authority (rows 18 and 19): an adopted run ruling carries the locator `authorization: .claude/team-kit.local.json afk: true (banner line 1 at run load) + afk.md §Gates #18` (or `#19`). For those two rows' classes only, afk.md overrides run SKILL.md § Orchestrator rulings:

- the premise-ruling locator paragraph — "Under the opt-in evidence/applicability protocol a ruling that touches a premise…" (run :372-377): the locator above is the authorization locator it asks for;
- the "Out of a ruling's reach" material-delta bullet (run :391-394): a material delta or premise strike in those classes becomes an adopted `PD-n` ruling, contract files unedited, instead of escalating.

Still out of reach under afk: a Destination / Out-of-scope change or a blocking-AC lowering → park. Paid or irreversible → never adopted, park — "A blanket grant never authorises a paid or irreversible run" (run :388-389).

`Source: user` mentions the skills leave unedited read "`Source: user`, or under afk the `Source: afk` form" (§Record): create SKILL.md Step 4c-a (:319), `team-templates/DESIGN-CRITIQUE.md` :58, :72, :87, create `references/discovery.md` :122.

Workflow launch (no gate site in any skill) → §Launch denied.

Line numbers below are the 2026-10-29 snapshot, taken before this effort's banner insertion; the files have moved since — re-anchor by the quoted gate text. create / run / resume = `.claude/skills/team-kit-{create,run,resume}/SKILL.md`; `references/…` = `.claude/skills/team-kit-create/references/…`.

| # | Skill | Gate | Site | afk disposition |
|---|---|---|---|---|
| 1 | create | no args → "ask what they want to build" | create § Step 1: Triage :166 | end the turn with the §Missing target create notice; never invents a task |
| 2 | create | clarify question | create § Step 2c: Clarify Loop :195 | adopt |
| 3 | create | approach pick + key decisions | create § Step 3: Approach Exploration :215 | adopt |
| 4 | create | present 5 sections | create § Step 3b: Present Requirements :221 | adopt; Approval Log state `unratified (afk)` + card link (§Record present state) |
| 5 | create | loop-budget checkpoint | create § Loop budgets — canonical :46 | §Budget: never grants; seals, an open `silent` finding under `Blocked on you`; never option (c) narrow scope |
| 6 | create | remote-hitl transport | create § Remote Mode (headless / discord relay) :50-52 | afk outranks it: no cards; notify-only at seal and at run end = the relay's `🏁 done` final text (§Report relay lines); Stop-nudge silent in relay (§Report) |
| 7 | create | discovery grill / prototype | create § 4b: Discovery Loop :257-258 | adopt |
| 8 | create | premise strike / frame-check reopen | create § 4b: Discovery Loop :267 | adopt, unless it edits Destination / Out of scope → residue; autoRun still launches |
| 9 | create | design critique human route | create § Step 4c-a: Design Critique :319 | adopt the critic's recommendation; a Destination / Out-of-scope-only fix → not adopted, the Blocker sealed as residue + reported; autoRun still launches (a design-critique-only residue passes the launch gate) |
| 10 | create | goal audit BLOCKED / not CLEAN ×2 | create § Step 4e: Plan-vs-Goal Audit :463-465 (+ `references/acceptance.md` § Step 2 — Audit loop :236, :240, :265) | adopt the auditor's recommendation; an exclusion challenge → residue; autoRun launches only through the §autoRun launch gate — held while run boot's seal check (`scripts/check-inline-fixes.mjs`) fails, the gate named in `Blocked on you` |
| 11 | create | Step 5 six sections | create § Step 5: Present Design :469-482 | adopt; the §6 autonomy grant recorded UNRATIFIED |
| 12 | create | 7-gate `Source: user` row | create § 7-gate: Seal the contract :525 | accept the afk form (point edit at this row; §Record) |
| 13 | create | 7a material deltas | create § 7a: File review :539 | adopt |
| 14 | create | 7b launch handoff | create § 7b: Hand off to /team-kit-run :547 (+ the :8 summary line under the H1) | autoRun → §autoRun firebreak + chain run (point edits :547, :8); else the seal report (§Report); the Skill call passes via the `Skill(team-kit-run)` allow rule in every mode (trusted workspace); residue → still launches; live hazard → held (§Seams hazard); the first Workflow launch needs auto mode + one earlier approved launch (§autoRun precondition, banner note); denied / cancelled → never retried (§Launch denied); the Workflow opt-in = `autoRun: true` (`.claude/team-kit.md` Ultracode Policy) |
| 15 | create | SAT destination unreachable (mode 4) | create § Edge Cases :625 (+ § The five ways an AC turns out unsatisfiable :412, § Who runs it :444; `references/acceptance.md` § Step 1b — SAT :203-216) | the blocking AC → DoD residue + reported; autoRun launches only through the §autoRun launch gate — held while run boot's seal check (`scripts/check-inline-fixes.mjs`) fails, the gate named in `Blocked on you` |
| 16 | create, run | sign-off surfaces (authenticated / external / prod URL / remote mutation) | create § Step 4c-b: Verification Approach :334, :365; run § Measurement — exercising the running product :241-243 (measurer "needs human" column) | never run; each listed in `Blocked on you` (§Seams sign-off list) |
| 17 | run | `type: HITL` + prod checklist | run § Prod-gating (mandatory) :192; run § Autonomy contract :414 | park the task + its dependents (§Seams) |
| 18 | run | BLOCKED / NEEDS_CONTEXT after failed triage (incl. the 2nd stop in a stage streak :452; a plan-declared direct gate :436 — no triage, the lead's own recommendation) | run § Autonomy contract :415, :422-428 | adopt the brief's recommendation as a `PD-n` ruling, UNRATIFIED, with the run `PD-n` authority locator above (`#18`); a Destination / Out-of-scope change or blocking-AC lowering → park |
| 19 | run | material delta / premise strike | run § Autonomy contract :416 (+ § Orchestrator rulings :391-394 out-of-reach list, :372-377 locator rule; § Sealed contract + context firebreak :333 unsatisfiable-AC route) | adopt as a `PD-n` ruling, contract files unedited, with the run `PD-n` authority locator above (`#19`); a Destination / Out-of-scope change or blocking-AC lowering → park; paid / irreversible → park (§Seams) |
| 20 | run | INTEGRITY | run § Autonomy contract :417 | park |
| 21 | run | cap / fix-ceiling exhaustion (incl. budget-throw / agent-cap BLOCKED :572, refused dispatch :475, transport auto-resume spent :48) | run § Autonomy contract :418 | park; never self-raised |
| 22 | run | paid 2nd attempt | run § Autonomy contract :419 | park |
| 23 | run | NEEDS_HUMAN_EVIDENCE | run § Autonomy contract :420 | park |
| 24 | run | invocation "infer from context or ask briefly" | run § Canonical invocation contract :298 | infer from the sealed contract; a field still missing → the §Missing target run notice in `Blocked on you`; never a guessed value |
| 25 | run | procedure 4 "present and wait" | run § Procedure (orchestrator) :484 | park / adopt + continue independent work — each sub-case takes its own row: `type: HITL` / paid → #17, #22; BLOCKED / NEEDS_CONTEXT / stall (triage failed or plan-declared direct gate) → #18; contract question → #19 |
| 26 | run | final message | run § Output :593 | add the `Adopted for you — UNRATIFIED` section (§Report) |
| 27 | resume | Step 7 "Claude retains its explicit launch handoff" | resume § Scope :18 (+ § Relationship to other skills :133 row) | honors autoRun (point edits :18, :133; §autoRun) |
| 28 | resume | ambiguous session dir → ask | resume § Step R0: Reconstitute :24 | the §Missing target resume notice listing the candidates by `map.md` mtime; no pick |
| 29 | resume | live hazard → human before the first step | resume § Step R1: Hazard sweep :37 | listed first in `Blocked on you`; never acted on; planning continues to seal; autoRun not launched (§Seams hazard) |
| 30 | resume | R3 ratification sweep | resume § Step R3: Ratification sweep :45-75 | deferred; gates stay UNRATIFIED (the :47 point edit → afk.md §Record pointer) |
| 31 | create (any create agent) | create-lane `BLOCKED` / `NEEDS_CONTEXT` → "escalate to human, never re-dispatch" | `.claude/team-kit.md` § Team Session + STATUS :46 | adopt the lead's own recommendation for the blocker, recorded UNRATIFIED (§Record); the re-dispatch carries the adopted answer and spends the step's loop budget (§Budget); human-only input → residue + `Blocked on you`; a Destination / Out-of-scope-only fix → residue; never weakens an acceptance criterion; autoRun still launches |
| 32 | create | discovery `STATUS: BLOCKED` → "escalate to human — never re-dispatch" | `references/discovery.md` § Lead action table :109 | as #31 |
| 33 | create | SAT not CLEAN after Claude cap 2 (modes 1-3, 5; Claude keeps its "cap-2 escalation", `references/acceptance.md` :29) | create § Who runs it :443; `references/acceptance.md` § Step 1b — SAT :140, :213 | adopt the auditor's recommendation (the planner re-dispatch spends the plan-revision budget, §Budget); a fix that weakens a blocking AC or moves it out of blocking → not adopted (never weakens an acceptance criterion) → that AC → DoD residue + reported (#15 shape); autoRun launches only through the §autoRun launch gate — held while run boot's seal check (`scripts/check-inline-fixes.mjs`) fails, the gate named in `Blocked on you` |

## §Record

Every afk adoption leaves a card in the session-root store `afk-adoptions.md`, one `map.md` **Decisions so far** row, and — in each phase artifact written under it — the state plus a link to the card. Phase artifacts carry state + link only, never the card's content.

- **Card store** — `afk-adoptions.md` at the session root, written by the create lead or the run orchestrator, append-only, one H2 per adoption:

  ```markdown
  # afk adoptions — {team-name}

  Claude lane · `.claude/team-kit.local.json` `afk: true` · append-only · ratify with `/team-kit-resume` R3

  ## A-{k} {slug}

  | Field | Value |
  |---|---|
  | Status | UNRATIFIED (afk, {YYYY-MM-DD}) |
  | Gate | {skill} {step / gate} — afk.md §Gates #{row} |
  | Map row | D-{n} {slug} |
  | Written under it | {every artifact + section written under this adoption} |
  | Authority | `.claude/team-kit.local.json` `afk: true` — standing work authorization, not approval |

  Scope: {one line}

  | Option | Concrete output | Main tradeoff |
  |---|---|---|
  | {A}: {…} (RECOMMENDED · ADOPTED) | {…} | {…} |
  | {B}: {…} | {…} | {…} |

  Recommended: {option} — {why}
  Question for R3: {question}
  R3 class hint: {Blocking | Integrity | Forced | Deferrable | Carried} — {why}
  ```

- **Ids**: `A-{k}` sequential within the store; `{slug}` lowercase kebab (`[a-z0-9]+(-[a-z0-9]+)*`, the form the validator's afk locator matches); the card anchor is `afk-adoptions.md#a-{k}-{slug}`; map rows take the next free `D-n`.
- **`map.md` Decisions so far row** (3 cells; `field()`-parseable): `| D-{n} {slug} | {gist}; Source: afk; Gate: {gate} | afk-adoptions.md#a-{k}-{slug} — UNRATIFIED (afk, {YYYY-MM-DD}) |`
- **Design-critique human-route row**: `| D-{n} {slug} | DC-{m} {finding slug} — fixed: {concrete change}; Rationale: {concrete}; Source: afk; Gate: create Step 4c-a design critique | afk-adoptions.md#a-{k}-{slug} — UNRATIFIED (afk, {YYYY-MM-DD}) |` — the `— rejected` form adds `; Material acknowledgement: accepted; Critic rationale: {…}; Rejection rationale: {…}` for a Blocker.
- **Discovery Q&A `Source` cell**: `afk — UNRATIFIED (afk, {YYYY-MM-DD}) → afk-adoptions.md#a-{k}-{slug}`.
- **Present state**: an afk-adopted present section's Approval Log state reads `unratified (afk)` + the card link.
- **Step 5 §6 autonomy grant**: adopted and recorded UNRATIFIED.
- **Seal acceptance**: the create 7-gate `Source: user` row and `check-design-critique.mjs` accept these afk forms only while the session's project config resolves `afk=true`; with afk off a `Source: afk` record is rejected exactly as before.
- **Run adoptions**: a `build-state.md` Orchestrator rulings `PD-n` row — clauses a-d + `UNRATIFIED (afk, {YYYY-MM-DD})` + `authorization: .claude/team-kit.local.json afk: true (banner line 1 at run load) + afk.md §Gates #{18|19}` + `card: afk-adoptions.md#a-{k}-{slug}` — plus the card and one `map.md` Decisions index row. Contract files stay unedited.
- **Budget grant**: none under afk; a grant needs a live user message (§Budget).
- **Designer hand-off**: the lead passes each adopted answer + its card anchor in the next designer dispatch, whose first line is the §Dispatch marker.

R3 lifecycle (`/team-kit-resume` R3, a real user turn):

- Ratify: the map row becomes `{gist}; Source: user; adopted: afk {YYYY-MM-DD}; Gate: {gate} | {user-turn locator} — RATIFIED (user, {YYYY-MM-DD})`; the card takes `Status: RATIFIED (user, {YYYY-MM-DD})` and gains the row `Ratified | {user-turn locator}`.
- Overturn: follow resume "After the sweep" — name every artifact listed in the card's "Written under it".
- Ratified rows pass the validator unchanged with afk off.

## §Budget

At a loop-budget checkpoint (create SKILL.md § Loop budgets — canonical) afk does not present the decision and never grants:

- no `silent` finding open (`references/acceptance.md` → Finding classes) → seal now, as in every mode;
- a `silent` finding open → option (a) **seal now**: the finding goes to `Blocked on you` and its verdict file keeps its non-CLEAN STATUS, so the §autoRun launch gate and run boot hold until the user resolves it;
- never option (b) **grant** — a budget grant needs a live user message. A turn-scoped waiver in `prompt.md` ("take all the recommended choices", `references/approval.md`) is bounded the same way (2026-11-05: two waiver grants took `20261104-moirai-nixos-pivot` from 3 to 5 plan revisions);
- never option (c) **narrow scope** — Destination stays unchanged.

## §Seams

Run park set — never executed or cleared under afk, never self-raised:

- `type: HITL` tasks and the prod checklist;
- INTEGRITY;
- cap / fix-ceiling exhaustion, including a budget-throw or agent-cap BLOCKED, a refused dispatch and a spent transport auto-resume;
- a paid second attempt;
- `NEEDS_HUMAN_EVIDENCE`;
- a recommendation that changes Destination / Out of scope or lowers a blocking acceptance criterion.

Park mechanics: the item and every transitive `blockedBy` dependent are held; independent work continues while caps allow; the run's final message lists each parked item in `Blocked on you`, as a table `# | Item | Why parked | Holds | Path`.

Sign-off actions never run under afk, create or run — each is listed in `Blocked on you`:

- an authenticated session (browser-shepherd);
- an external / third-party / production URL;
- a remote-state mutation;
- a paid spyglass escalation past `sonnet`;
- the codex driver.

Resume R1 live hazard: listed first in `Blocked on you`, never acted on; planning continues to seal; autoRun is not launched.

run `## Prod-gating (mandatory)` and `.claude/rules/kubectl.md` are unchanged — afk relaxes neither.

## §Missing target

Each notice below is the whole answer and ends the turn. afk never invents a task, picks a session or guesses a field.

- create, no task: `TeamKit afk: no task given — afk never invents one. Run /team-kit-create <task>, or set "afk": false in .claude/team-kit.local.json to be asked.`
- resume, ambiguous session dir: `TeamKit afk: ambiguous session dir — afk never picks one. Candidates by map.md mtime, newest first:` then one line per candidate `- team-session/{name}/ — map.md {YYYY-MM-DD HH:MM}`, then `Run /team-kit-resume team-session/{name}/.`
- run, field unresolved after inferring from the sealed contract: `## Blocked on you` then `- TeamKit afk: {FIELD} unresolved after inferring from the sealed contract — afk never guesses. Supply it and re-run /team-kit-run {abs session}.` (`{abs session}` = `<session>` when no session is known.)

## §Dispatch marker

While afk is on, this line is the first line of every create-lane and resume dispatch prompt:

`TeamKit afk=true — dispatched under afk ({YYYY-MM-DD}): an afk adoption record (map.md row Source: afk; link cell afk-adoptions.md#a-{n}-{slug} — UNRATIFIED (afk, {date})) stands in for a human answer; never ask the user. Record rules: {abs path of afk.md} §Record.`

The team-designer afk clause keys on a dispatch line starting `TeamKit afk=true`; without the marker the designer checks are unchanged.

## §autoRun

`autoRun: true` is the user's standing Workflow opt-in for exactly one launch — the sealed effort's `/team-kit-run` at create Step 7b, or `/team-kit-resume` continuing create (`.claude/team-kit.md` Ultracode Policy). It covers no other workflow.

Firebreak (create Step 7b, in order):

0. Launch gate (afk only) — checked before step 1. Run boot's seal check fails when `node "$REPO/.claude/skills/team-kit-create/scripts/check-inline-fixes.mjs" "$ABS_SESSION"` exits non-zero: a verdict file (`definition-of-done.md`, `goal-auditor/sat.md`, `goal-auditor/goal-audit.md`, `plan-review.md`) ends neither CLEAN nor ERRORS_REMAINING (a one-line proportionality-skip `sat.md` passes) or lists a `silent` row not closed in `inline-fixes.md`; efforts dated before 2026-11-06 with neither `inline-fixes.md` nor `run-watch.md` keep the older goal-audit/sat rule (run SKILL.md Entry-mode-1 step 1 refuses that seal). Failing → no launch: steps 1-5 are skipped (a held launch writes no `autorun-launch` row and no `spawn-prompt.md`), `map.md` `Phase:` becomes `sealed — autoRun launch held {YYYY-MM-DD}` + `Updated:`, and the turn ends with the create seal report (§Report), whose `Blocked on you` carries this item after any live hazard (listed first, §Seams), verbatim: `- /team-kit-run {abs session} — autoRun launch held: {gate} is not CLEAN; run boot refuses an unsealed plan. Clear that gate, then run it yourself.` (`{gate}` = each verdict file the script names, joined ` and `). A design-critique-only residue passes the check and still launches.
1. Append to `map.md` **Decisions so far**: `| D-{n} autorun-launch | sealed plan entered /team-kit-run without a launch handoff; Source: config; Config: .claude/team-kit.local.json autoRun: true ({YYYY-MM-DD}) | spawn-prompt.md |`
2. Refresh `map.md` `Phase:` (`run (autoRun) — launched {YYYY-MM-DD}`) + `Updated:`; write `spawn-prompt.md` (session root):
   ```markdown
   # Spawn note — {team-name} ({YYYY-MM-DD})
   Resume point: Step 7b sealed → /team-kit-run {abs session} (autoRun)
   Config: afk={v} · autoRun=true (banner line 1)
   Budget: {map.md Budget: line, copied}
   Pending agents: none
   Blocked on you: {count} — {items | none}
   Sealed contract: prompt.md · map.md · requirements.md · design.md · team-plan.md · definition-of-done.md · goal-auditor/sat.md
   ```
3. Live hazard surfaced at resume R1 under afk → stop here: hazard first in `Blocked on you`, no launch.
4. Skill tool `team-kit-run` with args `{abs session}`, same turn. The only text before the call is the create seal report (§Report), emitted once steps 0-3 pass — a report, not handoff text: no launch instruction or question addressed to the user.
5. run entry-mode-1 reads only the sealed contract files listed in step 2 — never planning-chat memory (run SKILL.md "Sealed contract + context firebreak").

- **Launch gate** (afk, step 0): launch only when run boot's seal check passes — `scripts/check-inline-fixes.mjs` exits 0 — else held with the step-0 line. Other residue (a design-critique Blocker) still launches and is never executed.
- **Live hazard** (resume R1, afk) → no launch (step 3).
- **Precondition**: auto mode + one earlier approved Workflow launch. Without it an interactive session waits at `Run a dynamic workflow?`, and a `-p` launch is denied (§Launch denied).
- **Skill call**: passes via the `Skill(team-kit-run)` allow rule in a trusted workspace.

## §Launch denied

A Workflow launch the permission check denies, or the consent dialog cancels (**No** / Esc interactive; `-p` with no `Workflow` rule), is never retried — Stop-nudge continuation included. The run turn ends with `## Blocked on you` whose first item is `- /team-kit-run {abs session} — Workflow launch {denied by the permission check | cancelled at the consent dialog}; afk never retries it. Re-run it yourself (auto mode + one approved launch).` In relay the launch is reported in that final text, not run. Rule 6 relaunch of a run that started and returned (run SKILL.md:43) unchanged.

## §Report

Section orders under afk (needs first, adoptions second — adoptions are asks too):

- create seal under afk: `## Blocked on you` → `## Adopted for you — UNRATIFIED` → `## Residue` → `## Sealed`.
- run final message under afk: `Blocked on you` → `Adopted for you — UNRATIFIED` → `Changed` → `Found` (run SKILL.md:593 order + one section).

Adoption row: `A-{k} {slug}` · gate · adopted option · R3 hint or path.

Both the create seal report and the run final message carry one `Adopted for you — UNRATIFIED` row per card, in that adoption-row form. A range of card ids or a pointer to `afk-adoptions.md` alone does not satisfy it.

Relay one-liners (one per event; autoRun → both in the run's final text):

- `TeamKit afk · {team-name} · sealed — blocked-on-you {n} · adopted-unratified {m} · residue {r} · team-session/{team-name}/map.md`
- `TeamKit afk · {team-name} · run ended — blocked-on-you {n} · adopted-unratified {m} · AC {passed}/{blocking} · team-session/{team-name}/build-state.md`

afk outranks the remote-hitl transport: no `hitl-question` fence in an afk final report, and no cards — the relay is notify-only, through these lines in the final text. The Stop-nudge stays silent in relay (`HITL_RELAY=1`), so the final text reaches the relay intact.

## §Plugin consumers

The `claude-plugin-pnpm` plugin ships `team-kit-create` and `team-kit-run` with this reader and these hooks. It does not ship this repo's `.gitignore`, its `.claude/settings.json`, or `team-kit-resume`. The banner, deny and nudge texts are the same for plugin consumers.

1. `.gitignore`: add `/.claude/team-kit.local.json`.
2. Skill calls (autoRun chain, "as a team" triggers): add `Skill(claude-plugin-pnpm:team-kit-create)` and `Skill(claude-plugin-pnpm:team-kit-run)` to `permissions.allow` in your `.claude/settings.json`, or run in auto mode.
3. Workflow consent: approve one Workflow launch in auto mode, or add a `Workflow` allow rule.

Rule strings: plugin skills run as `/<plugin>:<skill>` and an allow rule matches the name Claude invokes (code.claude.com/docs/en/skills.md — skill locations table, command names, permission syntax; fetched 2026-10-29).
