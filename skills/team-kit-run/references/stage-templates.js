// canonical execution-stage helpers + templates for /team-kit-run authored workflows.
// INLINE what you use into the workflow script at author time — workflow scripts cannot
// import (rule 7). SKILL.md owns the RULES; this file owns the IMPLEMENTATIONS.
// these are templates, not a runnable module — free vars (areas/modules/LANES/name/task/
// files/context/fb/TASK_KEY) come from your plan; TASK_KEY is the plan's task id as a safe
// path segment (`t1-integrate`), used to derive that task's reserved attempt paths.

// EVERY authored script OPENS with the pure-literal meta block (platform requirement — the engine
// needs it). phase() titles must match meta.phases EXACTLY (documented contract) — enumerate EVERY
// phase string any inlined helper emits, incl. 'Audit' (auditEmpty), 'Propose', 'Preflight',
// 'Calibrate', 'Finish', 'Grade', 'Compose', 'Measure', 'Disposition'. an example listing fewer phases
// than the helpers emit is the trap.
// export const meta = {
//   name: 'plan-<team-slug>',
//   description: '<one line — shown in the permission dialog>',
//   phases: [{ title: 'Research' }, { title: 'Audit' }, { title: 'Implement' }, { title: 'Propose' },
//            { title: 'Review' }, { title: 'Finish' }, { title: 'Finalize' }, { title: 'Validate' },
//            { title: 'Grade' }, { title: 'Compose' }, { title: 'Measure' }, { title: 'Disposition' },
//            { title: 'Preflight' }, { title: 'Calibrate' }],   // prune unused
// }

// TOP-OF-SCRIPT GUARD (reliability-9) — fail loud if args were dropped. resumeFromRunId resumes the
// journal, NOT args; omit them on resume and SESSION/PKG/etc. read `undefined`, every prompt re-renders
// (full silent cache miss) + Write paths become /repo/undefined*. Re-pass the SAME args on resume.
const SESSION = args.session   // absolute team-session path the agents Write under
if (!SESSION) throw new Error('args missing: `session` undefined — re-pass the SAME args on resumeFromRunId (rule 6 resume-args contract)')
// add one guard per required arg the prompts below interpolate (PKG, DOC_URLS, timestamps, …).

// ============================================================================================
// ATTEMPT-BOUND EVIDENCE (contract: `references/execution-evidence.md` — that file owns WHAT a record
// contains and WHO owes which duty; this owns only the two pure helpers). OPT-IN: inline these only in
// a run whose team-plan.md DECLARES the protocol. Saved legacy workflows and their fixed evidence paths
// are NOT migrated and stay valid exactly as written (selective adoption).
// Sibling contract: `references/execution-premises.md` owns WHEN an observation BINDS a consumer
// (acquisition vs comparison vs applicability), what a support change does to work already done, and
// the RetryPermit the retryMissing helper below enforces. Neither file restates the other's fields.
//
// Identity is ALLOCATED BY THE ORCHESTRATOR *BEFORE* DISPATCH and reserved in build-state.md (§1 A1).
// These helpers do NOT allocate: they re-derive the reserved path and serialize the obligations into the
// worker prompt. Pure JS — no fs, no import (rule 7), and NO wall-clock/random (rule 7 bans both, and a
// time-derived id would also break the cache): epoch + attempt numbers arrive in `args`, so a resume
// with identical args re-derives byte-identical paths and a completed stage replays cached (rule 6)
// instead of minting a SECOND identity for work that already happened (§1 A5).
const EPOCH = args.epoch   // orchestrator-supplied attempt epoch, persisted in build-state.md (§1 A3)
if (!EPOCH) throw new Error('args missing: `epoch` undefined — the attempt epoch is orchestrator-supplied and persisted in build-state.md; it is NEVER derived from wall-clock or random (rule 7, execution-evidence §1 A3)')
const SESSION_ROOT = SESSION.endsWith('/') ? SESSION : `${SESSION}/`
// a path SEGMENT, not a path: no separator, no traversal, no leading dot, no space, no wildcard.
// REFUSE, never sanitize — silently normalizing a traversal away is how one attempt lands on another's
// reserved bytes, and the reserved bytes are immutable evidence (§1 immutability).
const safeSeg = (label, v) => {
  const s = String(v == null ? '' : v)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) || s.includes('..'))
    throw new Error(`INTEGRITY: attemptRef ${label} is not a safe single path segment: ${JSON.stringify(v)} — separators, traversal, empty and dot-leading segments are REFUSED, never normalized away`)
  return s
}
// COLLISION REGISTRY — one attempt is ONE dispatch of ONE task by ONE owner (§1). Re-deriving the SAME
// identity is fine (author it once, reference it at several call sites); what is refused is a SECOND
// identity landing on a path already reserved — two stages writing one immutable record. That is an
// INTEGRITY finding routed to the HUMAN, never permission to overwrite (§1 A4). It is reachable in the
// numbered-FILE shape, where the task id is NOT part of the path: two tasks sharing one owner + artifact
// + attempt resolve to one file. A genuine rerun/correction/regrade reserves a NEW number first
// (§1 A2/A5) and therefore mints a different path.
const MINTED = new Map()
// PER-TASK COUNTER SEED (§1 A2) — the counter is monotonic per task id and lives in build-state.md, not
// in script memory: a relaunch RESUMES it. `args.attempts` mirrors the reserved maxima, so an in-run
// round index `r` dispatches as attempt `seed(k) + r`. Never reset, never reuse, never renumber — a
// failed or abandoned number stays consumed and its record stays on disk.
const seed = (k) => (args.attempts && args.attempts[k]) || 0
// attemptRef(owner, taskId, epoch, attempt[, opts]) → the frozen ref. Two reservation SHAPES, both
// resolved by the reservation in build-state.md, which is decisive (execution-evidence §1 path grammar):
//   directory (producers)      → {owner}/attempts/[{epoch}/]{taskId}/{attempt}/result.md
//                                 inputsDir → {owner}/attempts/[{epoch}/]{taskId}/{attempt}/inputs/
//   numbered file (reviewers,  → {owner}/{artifact}-{attempt}.md          opts.artifact
//     verifier, goal auditor,     inputsDir → {owner}/{artifact}-{attempt}.inputs/   (the SIBLING slot)
//     orchestrator, runtime       ONE record per attempt — progress/raw/normalized are sections inside
//     preflight)                  it — but consumed MUTABLE bytes still need a place to land (§5).
// inputsDir is the attempt's snapshot slot (execution-evidence §1 path grammar, §5): the ONLY place the
// producer copies consumed mutable bytes. The sibling carries the terminal's owner + artifact + attempt, so
// it is reserved and verified absent WITH the terminal and needs no scheme of its own. bindAttempt names it.
// opts.epochInPath: false when the reservation's directory layout carries no epoch segment. The epoch is
// a recorded FIELD in EVERY case; it is a path segment only when the reservation says so (§1 A3).
const attemptRef = (owner, taskId, epoch, attempt, opts) => {
  const o = safeSeg('owner', owner), t = safeSeg('taskId', taskId), e = safeSeg('epoch', epoch)
  const art = opts && opts.artifact ? safeSeg('artifact', opts.artifact) : null
  if (!Number.isInteger(attempt) || attempt < 1)
    throw new Error(`INTEGRITY: attemptRef attempt must be a positive integer, got ${JSON.stringify(attempt)} — attempt numbers are RESERVED in build-state.md (monotonic per task id, §1 A2); they are never defaulted, derived or incremented here`)
  const root = art ? `${SESSION_ROOT}${o}/`
    : `${SESSION_ROOT}${o}/attempts/${opts && opts.epochInPath === false ? '' : `${e}/`}${t}/${attempt}/`
  const resultPath = art ? `${root}${art}-${attempt}.md` : `${root}result.md`
  const inputsDir = art ? `${root}${art}-${attempt}.inputs/` : `${root}inputs/`
  const id = `${o}|${t}|${e}|${attempt}`
  if (MINTED.has(resultPath) && MINTED.get(resultPath) !== id)
    throw new Error(`INTEGRITY: attempt path collision at ${resultPath} — ${MINTED.get(resultPath)} already reserved it, ${id} tried to re-enter it. A collision is a human finding, not permission to overwrite (execution-evidence §1 A4)`)
  MINTED.set(resultPath, id)
  return Object.freeze({ owner: o, taskId: t, epoch: e, attempt, root, resultPath, inputsDir })
}
// bindAttempt(prompt, ref, inputPaths, dependencies) → the prompt PLUS its evidence obligations.
// NO IO and NO acceptance decision: it does not read, hash, compare or judge anything. It serializes
// (a) the exact reserved OUTPUT paths, (b) the exact INPUT paths to snapshot, (c) the exact selected
// DEPENDENCY terminals + their selected SHA-256. The WORKER does the read/hash/compare; an INDEPENDENT
// reviewer decides acceptance (execution-evidence §2). Interpolating the identity also makes every
// re-dispatch of a NEW attempt a cache MISS by construction — a byte-identical prompt replays the prior
// verdict cached (rule 6), which is exactly how a stale grade survives a correction.
const bindAttempt = (prompt, ref, inputPaths, dependencies) => {
  // the slot guard runs BEFORE anything is serialized: a copy obligation rendered with no location is an
  // obligation with nowhere to land. derive refs with attemptRef; a hand-built ref must carry inputsDir too.
  if (!ref || !ref.resultPath || !ref.root || !ref.inputsDir)
    throw new Error(`INTEGRITY: bindAttempt ref carries no reserved snapshot slot (inputsDir): ${JSON.stringify(ref)} — derive it with attemptRef, which resolves the slot for both shapes; a producer told to copy mutable bytes must be told WHERE (execution-evidence §1 path grammar, §5)`)
  const inputs = inputPaths || [], deps = dependencies || []
  const bad = deps.find(d => !d || !d.taskId || !Number.isInteger(d.attempt) || d.attempt < 1 ||
    !d.resultPath || !/^[0-9a-f]{64}$/i.test(String(d.sha256 || '')))
  if (bad) throw new Error(`INTEGRITY: bindAttempt dependency is not a dependency REFERENCE: ${JSON.stringify(bad)} — it must carry {taskId, attempt, resultPath, sha256}; a dependency named without a hash is not a dependency reference (execution-evidence §5)`)
  // §4 LISTS "terminal status" as a field; that is not the same as the record ENDING with it. every later
  // reader — a resume, a fresh boot, the orchestrator's selection duty (§2) — learns this stage's verdict from
  // the artifact's last line, never from the reply, which is gone. BOTH shapes owe it, so it is stated once here
  // rather than patched per stage; a stage may add its ordering rule, never restate this.
  const closeTerminal = `CLOSE THE RECORD ITSELF with its own terminal line: the last non-empty line of ` +
    `${ref.resultPath} is literally STATUS: {CLEAN | PARTIAL | BLOCKED | NEEDS_CONTEXT | ERRORS_REMAINING: n}, ` +
    `byte-identical to the STATUS line you return and with nothing after it (§4 terminal status, §10 template). ` +
    `Returning the line is not writing it: a verdict absent from its own record is not recorded.`
  const dirShape = ref.resultPath === `${ref.root}result.md`
  return `${prompt}\n\n` +
    `EVIDENCE OBLIGATIONS (protocol: .claude/skills/team-kit-run/references/execution-evidence.md).\n` +
    `Your attempt identity: owner=${ref.owner} task=${ref.taskId} epoch=${ref.epoch} attempt=${ref.attempt}. ` +
    `The paths below were RESERVED for you before this dispatch. They are exact, not examples: never invent, ` +
    `shift, renumber or overwrite one. A reserved terminal that already exists, or that you cannot locate, is an ` +
    `INTEGRITY condition — STOP with STATUS: BLOCKED and say so; it is for the human, not a retry.\n` +
    (dirShape
      ? `1. WRITE ${ref.root}progress.md FIRST, before substantive work — durable and mutable, and NEVER a terminal verdict.\n` +
        `2. WRITE the write-once terminal ${ref.resultPath} LAST, with the full §4 field set (identity; observed role/route; ` +
        `terminal status; every input as original path / snapshot path / SHA-256; contract paths + hashes; dependency ` +
        `task/attempt/result path + hash; output paths + hashes; raw observation locator; normalization input/output/RULE ` +
        `when used; correction-of; command/rc/suites/skips; explicit limits). ${closeTerminal} Copy mutable consumed bytes into ` +
        `${ref.inputsDir} and hash the copy; keep raw captures in ${ref.root}raw/ and derived values in ${ref.root}normalized/ ` +
        `— never overwrite raw with normalized, and never write only the normalized form.\n`
      : `1. WRITE your single reserved terminal ${ref.resultPath}, once, carrying the §4 field set (identity; observed ` +
        `role/route; terminal status; every input as original path / snapshot path / SHA-256; contract paths + hashes; ` +
        `dependency task/attempt/result path + hash; output paths + hashes; raw observation locator; correction-of; ` +
        `command/rc/suites/skips; explicit limits). ${closeTerminal} Record progress inside it as you go. Copy mutable consumed bytes ` +
        `into ${ref.inputsDir} — your reserved SIBLING snapshot slot (same owner, artifact and attempt as the terminal) ` +
        `— and hash the copy there; the slot holds those copies and nothing else, and is never edited once written.\n` +
        `2. Keep raw and normalized SEPARATE inside that record: the verbatim observation, then any derived value with ` +
        `the RULE that produced it. Never report only the normalized form, and never let a derived claim contradict its ` +
        `own raw bytes.\n`) +
    (inputs.length
      ? `3. READ these exact inputs before you work, and record each one's path and the SHA-256 you actually observed: ` +
        `${inputs.join(', ')}. Snapshot bounded: pointer + hash for bytes that are already immutable (another attempt's ` +
        `terminal, a sealed contract, tracked source unmodified vs this run's baseline commit); COPY mutable bytes ` +
        `(dirty/untracked source, ledger rows, tool output) into ${ref.inputsDir}. Confirm each one is still APPLICABLE to this task before you ` +
        `rely on it — a record produced against bytes that have since changed is stale, not evidence, and stale input is a ` +
        `recorded limit, never a silent assumption. Missing or unreadable input → STOP, STATUS: BLOCKED.\n`
      : `3. This stage declares NO consumed input evidence. If you find you need some, STOP with STATUS: NEEDS_CONTEXT — do not source it yourself.\n`) +
    (deps.length
      ? `4. DEPENDENCIES — before consuming ANY of them: read the exact named terminal, re-hash it, and compare to the ` +
        `SHA-256 the orchestrator SELECTED. ${deps.map(d => `${d.taskId} attempt ${d.attempt} → ${d.resultPath} (sha256 ${d.sha256})`).join('; ')}. ` +
        `A mismatch, a missing file, or evidence whose recorded applicability no longer holds for THIS task → STOP with ` +
        `STATUS: BLOCKED. Never resolve a dependency by directory listing, newest timestamp, highest filename, a "latest" ` +
        `pointer, or a CLEAN label: a producer's CLEAN is its claim, never your verification.\n`
      : `4. This stage consumes NO prior attempt's terminal. Do not go find one.\n`) +
    `5. Snapshotting, hashing and path preparation are PREPARATION, not observation: they never establish that a stage ` +
    `ran, that a tool was called, or that an effect happened. Claim only what you actually observed, and record what you ` +
    `did not as an explicit limit.\n` +
    `6. If a write is REFUSED, return the ENTIRE intended artifact text verbatim plus the refusal and the exact intended ` +
    `path. Do not rename, heredoc or otherwise bypass the guard; the orchestrator transcribes it.`
}
// STALE SET — the orchestrator's "stale affected dependents" duty (execution-evidence §2 selection row),
// computed instead of remembered. Pure: no IO, no import (rule 7), deterministic output.
// edges: [{ producer, consumer }] — ONE recorded consumption: the consumer's evidence read the producer's
//   bytes or claims (a §5 input triple or a dependency reference). Ids are opaque non-empty strings the
//   ledger uses consistently (a task key, `{task}#{attempt}`, a source path), compared with ===, never
//   normalized — mixing id styles across rows silently disconnects the graph.
// changed: an array or Set of ids whose bytes changed.
// → sorted array of every id reachable from `changed` along ONE OR MORE edges: the consumers made stale,
//   transitively. A changed id appears only if a changed id reaches it (it consumed changed work, directly
//   or around a cycle). A diamond yields its join once; a cycle terminates because an id is queued only on
//   first entry; an id no edge names contributes nothing and is never emitted — only an edge's consumer can
//   be, so nothing is invented. CAVEAT: that also means a MISTYPED changed id stales nothing — take ids from
//   the same ledger rows the edges come from. A malformed edge THROWS: dropping it would leave its consumer
//   un-staled, which is stale evidence read as current. The result names what to RENEW (a new attempt, §1
//   A5), never a record to edit.
const staleSet = (edges, changed) => {
  if (!Array.isArray(edges))
    throw new Error(`INTEGRITY: staleSet edges must be an array of {producer, consumer}, got ${JSON.stringify(edges)}`)
  if (!Array.isArray(changed) && !(changed instanceof Set))
    throw new Error(`INTEGRITY: staleSet changed must be an array or Set of ids, got ${JSON.stringify(changed)} — a missing changed set read as "nothing changed" would clear every consumer`)
  const consumersOf = new Map()
  for (const e of edges) {
    if (!e || typeof e.producer !== 'string' || !e.producer || typeof e.consumer !== 'string' || !e.consumer)
      throw new Error(`INTEGRITY: staleSet edge is not {producer, consumer} with non-empty string ids: ${JSON.stringify(e)} — a dropped edge leaves its consumer un-staled`)
    if (!consumersOf.has(e.producer)) consumersOf.set(e.producer, [])
    consumersOf.get(e.producer).push(e.consumer)
  }
  const stale = new Set(), queue = [...changed]
  for (let i = 0; i < queue.length; i++)
    for (const c of consumersOf.get(queue[i]) || [])
      if (!stale.has(c)) { stale.add(c); queue.push(c) }
  return [...stale].sort()
}
// ============================================================================================

