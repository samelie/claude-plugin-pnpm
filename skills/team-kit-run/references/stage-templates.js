// canonical execution-stage helpers + templates for /team-kit-run authored workflows.
// INLINE what you use into the workflow script at author time — workflow scripts cannot
// import (rule 7). SKILL.md owns the RULES; this file owns the IMPLEMENTATIONS.
// these are templates, not a runnable module — free vars (areas/modules/LANES/name/task/
// files/context/fb) come from your plan.

// EVERY authored script OPENS with the pure-literal meta block (platform requirement — the engine
// needs it). phase() titles must match meta.phases EXACTLY (documented contract) — enumerate EVERY
// phase string any inlined helper emits, incl. 'Audit' (auditEmpty), 'Propose', 'Preflight',
// 'Calibrate', 'Finish', 'Grade'. an example listing fewer phases than the helpers emit is the trap.
// export const meta = {
//   name: 'plan-<team-slug>',
//   description: '<one line — shown in the permission dialog>',
//   phases: [{ title: 'Research' }, { title: 'Audit' }, { title: 'Implement' }, { title: 'Propose' },
//            { title: 'Review' }, { title: 'Finish' }, { title: 'Finalize' }, { title: 'Validate' },
//            { title: 'Grade' }, { title: 'Preflight' }, { title: 'Calibrate' }],   // prune unused
// }

// TOP-OF-SCRIPT GUARD (reliability-9) — fail loud if args were dropped. resumeFromRunId resumes the
// journal, NOT args; omit them on resume and SESSION/PKG/etc. read `undefined`, every prompt re-renders
// (full silent cache miss) + Write paths become /repo/undefined*. Re-pass the SAME args on resume.
const SESSION = args.session   // absolute team-session path the agents Write under
if (!SESSION) throw new Error('args missing: `session` undefined — re-pass the SAME args on resumeFromRunId (rule 6 resume-args contract)')
// add one guard per required arg the prompts below interpolate (PKG, DOC_URLS, timestamps, …).

// Heavy agents do real tool work → they reliably FINISH but skip a forced StructuredOutput (rule 9).
// Heavy stages take NO schema: they WRITE their artifact to team-session/ + end with a STATUS line the
// orchestrator parses. statusOf() reads it. Schema is reserved for LIGHT stages (discovery/echo).
//
// 4-WAY CLASSIFIER (rule 12, reliability-3). A 3-way {clean|errors|partial} collapses BLOCKED and
// NEEDS_CONTEXT into a re-dispatchable bucket, so a "the plan is wrong / I'm missing context" agent
// burns the FULL MAX_REDISPATCH budget re-running an unwinnable stage instead of stopping. Split it:
//   • CLEAN              → done.
//   • BLOCKED|NEEDS_CONTEXT → 'blocked' → break the loop IMMEDIATELY, return to the HUMAN GATE
//                            (escalate signal — a human decision is needed; re-dispatch can't fix it).
//   • ERRORS_REMAINING   → 'errors' → re-dispatchable (the loop retries up to the cap).
//   • PARTIAL|DONE_WITH_CONCERNS → 'errors' → not-clean, re-dispatchable (never reads as clean).
//   • MISSING STATUS     → 'errors', NOT 'partial' (no silent clean; observability-3). A dropped/
//                          truncated terminal text must fail closed, never pass the gate.
// BLOCKED/NEEDS_CONTEXT MUST be checked BEFORE ERRORS_REMAINING so an "ERRORS_REMAINING but BLOCKED"
// line still escalates. statusOf caveat (rule 15 addendum): `STATUS: ERRORS_REMAINING: 0` is CLEAN —
// the team agents' STATUS protocol emits counts (`ERRORS_REMAINING: <count>`), so the count-0 branch
// is canonical, not optional.
// QUOTED-STATUS FALSE-CLEAN (observed live 2026-08-22, wf_f882957b-7c4). The prior impl tested
// /STATUS:\s*CLEAN/ against the WHOLE return string, and tested it FIRST. An agent that QUOTES a
// peer's status in its body — the preflight agent wrote: Ends `STATUS: CLEAN`. Refutation cleared
// the proposal. — then matched clean regardless of its OWN terminal status, which was
// ERRORS_REMAINING: 1. That is a false-clean, and it landed on the PRE-SPEND PRECONDITIONS gate:
// the workflow reported preflight clean while one precondition had actually FAILED. Cross-agent
// citation is normal and increasing (refuters/auditors quote what they graded), so classify the
// agent's OWN terminal STATUS line, never any occurrence anywhere in the text.
// the agent's OWN terminal STATUS line — factored so every status test (statusOf, the validate loop's
// PARTIAL check) anchors the same way and none re-opens the quoted-status false-clean vector.
const statusLineOf = (t) => {
  const s = String(t || '')
  const anchored = s.split('\n').map(l => l.trim()).filter(l => /^\**\s*STATUS:/i.test(l))
  if (anchored.length) return anchored[anchored.length - 1]
  const idx = s.toUpperCase().lastIndexOf('STATUS:')
  return idx < 0 ? null : s.slice(idx, idx + 120)                  // last occurrence, bounded
}
const statusOf = (t) => {
  const line = statusLineOf(t)
  if (line == null) return 'errors'                                // no STATUS at all = errors, never silent clean
  // order preserved from rule 12: BLOCKED/NEEDS_CONTEXT before ERRORS; count-0 before generic ERRORS.
  if (/STATUS:\s*\**\s*(BLOCKED|NEEDS_CONTEXT)/i.test(line)) return 'blocked'   // escalate → human gate
  if (/STATUS:\s*\**\s*ERRORS_REMAINING:\s*0\b/i.test(line)) return 'clean'     // count-0 = CLEAN (rule 15 addendum d)
  if (/STATUS:\s*\**\s*ERRORS_REMAINING/i.test(line)) return 'errors'
  if (/STATUS:\s*\**\s*(PARTIAL|DONE_WITH_CONCERNS)/i.test(line)) return 'errors' // not-clean, re-dispatchable
  if (/STATUS:\s*\**\s*CLEAN/i.test(line)) return 'clean'
  return 'errors'                                                        // unrecognised = errors, not clean
}
const ok = (s) => s === 'clean'
const escalates = (s) => s === 'blocked'   // BLOCKED/NEEDS_CONTEXT — break loop to the human gate

// COMBINED GATE (rule 12). statusOf is 4-way but the two not-clean buckets need DIFFERENT handling, and
// gating on escalates() ALONE is the easy mistake: PARTIAL / ERRORS_REMAINING / missing-STATUS are all
// 'errors', not 'blocked', so an escalates-only check lets them flow through as SUCCESS. Measured live
// 2026-08-23: a negative-controls stage returned PARTIAL and reached Finalize ungated (build-state §68).
// Use this at EVERY serial critical-path stage; returns null to continue, or the value to return.
const gate = (stage, txt, extra) => {
  const s = statusOf(txt)
  if (ok(s)) return null
  return { stage, status: escalates(s) ? 'blocked' : 'errors_remaining', detail: String(txt).slice(-3000), ...extra }
}

