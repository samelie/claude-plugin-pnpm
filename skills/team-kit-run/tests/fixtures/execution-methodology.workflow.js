// SYNTHETIC Workflow fixture — execution-methodology, scenario C6 (projection-defect).
//
// SYNTHETIC. Nothing here was ever dispatched. Every task id, owner, glob, prompt and sha256 is
// fabricated to match `execution-methodology.plan.md`. THIS FIXTURE CLAIMS NOTHING ABOUT LIVE CLAUDE
// WORKFLOW RUNTIME BEHAVIOR — it is a file with a valid workflow shape whose PROJECTIONS block is
// consumed as data by `execution-methodology.test.mjs` and by the independent spec review.
//
// It is INERT by default: the dispatch path below is behind an explicit args opt-in, so validating,
// reading or accidentally running this file dispatches nothing.
//
// DELIBERATELY NOT INLINED: a real authored script inlines the canonical helpers from
// `references/stage-templates.js` at author time (rule 7, no imports). This fixture does NOT copy
// attemptRef / bindAttempt / auditEmpty / retryMissing / spent / capReached / spendFix, because a
// copied helper body sitting in a test fixture is exactly the counterfeit the accompanying tests
// exist to exclude. Those helpers are EXECUTED from canonical source by the test; here they are
// only referenced by name. `tryAgent` and `coverage` below are minimal SHAPE STUBS for the inert
// dispatch path, clearly labelled, and are asserted against by nothing.

export const meta = {
  name: 'fixture-execution-methodology',
  description: 'SYNTHETIC C6 projection fixture — inert by default; data for execution-methodology.test.mjs',
  phases: [{ title: 'Implement' }, { title: 'Validate' }, { title: 'Grade' }],
}

const SESSION = args.session
if (!SESSION) throw new Error('args missing: `session` undefined — re-pass the SAME args on resumeFromRunId (rule 6 resume-args contract)')
const EPOCH = args.epoch
if (!EPOCH) throw new Error('args missing: `epoch` undefined — orchestrator-supplied and persisted in build-state.md, never wall-clock or random (rule 7)')

// <<< PROJECTIONS BEGIN — this whole block is sliced out and evaluated as pure data by
// execution-methodology.test.mjs. It reads only SESSION and EPOCH; nothing in it touches agent(),
// parallel(), args or any workflow primitive.
// SYNTHETIC selected dependency hashes, mirroring execution-methodology.plan.md `result_sha256`.
const SHA_IMPL = '11111111111111111111111111111111111111111111111111111111111111a1'
const SHA_VERIFY = '22222222222222222222222222222222222222222222222222222222222222a2'

const P_IMPL = `${SESSION}coder-alpha/attempts/X-1-impl/1/result.md`
const P_VERIFY = `${SESSION}verifier/mech-1.md`

const STAGE_IMPL = {
  id: 'X-1-impl', agent_type: 'team-coder', phase: 'Implement', owner: 'coder-alpha', attempt: 1,
  shape: { epochInPath: false }, batch: 1, files_owned: ['fixture/src/alpha/**'],
  prompt: 'SYNTHETIC implement stage', inputs: [`${SESSION}design.md`], dependencies: [],
}
const STAGE_VERIFY = {
  id: 'X-2-verify', agent_type: 'team-verifier', phase: 'Validate', owner: 'verifier', attempt: 1,
  shape: { artifact: 'mech' }, batch: 2, files_owned: [],
  prompt: 'SYNTHETIC mechanical verification stage — commands, rc, suites, skips',
  inputs: [], dependencies: [{ taskId: 'X-1-impl', attempt: 1, resultPath: P_IMPL, sha256: SHA_IMPL }],
}
const STAGE_GRADE = {
  id: 'X-3-grade', agent_type: 'team-goal-auditor', phase: 'Grade', owner: 'goal-auditor', attempt: 1,
  shape: { artifact: 'grade' }, batch: 3, files_owned: [],
  prompt: 'SYNTHETIC independent semantic grade stage — fresh grader, own record',
  inputs: [], dependencies: [
    { taskId: 'X-1-impl', attempt: 1, resultPath: P_IMPL, sha256: SHA_IMPL },
    { taskId: 'X-2-verify', attempt: 1, resultPath: P_VERIFY, sha256: SHA_VERIFY },
  ],
}
const STAGE_LIVE = {
  id: 'X-4-live', agent_type: 'team-coder', phase: 'Implement', owner: 'live-worker', attempt: 1,
  shape: { epochInPath: false }, batch: 1, files_owned: ['fixture/src/live/**'],
  prompt: 'SYNTHETIC live stage — HITL in the plan, never autonomous',
  inputs: [], dependencies: [{ taskId: 'X-1-impl', attempt: 1, resultPath: P_IMPL, sha256: SHA_IMPL }],
}
const clone = (s, patch) => ({ ...s, ...patch })