// Heavy agents do real tool work → they reliably FINISH but skip a forced StructuredOutput (rule 9).
// Heavy stages take NO schema: they WRITE their artifact to team-session/ + end with a STATUS line the
// orchestrator parses. statusOf() reads it. Schema is reserved for LIGHT stages (discovery/echo).
//
// 4-WAY CLASSIFIER (rule 12, reliability-3). A 3-way {clean|errors|partial} collapses BLOCKED and
// NEEDS_CONTEXT into a re-dispatchable bucket, so a "the plan is wrong / I'm missing context" agent
// burns the FULL MAX_REDISPATCH budget re-running an unwinnable stage instead of stopping. Split it:
//   • CLEAN              → done.
//   • BLOCKED|NEEDS_CONTEXT → 'blocked' → break the loop IMMEDIATELY and return the route-tagged stop
//                            (an in-loop retry can't fix it; SKILL.md → Triage-first routes the tag).
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
const escalates = (s) => s === 'blocked'   // BLOCKED/NEEDS_CONTEXT — break the loop, return the tagged stop

// EXACT-TOKEN INTEGRITY MARKER (rule 12 sub-note obligation 1) — the ONE test for "this report carries an
// INTEGRITY finding"; every control-flow INTEGRITY check calls it. A bare /INTEGRITY:/ matched a verifier's
// own clean line "INTEGRITY: none found." and RETURNED a run (moirai effort #1). The exact-token form that
// effort then shipped put \s* OUTSIDE the negative lookahead and is defeated by backtracking: \s* retreats to
// zero width, the lookahead sees the space instead of "none", and "**INTEGRITY: none found.**" MATCHES
// (e2 build-state D-5). Whitespace AND bold markers therefore sit INSIDE the lookahead, so nothing outside it
// can backtrack past the guard; that also covers "INTEGRITY: **none**" and the bold-label "**INTEGRITY:** none".
// The negative counts only when the WHOLE clean phrase (none, none found, n/a, no issues|findings|problems,
// optionally + found) is TERMINATED by . or !, a bold close, or end of line. A LEADING-WORD negative, keyed on
// none|no|n/a followed by a word boundary, read "INTEGRITY: no test covers the new refusal", "INTEGRITY: no-op
// guard" and "INTEGRITY: none of the suppressions were removed" as clean: false cleans on the integrity gate
// (e2 build-state PD-3). Anything else FAILS CLOSED as a finding ("none found — but …", "nothing found."): a
// false BLOCK is visible, a false clean is not. Line-anchored: a line that does not BEGIN with the marker is
// never a finding, so the token quoted mid-prose is not. SAME-LINE ALTERNATIVE (.*INTEGRITY:): a marker line
// that carries a SECOND INTEGRITY: token anywhere later on that same line is a finding whatever precedes it,
// so a terminated clean phrase cannot hide one ("INTEGRITY: none. INTEGRITY: contract file edited by a coder"
// read clean before; e2 build-state PD-4). Its cost: a clean line that quotes the token again fails closed.
// RESIDUAL false cleans no line regex can see: "INTEGRITY: none. But a suppression was added" (the clean phrase
// is terminated, the rest reads as prose) and a finding hard-wrapped onto the next line right after "none" (end
// of line terminates the phrase). A bulleted "- INTEGRITY: …" is not a marker line either. Backstop: the
// finding contract — one finding per line, each on its own line beginning INTEGRITY:, the report ending
// STATUS: BLOCKED, which statusOf escalates whatever this regex returns. The backstop's limit: a report gaming
// the gate will not self-report BLOCKED, so it covers honest reports only and the residuals stay open to gaming.
const hasIntegrity = (t) => /^[\s*]*INTEGRITY:(?:(?![\s*]*(?:none(?:\s+found)?|n\/a|no\s+(?:issues|findings|problems)(?:\s+found)?)\s*(?:[.!]|\*\*|$))|.*INTEGRITY:)/im.test(String(t || ''))