// PHASE GATE (rule 12 addendum) — gate a PHASE BOUNDARY on the plan's OWN declared advance condition,
// not on the strict classifier. gate() stays correct everywhere else, fix loops included. Measured
// 2026-08-24: team-plan.md ## Phase Transitions declared P2→P3 advances on "CLEAN/DONE_WITH_CONCERNS";
// the strict gate classes DONE_WITH_CONCERNS as 'errors', so the run HALTED at a stage the ratified
// contract said should proceed (8 agents in, 0 failures) — an authoring defect in the spine.
// Pass the plan's accept set verbatim (['CLEAN','DONE_WITH_CONCERNS']); anything outside it falls
// through to the strict gate, and BLOCKED/NEEDS_CONTEXT still escalate. An advanced-with-concerns
// stage is never silent — it lands in `concerns`, which the run's return rolls up.
const concerns = []
const phaseGate = (stage, txt, allowed, extra) => {
  const line = String(statusLineOf(txt) || '')
  const declared = allowed.some(a => new RegExp(`STATUS:\\s*\\**\\s*${a}\\b`, 'i').test(line))
  if (!declared || escalates(statusOf(txt))) return gate(stage, txt, extra)   // no plan may declare BLOCKED an advance
  if (!ok(statusOf(txt))) {
    concerns.push({ stage, line: line.slice(0, 600) })
    log(`${stage} advanced on the plan's declared transition (${allowed.join('|')}): ${line.slice(0, 300)}`)
  }
  return null
}

// TRY-AGENT WRAPPER (rule 11, reliability-2) — the documented failure model is NULL-FIRST: a terminal
// API error (after retries) or a user skip resolves agent() to null, not a throw. statusOf(null)
// already classifies 'errors', so null needs no wrapper — but check journal.jsonl before re-dispatching
// a null slice: a USER SKIP is a deliberate act, re-running it overrides the user (route to human).
// the documented THROW vector is budget-ceiling exceedance; residual throws (subprocess/harness) exist
// as backstop territory. so this wrapper does three jobs on the serial critical path:
//   budget throw → STATUS: BLOCKED (escalate — re-dispatching against a hard ceiling just re-throws)
//   other throw  → STATUS: ERRORS_REMAINING with a `transport:` marker — the orchestrator may
//                  auto-resume ONCE (resumeFromRunId + identical args; cached stages free) before the
//                  human gate. the marker is the ONLY auto-resume trigger: agent-REPORTED
//                  ERRORS_REMAINING (no marker) never auto-resumes.
const tryAgent = async (label, p, opts) => {
  try { return await agent(p, opts) }
  catch (e) {
    const msg = String((e && e.message) || e)
    if (/budget/i.test(msg)) {
      log(`budget ceiling hit at ${label} — escalating, never retrying against a hard ceiling`)
      return `STATUS: BLOCKED (budget exhausted at ${label}: ${msg})`     // statusOf() → 'blocked'
    }
    log(`critical-path agent threw at ${label} — ${msg} (transport-class; one auto-resume allowed)`)
    return `STATUS: ERRORS_REMAINING (transport: agent threw at ${label}: ${msg})`   // statusOf() → 'errors'
  }
}
// orchestrator-side rule for the transport marker: exactly ONE auto-resume per run, byte-identical
// args re-passed (top-of-script guard throws if dropped), notify with both runIds. NEVER auto-resume
// past a review-at-cap, an escalates() status, a plan-declared gate, or any paid/irreversible stage.

// COVERAGE ASSERTION (rule 10, reliability-1) — a parallel() fan-out can silently DROP an element:
// a schema-skipping heavy agent degrades to null (rule 9) and .filter(Boolean) erases it, so a
// missing slice would read as "all clean". After EVERY parallel() fan-out, assert full coverage:
// results.filter(Boolean).length === inputs.length, else return errors_remaining + a coverageGap
// object. A coverage gap MUST NOT return clean.
const coverage = (results, expected) => {
  const got = results.filter(Boolean).length
  return got === expected ? null : { expected, got, missing: expected - got }
}

// SINGLE-SLICE RETRY (true-gap salvage) — a coverage gap that survives auditEmpty used to bail the
// WHOLE run, discarding every completed slice's momentum. re-dispatch ONLY the missing (null) slices,
// ONCE, with a fresh tag (cache-poison guard). constraints: never a paid/one-shot slice (those bail
// to the human unconditionally). user-skip caveat: a null can be a deliberate mid-run skip, and the
// script CANNOT read journal.jsonl (no fs) — the one retry may re-offer skipped work; a second skip
// leaves it null → human. the ORCHESTRATOR reconciles post-run via journal.jsonl and reports any
// retried-over skip explicitly. dark-agent caveat (rule 15 addendum): same prompt can re-die
// identically — shrink scope in the retry prompt where possible. items[i]: { name, prompt, opts, paid? }.
const retryMissing = async (items, results, tag) => {
  const missIdx = results.map((r, i) => (r ? -1 : i)).filter(i => i >= 0)
  if (!missIdx.length) return results
  if (items.some((it, i) => missIdx.includes(i) && it.paid)) {
    log(`coverage gap includes a PAID slice — no auto-retry, bail to human`)
    return null
  }
  log(`retryMissing [${tag}]: ${missIdx.map(i => items[i].name).join(',')} — one re-dispatch each`)
  const redo = await parallel(missIdx.map(i => () =>
    tryAgent(`retry:${items[i].name}:${tag}`, `[retry ${tag}] ${items[i].prompt}`,
      { ...items[i].opts, label: `retry:${items[i].name}:${tag}` })))
  missIdx.forEach((idx, k) => { results[idx] = redo[k] })
  return results   // caller re-runs coverage(); a slice still missing after its one retry → human
}