const PROJECTIONS = {
  corrected: {
    role: 'control',
    note: 'the faithful projection of execution-methodology.plan.md',
    stages: [STAGE_IMPL, STAGE_VERIFY, STAGE_GRADE],
    excluded: [{ id: 'X-4-live', why: 'type: HITL — parked on the human checklist' }],
  },
  missingGradeDependency: {
    role: 'defect',
    inverts: 'O5 — the grade stage loses its X-2-verify dependency edge, so the grader is bound with no dependency reference at all and would grade without the mechanical evidence it exists to weigh',
    stages: [STAGE_IMPL, STAGE_VERIFY, clone(STAGE_GRADE, { dependencies: [] })],
    excluded: [{ id: 'X-4-live', why: 'type: HITL — parked on the human checklist' }],
  },
  semanticGradeOnVerifier: {
    role: 'defect',
    inverts: 'O4 + O6 — the blocking semantic AC is graded by team-verifier. This is the recorded historical failure: a semantic grader assigned to the verifier role initially failed.',
    stages: [STAGE_IMPL, STAGE_VERIFY, clone(STAGE_GRADE, { agent_type: 'team-verifier' })],
    excluded: [{ id: 'X-4-live', why: 'type: HITL — parked on the human checklist' }],
  },
  hitlIncluded: {
    role: 'defect',
    inverts: 'O3 — the HITL task is projected as an autonomous stage instead of being excluded onto the human checklist',
    stages: [STAGE_IMPL, STAGE_VERIFY, STAGE_GRADE, STAGE_LIVE],
    excluded: [],
  },
  overlappingOwnership: {
    role: 'defect',
    inverts: 'O7 — two same-batch source writers are handed overlapping files_owned globs, the one thing rule 14 exists to stop',
    stages: [STAGE_IMPL, clone(STAGE_VERIFY, { batch: 1, files_owned: ['fixture/src/alpha/one.ts'] }), STAGE_GRADE],
    excluded: [{ id: 'X-4-live', why: 'type: HITL — parked on the human checklist' }],
  },
}
// >>> PROJECTIONS END

// ---- inert dispatch path (opt-in only) ----------------------------------------------------
// SHAPE STUBS, not canonical helpers — see the header. They exist so this file has the documented
// rule-10 / rule-11 shape a real authored script has; no test asserts anything about them.
const tryAgent = async (label, p, opts) => {
  try { return await agent(p, opts) }
  catch (e) { return `STATUS: ERRORS_REMAINING (transport: fixture stub caught at ${label}: ${String((e && e.message) || e)})` }
}
const coverage = (results, expected) => {
  const got = results.filter(Boolean).length
  return got === expected ? null : { expected, got, missing: expected - got }
}

if (!args.FIXTURE_ALLOW_DISPATCH) {
  return { ok: true, synthetic: true, projections: Object.keys(PROJECTIONS), note: 'SYNTHETIC fixture — projection data only, nothing dispatched' }
}

const stages = PROJECTIONS.corrected.stages
const out = await parallel(stages.map(s => () =>
  tryAgent(s.id, `${s.prompt} [SYNTHETIC — write to ${SESSION}${s.owner}/]`, { label: s.id, phase: s.phase, agentType: s.agent_type })))
const gap = coverage(out, stages.length)
if (gap) return { stage: 'fixture-fanout', status: 'errors_remaining', coverageGap: gap }
return { ok: true, synthetic: true, stagesDispatched: stages.length, excluded: PROJECTIONS.corrected.excluded }