// COMBINED GATE (rule 12). statusOf is 4-way but the two not-clean buckets need DIFFERENT handling, and
// gating on escalates() ALONE is the easy mistake: PARTIAL / ERRORS_REMAINING / missing-STATUS are all
// 'errors', not 'blocked', so an escalates-only check lets them flow through as SUCCESS. Measured live
// 2026-08-23: a negative-controls stage returned PARTIAL and reached Finalize ungated (build-state §68).
// Use this at EVERY serial critical-path stage; returns null to continue, or the value to return.
const gate = (stage, txt, extra) => {
  const s = statusOf(txt)
  if (ok(s)) return null
  return { stage, status: escalates(s) ? 'blocked' : 'errors_remaining', detail: String(txt).slice(-3000), ...(escalates(s) ? routeOfText(txt) : {}), ...extra }
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

// ROUTE TAG (d-5 triage-first) — every stop this script returns NAMES its own route in additive fields.
// the orchestrator routes on `route`, never on note prose (SKILL.md § Autonomy contract → Triage-first):
// 'triage' = one fresh assessor resolves it and the run relaunches with the recorded ruling; 'human' = a
// kept gate. FAIL-CLOSED: a stop carrying no `route` is read as human, so a tag this script forgot can
// only narrow autonomy, never widen it. the script decides nothing beyond naming the class.
const ASSESSOR = { 'needs-context': 'team-researcher', stall: 'team-investigator', blocked: null }   // null = the orchestrator picks the assessor from the report
const triageRoute = (trigger) => ({ route: 'triage', trigger, assessor: ASSESSOR[trigger] })
const humanRoute = (gate) => ({ route: 'human', gate })                  // every call site passes a LITERAL gate name
// classify any text statusOf() read as 'blocked'. INTEGRITY is tested FIRST and twice: the exact-token
// marker, then a status line that NAMES an integrity condition. a reserved-terminal collision (the
// attempt-binding instruction above) carries no marker line at all, so hasIntegrity misses it and it
// would otherwise reach an assessor instead of the human who owns integrity.
const routeOfText = (t) => {
  if (hasIntegrity(t)) return humanRoute('integrity')
  const line = String(statusLineOf(t) || '')
  if (/\bINTEGRITY\b/i.test(line) || /\breserved\b.*\b(exist|collision|locate)/i.test(line)) return humanRoute('integrity')
  if (/\(agent cap reached/.test(line)) return humanRoute('agent-cap')   // the wrapper's platform-ceiling label, below
  if (/\(budget exhausted/.test(line)) return humanRoute('budget')
  return triageRoute(/NEEDS_CONTEXT/i.test(line) ? 'needs-context' : 'blocked')
}
// a same-failure stall is a triage trigger only while the loop still has rounds LEFT. on the last round
// the stall IS cap exhaustion, and an exhausted cap is a kept human gate — arrive with the ledger.
const stallRoute = (roundsLeft) => (roundsLeft > 0 ? triageRoute('stall') : humanRoute('round-cap'))

// RULING CARRIER (d-5) — a ruling the orchestrator recorded as PD-n reaches ONLY the builder it names,
// and only as an INPUT path: the agent READS the ruling at that path, so no dispatch prompt acquires a
// new obligation. absent → [] → every prompt byte is unchanged and existing cache prefixes still hit.
// the WHOLE args.rulings is re-validated on every call and fails closed: a key outside the closed set, a
// non-array value or an entry without a PD-n id and a path is a ledger defect for the human, never a
// value to guess past — a ruling aimed at a stage that does not exist would otherwise reach no prompt
// and read as applied.
const RULING_STAGES = ['impl', 'spec', 'qual', 'finalize', 'fix-mech', 'validate', 'fix-ac']
const rulingInputs = (stageKey) => {
  const all = args.rulings || {}
  for (const k of Object.keys(all)) {
    if (!RULING_STAGES.includes(k))
      throw new Error(`INTEGRITY: unknown ruling stage key "${k}" — args.rulings accepts exactly ${RULING_STAGES.join(', ')}; a ruling on an unknown stage reaches no builder and would read as applied`)
    if (!Array.isArray(all[k]))
      throw new Error(`INTEGRITY: args.rulings.${k} is ${typeof all[k]}, not an array of { id, path } entries`)
    for (const r of all[k])
      if (!r || !/^PD-\d+\b/.test(String(r.id || '')) || !String(r.path || '').trim())
        throw new Error(`INTEGRITY: malformed ruling on ${k} — every entry carries a PD-n id and the non-empty path it was recorded at, got ${JSON.stringify(r)}`)
  }
  return (all[stageKey] || []).map((r) => `${r.path} (${r.id})`)
}

// TRY-AGENT WRAPPER (rule 11, reliability-2) — the documented failure model is NULL-FIRST: a terminal
// API error (after retries) or a user skip resolves agent() to null, not a throw. statusOf(null)
// already classifies 'errors', so null needs no wrapper — but check journal.jsonl before re-dispatching
// a null slice: a USER SKIP is a deliberate act, re-running it overrides the user (route to human).
// the documented THROW vectors are the platform agent() call cap and budget-ceiling exceedance;
// residual throws (subprocess/harness) exist as backstop territory. so this wrapper does four jobs on
// the serial critical path:
//   agent-cap throw: BLOCKED labelled `agent cap reached`, tested FIRST because the platform cap
//                  message itself names the remaining token budget, so the budget branch would claim it and
//                  report a hard platform ceiling as a token budget
//   budget throw → STATUS: BLOCKED (escalate — re-dispatching against a hard ceiling just re-throws)
//   other throw  → STATUS: ERRORS_REMAINING with a `transport:` marker — the orchestrator may
//                  auto-resume ONCE (resumeFromRunId + identical args; cached stages free) before the
//                  human gate. the marker is the ONLY auto-resume trigger: agent-REPORTED
//                  ERRORS_REMAINING (no marker) never auto-resumes.
const tryAgent = async (label, p, opts) => {
  try { return await agent(p, opts) }
  catch (e) {
    const msg = String((e && e.message) || e)
    // the platform agent() call cap is tested BEFORE /budget/i: its own message names the remaining
    // token budget, so the budget branch below would otherwise claim it and mislabel a hard
    // platform ceiling as a token budget. matched on the error NAME or the message (AA-1).
    if ((e && e.name === 'WorkflowAgentCapError') || /agent\(\) call cap reached/i.test(msg)) {
      log(`agent cap hit at ${label} — a platform ceiling, never retried`)
      return `STATUS: BLOCKED (agent cap reached at ${label}: ${msg})`     // statusOf() → 'blocked'
    }
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
// A MARKER IS NOT REPLAY AUTHORITY. It records that this wrapper caught a throw — nothing more. It does
// not establish what the dispatched stage DID before throwing, so it never settles the stage's effect
// state, and under the opt-in evidence protocol it does not by itself license the re-dispatch: that
// needs a RetryPermit the orchestrator recorded against the journal (execution-premises.md §7,
// execution-evidence.md §7 R4). The marker is at most the evidencePath such a permit cites.

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
// ONCE, with a fresh tag (cache-poison guard). dark-agent caveat (rule 15 addendum): same prompt can
// re-die identically — shrink scope in the retry prompt where possible.
//
// THIS SCRIPT CANNOT INSPECT JOURNALS. A workflow has no import and no fs (rule 7), so nothing in here
// can read <transcriptDir>/journal.jsonl and nothing in here can tell an API failure from a deliberate
// USER SKIP from a cap kill: `null` is the same value for all three. The previous speculative behavior
// — re-dispatch any non-paid null, journal-check "afterwards" — is REMOVED: it re-offered work a user
// had already skipped (overriding the user) and re-ran stages whose effect was UNKNOWN (turning one
// unknown effect into two). This helper no longer DECIDES a retry; it only enforces a decision the
// ORCHESTRATOR already made outside the run, against the journal, and passed in as a permit.
//
// items[i]: { name, prompt, opts, paid?, retryPermit? }
// retryPermit: { decision:'allow'|'hold', evidencePath, reversible, unpaid, userSkip } — the recorded
// reconciliation (execution-premises.md §7; execution-evidence.md §7 R4). RETRY only on: decision
// 'allow' + a non-empty evidencePath + reversible + unpaid + NOT userSkip + the slice is not paid.
// Anything else — permit MISSING, 'hold', 'allow' with no evidence locator, irreversible, paid, or a
// user skip — returns a HOLD (null) to the orchestrator WITH ITS REASON, never a silent bail and never
// an auto-replay. A `transport:` marker (rule 11) is evidence that a stage threw; it is at most the
// evidencePath an 'allow' cites, and on its own it is NOT replay authority.
// Under the execution-evidence protocol a retry is a GENUINE RERUN, so its slice is a NEWLY RESERVED
// attempt (§1 A2/A5) — the caller passes an already bound `prompt` for that new number, never the dead
// attempt's prompt re-sent at its old identity.
const permitDenial = (it) => {
  const p = it && it.retryPermit
  if (it && it.paid) return 'paid/one-shot slice — a second paid run is a decision, not a retry (§7 R4)'
  if (!p) return 'no RetryPermit — the orchestrator has not reconciled this null against the journal'
  if (p.decision !== 'allow') return `permit decision is ${JSON.stringify(p.decision)}, not 'allow'`
  if (p.userSkip) return 'permit records a USER SKIP — a skip is a decision, re-offering it overrides the user'
  if (!p.reversible) return 'permit is not reversible-scoped'
  if (!p.unpaid) return 'permit is not unpaid-scoped'
  if (!p.evidencePath || !String(p.evidencePath).trim()) return "permit says 'allow' with no evidencePath — an authority claim with no recorded reconciliation"
  return null   // permitted
}
const retryMissing = async (items, results, tag) => {
  const missIdx = results.map((r, i) => (r ? -1 : i)).filter(i => i >= 0)
  if (!missIdx.length) return results
  const denied = missIdx.map(i => ({ i, why: permitDenial(items[i]) })).filter(d => d.why)
  if (denied.length) {
    denied.forEach(d => log(`HOLD retryMissing [${tag}] ${items[d.i].name}: ${d.why}`))
    log(`retryMissing [${tag}]: HOLD to the orchestrator — reconcile against journal.jsonl, record the ` +
      `effect state (none/observed/unknown) and either reserve a NEW attempt with a permit or escalate. ` +
      `Not an ordinary retry (execution-premises.md §7).`)
    return null
  }
  log(`retryMissing [${tag}]: ${missIdx.map(i => items[i].name).join(',')} — one permitted re-dispatch each ` +
    `(permits: ${missIdx.map(i => items[i].retryPermit.evidencePath).join(',')})`)
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
// items[i]: { name, artifact, auditArtifact, files_owned?, verify? } — artifact = the <session> path the
// PRODUCER was told to Write; auditArtifact = the SEPARATE path under the AUDIT owner this audit writes.
//
// A RECONSTRUCTION IS NOT THE OBSERVATION (execution-evidence §7). Two changes to the original shape:
//   • the audit writes its OWN auditArtifact and NEVER the producer's artifact. It reads the producer's
//     record; it does not re-write it. The producer's record — INCLUDING ITS ABSENCE — stays exactly as
//     the producer left it, or the run has overwritten the very evidence the audit exists to interpret.
//   • "no artifact AND no diff" does NOT prove the work was not done. That is the cap-kill signature
//     (rule 15 addendum) and a killed agent's edits survive it. Unknown completion is recorded UNKNOWN
//     and HELD for journal reconciliation — never reported as proven non-execution, never auto-replayed.
// The patched slice keeps the RUN moving, so it is prefixed `[reconstruction …]`: downstream gates read
// its STATUS (the terminal line still anchors — statusLineOf is line-anchored), but nothing may select
// or cite it as the PRODUCER's terminal evidence. Reconstruction and observation stay distinguishable.
const isReconstruction = (t) => /^\[reconstruction /.test(String(t || ''))
// CLOSE THE ARTIFACT — the UNBOUND twin of bindAttempt's closeTerminal (SKILL.md § Execution-stage
// templates). bindAttempt states the obligation for every stage it binds; a stage that does NOT route
// through it owes the same sentence in its own prompt, or its verdict lives only in a reply that is gone
// by the next resume, fresh boot or evidence selection (§2 selection reads the artifact's last line).
// ONE const interpolated at every unbound site below, never re-typed per stage: six pasted copies is how
// this clause drifted into 25 dialects in the role files. It cites execution-evidence rather than
// re-deriving the canonical statement — that file owns it.
// PLACEMENT CAVEAT — READ IT AT THE USE SITE, NOT HERE. This const is DECLARED in this block and USED in
// three blocks far below (research, preflight, calibrate), and this file is copied in PIECES: a block taken
// on its own throws `ReferenceError: closeArtifact is not defined` (reproduced 2026-09-13 by evaluating the
// paid block alone, 5148 bytes, against mocked free vars). It cannot be hoisted out to fix that — the suite
// extracts this block by anchor and EXPORTS closeArtifact from it, so a const moved above the anchor leaves
// the extracted region and throws there instead (verified the same way). So the dependency is declared at
// each USE site instead: every unbound stage below carries a one-line note to bring this const with it.
// Keep those notes in step with this one, and never hand-type the sentence at a site — the whole point of
// one const is that the next dialect cannot start.
const closeArtifact = (path) => `CLOSE THE ARTIFACT ITSELF with its own terminal line: the last ` +
  `non-empty line of ${path} is literally that same STATUS line, byte-identical to the one you return and ` +
  `with nothing after it (execution-evidence.md §4 terminal status, §10 template). Returning the line is ` +
  `not writing it: a verdict absent from its own record is not recorded. If the write is REFUSED, that ` +
  `same line ends the TEXT you return for the lead to persist — follow the write-denial protocol, never ` +
  `bypass the guard.`
const auditEmpty = async (items, results, tag) => {
  // fail LOUD and on EVERY call, not only when a slice happens to come back empty: an item authored
  // without its own auditArtifact would otherwise silently fall back to writing the producer's file.
  const unowned = items.filter(it => !it || !it.auditArtifact).map(it => (it && it.name) || '?')
  if (unowned.length) throw new Error(`INTEGRITY: auditEmpty item(s) without an auditArtifact: ${unowned.join(',')} — a reconstruction is a SEPARATE artifact under the AUDIT owner and may never be written into the producer's artifact (execution-evidence §7 R1)`)
  // DISTINCT, not merely present: an auditArtifact equal to the producer's artifact passes the presence
  // check and still aims the reconstruction at the producer's record — the overwrite R1 forbids. Exact
  // string equality: two spellings of one path (./x vs x) are not caught here.
  const aliased = items.filter(it => it.auditArtifact === it.artifact).map(it => it.name || '?')
  if (aliased.length) throw new Error(`INTEGRITY: auditEmpty item(s) whose auditArtifact IS the producer's artifact: ${aliased.join(',')} — the audit would write the very record it exists to interpret; a reconstruction goes to a SEPARATE path under the AUDIT owner (execution-evidence §7 R1)`)
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
      `READ — do not write — its on-disk artifact ${it.artifact}` +
      (it.files_owned ? ` and the git diff (working tree vs HEAD) of its owned files: ${it.files_owned.join(', ')}` : '') + `. ` +
      (it.verify ? `Run its verify: ${it.verify} — report pass/fail with the output tail; count ONLY failures in its owned files. ` : '') +
      `Write YOUR reconstruction to ${it.auditArtifact}, and write NOTHING else: ${it.artifact} is the PRODUCER's record ` +
      `and stays exactly as the producer left it, including if it is missing or empty. Label the file a reconstruction ` +
      `and record: which producer attempt it reconstructs, the exact artifact/diff/verify locators you actually read, ` +
      `your steps, your certainty, and every effect you could not resolve. ` +
      `A missing artifact AND no diff does NOT prove the work was not done — that is the cap-kill signature, and a ` +
      `killed agent's file edits survive it. Report completion as unknown in that case; do not assert non-execution. ` +
      `END with a STATUS line: CLEAN only if the work looks complete AND — when a verify is given — its verify slice ` +
      `passes; ERRORS_REMAINING when it is incomplete; BLOCKED when completion is UNKNOWN — unknown is held for the ` +
      `orchestrator to reconcile against journal.jsonl, it is never an ordinary retry. ` +
      closeArtifact(it.auditArtifact),
      { label: `audit:${it.name}:${tag}`, phase: 'Audit', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
  }))
  // the audit fan-out itself can drop a slice — that IS a true gap (no recoverable disk evidence).
  if (coverage(audits, emptyIdx.length)) return null
  emptyIdx.forEach((idx, k) => { results[idx] = `[reconstruction ${items[idx].auditArtifact} — NOT the producer's terminal]\n${audits[k]}` })
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
// TAKING THIS BLOCK ALONE: bring the closeArtifact const with it — declared up in the disk-audit block,
// interpolated on the last line of this prompt, and a ReferenceError if you copy one without the other.
const RESEARCHER = `You are a team RESEARCHER. Read-only. Use ToolSearch to load ` +
  `mcp__cocoindex-code__search / claude-mem / context-mode; follow investigation-methodology. ` +
  `Do NOT modify files. Write findings to <session>research/<name>.md, then END with a STATUS line. ` +
  closeArtifact('<session>research/<name>.md')
let research = await parallel(areas.map(a => () =>
  tryAgent(`research:${a.name}`, `${RESEARCHER}\nInvestigate: ${a.desc}\nWrite: <session>research/${a.name}.md`,
    { label: `research:${a.name}`, phase: 'Research' })))        // NO agentType, NO schema → free text; tryAgent per rule 11
// EMPTY-RESULT DISK AUDIT (rule 15) BEFORE coverage — a researcher that Wrote its research/<name>.md but lost
// its return text is recoverable from disk; don't bail it as a drop. artifact = the findings file it Wrote,
// auditArtifact = the audit owner's OWN separate file (the audit never re-writes the researcher's).
research = await auditEmpty(areas.map(a => ({ name: a.name, artifact: `<session>research/${a.name}.md`, auditArtifact: `<session>verifier/audit-research-${a.name}.md` })), research, 'research')
if (!research) return { stage: 'research', status: 'errors_remaining', note: 'empty-result audit coverage gap' }
// TRUE GAP → one single-slice retry, and ONLY under a RetryPermit the orchestrator already recorded
// against the journal and passed in args (this script cannot read journal.jsonl — rule 7). No permit,
// a held permit, a paid slice or a user skip → HOLD, not a retry (execution-premises.md §7).
research = await retryMissing(areas.map(a => ({ name: a.name, prompt: `${RESEARCHER}\nInvestigate: ${a.desc}\nWrite: <session>research/${a.name}.md`, opts: { phase: 'Research' }, retryPermit: (args.retryPermits || {})[a.name] })), research, 'research-gap')
if (!research) return { stage: 'research', status: 'errors_remaining', note: 'retry HELD — no/held permit, paid slice or user skip; orchestrator reconciles against journal.jsonl' }
// COVERAGE ASSERTION (rule 10) — a dropped research area must NOT read as covered.
const researchGap = coverage(research, areas.length)
if (researchGap) { log(`Research coverage gap after retry: ${JSON.stringify(researchGap)}. NOT clean.`)
  return { stage: 'research', status: 'errors_remaining', coverageGap: researchGap } }
// orchestrator reads <session>research/*.md for detail; gate on statusOf(research[i]).

// IMPLEMENT — single-writer (default, safe on one branch). FREE TEXT + writes its attempt record.
// Routed through tryAgent (rule 11) — a thrown coder (stall/rate-limit/subprocess) must NOT abort the run.
// ATTEMPT BINDING: `n` is the RESERVED attempt number for THIS dispatch (args.attempts, mirrored from
// build-state.md), not a loop index the script invents — a re-implement after a failed review is a NEW
// reserved attempt whose failed predecessor is retained (§1 A2). The identity rides IN the prompt, so a
// re-dispatch is a cache MISS by construction; `<session>coder-${name}/progress.md` survives only as a
// latest POINTER (§9) — decisive evidence is the numbered record below, never the fixed path.
const implRef = (n) => attemptRef(`coder-${name}`, TASK_KEY, EPOCH, n)
const runImplement = (fb, n) => tryAgent(`impl:${name}`,
  bindAttempt(
    `Implement ${task} in ${files}. ${context}${fb || ''}\n` +
    `Edit ONLY your owned files; END with a STATUS line.`,
    implRef(n), [...(args.inputs || []), ...rulingInputs('impl')], args.deps || []),
  // NO model override → inherits the session model. implement is real design/judgment work — the
  // ONE stage class that keeps the inherited model (rule 13). Do NOT add model:'sonnet' here.
  { label: `impl:${name}`, phase: 'Implement', agentType: 'team-coder' })   // NO schema
await runImplement('', 1)   // tryAgent-wrapped: on throw → STATUS: ERRORS_REMAINING text, not a run abort

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
// NO closeArtifact() here, and that is deliberate: this stage's artifact is a PATCH the apply stage
// feeds to git, not a prose record. A trailing STATUS line corrupts it, so the close obligation cannot
// attach to a .diff — the verdict rides in the reply, and a lost reply is reconstructed from the diff by
// the auditEmpty pass above. The residual is real and NOT closed here: a propose attempt whose reply is
// gone has no durable verdict of its own. Closing it means giving the stage a companion record to close,
// which is a new reserved path this file may not mint on its own.
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
proposals = await auditEmpty(orderedMods.map(m => ({ name: m.name, artifact: `<session>proposals/${m.name}.diff`, auditArtifact: `<session>verifier/audit-propose-${m.name}.md` })), proposals, 'propose')
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
//   const laneRef = (l, n) => attemptRef(`coder-${l.name}`, l.taskKey, EPOCH, n)
//   let lanes = await parallel(LANES.map(l => () => tryAgent(`impl:${l.name}`, bindAttempt(coderPrompt(l, fb[l.name]), laneRef(l, l.attempt), l.inputs, l.deps), {label:`impl:${l.name}`, phase:'Implement', agentType:'team-coder'})))
//   lanes = await auditEmpty(LANES.map(l => ({name:l.name, artifact:`${laneRef(l, l.attempt).root}progress.md`, auditArtifact:`<session>verifier/audit-impl-${l.name}-initial.md`, files_owned:l.files_owned, verify:l.verify})), lanes, 'initial')
//   if (!lanes) return { stage:'implement-audit', status:'errors_remaining', note:'audit coverage gap' }
// On review-driven re-dispatch, TAG each lane's feedback per attempt so the in-run cache can't return a
// stale/empty result (cache-poison guard, rule 15): fb[l.name] = `[retry s${attempt+1}] spec failed — read
// <session>spec-reviewer/spec-review-${attempt+1}.md and fix YOUR lane`, then re-run auditEmpty with a fresh
// tag (`spec-redo-${attempt+1}` / `qual-redo-${attempt+1}`). The single-writer loop below varies its prompt
// via the growing `feedback` array, so it is already tag-safe; the PARALLEL redo needs the explicit tag.

// REVIEW + bounded reject → re-dispatch (PROVEN de-harness: reject@1 → feedback → approve@2; capped at MAX_REDISPATCH rounds).
// spec gates quality; STATUS drives the loop (NO schema — reviewers do real diff-reading work, rule 9).
// runId threading (gaps-1): the in-run loop below re-dispatches as separate agent() calls inside ONE workflow run,
// so the engine already caches the unchanged prior stages. The expensive miss is when a re-dispatch crosses a
// HUMAN GATE and becomes a SEPARATE launch: the orchestrator MUST capture this run's WorkflowOutput.runId (step 4)
// and pass it as resumeFromRunId on the relaunch — else every prior passing stage re-runs from scratch (treated as
// same-session-only until re-probed — rule 6; identical args required or the cache misses — see the resume-args contract).
// BLOCKED/NEEDS_CONTEXT from ANY stage breaks the loop and returns a route-tagged stop (rule 12,
// reliability-3) — an in-loop retry cannot resolve "the plan is wrong / I'm missing context", so stop
// instead of burning MAX_REDISPATCH on an unwinnable stage. The orchestrator routes the tag per
// SKILL.md § Autonomy contract → Triage-first: one fresh assessor first, a person once triage fails.
// Only 'errors' re-dispatches in-loop.
const MAX_REDISPATCH = 10
// ────────────────────────────────────────────────────────────────────────────────────────────
// ACCOUNTING — TWO UNITS, NOT INTERCHANGEABLE (SKILL.md § Autonomy contract → Two accounting units).
//   REVIEW ROUND    = one remediation ITERATION of ONE phase loop. Capped PER PHASE (review /
//                     verify / validate / measure each have their own cap; review rounds never consume
//                     verify rounds). Counted by `attempt` / `vRound` / `aRound` / `mRound` below.
//   FIX DISPATCH    = one ACTUAL coder dispatch to fix something (impl-redo / fix-mech / fix-ac).
//                     ONE GLOBAL ceiling across all three phases. Counted by spendFix().
// They diverge BOTH ways, which is why neither number may stand in for the other: one round can
// carry TWO distinct repairs (a test repair and a runtime repair) — two dispatches, still ONE round,
// never two fabricated rounds; and a round that finds nothing to hand a coder charges ZERO dispatches
// (a no-op correction is not dispatched and not charged).
// ────────────────────────────────────────────────────────────────────────────────────────────
// SEEDING (rule 12). In-memory counters die at every relaunch, so BOTH units are seeded from
// build-state.md via args — consumed history is SEEDED, never reset. Three invariants:
//   (1) a seed only ever REDUCES headroom. It is a CONSUMED count, never an allowance: seeded at or
//       above a cap means the NEXT dispatch in that lane is REFUSED, not "one more granted".
//   (2) SEEDING NEVER EXPANDS A CAP. The caps come from the plan's ratified `autonomy:` block; a
//       resume spends against them and can never raise one. spent() accepts undefined/null (→ 0) or a
//       non-negative safe integer (→ itself) and THROWS INTEGRITY on anything else. It used to floor and
//       zero: NaN/garbage/negative → 0, i.e. FULL headroom for a lane whose ledger said otherwise — a
//       seed expanding a cap. A seed the script cannot read is a ledger defect for the human, never a
//       number to guess. The ceiling is read from globalFixCeiling ONLY — never from a spent-count arg.
//       The throw fires where ROUNDS_SPENT / totalFix are evaluated: inline this block BEFORE the first
//       agent() so a malformed seed refuses the launch before anything dispatches.
//   (3) seed only what THIS segment will not re-incur. A resumeFromRunId relaunch with identical args
//       re-executes the script from the top and replays completed agent() calls from cache (rule 6),
//       so this run's own replayed rounds re-increment these counters in-script; seed the charges from
//       EARLIER launches only, or the same fix is charged twice. (Derived from the documented
//       resume-caching contract, not from an observed run — check it on a long segment chain.)
// build-state.md is authoritative; these counters are a bounded mirror. Disagreement resolves toward
// the ledger, never toward whichever number leaves more headroom.
const spent = (v) => {
  if (v === undefined || v === null) return 0                                // no seed recorded = nothing consumed
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return v + 0   // + 0 folds -0 into 0
  const shown = typeof v === 'string' || typeof v === 'object' ? JSON.stringify(v) : String(v)   // String keeps NaN/Infinity/bigint readable
  throw new Error(`INTEGRITY: malformed consumed-count seed ${shown} (${typeof v}) — a seed is a non-negative safe integer mirrored from build-state.md; fractional, negative, NaN, ±Infinity and non-numeric seeds (numeric strings included) are REFUSED, never floored or zeroed into headroom (seeding invariant 2)`)
}
// consumed ROUNDS per phase, from the ledger. `capReached(stage, seeded, inSegment, cap)` is the
// refusal: total rounds = seeded + in-segment, compared against that phase's OWN cap.
const ROUNDS_SPENT = {
  review: spent(args.autonomy && args.autonomy.roundsAlreadySpent && args.autonomy.roundsAlreadySpent.review),
  verify: spent(args.autonomy && args.autonomy.roundsAlreadySpent && args.autonomy.roundsAlreadySpent.verify),
  validate: spent(args.autonomy && args.autonomy.roundsAlreadySpent && args.autonomy.roundsAlreadySpent.validate),
  // the measurement lane's own unit (below the grade): a measurer is not a coder, so its rounds are
  // counted here and NEVER charged against the global fix-dispatch ceiling.
  measure: spent(args.autonomy && args.autonomy.roundsAlreadySpent && args.autonomy.roundsAlreadySpent.measure),
}
const capReached = (stage, seeded, inSegment, cap) => (seeded + inSegment >= cap
  ? { stage, status: 'errors_remaining', rounds: seeded + inSegment, seededRounds: seeded, cap, note: `${stage} round cap ${cap} reached (${seeded} seeded from build-state + ${inSegment} this segment) — human gate with the ledger; a seed never raises a cap`, route: 'human', gate: 'round-cap' }
  : null)
// GLOBAL FIX CEILING — the autonomy block's third default: total coder fix-dispatches across
// review + verify + validate ≤ TOTAL_FIX. in-memory here; the ORCHESTRATOR mirrors the count into
// build-state.md after every round so a relaunch SEEDS it (rule 12) — pass the prior count via args.
const TOTAL_FIX = (args.autonomy && args.autonomy.globalFixCeiling) || 30
let totalFix = spent(args.autonomy && args.autonomy.fixesAlreadySpent)
const spendFix = (stage) => (++totalFix > TOTAL_FIX ? { stage, status: 'errors_remaining', note: `global fix ceiling ${TOTAL_FIX} exhausted (${totalFix - 1} already charged) — human gate with the ledger`, route: 'human', gate: 'fix-ceiling' } : null)
// transport-synthesized text is NOT a gate verdict: no artifact was (re)written, so a fix loop
// dispatched against it fixes stale/nothing. surface it so the orchestrator applies the one-auto-resume rule.
const isTransport = (t) => /\(transport:/.test(String(t || ''))
let attempt = 0, status = null, escalated = null
// the coder's MONOTONIC attempt number for this run (§1 A2): every coder dispatch below — re-implement,
// mechanical fix, AC fix — consumes the NEXT one, and the superseded attempt's record is retained
// exactly as it was. Seeded from build-state via args so a relaunch resumes rather than restarts at 1.
let implAttempt = seed('impl') + 1
const feedback = []
// REFUSE BEFORE DISPATCHING, not after: a review lane already seeded at its cap gets no further round.
const reviewCapped = capReached('review', ROUNDS_SPENT.review, 0, MAX_REDISPATCH)
if (reviewCapped) return reviewCapped
// REVIEW STALL (rule 12 brake) — two CONSECUTIVE review rounds failing on the same normalized
// failedFindings line are not making progress: stop with the signature instead of spending the rounds
// that are left. mirrors the verify loop's failedGates compare below, normalizing by .trim() only.
// an empty or absent list never trips it (a reviewer that omitted the line is a missing signal, not
// evidence of a repeat), and an implement round that self-reports errors resets the signature — "two
// rounds running" counts consecutive REVIEW verdicts, not dispatches.
const reviewSig = (stage, t) => {
  const items = (String(t || '').match(/failedFindings:.*$/m) || [''])[0].replace(/failedFindings:\s*/, '').trim()
  return items ? `${stage}:${items}` : ''
}
let lastReview = null
let escalatedText = ''                 // the ESCALATING stage's own text — the review stop routes on it, never on the summary
const reviewStall = (stage, t) => {
  const sig = reviewSig(stage, t)
  if (sig && sig === lastReview) { log(`identical failedFindings two review rounds — stopping early`)
    return { stage: 'review', attempts: attempt, status: 'errors_remaining', note: 'no progress between review rounds', detail: sig, ...stallRoute(MAX_REDISPATCH - (ROUNDS_SPENT.review + attempt + 1)) } }
  lastReview = sig
  return null
}
// the cap counts TOTAL rounds (seeded + this segment). `attempt` stays the IN-SEGMENT index — it also
// drives the attempt REFS and the prompt tag, and those already advance through seed('spec')/seed('qual'),
// so adding the seeded rounds there too would double-advance the reserved numbering (§1 A2).
while (ROUNDS_SPENT.review + attempt < MAX_REDISPATCH) {
  // the feedback entries carry the reviewers' EXACT reserved terminals — never a glob or a "latest" path (§9).
  const fb = feedback.length ? `\nAddress prior review feedback, reading each named record at the exact path given: ${feedback.join(' | ')}` : ''
  if (attempt > 0) { const c = spendFix(`impl-redo#${attempt}`); if (c) return c; implAttempt++ }   // re-implements count toward the ceiling AND consume a fresh attempt number
  const impl = await runImplement(fb, implAttempt)          // ← the IMPLEMENT thunk above (single-writer OR propose-apply); tryAgent-wrapped
  if (isTransport(impl)) return { stage: `impl#${attempt + 1}`, status: 'errors_remaining', transport: true }
  const implStatus = statusOf(impl)
  if (escalates(implStatus)) { escalated = { at: `impl#${attempt + 1}`, reason: 'implement BLOCKED/NEEDS_CONTEXT — see coder progress.md' }; escalatedText = impl; break }
  if (!ok(implStatus)) { feedback.push('coder self-reported errors — see coder progress.md'); lastReview = null; attempt++; continue }  // a self-reported-failing implement never reaches review as clean
  // spec + qual routed through tryAgent (rule 11); [attempt N] tag in the PROMPT — label alone does not
  // vary the cache key, and a byte-identical re-dispatch would replay the prior round's verdict cached.
  // CONSUMER BINDING: the reviewer's input is the coder's EXACT reserved terminal for the attempt that
  // just ran — read at that path and hashed there, never resolved by listing spec-reviewer/ or by taking
  // the newest coder file. Each reviewer gets its own reserved numbered artifact (§1 file shape).
  const implTerminal = implRef(implAttempt).resultPath
  const spec = await tryAgent(`spec#${attempt + 1}`,
    bindAttempt(`[attempt ${attempt + 1}] Spec-review vs requirements; read the git diff and the coder's terminal record. If the review fails, put the one-line "failedFindings:" list (failing requirement or AC id + file per finding, sorted, "; "-separated) ABOVE the verdict. END with STATUS.`,
      attemptRef('spec-reviewer', TASK_KEY, EPOCH, seed('spec') + attempt + 1, { artifact: 'spec-review' }), [implTerminal, ...(args.contracts || []), ...rulingInputs('spec')], args.deps || []),
    // model:'sonnet' — review is a mechanical/review stage (rule 13). Reserve the inherited model for implement/design.
    { label: `spec#${attempt + 1}`, phase: 'Review', agentType: 'team-spec-reviewer', model: 'sonnet' })
  if (isTransport(spec)) return { stage: `spec#${attempt + 1}`, status: 'errors_remaining', transport: true }
  const specStatus = statusOf(spec)
  const specTerminal = attemptRef('spec-reviewer', TASK_KEY, EPOCH, seed('spec') + attempt + 1, { artifact: 'spec-review' }).resultPath
  if (escalates(specStatus)) { escalated = { at: `spec#${attempt + 1}`, reason: `spec BLOCKED/NEEDS_CONTEXT — see ${specTerminal}` }; escalatedText = spec; break }  // escalate, don't re-dispatch
  if (!ok(specStatus)) { const rs = reviewStall('spec', spec); if (rs) return rs; feedback.push(`spec failed — see ${specTerminal}`); attempt++; continue }  // spec gates quality
  const qual = await tryAgent(`qual#${attempt + 1}`,
    bindAttempt(`[attempt ${attempt + 1}] Quality-review (structure/quality/security). If the review fails, put the one-line "failedFindings:" list (failing rule + file per finding, sorted, "; "-separated) ABOVE the verdict. END with STATUS.`,
      attemptRef('reviewer', TASK_KEY, EPOCH, seed('qual') + attempt + 1, { artifact: 'review' }), [implTerminal, specTerminal, ...rulingInputs('qual')], args.deps || []),
    // model:'sonnet' — review is a mechanical/review stage (rule 13).
    { label: `qual#${attempt + 1}`, phase: 'Review', agentType: 'team-reviewer', model: 'sonnet' })
  if (isTransport(qual)) return { stage: `qual#${attempt + 1}`, status: 'errors_remaining', transport: true }
  status = statusOf(qual)
  const qualTerminal = attemptRef('reviewer', TASK_KEY, EPOCH, seed('qual') + attempt + 1, { artifact: 'review' }).resultPath
  if (escalates(status)) { escalated = { at: `qual#${attempt + 1}`, reason: `quality BLOCKED/NEEDS_CONTEXT — see ${qualTerminal}` }; escalatedText = qual; break }  // escalate, don't re-dispatch
  if (ok(status)) break
  const rq = reviewStall('qual', qual); if (rq) return rq
  feedback.push(`quality failed— see ${qualTerminal}`); attempt++
}
// A BLOCKED/NEEDS_CONTEXT escalation OR still-not-clean-at-the-cap → STOP and return the tagged stop:
// the cap-at-end tag is a kept human gate; the escalation tag is routed (SKILL.md → Triage-first).
// (No infinite churn, and an escalation never burned the budget — it broke on the first hit.)
// The orchestrator captured this run's WorkflowOutput.runId (step 4); pass it as resumeFromRunId on the
// post-gate relaunch so the already-passed stages stay cached and only the contested stage re-runs (gaps-1).
if (escalated) { log(`Review stopped at ${escalated.at} (reliability-3) — returning the route-tagged stop: ${escalated.reason}`)
  return { stage: 'review', attempts: attempt, blocked: true, escalated, feedback, status: 'blocked', detail: String(escalatedText).slice(-3000), ...routeOfText(escalatedText) } }
if (!ok(status)) return { stage: 'review', attempts: attempt, blocked: true, feedback, status: 'errors_remaining', note: `review round cap ${MAX_REDISPATCH} reached (${ROUNDS_SPENT.review} seeded from build-state + ${attempt} this segment) — not clean at the cap`, route: 'human', gate: 'round-cap' }

// ============================================================================================
// POST-IMPLEMENTATION VALIDATION LOOPS — the run's job is to arrive at its human gate either CLEAN
// or with a fully-diagnosed, ledger-recorded residue. deterministic failures (lint/type/test, failed
// deterministic AC) are the MOST machine-fixable class — they loop, bounded, before any human sees
// them. composite exit: mechanical gates green AND every blocking AC PASS AND no integrity finding.
// ordering: review-clean → FINISH (cleanup INSIDE the verified span) → VERIFY loop → VALIDATE loop →
// GRADE → the live-surface measurement lane (COMPOSE → MEASURE → DISPOSITION), which reads the running
// product rather than the code and feeds the NEXT grade instead of gating this one.
//
// CIRCUIT BREAKERS (survive relaunches): the orchestrator persists per-loop and per-AC attempt
// counts to <session>build-state.md after every round — in-memory counters die at a relaunch, and a
// relaunch must SEED both accounting units from that ledger (args interpolated into NO prompt, so
// they do not break the cache prefix):
//   per-phase ROUND caps  ← args.autonomy.roundsAlreadySpent.{review,verify,validate}, compared via
//                           capReached() BEFORE each loop and again at every round increment. Seeded
//                           at the cap ⇒ the next round is refused, never granted.
//   global DISPATCH ceiling ← args.autonomy.fixesAlreadySpent, spent via spendFix() at EVERY coder fix
//                           dispatch (impl-redo / fix-mech / fix-ac). TOTAL_FIX is read from the plan's
//                           globalFixCeiling ONLY — a spent-count arg can never raise it.
// Both live in the accounting block above the review loop. Seeding never expands a cap; a seed only
// reduces headroom. failure-signature check: the SAME normalized failedGates/failedACs line two rounds
// running → stop with the signature, don't burn remaining retries; with rounds LEFT that stop is a
// triage trigger, on the loop's final round it is cap exhaustion (SKILL.md → Triage-first).
// ============================================================================================

// FINISH — cleanup BEFORE the mechanical gates so finisher edits sit inside the verified span
// (finisher-after-gates let cleanup break a green build the gates had already blessed).
// ATTEMPT BINDING (this stage used to be told to write its verdict into progress.md — the ONE file that
// MAY NOT carry a terminal verdict, §3; adding the close obligation to it would have ordered the
// violation instead of fixing it). Bound like every other heavy stage, so the obligation arrives from
// closeTerminal and the terminal is a RESERVED write-once record. Numbered-file shape: the finisher's
// evidence is one file per attempt, and `cleanup-report` is the artifact its role file already owes a
// closed STATUS line on, so the reserved terminal IS that report — {session}finisher/cleanup-report-{n}.md.
// The unnumbered <session>finisher/cleanup-report.md survives only as a latest POINTER (§9), never cited.
// TWO CONSEQUENCES OF BINDING IT, neither visible at the line below. (1) `seed('finish')` is a RESERVATION
// KEY like impl/spec/qual/verify/validate/compose/measure/disposition: a relaunch that MEANS to re-run
// cleanup bumps `attempts.finish` so this dispatch draws a fresh number, and one that does not bump it gets
// a cached replay — fine while the prompt is byte-identical, a second record on consumed write-once bytes
// (§1 A4) the moment anything re-renders it, which MINTED (:63) cannot see across launches.
// (2) bindAttempt interpolates args.deps, so finish is now one of the ELEVEN stages on that shared channel
// (see the grade channel below): a relaunch feeding a later grade through `deps` instead of `gradeDeps`
// re-renders THIS prompt (+519 bytes measured for one selected dep, more as the set grows), missing the
// cache and replaying it onto the path seed('finish') already reserved. Through `gradeDeps` finish is
// inert and replays cached, as intended.
const finishRef = attemptRef('finisher', TASK_KEY, EPOCH, seed('finish') + 1, { artifact: 'cleanup-report' })
const finish = await tryAgent('finish',
  bindAttempt(`Strip console.* debug logs (keep error-handling console.error) and enforce comment standards on ` +
    `the files this run modified (git diff vs <session>baseline.diff). END with STATUS.`,
    finishRef, [implRef(implAttempt).resultPath, '<session>baseline.diff'], args.deps || []),
  { label: 'finish', phase: 'Finish', agentType: 'team-finisher', model: 'sonnet', effort: 'low' })
const finishGate = gate('finish', finish); if (finishGate) return finishGate

// VERIFY LOOP — finalize is a fix loop, not a one-shot gate. verifier findings are file/line/rule-
// actionable; feed them to the owning coder and re-verify, capped at MAX_VERIFY rounds. TWO classes ride one report:
//   mechanical failures → loop (coder fix → re-verify)
//   INTEGRITY findings (gamed gate / contract edit / decoration guard) → STATUS: BLOCKED → human,
//   NEVER re-dispatched to the coder that gamed them — the marker is machine-readable by contract.
// ATTEMPT BINDING: each verify round writes its OWN reserved `verifier/results-{n}.md`; the fixed
// `<session>verifier/results.md` is at most a latest POINTER and is never cited as evidence (§9). The
// round number rides in the prompt via bindAttempt, so a re-verify after a fix cannot replay cached.
const FINALIZE_PROMPT = (tag, ref, inputs) => bindAttempt(`[${tag}] Run lint/types/knip/test on the changed packages (git diff → pnpm -F filters). knip-skeptical. ` +
  `Subtract <session>baseline.diff (the pre-run dirty-tree snapshot) before attributing any hunk or failure to this run. ` +
  `GATE-GAMING GUARD: scan the git diff for NEW eslint-disable / @ts-expect-error / @ts-ignore / knip-ignore / ` +
  `.skip()ed tests / weakened-or-loosened types — a gate that passes ONLY via a new suppression is a FAILED gate, ` +
  `not a pass. Flag any edit to definition-of-done.md / requirements.md / team-plan.md (writers may not touch the contract). ` +
  `IF this run added or changed a runtime GUARD (a refusal, an assert, a fail-closed branch): break it, ` +
  `confirm its test goes RED, restore by RE-EDITING (never git checkout/restore/stash — see the dirty-tree ` +
  `note in SKILL.md), confirm GREEN. A guard whose test stays GREEN when the guard is deleted is DECORATION. ` +
  `Skip this clause entirely if the run added no runtime guard. ` +
  `ANY gaming/contract-edit/decoration finding: prefix its line "INTEGRITY:" and END with STATUS: BLOCKED — ` +
  `these are for the human, not a fix loop. Otherwise put the one-line "failedGates:" list (gate names + owning ` +
  `files) ABOVE the verdict. END with STATUS. Record every command with its rc, the suites actually executed and any ` +
  `skips: a command you did not run is a limit, never an inferred pass.`,
  ref, [...inputs, ...rulingInputs('finalize')], args.deps || [])
const MAX_VERIFY = 10
let vRound = 0, verify, lastGates = null
// seeded-at-cap refusal before the first finalize of this segment (see the accounting block above)
const verifyCapped = capReached('finalize', ROUNDS_SPENT.verify, 0, MAX_VERIFY)
if (verifyCapped) return verifyCapped
while (true) {
  const vRef = attemptRef('verifier', TASK_KEY, EPOCH, seed('verify') + vRound + 1, { artifact: 'results' })
  verify = await tryAgent(`finalize#${vRound + 1}`,
    FINALIZE_PROMPT(vRound ? `re-verify v${vRound + 1}` : 'initial', vRef, [implRef(implAttempt).resultPath]),
    { label: `finalize#${vRound + 1}`, phase: 'Finalize', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
  // transport BEFORE any verdict handling: no results.md was (re)written — a fix dispatched now fixes stale/nothing.
  if (isTransport(verify)) return { stage: 'finalize', status: 'errors_remaining', transport: true }
  // INTEGRITY BEFORE the clean break: the marker is the defense against a report that carries gaming
  // findings under a (misbehaving) terminal CLEAN — checked first so a lying CLEAN cannot pass the gate.
  // exact-token hasIntegrity, never a substring test: a bare /INTEGRITY:/ returned a clean run (rule 12 sub-note).
  if (hasIntegrity(verify)) return { stage: 'finalize', status: 'blocked', integrity: true, route: 'human', gate: 'integrity', detail: String(verify).slice(-3000) }
  const vs = statusOf(verify)
  if (ok(vs)) break
  if (escalates(vs)) return { stage: 'finalize', status: 'blocked', detail: String(verify).slice(-3000), ...routeOfText(verify) }
  const gates = (String(verify).match(/failedGates:.*$/m) || [''])[0].trim()
  if (gates && gates === lastGates) { log(`identical failure signature two verify rounds — escalating early`)
    return { stage: 'finalize', status: 'errors_remaining', note: 'no progress between fix rounds', detail: gates, ...stallRoute(MAX_VERIFY - (ROUNDS_SPENT.verify + vRound + 1)) } }
  lastGates = gates
  vRound++
  // the ROUND cap (per phase, seeded + this segment) is checked first; the DISPATCH ceiling (global,
  // seeded) is a separate charge on the next line — two units, two refusals, never one standing in for the other.
  const vCap = capReached('finalize', ROUNDS_SPENT.verify, vRound, MAX_VERIFY)
  if (vCap) return { ...vCap, detail: String(verify).slice(-3000) }
  const ceiling = spendFix(`fix-mech#${vRound}`); if (ceiling) return ceiling
  // targeted fix: verifier-cited files INTERSECTED with the lane's owned globs — never a roving fix.
  // a fix is a NEW coder dispatch → the next reserved attempt (§1 A2); it reads the verifier's EXACT
  // reserved terminal, never `verifier/results.md`, and its own failed predecessor stays on disk.
  implAttempt++
  await tryAgent(`fix-mech#${vRound}`,
    bindAttempt(`[fix v${vRound}] Fix ONLY the failures the verifier record lists that are ` +
      `attributable to your owned files (${files}). Do NOT touch the contract files or add suppressions. ` +
      `Subtract <session>baseline.diff before claiming any hunk as this run's. END with STATUS.`,
      implRef(implAttempt), [vRef.resultPath, '<session>baseline.diff', ...rulingInputs('fix-mech')], args.deps || []),
    { label: `fix-mech#${vRound}`, phase: 'Finalize', agentType: 'team-coder' })
}

// VALIDATE LOOP — grade the CONTRACT's AC, then fix-and-re-grade the deterministic FAILs via each
// AC's maps_to lane, capped at MAX_VALIDATE ROUNDS (its own per-phase cap, seeded) — the coder fix each round triggers
// is charged SEPARATELY against the global TOTAL_FIX dispatch ceiling; the two are not one budget. before ANY re-dispatch of a failing AC: re-read its
// sat.md row — if nothing in the plan produces the named passing state, the AC is UNSATISFIABLE (a
// contract defect → PD-n ruling or human), never a coder failure; looping would burn rounds against a
// gate no correct run can open. an AC failing IDENTICALLY after one fix round → same early escalate.
// NEEDS_HUMAN_EVIDENCE parks the AC (build-state: needs-human) and the loop CONTINUES on the rest —
// the run exits with the distinct 'needs_human_evidence' status, never conflated with failure.
// ATTEMPT BINDING: each round writes its OWN reserved `verifier/validation-{n}.md`. The legacy
// `<session>validation-report.md` may survive as a latest POINTER but is never decisive evidence and is
// never cited as a dependency (§9) — the per-AC verdict a grade consumes is the numbered record.
const VALIDATE_PROMPT = (tag, only, ref, inputs) => bindAttempt(`[${tag}] Read the acceptance contract${only ? ` — grade ONLY these ACs: ${only}` : ''}. ` +
  `For each blocking AC: kind=deterministic → run its verify command, record PASS/FAIL + the command, rc and evidence; ` +
  `kind=semantic → record DEFER (a separate goal-auditor grade stage owns semantic grading — do not grade it yourself); ` +
  `kind=semantic needing rendered evidence nobody can produce here (screenshot / running UI) → record NEEDS_HUMAN_EVIDENCE. ` +
  `Put the one-line "failedACs:" list (AC id + slug + its maps_to task/lane) ABOVE the verdict. ` +
  `END with STATUS (CLEAN = every graded blocking AC PASS; PARTIAL = any NEEDS_HUMAN_EVIDENCE; ` +
  `ERRORS_REMAINING = any FAIL). ` +
  `RE-MEASURE the ORCHESTRATOR's own claims too — the gate results and hazard descriptions it wrote into ` +
  `build-state.md are graded surfaces, not givens (two were wrong on 2026-08-23). Contradicting the ` +
  `orchestrator with evidence is the job, not insubordination.`,
  ref, [...inputs, ...rulingInputs('validate')], args.deps || [])
const MAX_VALIDATE = 10
let aRound = 0, validate, lastACs = null, regraded = false
const parked = new Set()    // NEEDS_HUMAN_EVIDENCE ACs accumulate across rounds — parked, never lost
// seeded-at-cap refusal before the first grade of this segment (see the accounting block above)
const validateCapped = capReached('validate', ROUNDS_SPENT.validate, 0, MAX_VALIDATE)
if (validateCapped) return validateCapped
while (true) {
  // re-derived every round: after a fix-ac the graded bytes are the NEW coder attempt's, not the old one's.
  const acInputs = [args.contract || '<session>definition-of-done.md', implRef(implAttempt).resultPath]
  const aRef = attemptRef('verifier', TASK_KEY, EPOCH, seed('validate') + aRound + (regraded ? 1 : 0) + 1, { artifact: 'validation' })
  validate = await tryAgent(`validate#${aRound + 1}`, VALIDATE_PROMPT(aRound ? `re-grade a${aRound + 1}` : 'initial', aRound ? lastACs : null, aRef, acInputs),
    { label: `validate#${aRound + 1}`, phase: 'Validate', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
  if (isTransport(validate)) return { stage: 'validate', status: 'errors_remaining', transport: true }
  // park needs-human rows every round (subset re-grades would otherwise drop round-1 parks from scope)
  for (const m of String(validate).matchAll(/^.*\bNEEDS_HUMAN_EVIDENCE\b.*$/gm)) parked.add(m[0].trim())
  let as = statusOf(validate)
  const term = String(statusLineOf(validate) || '')                // the agent's OWN terminal line — never the whole text (quoted-status vector)
  let acs = (String(validate).match(/failedACs:.*$/m) || [''])[0].replace(/failedACs:\s*/, '').trim()
  if (ok(as) || (/PARTIAL/i.test(term) && !acs)) {                 // clean, or only parked needs-human ACs left
    // rounds ≥2 graded only the failed subset — a fix can regress a previously-passing AC, so one final
    // FULL-scope grade backs the composite exit before it claims "every blocking AC PASS".
    if (aRound === 0 || regraded) break
    regraded = true
    validate = await tryAgent(`validate-full`,
      VALIDATE_PROMPT('final full-scope', null, attemptRef('verifier', TASK_KEY, EPOCH, seed('validate') + aRound + 2, { artifact: 'validation' }), acInputs),
      { label: 'validate-full', phase: 'Validate', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
    if (isTransport(validate)) return { stage: 'validate', status: 'errors_remaining', transport: true }
    for (const m of String(validate).matchAll(/^.*\bNEEDS_HUMAN_EVIDENCE\b.*$/gm)) parked.add(m[0].trim())
    const fs2 = statusOf(validate)
    if (ok(fs2) || (/PARTIAL/i.test(String(statusLineOf(validate) || '')) && !(String(validate).match(/failedACs:\s*\S/)))) break
    // the regression the full grade found becomes THIS round's verdict: it falls through to the
    // escalate / stall / cap / fix path below carrying the full-scope failedACs as the signature
    // (resetting it instead made the next fix-less re-grade trip a false stall), and the grade ref
    // above offsets by the regraded flag to skip the attempt number validate-full consumed, so no
    // reserved validation-{n} record is ever written twice.
    as = fs2
    acs = (String(validate).match(/failedACs:.*$/m) || [''])[0].replace(/failedACs:\s*/, '').trim()
  }
  if (escalates(as)) return { stage: 'validate', status: 'blocked', detail: String(validate).slice(-3000), ...routeOfText(validate) }
  if (acs && acs === lastACs) { log(`identical failedACs two rounds — sat-check then escalate`)
    return { stage: 'validate', status: 'errors_remaining', note: 'no progress — re-read each failing AC sat.md row: unsatisfiable AC is a contract defect, not a coder failure', detail: acs, ...stallRoute(MAX_VALIDATE - (ROUNDS_SPENT.validate + aRound + 1)) } }
  lastACs = acs
  aRound++
  // round cap (per phase, seeded) then dispatch ceiling (global, seeded) — separately charged, separately refused
  const aCap = capReached('validate', ROUNDS_SPENT.validate, aRound, MAX_VALIDATE)
  if (aCap) return { ...aCap, detail: String(validate).slice(-3000) }
  const acCeiling = spendFix(`fix-ac#${aRound}`); if (acCeiling) return acCeiling
  // route each FAIL to its maps_to lane; every fix re-enters the mechanical gates (a fix can break lint/tests),
  // so after fixes re-run ONE finalize pass before re-grading. sat-check FIRST (see block comment above).
  implAttempt++          // an AC fix is a NEW coder dispatch → the next reserved attempt (§1 A2)
  await tryAgent(`fix-ac#${aRound}`,
    bindAttempt(`[fix a${aRound}] For each failed AC mapped to your lane: re-read its sat.md row FIRST — if the plan ` +
      `produces no passing state, STOP and report BLOCKED (unsatisfiable, contract defect). Else make the passing state ` +
      `real in your owned files (${files}). Never edit the contract files. Subtract <session>baseline.diff before ` +
      `claiming any hunk as this run's. END with STATUS.`,
      implRef(implAttempt), [aRef.resultPath, '<session>goal-auditor/sat.md', '<session>baseline.diff', ...rulingInputs('fix-ac')], args.deps || []),
    { label: `fix-ac#${aRound}`, phase: 'Validate', agentType: 'team-coder' })
  const reverify = await tryAgent(`finalize-after-ac#${aRound}`,
    FINALIZE_PROMPT(`post-ac-fix v${aRound}`, attemptRef('verifier', TASK_KEY, EPOCH, seed('verify') + vRound + 1 + aRound, { artifact: 'results' }), [implRef(implAttempt).resultPath]),
    { label: `finalize-after-ac#${aRound}`, phase: 'Finalize', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
  if (isTransport(reverify)) return { stage: 'finalize-after-ac', status: 'errors_remaining', transport: true }
  if (hasIntegrity(reverify)) return { stage: 'finalize-after-ac', status: 'blocked', integrity: true, route: 'human', gate: 'integrity', detail: String(reverify).slice(-3000) }
  const rvGate = gate('finalize-after-ac', reverify); if (rvGate) return rvGate
}

// GRADE — semantic ACs go to team-goal-auditor, NOT team-verifier: fresh context, goal-anchored,
// disprove-own-finding (the protocol the design doc assigns; also restores the missing impl-vs-goal
// drift check — nothing else re-checks built code against prompt.md). `grade` is the one PROMPT-CARRIED
// phase — the agent file enumerates define/sat/audit; this dispatch carries the whole instruction.
// ATTEMPT BINDING + THE STALE-GRADE VECTOR. A regrade after a correction MUST NOT replay the prior
// verdict from cache (rule 6): a byte-identical completed call returns cached, so a fixed prompt would
// re-serve the OLD grade against NEW bytes and an old PASS would silently acquire new hashes. Three
// things vary per grade attempt and all three ride IN the prompt text (a label does not vary the cache
// key): the correction TAG, the reserved attempt identity, and the immutable grade-inputs snapshot the
// orchestrator captured for THIS attempt. The empty-tag refusal below is the guard, not a convention.
// A grade also REFUSES an empty selected dependency list: with none, bindAttempt step 4 tells the grader it
// consumes NO prior terminal while this prompt tells it to read the records the snapshot selects — a
// dispatch that contradicts itself. Those records are hash-bound, so they are selected at a SEAM before
// the launch that grades (execution-evidence §2 hash-bound dependencies); the grade never finds its own.
const GRADE_PROMPT = (tag, ref, gradeInputs) => {
  if (!tag || !String(tag).trim())
    throw new Error('INTEGRITY: grade dispatch without a correction/round tag — a byte-identical grade prompt REPLAYS the prior verdict from cache (rule 6), attaching a stale PASS to corrected bytes. Every regrade carries a FRESH tag AND a freshly reserved attempt.')
  if (!gradeInputs)
    throw new Error('INTEGRITY: grade dispatch without its runtime/grade-inputs-{n}.md snapshot — the grader selects evidence from that immutable snapshot, never by filename search')
  // DEDICATED GRADE CHANNEL. `args.deps` is a SINGLE SHARED CHANNEL that ELEVEN heavy stages read: impl,
  // spec, qual, finish, finalize, fix-mech, validate, fix-ac, compose, measure and disposition. COUNT IT FROM
  // THE CALL SITES, never from this sentence's memory — it said nine and meant ten: finish became a consumer
  // the day it was bound (feeding deps moves its prompt — +519 bytes measured for ONE selected dependency,
  // and it grows with the set; what matters is that the delta is never zero), and fix-ac had been one all along
  // while going unnamed here. bindAttempt interpolates the channel INTO every one of those prompts. So
  // feeding a LATER grade through args.deps changes those prompts' bytes too:
  // every one of them misses the cache (rule 6) and replays, and a replayed stage re-mints the SAME
  // attemptRef path — a second record landing on consumed write-once reserved bytes (§1 A4). attemptRef's
  // MINTED collision guard is per-EXECUTION and cannot fire across launches, so nothing catches it. This
  // channel feeds the grade WITHOUT touching what every other stage reads.
  // ABSENT (undefined/null) falls back to args.deps — every caller and every test predating this channel is
  // byte-unchanged. PRESENT-but-empty does NOT fall back: the orchestrator wired the channel and selected
  // nothing, and quietly grading against the shared list instead would swap in an unintended dependency set
  // AND silence the refusal below (bindAttempt would stop contradicting itself, so the defect goes unseen).
  // It falls through to that refusal instead — a mis-wired relaunch fails loud, exactly as an empty
  // args.deps already does for grade.
  const deps = args.gradeDeps == null ? (args.deps || []) : args.gradeDeps
  if (!Array.isArray(deps) || !deps.length)
    throw new Error('INTEGRITY: grade dispatch with an EMPTY selected dependency list — bindAttempt would tell the grader it consumes NO prior attempt terminal while this prompt tells it to read the exact records the snapshot selects: a dispatch that contradicts itself. Select each graded record as {taskId, attempt, resultPath, sha256} at the seam before this launch (execution-evidence §2, §5). A PRESENT-but-empty or non-array `args.gradeDeps` lands here BY DESIGN: the grade channel was wired and selected nothing, which is refused, never silently defaulted back onto the shared `args.deps`.')
  // the close obligation is ALSO the carrier's (bindAttempt states it for EVERY heavy dispatch), so a grade prompt
  // states it twice. DELIBERATE, do not collapse: PD-5 AC-1 maps the obligation to GRADE_PROMPT and its verify binds
  // the literal "CLOSE THE ARTIFACT ITSELF ..." to THIS region (cases.json docs.gradeArtifactStatus, mutant
  // M-grade-artifact-status-removed, the K1 requiresArtifactStatus probe). deleting it here breaks a landed contract.
  return bindAttempt(
    `[${tag}] Phase: grade (prompt-carried — a run-lane phase your agent file does not enumerate; THIS prompt is the instruction). ` +
    `FRESH CONTEXT. Read ONLY: <session>prompt.md, the acceptance contract, the evidence snapshot ${gradeInputs}, and for each ` +
    `blocking semantic AC the exact attempt record that snapshot selects for it. Do NOT read plan/design/discovery history, and ` +
    `do NOT choose evidence by directory listing, newest timestamp, highest filename or a "latest" pointer. ` +
    `Independently check the snapshot against the selected artifacts and the retained affected history it names — including ` +
    `failed, incomplete and reserved attempts — and hash the snapshot, each selected artifact and every decisive historical ` +
    `input you relied on. The snapshot indexes evidence; it is not itself authority. ` +
    `Grade each blocking semantic AC against its rubric AND against the original goal in prompt.md — does the ` +
    `built work faithfully serve what was asked, not merely what the plan did? Disprove each FAIL before ` +
    `reporting it. Naming drift (behavior green, tag renamed) is a flag, not a FAIL. An earlier PASS is not re-usable for ` +
    `changed bytes: re-grade it or record it explicitly stale. Put the one-line "failedACs:" list ABOVE the verdict, ` +
    `then CLOSE THE ARTIFACT ITSELF with its own terminal line: the last non-empty line of ` +
    `${ref.resultPath} is literally STATUS: {CLEAN | PARTIAL | BLOCKED | NEEDS_CONTEXT | ERRORS_REMAINING: n}, ` +
    `byte-identical to the STATUS line you return and with nothing after it (execution-evidence §4 terminal ` +
    `status, §10 template). Returning the line is not writing it: a verdict absent from its own record is not ` +
    `recorded. END your reply with that same STATUS line.`,
    ref, [gradeInputs, args.contract || '<session>definition-of-done.md'], deps)
}
const gradeAttempt = seed('grade') + 1
const gradeSem = await tryAgent('grade',
  GRADE_PROMPT(args.gradeTag || 'initial', attemptRef('goal-auditor', 'grade', EPOCH, gradeAttempt, { artifact: 'final-grade' }),
    `<session>runtime/grade-inputs-${gradeAttempt}.md`),
  { label: 'grade', phase: 'Grade', agentType: 'team-goal-auditor' })   // keeps inherited model — judgment work (rule 13)
if (isTransport(gradeSem)) return { stage: 'grade', status: 'errors_remaining', transport: true }
const gradeGate = gate('grade', gradeSem); if (gradeGate) return gradeGate

// ============================================================================================
// LIVE-SURFACE MEASUREMENT — COMPOSE → MEASURE → DISPOSITION. every stage above verifies by READING
// code and running unit tests; none of them ever exercises the RUNNING product, and VALIDATE_PROMPT's
// NEEDS_HUMAN_EVIDENCE clause punts whatever needs one. that hatch is mostly false now — Playwright MCP
// (projects into team-measurer on the WORKFLOW lane, round-trip measured 2026-09-12; NOT on the native
// lane), project CLIs and MCP servers are exercisable surfaces. a LIVE spyglass is NOT one: it is a paid
// human-gated call, so it never runs here. so this lane drives
// what was actually built and RECORDS what came back.
//
// MEASUREMENT, NOT VERIFICATION — the distinction every prompt below rests on. you cannot prompt an agent
// out of sycophancy: "did checkout work?" returns yes regardless. that is only a problem because an
// OBSERVER was asked for a VERDICT, so never ask one. a measurer exercises a surface and records INPUT AND
// OUTPUT VERBATIM — the status and body, the page text, the row id, the stdout and rc, the capture path —
// and emits no PASS, no FAIL, no "works correctly". judgment happens later, in a DIFFERENT agent reading
// the record. already house doctrine: execution-evidence §2 gives the producer the recording duty and an
// INDEPENDENT reviewer the acceptance decision; §6 keeps raw separate from normalized and forbids
// reporting only the normalized form.
//
// FEED, NOT GATE. no journey's observation is ever handed to gate(): a flaky browser degrades a grade, it
// never holds a good run hostage. the only stops this lane returns are about whether the MEASUREMENT
// RECORD SET was produced — a compose that failed, a measurer reporting an INTEGRITY condition — never
// about what a journey observed. everything short of that lands in `concerns` and in the disposition's
// inputs, where it is weighed instead of enforced.
//
// WHY IT SITS AFTER THE GRADE. hash-bound dependencies are selected at a SEAM BEFORE the launch that
// consumes them (execution-evidence §2), so nothing written in THIS segment can reach THIS segment's grade
// deps or its grade-inputs snapshot — the grade never finds its own. measurement therefore feeds the NEXT
// grade attempt (the orchestrator selects these records into runtime/grade-inputs-{n}.md and relaunches
// with a fresh tag), and running it after the grade is what lets the disposition read the grade record too.
//
// AND THEREFORE — AUTHOR THIS LANE AS ITS OWN SEGMENT. grade must be the LAST agent() call in whatever
// script it sits in. rule 6's resume cache is the longest unchanged PREFIX, and step 6 REQUIRES the
// re-grade prompt to change (fresh tag, fresh identity, fresh snapshot), so the prefix breaks AT grade and
// every call after it re-runs however byte-identical its own prompt is. trail this lane behind grade in one
// script and a re-grade replays compose/measure/disposition: it re-drives live surfaces, and because the
// relaunch bumps only attempts.grade it re-mints their already-consumed reserved paths onto write-once
// bytes that MINTED (per-execution, :63) cannot see across launches. args.gradeDeps closes the shared-
// CHANNEL hazard; ONLY the segment split closes the CACHE one. bumping every lane seed instead removes the
// collision by genuinely re-measuring — a decision, never a default. recipe: SKILL.md Procedure step 6.
// ============================================================================================

// COMPOSE (one agent, serial) — <session>verification-approach.md was authored BEFORE the build (create
// Step 4c-b: exercisable surfaces / one suggestion each / which features need their own agent / the human
// residual), so it cannot know what exists: it carries SUGGESTIONS. this stage composes the REAL journeys
// from what is on disk and RECORDS THE DELTA against them. a suggestion that no longer fits what was built
// is a recorded deviation, never a silent drop and never a failure — stale scaffolding is the EXPECTED
// case, and a compose that says so is doing its job. the approach file is deliberately NOT a declared
// input: a declared input that is missing is STATUS: BLOCKED (bindAttempt step 3), and this one is allowed
// to be absent, so the prompt reads it conditionally and records its absence as a starting condition.
// agentType: the composer must name each journey's MECHANISM, negative control and correlation handle, and
// that vocabulary is team-measurer's contract; it reads and plans, and the role holds no Edit tool.
// its reserved terminal IS the journey manifest — <session>measure/verification-plan.md may survive as a
// latest POINTER, but every measurer below reads the numbered record at its exact path, never the pointer (§9).
const composeRef = attemptRef('measurer', 'compose', EPOCH, seed('compose') + 1, { artifact: 'verification-plan' })
const compose = await tryAgent('compose',
  bindAttempt(`Phase: compose (prompt-carried — a run-lane phase your agent file does not enumerate; THIS prompt is the instruction). ` +
    `Compose the journeys that can actually be exercised against WHAT WAS BUILT: read the built tree, not the plan's intentions. ` +
    `Read <session>verification-approach.md IF IT EXISTS — create-side scaffolding written before the build, so every suggestion in it ` +
    `is a hypothesis about a surface that may not exist, may have moved, or may now be reachable a different way; its absence is a ` +
    `recorded starting condition, never a reason to stop. ` +
    `One row per journey, each carrying: ACTOR (who drives it) / MECHANISM (the exact tool and address — the spyglass skill, Playwright ` +
    `MCP, curl + URL, the CLI invocation, the query) / ORACLE (the observable to be recorded, NOT a pass condition) / its CORRELATION ` +
    `HANDLE (request id, order id, or a timestamp window + clock source) / its NEGATIVE CONTROL (the state in which the journey MUST NOT ` +
    `succeed, and how to force that state) / its PROD-GATING side, declared explicitly — deploys, migrations, deletes, kubectl mutations, ` +
    `scaling and paid live calls (a live spyglass included) NEVER run inside this workflow and return as a human-gated checklist, and a ` +
    `journey whose side you cannot determine is gated, not autonomous. ` +
    `Prioritise the ACs the validate loop PARKED as NEEDS_HUMAN_EVIDENCE: a parked row a composable journey can now exercise is the ` +
    `highest-value row you can write. ` +
    `Then record the DELTA against the approach file as its own section — superseded, dropped as not-built, added because it exists now, ` +
    `mechanism changed — one line each with its reason. Deviation is the OUTPUT of this stage, not a failure of it. ` +
    `Give every journey a KEY matching [A-Za-z0-9][A-Za-z0-9._-]* : it becomes that measurement's reserved path segment. ` +
    `Put the one-line "journeys:" list ABOVE the verdict — "; "-separated, sorted, each entry key=autonomous or key=prod-gated, and ` +
    `nothing else on that line: it is what dispatches the fan-out, and anything not spelled exactly autonomous is treated as gated. ` +
    `You grade nothing and you conclude nothing here. END with STATUS (CLEAN = a manifest composed against the built tree with its delta ` +
    `recorded; it says nothing about whether the product works).`,
    composeRef, [args.contract || '<session>definition-of-done.md', '<session>team-plan.md', '<session>baseline.diff'], args.deps || []),
  { label: 'compose', phase: 'Compose', agentType: 'team-measurer' })
if (isTransport(compose)) return { stage: 'compose', status: 'errors_remaining', transport: true }
const composeGate = gate('compose', compose); if (composeGate) return composeGate

// the fan-out is driven by compose's own one-line list, parsed exactly like failedGates/failedACs: a
// workflow has no fs (rule 7), so the script CANNOT read the manifest it just had written, and the
// alternative — deferring the fan-out to a relaunch that passes the rows in args — would point the
// measurers at a manifest composed by a DIFFERENT attempt (§1 A2). the rows and the record they were read
// from stay together this way, and a resume replays the cached compose so the same rows re-derive.
// FAIL CLOSED on the prod-gating side (FRAMEWORK, non-negotiable): only an entry spelled exactly
// `autonomous` is dispatched. undeclared is not "safe", it is undeclared, and it goes to the human-gated
// checklist exactly like a declared-gated journey — never run here, and never silently dropped either.
const journeyLine = (String(compose).match(/^journeys:.*$/m) || [''])[0].replace(/journeys:\s*/, '').trim()
const JOURNEYS = journeyLine.split(';').map(s => s.trim()).filter(Boolean).map(s => {
  const [key, side] = s.split('=').map(x => String(x || '').trim())
  return { key, autonomous: side === 'autonomous' }
}).filter(j => j.key)        // an unsafe key is REFUSED by attemptRef, the one authority on a path segment — never re-tested here
if (!JOURNEYS.length) concerns.push({ stage: 'measure', line: 'compose recorded no journeys line — nothing was exercised against the running product' })
const gatedJourneys = JOURNEYS.filter(j => !j.autonomous)
if (gatedJourneys.length) { const gatedKeys = gatedJourneys.map(j => j.key).join(',')
  log(`prod-gated or undeclared journeys NOT exercised in-workflow: ${gatedKeys} — they return as human-gated checklist items carrying their steps, the expected observation and the capture to bring back`)
  concerns.push({ stage: 'measure', line: `human-gated checklist (not run here): ${gatedKeys}` }) }

// MEASURE (fan-out, one agent per journey). THE STATUS-LINE RULE IS THE LOAD-BEARING CLAUSE and it is
// stated in the prompt itself: a measurer's terminal line reports whether the MEASUREMENT completed, never
// whether the product works. a measurer that writes CLEAN because "the feature worked" has misunderstood
// its job and reintroduced the verdict this lane exists to remove. the prompt asks for no verdict at all,
// so there is nothing for sycophancy to answer. bindAttempt already owes the raw/normalized separation and
// the terminal-line obligation; this prompt adds only what is measurement-specific.
const MEASURE_PROMPT = (tag, j, ref) => bindAttempt(`[${tag}] Measure ONE journey: ${j.key}. ` +
  `Read its row in the journey manifest named below and exercise EXACTLY that journey — its actor, its mechanism, its address. Do not ` +
  `substitute a different surface, and do not read the source to decide what "should" happen: you are measuring the running product. ` +
  `RECORD INPUT AND OUTPUT VERBATIM — the request sent and the response received, the page text, the row, the stdout, stderr and rc — ` +
  `with every observation referenced BY PATH to the capture holding the bytes. A narrated observation with no artifact behind it is not ` +
  `a measurement; a reader must be able to open the bytes and disagree with you. ` +
  `You are NOT asked whether it worked, so do not answer that: no PASS, no FAIL, no "works correctly", no "as expected". An opinion you ` +
  `cannot resist goes in a labelled Observation notes section — never in the record, never in the STATUS line. ` +
  `NEGATIVE CONTROL, non-negotiable: also exercise this journey in the state where it MUST NOT succeed (the manifest names it — bad ` +
  `credentials, the flag off, a row id that does not exist, the dependency stopped) and record that it did not, with the same capture ` +
  `discipline as the positive exercise. A journey that passes against a dead server is indistinguishable from one that works; a journey ` +
  `measured without its negative control is an anecdote, and you say so under your limits. ` +
  `CORRELATION HANDLE, non-negotiable: put the manifest's handle (request id / order id / timestamp window + clock source) IN the request ` +
  `and beside every capture it belongs to, so an independent observation of this same transaction by another agent can be JOINED to ` +
  `yours instead of standing as a second anecdote nobody can reconcile. ` +
  `PROD-GATING (FRAMEWORK, non-negotiable): deploys, migrations, deletes, kubectl mutations, scaling and paid live calls — a live ` +
  `spyglass included — NEVER run here. If this journey turns out to need one, STOP measuring it and return it as a human-gated checklist ` +
  `item: the exact steps, the expected observation, and the capture the human should bring back. Recording it un-run is the correct ` +
  `outcome, not a failure. ` +
  `END with a STATUS line that is a statement about YOUR MEASUREMENT and never about the product: CLEAN = I exercised the surface and ` +
  `recorded what I observed (still CLEAN when what I observed is a broken product); PARTIAL = I measured some of the assigned surfaces ` +
  `and recorded which I did not; ERRORS_REMAINING: n = I could not complete the measurement on n surfaces (unreachable, tool failed); ` +
  `BLOCKED = the environment or a precondition was not there. A measurer that writes CLEAN because "the feature worked" has ` +
  `misunderstood its job and reintroduced the verdict.`,
  ref, [composeRef.resultPath], args.deps || [])
// a measurer is not a coder and fixes nothing, so a measurement round NEVER calls spendFix(): charging it
// would spend the ceiling mechanical repair depends on. its own per-phase round cap (the accounting
// block's fourth key) is the only bound, and ONE round is ONE full fan-out, not one per journey — slices
// are bounded by auditEmpty/retryMissing/coverage like every other fan-out. no stall brake: the cap is
// small and the lane is feed-only, so a journey that never completes costs the run a recorded gap, nothing more.
const MAX_MEASURE = 3
let mRound = 0, pending = JOURNEYS.filter(j => j.autonomous)
const measurements = []
const mRef = (j, n) => attemptRef('measurer', j.key, EPOCH, n)    // attemptRef REFUSES an unsafe journey key rather than normalize it onto another attempt's bytes
// per-journey MONOTONIC attempt allocation (§1 A2), seeded from build-state and NEVER derived from the
// round index: a round index re-issues the number a retry already consumed, which is two dispatches
// writing one immutable record. every dispatch takes the NEXT number; an abandoned number stays consumed.
const mSpent = new Map()
const mNextRef = (j) => { const used = (mSpent.get(j.key) || 0) + 1; mSpent.set(j.key, used); return mRef(j, seed(`measure-${j.key}`) + used) }
while (pending.length) {
  // the cap REFUSES the next round exactly as it does in every other loop; only the consequence differs —
  // an unmeasured journey is recorded incompleteness for the disposition to weigh, not a run-halting stop.
  const mCap = capReached('measure', ROUNDS_SPENT.measure, mRound, MAX_MEASURE)
  if (mCap) { log(`${mCap.note} — ${pending.length} journey(s) left unmeasured`)
    concerns.push({ stage: 'measure', line: `unmeasured at the measurement cap: ${pending.map(j => j.key).join(',')}` }); break }
  const mTag = mRound ? `re-measure m${mRound + 1}` : 'initial'
  const items = pending.map(j => ({ name: j.key, journey: j, ref: mNextRef(j) }))
  let out = await parallel(items.map(it => () => tryAgent(`measure:${it.name}`,
    MEASURE_PROMPT(mTag, it.journey, it.ref),
    // NO model override: the role's frontmatter already chose (rule 13), and driving a live surface and
    // deciding what is worth capturing is judgment work, not a mechanical pass.
    { label: `measure:${it.name}`, phase: 'Measure', agentType: 'team-measurer' })))
  out = await auditEmpty(items.map(it => ({ name: it.name, artifact: `${it.ref.root}progress.md`, auditArtifact: `<session>verifier/audit-measure-${it.name}-m${mRound + 1}.md` })), out, `measure-m${mRound + 1}`)
  if (!out) { concerns.push({ stage: 'measure', line: `empty-result audit coverage gap in measurement round ${mRound + 1}` }); break }
  // a retry is a GENUINE RERUN, so it is a NEWLY reserved attempt (§1 A2/A5) — never the dead attempt's
  // identity re-sent, which would land a second record on immutable reserved bytes. only the MISSING slice
  // draws a number, and that slice's record pointer moves to it: the dead attempt's record stays on disk,
  // but what the disposition is told to read is the attempt that actually produced text.
  const retryItems = items.map((it, i) => {
    const retryRef = out[i] != null ? null : mNextRef(it.journey)
    if (retryRef) it.ref = retryRef
    return { name: it.name, prompt: retryRef ? MEASURE_PROMPT(`retry m${mRound + 1}`, it.journey, retryRef) : null,
      opts: { phase: 'Measure', agentType: 'team-measurer' }, retryPermit: (args.retryPermits || {})[`measure:${it.name}`] }
  })
  out = await retryMissing(retryItems, out, `measure-gap-m${mRound + 1}`)
  if (!out) { concerns.push({ stage: 'measure', line: `measurement retry HELD — no/held permit or a user skip; the orchestrator reconciles against journal.jsonl` }); break }
  const mGap = coverage(out, items.length)
  if (mGap) { log(`measurement coverage gap after retry: ${JSON.stringify(mGap)} — recorded, NOT read as measured`)
    concerns.push({ stage: 'measure', line: `measurement coverage gap: ${JSON.stringify(mGap)}` }); break }
  // an INTEGRITY condition is never softened, here or anywhere: it is not a product observation, it is the
  // reserved-terminal/collision class bindAttempt warns about, and it is the one thing this lane stops on.
  const mInteg = out.findIndex(t => hasIntegrity(t))
  if (mInteg >= 0) return { stage: 'measure', status: 'blocked', ...humanRoute('integrity'), detail: String(out[mInteg]).slice(-3000) }
  // classify on the MEASUREMENT, never on the observation: CLEAN means the measurement completed, and it
  // means that equally against a broken product. only an INCOMPLETE measurement re-dispatches; a BLOCKED
  // one never does — a missing precondition is not fixed by running it again (rule 12). a transport-
  // synthesized or reconstructed slice is not the producer's terminal (rule 11, §7), so it is recorded but
  // never cited downstream as the record to read and hash.
  items.forEach((it, i) => measurements.push({ key: it.name, path: it.ref.resultPath, status: statusOf(out[i]),
    cited: !isTransport(out[i]) && !isReconstruction(out[i]) }))
  const stuck = items.filter((it, i) => escalates(statusOf(out[i])))
  if (stuck.length) concerns.push({ stage: 'measure', line: `measurement BLOCKED (environment/precondition absent, not re-dispatched): ${stuck.map(it => it.key).join(',')}` })
  pending = items.filter((it, i) => !ok(statusOf(out[i])) && !escalates(statusOf(out[i]))).map(it => it.journey)
  mRound++
}

// DISPOSITION (one agent, serial, FRESH CONTEXT) — the run's account of ITSELF. the grade answers "does
// each blocking semantic AC hold"; this answers "what did the run actually achieve, what is still unmet,
// and WHAT SHOULD HAPPEN NEXT". prompt-carried phase, same as grade: team-goal-auditor's file enumerates
// define/sat/audit and carries neither, so THIS prompt is the whole instruction.
// it reads measurement records as EVIDENCE, not as verdicts. a measurer emits no pass/fail by construction
// and its CLEAN says the measurement completed — reading that CLEAN as a pass would reintroduce, one
// reader downstream, exactly the verdict the fan-out refused to ask for. <session>disposition.md may
// survive as a latest POINTER; the numbered record below is the decisive one (§9).
// the gate is on whether the disposition was PRODUCED. its recommendation is for the orchestrator and the
// human — never a branch this script takes, or the lane would hard-gate the run through the back door.
const dispoRef = attemptRef('goal-auditor', 'disposition', EPOCH, seed('disposition') + 1, { artifact: 'disposition' })
const disposition = await tryAgent('disposition',
  bindAttempt(`[${args.dispositionTag || 'initial'}] Phase: disposition (prompt-carried — a run-lane phase your agent file does not enumerate; THIS prompt is the instruction). ` +
    `FRESH CONTEXT. You are not re-grading and you are not re-measuring. Answer three questions from the records named below, citing for ` +
    `every claim the exact record path and the SHA-256 you observed there: ` +
    `(1) WHAT THIS RUN ACTUALLY ACHIEVED, measured against the original ask in <session>prompt.md — not against what the plan intended; ` +
    `(2) WHICH ACCEPTANCE CRITERIA ARE UNMET, and for each the EXACT record that shows it — a grade record, a verifier record, a ` +
    `measurement record, or "no record exists", which is itself the finding; ` +
    `(3) WHAT TO DO NEXT — for every open item exactly one of: continue (the run may proceed as planned), re-dispatch a named lane (say ` +
    `which, and what it must make true), re-grade on the measurement (where a record here would CHANGE a graded verdict: name which records ` +
    `bear on which AC, then recommend RESERVING the next grade attempt and its grade-inputs snapshot, selecting those records into it, and ` +
    `relaunching to re-grade against them — the grade you are reading could not see them, its inputs were bound before they existed, and the ` +
    `re-grade re-runs only because its prompt CHANGES with that fresh tag, reserved identity and snapshot path: a byte-identical call replays ` +
    `the cached verdict, which is how a stale PASS survives a correction), escalate to the human (say what decision is needed and what ` +
    `evidence to bring), or done. ` +
    `A measurement record is EVIDENCE, not a verdict: by construction it carries no PASS/FAIL, and its STATUS: CLEAN means the ` +
    `MEASUREMENT completed — a measurement that ran cleanly against a broken product is CLEAN. Read the recorded input and output and ` +
    `conclude yourself; never read a measurer's CLEAN as a pass, and never let a summary stand in for the raw capture it claims to describe. ` +
    `Check each journey's NEGATIVE CONTROL before you rely on its positive observation: one recorded without a negative control is an ` +
    `anecdote, and one whose negative control ALSO succeeded measured nothing. Join observations of one transaction by their CORRELATION ` +
    `HANDLE before calling two records agreement or contradiction. ` +
    `Journeys returned as human-gated checklist items are NOT failures and are never graded as unmet — carry them onto the checklist with ` +
    `their steps and the capture the human should bring back. A parked NEEDS_HUMAN_EVIDENCE AC a measurement now covers: say so, name the ` +
    `record, and recommend the regrade that would consume it. Where a measurement is MISSING or incomplete, say so and say what it would ` +
    `take — an absent measurement is never a pass and never a fail. ` +
    `END with STATUS — about whether the DISPOSITION was produced, never about the product: CLEAN = every open item has an evidenced next ` +
    `action; PARTIAL = an item you could not disposition, named with what is missing; BLOCKED = a record you were told to read is absent ` +
    `or unreadable.`,
    dispoRef, ['<session>prompt.md', args.contract || '<session>definition-of-done.md', '<session>team-plan.md', '<session>build-state.md',
      composeRef.resultPath, attemptRef('goal-auditor', 'grade', EPOCH, gradeAttempt, { artifact: 'final-grade' }).resultPath,
      ...measurements.filter(m => m.cited).map(m => m.path)], args.deps || []),
  { label: 'disposition', phase: 'Disposition', agentType: 'team-goal-auditor' })   // keeps inherited model — judgment work (rule 13)
if (isTransport(disposition)) return { stage: 'disposition', status: 'errors_remaining', transport: true }
const dispoGate = gate('disposition', disposition); if (dispoGate) return dispoGate

// composite exit reached: mechanical gates green + every graded blocking AC PASS + no integrity flag.
// parked needs-human ACs exit with their own DISTINCT status — never conflated with failure. on
// evidence supplied: write the evidence path into the AC row, RESERVE the next grade attempt and its
// grade-inputs snapshot, then relaunch resumeFromRunId with the SAME args plus the new
// `attempts.grade` / `gradeTag` / `gradeDeps` selection — `gradeDeps`, NEVER `deps`: args.deps is the one
// SHARED channel the other ELEVEN heavy stages read (impl, spec, qual, finish, finalize, fix-mech, validate,
// fix-ac, compose, measure, disposition — finish among them since it was bound), so feeding the grade
// through it re-renders their prompts, misses the cache on all of them (rule 6) and replays them onto their
// already-consumed reserved attempt paths — a second record on write-once bytes, which attemptRef's
// per-execution guard cannot see across launches. the re-grade re-runs because its prompt CHANGES (fresh
// tag, fresh reserved identity, fresh snapshot path), not because of the resume alone: a byte-identical
// completed call replays cached, and that is exactly how a stale PASS survives a correction.
// WHICH SEEDS TO BUMP, stated because bumping only `attempts.grade` is the documented shape and every other
// lane is silently left to replay: a lane you mean to RE-RUN needs its OWN seed bumped — `attempts.impl` /
// `.spec` / `.qual` / `.finish` / `.verify` / `.validate` / `.compose` / `.measure-{journey}` /
// `.disposition`. `.finish` is the one an existing relaunch recipe never named, because finish only became a
// reserved lane when it was bound. Left unbumped a lane replays its cached verdict, which is CORRECT for a
// lane that did not change and a re-mint onto consumed bytes for any lane whose prompt moved.
if (parked.size) return { stage: 'validate', status: 'needs_human_evidence', parked: [...parked], ...humanRoute('needs-human-evidence') }

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
// TAKING THIS BLOCK ALONE: bring the closeArtifact const with it — declared up in the disk-audit block,
// interpolated at the end of this dispatch, and a ReferenceError if you copy one without the other.
const pre = await tryAgent('preflight',
  `PRE-SPEND PRECONDITIONS. Run each assertion EXACTLY as written and record the command, raw output and OBSERVED rc:\n` +
  PRECONDITIONS.map(p => `- ${p.name}: \`${p.cmd}\` — expect ${p.expect}`).join('\n') + `\n` +
  `Do NOT repair, retry or work around a failure — measure it and report. Write <session>verifier/preconditions.md ` +
  `(one row per assertion: command / output / rc / PASS-FAIL); END with a STATUS line — CLEAN only if EVERY assertion passed. ` +
  closeArtifact('<session>verifier/preconditions.md'),
  { label: 'preflight', phase: 'Preflight', agentType: 'team-verifier', model: 'sonnet', effort: 'low' })
const preStatus = statusOf(pre)
if (!ok(preStatus)) { log('Preconditions NOT all green — refusing to reach the paid stage. See verifier/preconditions.md.')
  return { stage: 'preflight', status: preStatus === 'blocked' ? 'blocked' : 'errors_remaining', note: 'unmet precondition — do not spend', ...(preStatus === 'blocked' ? humanRoute('paid') : {}) } }

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
  return { stage: 'calibrate', status: 'blocked', note: 'calibration itself spends — human-gated like any paid action (prod-gating)', ...humanRoute('paid') }
}
// TAKING THIS BLOCK ALONE: same carry as the preflight above — the closeArtifact const is declared in the
// disk-audit block, interpolated at the end of this dispatch, and a ReferenceError without it.
const calib = await tryAgent('calibrate',
  `CALIBRATION for the one-shot paid stage that follows. Exercise the SAME composition end-to-end on a ` +
  `throwaway target, capped at <budget>. Report, with measured evidence: the real cost field the budget rule ` +
  `reads (assert it is NOT null — a null under a fail-closed rule charges the full ceiling); that every evidence ` +
  `artifact the graded run's criteria read is actually WRITTEN and survives teardown; and the real vendor ` +
  `output SHAPE the parsing/gating legs assume. Also record the plan's open fog rows (prompt shape, budget split) ` +
  `as MEASUREMENTS. Fix what you find here, with landed tests, at calibration cost — not inside the paid dispatch. ` +
  `Write <session>coder-<name>/calibration.md; END with a STATUS line. ` +
  closeArtifact('<session>coder-<name>/calibration.md'),
  { label: 'calibrate', phase: 'Calibrate', agentType: 'team-coder' })   // NO model override (rule 13)
const calibStatus = statusOf(calib)
if (!ok(calibStatus)) { log('Calibration not CLEAN — REFUSING to fire the one-shot paid stage on uncalibrated inputs.')
  return { stage: 'calibrate', status: calibStatus === 'blocked' ? 'blocked' : 'errors_remaining', ...(calibStatus === 'blocked' ? humanRoute('paid') : {}),
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