// EMPTY-RESULT DISK AUDIT (rule 15, reliability-15) — tryAgent (rule 11) catches only THROWS. A heavy
// agent can FINISH (edit its owned files, Write its team-session artifact) yet lose its RETURN TEXT →
// it comes back as "" (empty string, NOT a throw), a SEPARATE vector from the rule-9 schema-skip. The
// coverage() above then .filter(Boolean)-drops that slice and the run BAILS, discarding real on-disk
// work (hit 5× in one run). So BEFORE calling coverage() on a heavy fan-out, run auditEmpty: for each
// empty slice dispatch a cheap verifier to reconstruct a STATUS line from the disk artifact the agent
// was told to Write (+ the git diff of its owned files, for source-writers). Only a slice with NO
// artifact AND NO diff is a true gap. `tag` makes every repair prompt UNIQUE across rounds (initial /
// spec-redo-N / qual-redo-N) so the in-run workflow cache cannot return a prior round's stale/empty
// audit (cache-poison guard). Returns the patched results, or null if the audit itself has a gap.
// items[i]: { name, artifact, files_owned?, verify? } — artifact = the <session> path the agent Wrote.
const auditEmpty = async (items, results, tag) => {
  // lost-text slices ONLY (rule 15: finished-but-lost-return). NULL slices are a DIFFERENT vector
  // (API error / user skip — rule 11) and stay null here so retryMissing/coverage can see them;
  // patching a null with audit text would make the downstream retry+coverage chain dead code.
  const emptyIdx = results.map((r, i) => (r != null && !String(r).trim() ? i : -1)).filter(i => i >= 0)
  if (!emptyIdx.length) return results
  log(`empty-result slices [${tag}]: ${emptyIdx.map(i => items[i].name).join(',')} — auditing disk before bailing`)
  const audits = await parallel(emptyIdx.map(i => () => {
    const it = items[i]
    return tryAgent(`audit:${it.name}:${tag}`,
      `Disk audit [${tag}] for ${it.name}: the agent finished but its report text was lost. ` +
      `Read its on-disk artifact ${it.artifact}` +
      (it.files_owned ? ` and the git diff (working tree vs HEAD) of its owned files: ${it.files_owned.join(', ')}` : '') + `. ` +
      (it.verify ? `Run its verify: ${it.verify} — report pass/fail with the output tail; count ONLY failures in its owned files. ` : '') +
      `If the artifact is missing/empty AND there is no diff, the work was NOT done. ` +
      `Re-Write ${it.artifact} with the reconstructed progress, then END with a STATUS line ` +
      `(CLEAN only if the work looks complete AND — when a verify is given — its verify slice passes; ` +
      `ERRORS_REMAINING otherwise; BLOCKED if the disk shows the work was never started).`,
      { label: `audit:${it.name}:${tag}`, phase: 'Audit', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
  }))
  // the audit fan-out itself can drop a slice — that IS a true gap (no recoverable disk evidence).
  if (coverage(audits, emptyIdx.length)) return null
  emptyIdx.forEach((idx, k) => { results[idx] = audits[k] })
  return results
}

// GLOB-DISJOINTNESS PRE-FLIGHT (rule 14, reliability-7) — worktrees are banned (rule 5), so disjoint
// files_owned is the ONLY structural backstop against two same-batch coders clobbering each other; the
// planner's "non-overlapping globs" is LLM discipline, NOT a runtime check, and no hook fires for
// workflow writers (rule 4). Run this BEFORE any parallel SOURCE-write fan-out. Pure JS — no fs/glob
// import (rule 7); compares the literal segments of each glob (`**`/`*`/`?` as wildcards). Conservative:
// it FLAGS a pair when their patterns could match a common path; a flagged pair is downgraded/halted,
// never trusted. Read-only fan-out + per-agent team-session/ writes (disjoint paths) are EXEMPT.
//
// segMatch(a, b): could glob `a` and glob `b` match a common path? Walk segments; `**` swallows the rest.
const segMatch = (a, b) => {
  const A = a.split('/'), B = b.split('/')
  let i = 0, j = 0
  while (i < A.length && j < B.length) {
    if (A[i] === '**' || B[j] === '**') return true   // ** matches any remaining tail → potential overlap
    const wa = A[i].includes('*') || A[i].includes('?'), wb = B[j].includes('*') || B[j].includes('?')
    if (!wa && !wb && A[i] !== B[j]) return false      // two literal segments differ → disjoint
    i++; j++                                            // wildcard segment (or equal literals) → keep walking
  }
  // one pattern is a prefix of the other (e.g. src/a vs src/a/b) → overlap; equal-length consumed → overlap
  return true
}
const globsOverlap = (g1, g2) => g1.some(a => g2.some(b => segMatch(a, b)))
// owners: [{ name, files_owned: [glob,…] }, …]. Returns [] when fully disjoint, else the colliding pairs.
const disjoint = (owners) => {
  const overlaps = []
  for (let i = 0; i < owners.length; i++)
    for (let k = i + 1; k < owners.length; k++)
      if (globsOverlap(owners[i].files_owned, owners[k].files_owned))
        overlaps.push({ a: owners[i].name, b: owners[k].name })
  return overlaps   // empty = disjoint → parallel OK; non-empty = collision → halt or downgrade (rule 14)
}

// RESEARCH (read-only, parallel) — DEFAULT agent + injected role (path A). FREE TEXT + writes research/<name>.md.
// artifact naming (rule 16): never a findings*/report* basename for a subagent-Written file — the harness
// write guard denies them. research/<area-name>.md is safe; so are progress/results/review/audit names.
const RESEARCHER = `You are a team RESEARCHER. Read-only. Use ToolSearch to load ` +
  `mcp__cocoindex-code__search / claude-mem / context-mode; follow investigation-methodology. ` +
  `Do NOT modify files. Write findings to <session>research/<name>.md, then END with a STATUS line.`
let research = await parallel(areas.map(a => () =>
  tryAgent(`research:${a.name}`, `${RESEARCHER}\nInvestigate: ${a.desc}\nWrite: <session>research/${a.name}.md`,
    { label: `research:${a.name}`, phase: 'Research' })))        // NO agentType, NO schema → free text; tryAgent per rule 11
// EMPTY-RESULT DISK AUDIT (rule 15) BEFORE coverage — a researcher that Wrote its research/<name>.md but lost
// its return text is recoverable from disk; don't bail it as a drop. artifact = the findings file.
research = await auditEmpty(areas.map(a => ({ name: a.name, artifact: `<session>research/${a.name}.md` })), research, 'research')
if (!research) return { stage: 'research', status: 'errors_remaining', note: 'empty-result audit coverage gap' }
// TRUE GAP → one single-slice retry before any bail (journal-check user-skip first; never paid slices).
research = await retryMissing(areas.map(a => ({ name: a.name, prompt: `${RESEARCHER}\nInvestigate: ${a.desc}\nWrite: <session>research/${a.name}.md`, opts: { phase: 'Research' } })), research, 'research-gap')
if (!research) return { stage: 'research', status: 'errors_remaining', note: 'paid slice in gap — human decision' }
// COVERAGE ASSERTION (rule 10) — a dropped research area must NOT read as covered.
const researchGap = coverage(research, areas.length)
if (researchGap) { log(`Research coverage gap after retry: ${JSON.stringify(researchGap)}. NOT clean.`)
  return { stage: 'research', status: 'errors_remaining', coverageGap: researchGap } }
// orchestrator reads <session>research/*.md for detail; gate on statusOf(research[i]).

// IMPLEMENT — single-writer (default, safe on one branch). FREE TEXT + writes coder-{name}/progress.md.
// Routed through tryAgent (rule 11) — a thrown coder (stall/rate-limit/subprocess) must NOT abort the run.
const runImplement = (fb) => tryAgent(`impl:${name}`,
  `Implement ${task} in ${files}. ${context}${fb || ''}\n` +
  `Edit ONLY your owned files. Write progress to <session>coder-${name}/progress.md; END with a STATUS line.`,
  // NO model override → inherits the session model. implement is real design/judgment work — the
  // ONE stage class that keeps the inherited model (rule 13). Do NOT add model:'sonnet' here.
  { label: `impl:${name}`, phase: 'Implement', agentType: 'team-coder' })   // NO schema
await runImplement()   // tryAgent-wrapped: on throw → STATUS: ERRORS_REMAINING text, not a run abort

// IMPLEMENT — propose-then-apply (parallel reasoning, serial mutation). PROVEN logic (de-harness): same-path = FLAG.
// Coders WRITE a unified diff to <session>proposals/{name}.diff (FILE handoff — robust vs schema diff-fidelity) +
// state target path(s) + STATUS. NO schema. The apply stage reads the patches; grouping/collision is pure JS.
//
// GLOB-DISJOINTNESS PRE-FLIGHT (rule 14, reliability-7) — BEFORE fanning out parallel source writers, prove
// their declared files_owned globs don't intersect. Even though propose-then-apply flags same-FILE collisions
// at apply time, an overlapping OWNERSHIP plan means two coders reason against the same files in parallel and
// produce conflicting diffs — catch it up front. A non-empty result = a stale/typo'd plan: HALT (return errors)
// or DOWNGRADE the colliding modules to a single-writer serial pipeline. modules carry { name, files_owned }.
// rule 14 sanctions two branches; DOWNGRADE is the default (single-writer is the documented safe
// default), HALT only when the overlap is pathological (most/all of the roster colliding — that is a
// broken plan, not a stale glob). downgrade = colliding modules leave the parallel fan-out and run as
// a SERIAL chain, each later writer's prompt naming the earlier writers' proposal diffs so it reasons
// against them, not blind. record the overlap in build-state as a deviation naming the pairs.
const overlaps = disjoint(modules)
if (overlaps.length > modules.length / 2) { log(`ownership overlap is roster-wide: ${JSON.stringify(overlaps)} — broken plan, halting`)
  return { stage: 'propose', status: 'errors_remaining', overlaps } }
const collidingNames = new Set(overlaps.flatMap(o => [o.a, o.b]))
const [serialMods, parallelMods] = [modules.filter(m => collidingNames.has(m.name)), modules.filter(m => !collidingNames.has(m.name))]
if (serialMods.length) log(`ownership overlap (reliability-7): serializing ${serialMods.map(m => m.name).join(',')}; ${parallelMods.length} lanes stay parallel; recorded as deviation`)
const proposePrompt = (m, prior) => `Propose ${m.task}. Do NOT edit source. ` +
  (prior.length ? `Peers already proposed against overlapping files — Read ${prior.map(p => `<session>proposals/${p}.diff`).join(', ')} first and make your diff compose with theirs. ` : '') +
  `Write a unified diff to <session>proposals/${m.name}.diff, state the target path(s), END with STATUS.`
const parallelResults = await parallel(parallelMods.map(m => () =>
  agent(proposePrompt(m, []), { label: `propose:${m.name}`, phase: 'Propose', agentType: 'team-coder' })))
const serialResults = []
for (let i = 0; i < serialMods.length; i++)
  serialResults.push(await tryAgent(`propose:${serialMods[i].name}`,
    proposePrompt(serialMods[i], serialMods.slice(0, i).map(m => m.name)),
    { label: `propose:${serialMods[i].name}`, phase: 'Propose', agentType: 'team-coder' }))
const orderedMods = [...parallelMods, ...serialMods]                 // keep results aligned with their modules
let proposals = [...parallelResults, ...serialResults]
// EMPTY-RESULT DISK AUDIT (rule 15) BEFORE coverage — a proposer that Wrote its .diff but lost its
// return text is recoverable; artifact = the diff file. Only a genuinely missing diff is a true gap.
proposals = await auditEmpty(orderedMods.map(m => ({ name: m.name, artifact: `<session>proposals/${m.name}.diff` })), proposals, 'propose')
if (!proposals) return { stage: 'propose', status: 'errors_remaining', note: 'empty-result audit coverage gap' }
// COVERAGE ASSERTION (rule 10) — a dropped proposer = a missing diff the apply stage would silently
// skip, landing a partial change that reads as complete. A coverage gap MUST NOT proceed to apply.
const proposalGap = coverage(proposals, orderedMods.length)
if (proposalGap) { log(`Propose coverage gap: ${JSON.stringify(proposalGap)}. NOT clean — do NOT apply.`)
  return { stage: 'propose', status: 'errors_remaining', coverageGap: proposalGap } }
// APPLY (one writer): read <session>proposals/*.diff (Bash), group by target path; a path with >1 proposer =
// COLLISION → flag for manual merge (never clobber); apply the rest serially. Pure file + JS, no schema.

// PARALLEL-CODER IMPLEMENT (third mode — proven de-harness LANES): when the plan carries N disjoint-
// owned coders that DIRECTLY edit source (disjoint() pre-flight already passed → safe on one branch),
// fan them out with parallel() and treat the result EXACTLY like research/propose — auditEmpty BEFORE
// coverage, so a coder that finished its edits but lost its return text is reconstructed from git diff +
// its progress.md rather than bailing the whole batch:
//   let lanes = await parallel(LANES.map(l => () => tryAgent(`impl:${l.name}`, coderPrompt(l, fb[l.name]), {label:`impl:${l.name}`, phase:'Implement', agentType:'team-coder'})))
//   lanes = await auditEmpty(LANES.map(l => ({name:l.name, artifact:`<session>coder-${l.name}/progress.md`, files_owned:l.files_owned, verify:l.verify})), lanes, 'initial')
//   if (!lanes) return { stage:'implement-audit', status:'errors_remaining', note:'audit coverage gap' }
// On review-driven re-dispatch, TAG each lane's feedback per attempt so the in-run cache can't return a
// stale/empty result (cache-poison guard, rule 15): fb[l.name] = `[retry s${attempt+1}] spec failed — read
// <session>spec-reviewer/spec-review-${attempt+1}.md and fix YOUR lane`, then re-run auditEmpty with a fresh
// tag (`spec-redo-${attempt+1}` / `qual-redo-${attempt+1}`). The single-writer loop below varies its prompt
// via the growing `feedback` array, so it is already tag-safe; the PARALLEL redo needs the explicit tag.

// REVIEW + bounded reject → re-dispatch (PROVEN de-harness: reject@1 → feedback → approve@2; max-3 cap).
// spec gates quality; STATUS drives the loop (NO schema — reviewers do real diff-reading work, rule 9).
// runId threading (gaps-1): the in-run loop below re-dispatches as separate agent() calls inside ONE workflow run,
// so the engine already caches the unchanged prior stages. The expensive miss is when a re-dispatch crosses a
// HUMAN GATE and becomes a SEPARATE launch: the orchestrator MUST capture this run's WorkflowOutput.runId (step 4)
// and pass it as resumeFromRunId on the relaunch — else every prior passing stage re-runs from scratch (treated as
// same-session-only until re-probed — rule 6; identical args required or the cache misses — see the resume-args contract).
// BLOCKED/NEEDS_CONTEXT from ANY stage breaks the loop to the human gate (rule 12, reliability-3) —
// re-dispatch cannot resolve "the plan is wrong / I'm missing context", so escalate instead of burning
// MAX_REDISPATCH on an unwinnable stage. Only 'errors' re-dispatches.
const MAX_REDISPATCH = 3
// GLOBAL FIX CEILING — the autonomy block's third default: total coder fix-dispatches across
// review + verify + validate ≤ TOTAL_FIX. in-memory here; the ORCHESTRATOR mirrors the count into
// build-state.md after every round so a relaunch RESUMES it (rule 12) — seed a prior count via args.
const TOTAL_FIX = (args.autonomy && args.autonomy.globalFixCeiling) || 6
let totalFix = (args.autonomy && args.autonomy.fixesAlreadySpent) || 0
const spendFix = (stage) => (++totalFix > TOTAL_FIX ? { stage, status: 'errors_remaining', note: `global fix ceiling ${TOTAL_FIX} exhausted — human gate with the ledger` } : null)
// transport-synthesized text is NOT a gate verdict: no artifact was (re)written, so a fix loop
// dispatched against it fixes stale/nothing. surface it so the orchestrator applies the one-auto-resume rule.
const isTransport = (t) => /\(transport:/.test(String(t || ''))
let attempt = 0, status = null, escalated = null
const feedback = []
while (attempt < MAX_REDISPATCH) {
  const fb = feedback.length ? `\nAddress prior review feedback (detail in <session>reviewer/*.md): ${feedback.join(' | ')}` : ''
  if (attempt > 0) { const c = spendFix(`impl-redo#${attempt}`); if (c) return c }   // re-implements count toward the ceiling
  const impl = await runImplement(fb)                       // ← the IMPLEMENT thunk above (single-writer OR propose-apply); tryAgent-wrapped
  if (isTransport(impl)) return { stage: `impl#${attempt + 1}`, status: 'errors_remaining', transport: true }
  const implStatus = statusOf(impl)
  if (escalates(implStatus)) { escalated = { at: `impl#${attempt + 1}`, reason: 'implement BLOCKED/NEEDS_CONTEXT — see coder progress.md' }; break }
  if (!ok(implStatus)) { feedback.push('coder self-reported errors — see coder progress.md'); attempt++; continue }  // a self-reported-failing implement never reaches review as clean
  // spec + qual routed through tryAgent (rule 11); [attempt N] tag in the PROMPT — label alone does not
  // vary the cache key, and a byte-identical re-dispatch would replay the prior round's verdict cached.
  const spec = await tryAgent(`spec#${attempt + 1}`, `[attempt ${attempt + 1}] Spec-review vs requirements; read the git diff. Write <session>spec-reviewer/spec-review.md; END with STATUS.`,
    // model:'sonnet' — review is a mechanical/review stage (rule 13). Reserve the inherited model for implement/design.
    { label: `spec#${attempt + 1}`, phase: 'Review', agentType: 'team-spec-reviewer', model: 'sonnet' })
  if (isTransport(spec)) return { stage: `spec#${attempt + 1}`, status: 'errors_remaining', transport: true }
  const specStatus = statusOf(spec)
  if (escalates(specStatus)) { escalated = { at: `spec#${attempt + 1}`, reason: 'spec BLOCKED/NEEDS_CONTEXT — see spec-reviewer/spec-review.md' }; break }  // escalate, don't re-dispatch
  if (!ok(specStatus)) { feedback.push('spec failed — see spec-reviewer/spec-review.md'); attempt++; continue }  // spec gates quality
  const qual = await tryAgent(`qual#${attempt + 1}`, `[attempt ${attempt + 1}] Quality-review (structure/quality/security). Write <session>reviewer/review.md; END with STATUS.`,
    // model:'sonnet' — review is a mechanical/review stage (rule 13).
    { label: `qual#${attempt + 1}`, phase: 'Review', agentType: 'team-reviewer', model: 'sonnet' })
  if (isTransport(qual)) return { stage: `qual#${attempt + 1}`, status: 'errors_remaining', transport: true }
  status = statusOf(qual)
  if (escalates(status)) { escalated = { at: `qual#${attempt + 1}`, reason: 'quality BLOCKED/NEEDS_CONTEXT — see reviewer/review.md' }; break }  // escalate, don't re-dispatch
  if (ok(status)) break
  feedback.push('quality failed — see reviewer/review.md'); attempt++
}
// A BLOCKED/NEEDS_CONTEXT escalation OR still-not-clean-at-the-cap → STOP, hand back to the human gate
// (no infinite churn, and BLOCKED never burned the budget — it broke on the first hit).
// The orchestrator captured this run's WorkflowOutput.runId (step 4); pass it as resumeFromRunId on the
// post-gate relaunch so the already-passed stages stay cached and only the contested stage re-runs (gaps-1).
if (escalated) { log(`Review BLOCKED at ${escalated.at} → human gate (reliability-3): ${escalated.reason}`)
  return { stage: 'review', attempts: attempt, blocked: true, escalated, feedback } }
if (!ok(status)) return { stage: 'review', attempts: attempt, blocked: true, feedback }

// ============================================================================================
// POST-IMPLEMENTATION VALIDATION LOOPS — the run's job is to arrive at its human gate either CLEAN
// or with a fully-diagnosed, ledger-recorded residue. deterministic failures (lint/type/test, failed
// deterministic AC) are the MOST machine-fixable class — they loop, bounded, before any human sees
// them. composite exit: mechanical gates green AND every blocking AC PASS AND no integrity finding.
// ordering: review-clean → FINISH (cleanup INSIDE the verified span) → VERIFY loop → VALIDATE loop.
//
// CIRCUIT BREAKERS (survive relaunches): the orchestrator persists per-loop and per-AC attempt
// counts to <session>build-state.md after every round — in-memory counters die at a relaunch, and a
// relaunch must RESUME the count by seeding args.autonomy.fixesAlreadySpent (an arg interpolated into
// NO prompt, so it does not break the cache prefix). global ceiling: the TOTAL_FIX counter declared
// above the review loop, spent via spendFix() at EVERY coder fix dispatch (impl-redo / fix-mech /
// fix-ac). failure-signature check: the SAME normalized failedGates/failedACs line two rounds
// running → escalate immediately, don't burn remaining retries.
// ============================================================================================

// FINISH — cleanup BEFORE the mechanical gates so finisher edits sit inside the verified span
// (finisher-after-gates let cleanup break a green build the gates had already blessed).
const finish = await tryAgent('finish',
  `Strip console.* debug logs (keep error-handling console.error) and enforce comment standards on ` +
  `the files this run modified (git diff vs <session>baseline.diff). Write <session>finisher/progress.md; END with STATUS.`,
  { label: 'finish', phase: 'Finish', agentType: 'team-finisher', model: 'sonnet', effort: 'low' })
const finishGate = gate('finish', finish); if (finishGate) return finishGate

// VERIFY LOOP — finalize is a fix loop, not a one-shot gate. verifier findings are file/line/rule-
// actionable; feed them to the owning coder and re-verify, cap 3. TWO classes ride one report:
//   mechanical failures → loop (coder fix → re-verify)
//   INTEGRITY findings (gamed gate / contract edit / decoration guard) → STATUS: BLOCKED → human,
//   NEVER re-dispatched to the coder that gamed them — the marker is machine-readable by contract.
const FINALIZE_PROMPT = (tag) => `[${tag}] Run lint/types/knip/test on the changed packages (git diff → pnpm -F filters). knip-skeptical. ` +
  `Subtract <session>baseline.diff (the pre-run dirty-tree snapshot) before attributing any hunk or failure to this run. ` +
  `GATE-GAMING GUARD: scan the git diff for NEW eslint-disable / @ts-expect-error / @ts-ignore / knip-ignore / ` +
  `.skip()ed tests / weakened-or-loosened types — a gate that passes ONLY via a new suppression is a FAILED gate, ` +
  `not a pass. Flag any edit to definition-of-done.md / requirements.md / team-plan.md (writers may not touch the contract). ` +
  `IF this run added or changed a runtime GUARD (a refusal, an assert, a fail-closed branch): break it, ` +
  `confirm its test goes RED, restore by RE-EDITING (never git checkout/restore/stash — see the dirty-tree ` +
  `note in SKILL.md), confirm GREEN. A guard whose test stays GREEN when the guard is deleted is DECORATION. ` +
  `Skip this clause entirely if the run added no runtime guard. ` +
  `ANY gaming/contract-edit/decoration finding: prefix its line "INTEGRITY:" and END with STATUS: BLOCKED — ` +
  `these are for the human, not a fix loop. Otherwise: Write <session>verifier/results.md; END with a STATUS ` +
  `line and a one-line "failedGates:" list (gate names + owning files).`
const MAX_VERIFY = 3
let vRound = 0, verify, lastGates = null
while (true) {
  verify = await tryAgent(`finalize#${vRound + 1}`, FINALIZE_PROMPT(vRound ? `re-verify v${vRound + 1}` : 'initial'),
    { label: `finalize#${vRound + 1}`, phase: 'Finalize', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
  // transport BEFORE any verdict handling: no results.md was (re)written — a fix dispatched now fixes stale/nothing.
  if (isTransport(verify)) return { stage: 'finalize', status: 'errors_remaining', transport: true }
  // INTEGRITY BEFORE the clean break: the marker is the defense against a report that carries gaming
  // findings under a (misbehaving) terminal CLEAN — checked first so a lying CLEAN cannot pass the gate.
  if (/INTEGRITY:/.test(String(verify))) return { stage: 'finalize', status: 'blocked', integrity: true, detail: String(verify).slice(-3000) }
  const vs = statusOf(verify)
  if (ok(vs)) break
  if (escalates(vs)) return { stage: 'finalize', status: 'blocked', detail: String(verify).slice(-3000) }
  const gates = (String(verify).match(/failedGates:.*$/m) || [''])[0].trim()
  if (gates && gates === lastGates) { log(`identical failure signature two verify rounds — escalating early`)
    return { stage: 'finalize', status: 'errors_remaining', note: 'no progress between fix rounds', detail: gates } }
  lastGates = gates
  vRound++
  if (vRound >= MAX_VERIFY) return { stage: 'finalize', status: 'errors_remaining', rounds: vRound, detail: String(verify).slice(-3000) }
  const ceiling = spendFix(`fix-mech#${vRound}`); if (ceiling) return ceiling
  // targeted fix: verifier-cited files INTERSECTED with the lane's owned globs — never a roving fix.
  await tryAgent(`fix-mech#${vRound}`, `[fix v${vRound}] Read <session>verifier/results.md. Fix ONLY the listed failures ` +
    `attributable to your owned files (${files}). Do NOT touch the contract files or add suppressions. ` +
    `Subtract <session>baseline.diff before claiming any hunk as this run's. ` +
    `Write progress to <session>coder-${name}/progress.md; END with STATUS.`,
    { label: `fix-mech#${vRound}`, phase: 'Finalize', agentType: 'team-coder' })
}

// VALIDATE LOOP — grade the CONTRACT's AC, then fix-and-re-grade the deterministic FAILs via each
// AC's maps_to lane, cap 3 shared with TOTAL_FIX. before ANY re-dispatch of a failing AC: re-read its
// sat.md row — if nothing in the plan produces the named passing state, the AC is UNSATISFIABLE (a
// contract defect → PD-n ruling or human), never a coder failure; looping would burn rounds against a
// gate no correct run can open. an AC failing IDENTICALLY after one fix round → same early escalate.
// NEEDS_HUMAN_EVIDENCE parks the AC (build-state: needs-human) and the loop CONTINUES on the rest —
// the run exits with the distinct 'needs_human_evidence' status, never conflated with failure.
const VALIDATE_PROMPT = (tag, only) => `[${tag}] Read <session>definition-of-done.md${only ? ` — grade ONLY these ACs: ${only}` : ''}. ` +
  `For each blocking AC: kind=deterministic → run its verify command, record PASS/FAIL + evidence; ` +
  `kind=semantic → record DEFER (a separate goal-auditor grade stage owns semantic grading — do not grade it yourself); ` +
  `kind=semantic needing rendered evidence nobody can produce here (screenshot / running UI) → record NEEDS_HUMAN_EVIDENCE. ` +
  `Write per-AC results to <session>validation-report.md; END with STATUS (CLEAN = every graded blocking AC PASS; ` +
  `PARTIAL = any NEEDS_HUMAN_EVIDENCE; ERRORS_REMAINING = any FAIL) and a one-line "failedACs:" list ` +
  `(AC id + slug + its maps_to task/lane). ` +
  `RE-MEASURE the ORCHESTRATOR's own claims too — the gate results and hazard descriptions it wrote into ` +
  `build-state.md are graded surfaces, not givens (two were wrong on 2026-08-23). Contradicting the ` +
  `orchestrator with evidence is the job, not insubordination.`
const MAX_VALIDATE = 3
let aRound = 0, validate, lastACs = null, regraded = false
const parked = new Set()    // NEEDS_HUMAN_EVIDENCE ACs accumulate across rounds — parked, never lost
while (true) {
  validate = await tryAgent(`validate#${aRound + 1}`, VALIDATE_PROMPT(aRound ? `re-grade a${aRound + 1}` : 'initial', aRound ? lastACs : null),
    { label: `validate#${aRound + 1}`, phase: 'Validate', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
  if (isTransport(validate)) return { stage: 'validate', status: 'errors_remaining', transport: true }
  // park needs-human rows every round (subset re-grades would otherwise drop round-1 parks from scope)
  for (const m of String(validate).matchAll(/^.*\bNEEDS_HUMAN_EVIDENCE\b.*$/gm)) parked.add(m[0].trim())
  const as = statusOf(validate)
  const term = String(statusLineOf(validate) || '')                // the agent's OWN terminal line — never the whole text (quoted-status vector)
  const acs = (String(validate).match(/failedACs:.*$/m) || [''])[0].replace(/failedACs:\s*/, '').trim()
  if (ok(as) || (/PARTIAL/i.test(term) && !acs)) {                 // clean, or only parked needs-human ACs left
    // rounds ≥2 graded only the failed subset — a fix can regress a previously-passing AC, so one final
    // FULL-scope grade backs the composite exit before it claims "every blocking AC PASS".
    if (aRound > 0 && !regraded) {
      regraded = true
      validate = await tryAgent(`validate-full`, VALIDATE_PROMPT('final full-scope', null),
        { label: 'validate-full', phase: 'Validate', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
      if (isTransport(validate)) return { stage: 'validate', status: 'errors_remaining', transport: true }
      for (const m of String(validate).matchAll(/^.*\bNEEDS_HUMAN_EVIDENCE\b.*$/gm)) parked.add(m[0].trim())
      const fs2 = statusOf(validate)
      if (ok(fs2) || (/PARTIAL/i.test(String(statusLineOf(validate) || '')) && !(String(validate).match(/failedACs:\s*\S/)))) break
      lastACs = null; continue                                     // full grade found a regression — loop handles it (rounds already bounded)
    }
    break
  }
  if (escalates(as)) return { stage: 'validate', status: 'blocked', detail: String(validate).slice(-3000) }
  if (acs && acs === lastACs) { log(`identical failedACs two rounds — sat-check then escalate`)
    return { stage: 'validate', status: 'errors_remaining', note: 'no progress — re-read each failing AC sat.md row: unsatisfiable AC is a contract defect, not a coder failure', detail: acs } }
  lastACs = acs
  aRound++
  if (aRound >= MAX_VALIDATE) return { stage: 'validate', status: 'errors_remaining', rounds: aRound, detail: String(validate).slice(-3000) }
  const acCeiling = spendFix(`fix-ac#${aRound}`); if (acCeiling) return acCeiling
  // route each FAIL to its maps_to lane; every fix re-enters the mechanical gates (a fix can break lint/tests),
  // so after fixes re-run ONE finalize pass before re-grading. sat-check FIRST (see block comment above).
  await tryAgent(`fix-ac#${aRound}`, `[fix a${aRound}] Read <session>validation-report.md and <session>goal-auditor/sat.md. ` +
    `For each failed AC mapped to your lane: re-read its sat.md row first — if the plan produces no passing state, STOP and ` +
    `report BLOCKED (unsatisfiable, contract defect). Else make the passing state real in your owned files (${files}). ` +
    `Never edit the contract files. Subtract <session>baseline.diff before claiming any hunk as this run's. ` +
    `Write progress to <session>coder-${name}/progress.md; END with STATUS.`,
    { label: `fix-ac#${aRound}`, phase: 'Validate', agentType: 'team-coder' })
  const reverify = await tryAgent(`finalize-after-ac#${aRound}`, FINALIZE_PROMPT(`post-ac-fix v${aRound}`),
    { label: `finalize-after-ac#${aRound}`, phase: 'Finalize', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
  if (isTransport(reverify)) return { stage: 'finalize-after-ac', status: 'errors_remaining', transport: true }
  if (/INTEGRITY:/.test(String(reverify))) return { stage: 'finalize-after-ac', status: 'blocked', integrity: true, detail: String(reverify).slice(-3000) }
  const rvGate = gate('finalize-after-ac', reverify); if (rvGate) return rvGate
}

// GRADE — semantic ACs go to team-goal-auditor, NOT team-verifier: fresh context, goal-anchored,
// disprove-own-finding (the protocol the design doc assigns; also restores the missing impl-vs-goal
// drift check — nothing else re-checks built code against prompt.md). `grade` is the one PROMPT-CARRIED
// phase — the agent file enumerates define/sat/audit; this dispatch carries the whole instruction.
const gradeSem = await tryAgent('grade',
  `Phase: grade (prompt-carried — a run-lane phase your agent file does not enumerate; THIS prompt is the instruction). ` +
  `FRESH CONTEXT. Read ONLY: <session>prompt.md, <session>definition-of-done.md, and for each blocking ` +
  `semantic AC the evidence artifact its row names. Do NOT read plan/design/discovery history. ` +
  `Grade each blocking semantic AC against its rubric AND against the original goal in prompt.md — does the ` +
  `built work faithfully serve what was asked, not merely what the plan did? Disprove each FAIL before ` +
  `reporting it. Naming drift (behavior green, tag renamed) is a flag, not a FAIL. ` +
  `Write <session>goal-auditor/grade.md; END with STATUS + a one-line "failedACs:" list.`,
  { label: 'grade', phase: 'Grade', agentType: 'team-goal-auditor' })   // keeps inherited model — judgment work (rule 13)
if (isTransport(gradeSem)) return { stage: 'grade', status: 'errors_remaining', transport: true }
const gradeGate = gate('grade', gradeSem); if (gradeGate) return gradeGate
// composite exit reached: mechanical gates green + every graded blocking AC PASS + no integrity flag.
// parked needs-human ACs exit with their own DISTINCT status — never conflated with failure. on
// evidence supplied: write the evidence path into the AC row, then relaunch resumeFromRunId with the
// SAME args — the re-grade re-runs because its prompt CHANGES (evidence-round tag / the AC row it
// reads), not because of the resume alone: a byte-identical completed call would replay cached.
if (parked.size) return { stage: 'validate', status: 'needs_human_evidence', parked: [...parked] }

// ============================================================================================
// PAID / IRREVERSIBLE STAGES — these two gates run IMMEDIATELY BEFORE the paid stage, wherever it
// sits in the plan (usually late, and usually HITL per prod-gating). SKILL.md § "Paid / irreversible
// stages" owns the reasoning; this owns the shape. Both hard-RETURN on not-CLEAN — never fall through.
// ============================================================================================

// PRECONDITIONS GATE (paid-stage §1) — the plan DECLARES its external preconditions; the run ASSERTS
// every one, rc-checked, BEFORE the first paid action. $0, read-only, AFK-safe. Each row was a
// one-line assertion nobody wrote, and each cost a real run: a reachable-but-EMPTY redis with no
// worker (the cycle blocks its 120s timeout and dies after spending); a prerequisite commit present
// in the working tree but on NO remote branch while the pipeline clones --depth 1 from origin
// ("committed locally" is NOT "reachable from the clone source"); an evidence dir inside a workDir
// the runner rm's twice. Liveness must prove a CONSUMER exists — a port answering PONG proves nothing.
const PRECONDITIONS = [
  // pick the row that matches the CHILD: a `codex exec` child reads CODEX_API_KEY and ignores the
  // ChatGPT login; the team-codex-verifier lane is the reverse — it inherits `codex login` and needs
  // no key. asserting the wrong one is green while the run still cannot authenticate.
  { name: 'credential',   cmd: `[ -n "$CODEX_API_KEY" ]`,                                            expect: 'rc 0 — for a `codex exec` child ONLY' },
  { name: 'codex-login',  cmd: `codex login status`,                                                 expect: 'rc 0 — for a team-codex-verifier stage; no API key is read' },
  { name: 'queue-worker', cmd: `redis-cli -u "$REDIS_URL" TTL bull:<queue>:stalled-check`,            expect: 'POSITIVE integer — only a BullMQ Worker refreshes it; -2 = worker DOWN, do not spend' },
  { name: 'clone-reach',  cmd: `git branch -r --contains <sha>`,                                      expect: 'NON-EMPTY — the clone source must carry it, the working tree is irrelevant' },
  { name: 'initial-state',cmd: `test -e <state-dir> && ls -A <state-dir>`,                             expect: 'ABSENT or EMPTY — leftover state from a prior run can satisfy this run\'s unforgeable check with zero real traffic; record the measured result in the run receipt' },
  { name: 'evidence-dir', cmd: `test -d <evidence-dir>`,                                              expect: 'rc 0, and OUTSIDE any dir the runner deletes at teardown' },
]
const pre = await tryAgent('preflight',
  `PRE-SPEND PRECONDITIONS. Run each assertion EXACTLY as written and record the command, raw output and OBSERVED rc:\n` +
  PRECONDITIONS.map(p => `- ${p.name}: \`${p.cmd}\` — expect ${p.expect}`).join('\n') + `\n` +
  `Do NOT repair, retry or work around a failure — measure it and report. Write <session>verifier/preconditions.md ` +
  `(one row per assertion: command / output / rc / PASS-FAIL); END with a STATUS line — CLEAN only if EVERY assertion passed.`,
  { label: 'preflight', phase: 'Preflight', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
const preStatus = statusOf(pre)
if (!ok(preStatus)) { log('Preconditions NOT all green — refusing to reach the paid stage. See verifier/preconditions.md.')
  return { stage: 'preflight', status: preStatus === 'blocked' ? 'blocked' : 'errors_remaining', note: 'unmet precondition — do not spend' } }

// CALIBRATE GATE (paid-stage §2) — a cheap, disposable, budget-capped rehearsal of the paid stage's
// FULL composition (real vendor, real composition root, real artifact writes) against a THROWAWAY
// target. It is the only stage that exercises the composition root against the real vendor before the
// spend: measured ~$0.69 upper bound, it caught a null cost field that made a fail-closed budget rule
// charge the FULL ceiling per call (budget exhausts after call 1) and an EISDIR in the evidence capture
// (no manifest ⇒ a blocking AC unsatisfiable). Neither was visible to ANY unit test; neither is
// recoverable after a one-shot run. Keeps the inherited model — diagnosis is real judgment work (rule 13).
// If calibration itself spends, it is HITL-gated like any paid action and goes FIRST on the checklist —
// enforced, not advisory: the in-script stage runs ONLY when the plan declares the rehearsal free.
if (!args.calibrationIsFree) {
  log('calibration spends (args.calibrationIsFree not set) — HITL: checklist item FIRST (capped, throwaway target); relaunch after its recorded CLEAN')
  return { stage: 'calibrate', status: 'blocked', note: 'calibration itself spends — human-gated like any paid action (prod-gating)' }
}
const calib = await tryAgent('calibrate',
  `CALIBRATION for the one-shot paid stage that follows. Exercise the SAME composition end-to-end on a ` +
  `throwaway target, capped at <budget>. Report, with measured evidence: the real cost field the budget rule ` +
  `reads (assert it is NOT null — a null under a fail-closed rule charges the full ceiling); that every evidence ` +
  `artifact the graded run's criteria read is actually WRITTEN and survives teardown; and the real vendor ` +
  `output SHAPE the parsing/gating legs assume. Also record the plan's open fog rows (prompt shape, budget split) ` +
  `as MEASUREMENTS. Fix what you find here, with landed tests, at calibration cost — not inside the paid dispatch. ` +
  `Write <session>coder-<name>/calibration.md; END with a STATUS line.`,
  { label: 'calibrate', phase: 'Calibrate', agentType: 'team-coder' })   // NO model override (rule 13)
const calibStatus = statusOf(calib)
if (!ok(calibStatus)) { log('Calibration not CLEAN — REFUSING to fire the one-shot paid stage on uncalibrated inputs.')
  return { stage: 'calibrate', status: calibStatus === 'blocked' ? 'blocked' : 'errors_remaining',
    note: 'calibration must be CLEAN before the spend — the paid stage is one-shot and unrecoverable' } }

// THE PAID DISPATCH ITSELF — clauses that MUST ride in its prompt verbatim (paid-stage §3/§4):
//   • pre-spend assertions repeated IN the dispatch, in order, "abort if any fails" (the preflight
//     stage proves them at t0; the dispatch re-proves them at spend time).
//   • the composition-root BINDING check for any capture whose stream the tests assert on — declared
//     -and-invoked is NOT bound; an unbound seam means the paid run persists nothing and its record
//     cannot be re-derived afterwards.
//   • "Do NOT silently retry a paid run — report and stop. A second run is a decision, not a retry."
//   • known pre-measured environment limits named up front: "record it with the measurement — do not
//     treat it as a run failure and do not retry because of it."
//   • what CANNOT be reconstructed afterwards, so the agent confirms it exists before returning.
// Then gate the irreversible step (merge/deploy/activate) on the GRADING stage reading CLEAN — same
// shape as above. Calibration CLEAN gates the spend; grading CLEAN gates the irreversible step.

// SCHEMA IS FINE for LIGHT stages only — discovery/echo/tiny-verdict with little/no tool work
// (e.g. monorepo-health's DISCOVER). Heavy stages above must NOT use schema (rule 9).
