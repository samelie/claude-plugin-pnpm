// persistent regressions for the attempt-evidence / premise-applicability / faithful-adoption
// helpers in `references/stage-templates.js`.
//
// COUNTERFEIT GUARD — the point of this file. stage-templates.js is a TEMPLATE, not a module: it
// opens on free vars (args/agent/parallel/log/...) and workflow scripts cannot import (rule 7). So
// every helper under test is SLICED OUT OF THE REAL FILE BY ANCHOR, proven to be a contiguous
// substring of those exact bytes, and EVALUATED here in a controlled scope with mocked
// agent/parallel/args/log. Nothing in this file re-implements a helper; a self-check below fails the
// suite if a declaration of one ever appears in these bytes. A test that re-types the helper proves
// only that the test author can type.
//
// SCOPE LIMIT, stated once and meant: these tests claim NOTHING about live Claude Workflow runtime
// behavior. agent(), parallel(), the in-run cache, resumeFromRunId replay, agentType routing and
// observer arming are all mocked. Green here is evidence about pure JS helper regions and about the
// synthetic fixtures in ./fixtures — nothing more.
//
// Fixtures: execution-methodology.cases.json (cases, guards, C1-C8 scenarios),
//           execution-methodology.plan.md (synthetic plan), execution-methodology.workflow.js
//           (synthetic projections). Every fabricated packet in them is labelled synthetic.
//
// IN-MEMORY MUTANTS (e2). For every guard e2 added, cases.json `mutants` names a canonical region, an
// exact-once find string and its replacement. The test edits the EXTRACTED STRING, evaluates the mutant in
// the same controlled scope, and asserts it behaves differently from the unmutated region. The source file
// is never written; a mutant that fails to apply, or that changes nothing observable, fails the suite.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..', '..')
const CANON_PATH = join(REPO, '.claude/skills/team-kit-run/references/stage-templates.js')
const CANON = readFileSync(CANON_PATH, 'utf8')
const CANON_LINES = CANON.split('\n')
const CANON_SHA = createHash('sha256').update(CANON).digest('hex')

const FIX = join(HERE, 'fixtures')
const CASES_RAW = readFileSync(join(FIX, 'execution-methodology.cases.json'), 'utf8')
const CASES = JSON.parse(CASES_RAW)
const PLAN_MD = readFileSync(join(FIX, 'execution-methodology.plan.md'), 'utf8')
const WF_SRC = readFileSync(join(FIX, 'execution-methodology.workflow.js'), 'utf8')
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf8')
const SKILL_PATH = join(REPO, '.claude/skills/team-kit-run/SKILL.md')
const SKILL = readFileSync(SKILL_PATH, 'utf8')

const SESSION = CASES.session
const EPOCH = CASES.epoch
const sess = (v) => (typeof v === 'string' ? v.split('<SESSION>').join(SESSION) : v)
const deep = (v) => JSON.parse(JSON.stringify(v).split('<SESSION>').join(SESSION))

// ---------------------------------------------------------------------------------------------
// canonical region extraction
// ---------------------------------------------------------------------------------------------

const regionText = (name) => {
  const spec = CASES.regions[name]
  assert.ok(spec, `unknown region ${name}`)
  const starts = CANON_LINES.reduce((a, l, i) => (l.includes(spec.startAnchor) ? a.concat(i) : a), [])
  assert.equal(starts.length, 1,
    `region ${name}: start anchor must occur exactly once in ${CANON_PATH}, found ${starts.length}. ` +
    `The canonical file moved under this fixture — re-anchor it, never re-type the helper.`)
  const s = starts[0]
  const e = CANON_LINES.findIndex((l, i) => i > s && l.includes(spec.endAnchor))
  assert.ok(e > s, `region ${name}: end anchor not found after line ${s + 1}`)
  const text = CANON_LINES.slice(s, e).join('\n')
  assert.ok(text.trim().length > 0, `region ${name} is empty`)
  assert.ok(CANON.includes(text),
    `region ${name} is not a contiguous substring of the canonical file — extraction is broken`)
  return text
}

// in-memory mutation of an extracted region's TEXT. applies only to the region the mutant names; the find
// string must occur exactly once so a mutant can never silently miss or hit the wrong site. APPLIED counts
// real applications, so a probe that never routes the mutant into its region fails instead of passing.
const APPLIED = new Map()
const mutateText = (name, src, mut) => {
  if (!mut || mut.region !== name) return src
  const hits = src.split(mut.find).length - 1
  assert.equal(hits, 1, `mutant ${mut.id}: find string must occur exactly once in region ${name}, found ${hits}`)
  const out = src.replace(mut.find, () => mut.replace)
  assert.notEqual(out, src, `mutant ${mut.id} left region ${name} unchanged`)
  APPLIED.set(mut.id, (APPLIED.get(mut.id) || 0) + 1)
  return out
}

const AsyncFunction = (async () => {}).constructor

// evaluate the canonical region (or its in-memory mutant) in a controlled scope. exactly the region's
// DECLARED free vars arrive as function params, so the region sees the mocks we hand it and nothing of
// this module; an extra key in `scope` is never visible to it.
const evalRegion = (name, scope, mut) => {
  const src = mutateText(name, regionText(name), mut)
  const spec = CASES.regions[name]
  const missing = spec.scope.filter((k) => !Object.keys(scope).includes(k))
  assert.deepEqual(missing, [], `region ${name}: unmocked free vars ${missing.join(',')}`)
  const body = `${src}\nreturn { ${spec.exports.join(', ')} }`
  const Ctor = spec.async ? AsyncFunction : Function
  return new Ctor(...spec.scope, body)(...spec.scope.map((k) => scope[k]))
}

const MUT = (id) => {
  const m = CASES.mutants.entries.find((x) => x.id === id)
  assert.ok(m, `mutant ${id} not found`)
  return m
}

const REGION_NAMES = Object.keys(CASES.regions)

// ---------------------------------------------------------------------------------------------
// 0. counterfeit guard
// ---------------------------------------------------------------------------------------------

test('counterfeit guard: every canonical region extracts, is contiguous, and is non-trivial', (t) => {
  t.diagnostic(`stage-templates.js sha256 observed now: ${CANON_SHA}`)
  let total = 0
  for (const name of REGION_NAMES) {
    const txt = regionText(name)
    total += txt.length
    assert.ok(txt.length > 120, `region ${name} suspiciously short (${txt.length} bytes)`)
  }
  assert.ok(total > 6000, `extracted only ${total} bytes of canonical source — too little to be the helpers`)
  t.diagnostic(`${REGION_NAMES.length} regions, ${total} canonical bytes executed by this suite`)
})

// every helper this suite executes. e1's scan is kept as it was: a line-start declaration of any e1 helper.
// the e2 helpers (staleSet, hasIntegrity) are scanned STRICTLY in every test and fixture file: a declaration
// anywhere (line start, inline, or inside a JSON string) or an object-literal function smuggled in under the
// name. strict forms apply to the e2 names only — e1's own mocks (`coverage: () => null`) are stubs the
// harness hands a region, not copies of a body.
const E1_TEST_HELPERS = ['safeSeg', 'attemptRef', 'bindAttempt', 'permitDenial', 'retryMissing',
  'isReconstruction', 'auditEmpty', 'closeArtifact', 'statusLineOf', 'statusOf', 'coverage', 'spent',
  'capReached', 'spendFix', 'segMatch', 'globsOverlap', 'disjoint']
const E1_FIXTURE_HELPERS = ['attemptRef', 'bindAttempt', 'permitDenial', 'retryMissing', 'auditEmpty',
  'closeArtifact', 'spent', 'capReached', 'spendFix', 'safeSeg', 'segMatch', 'disjoint']
const E2_HELPERS = ['staleSet', 'hasIntegrity']
const lineDecl = (n) => new RegExp(String.raw`(?:^|\n)\s*(?:const|let|var|function)\s+${n}\s*[=(]`)
const strictDecl = (n) => [
  lineDecl(n),
  new RegExp(String.raw`\b(?:const|let|var|function)\s+${n}\b\s*[=(]`),
  new RegExp(String.raw`\b${n}\s*:\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)`),
]
const declaredIn = (src, e1Names) => [
  ...e1Names.filter((n) => lineDecl(n).test(src)),
  ...E2_HELPERS.filter((n) => strictDecl(n).some((re) => re.test(src))),
]
// region anchors are LOCATORS that must occur exactly once in canonical source (regionText asserts it), so
// they carry declaration text by design and cannot smuggle a body; they are blanked before the scan.
const CASES_SCANNABLE = JSON.stringify({ ...CASES, regions: Object.fromEntries(Object.entries(CASES.regions)
  .map(([k, r]) => [k, { ...r, startAnchor: '<anchor>', endAnchor: '<anchor>' }])) }, null, 1)
// JSON.stringify escapes every backslash, so a regex literal re-typed inside a cases.json STRING never equals
// the raw canonical bytes in the escaped form; the decoded string leaves are scanned as well.
const stringLeaves = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(stringLeaves) : [])
const CASES_LEAVES = stringLeaves(JSON.parse(CASES_SCANNABLE))
const SCANNED = {
  'tests/execution-methodology.test.mjs': SELF,
  'tests/fixtures/execution-methodology.workflow.js': WF_SRC,
  'tests/fixtures/execution-methodology.cases.json': CASES_SCANNABLE,
  'tests/fixtures/execution-methodology.plan.md': PLAN_MD,
}

test('counterfeit guard: this test file declares none of the helpers it tests', () => {
  const offenders = declaredIn(SELF, E1_TEST_HELPERS)
  assert.deepEqual(offenders, [],
    `these helpers are DECLARED in the test file instead of executed from canonical source: ${offenders.join(',')}`)
})

test('counterfeit guard: no fixture file copies a canonical helper body', () => {
  for (const [file, src] of Object.entries(SCANNED).filter(([f]) => f.includes('/fixtures/'))) {
    const offenders = declaredIn(src, E1_FIXTURE_HELPERS)
    assert.deepEqual(offenders, [], `${file} copies helper bodies: ${offenders.join(',')}`)
  }
})

// planted text is built from templates, so this file never carries a literal declaration of its own
test('counterfeit guard: the declaration scan is live — a planted staleSet / hasIntegrity re-type is caught in every form', () => {
  const plants = [
    (n) => `\nconst ${n} = (a, b) => []`,
    (n) => `  function ${n}(t) { return false }`,
    (n) => `{ "x": "let ${n} = null" }`,
    (n) => `const mod = { ${n}: (t) => false }`,
    (n) => `const mod = { ${n}: async (e, c) => [] }`,
    (n) => `const mod = { ${n}: t => false }`,
  ]
  for (const n of E2_HELPERS) {
    for (const plant of plants) assert.ok(declaredIn(plant(n), []).includes(n), `scan missed ${JSON.stringify(plant(n))}`)
    assert.deepEqual(declaredIn(`const mod = { ${n}: sm.${n} }`, []), [], 'passing a canonical export through a scope object is not a re-type')
  }
})

// the canonical declaration prefix, built from the name so this file never carries one literally
const declPrefix = (n) => `const ${n} = `

// body signatures come FROM the canonical bytes, so the scan cannot drift from the helper it protects
const canonicalIntegrityLiteral = () => {
  const line = regionText('status').split('\n').find((l) => l.startsWith(declPrefix('hasIntegrity')))
  assert.ok(line, 'hasIntegrity declaration not found in the status region')
  const lit = line.slice(line.indexOf('/'), line.lastIndexOf('.test('))
  assert.match(lit, /^\/\^.*\/[a-z]*$/, `could not extract the hasIntegrity regex literal from: ${line}`)
  return lit
}

test('counterfeit guard: no test or fixture file re-types the body of hasIntegrity or staleSet under another name', () => {
  const lit = canonicalIntegrityLiteral()
  const walk = regionText('staleSet').split('\n').map((l) => l.trim()).find((l) => l.startsWith('for (const c of '))
  assert.ok(walk, 'staleSet traversal line not found in its region')
  for (const [file, src] of Object.entries(SCANNED)) {
    assert.equal(src.includes(lit), false, `${file} re-types the canonical hasIntegrity regex`)
    assert.equal(src.includes(walk), false, `${file} re-types the staleSet traversal`)
  }
  for (const s of CASES_LEAVES) {
    assert.equal(s.includes(lit), false, `a cases.json string re-types the canonical hasIntegrity regex: ${s.slice(0, 80)}`)
    assert.equal(s.includes(walk), false, `a cases.json string re-types the staleSet traversal: ${s.slice(0, 80)}`)
  }
  const planted = JSON.stringify({ x: { y: lit } })
  assert.equal(planted.includes(lit), false, 'the escaped JSON form is expected to hide a re-typed regex from a raw scan')
  assert.ok(stringLeaves(JSON.parse(planted)).some((s) => s.includes(lit)), 'the decoded-leaf scan must catch a regex re-typed inside a JSON string')
})

test('every fabricated fixture is labelled synthetic and disclaims runtime behavior', () => {
  assert.equal(CASES.synthetic, true)
  assert.match(CASES.syntheticNotice, /FABRICATED/)
  assert.match(CASES.runtimeClaim, /NONE\./)
  assert.match(PLAN_MD, /SYNTHETIC FIXTURE\. NOT A REAL PLAN\./)
  assert.match(PLAN_MD, /claims nothing about live Claude Workflow runtime behavior/i)
  assert.match(WF_SRC, /SYNTHETIC\. Nothing here was ever dispatched\./)
  assert.match(WF_SRC, /CLAIMS NOTHING ABOUT LIVE CLAUDE\s*\n\/\/ WORKFLOW RUNTIME BEHAVIOR/)
  for (const [id, c] of Object.entries(CASES.cases)) {
    assert.equal(typeof c.synthetic, 'boolean', `case ${id} must declare `+'`synthetic`')
    if (c.synthetic === false) assert.ok(c.note, `case ${id} claims non-synthetic input and must say why`)
  }
})

// ---------------------------------------------------------------------------------------------
// case runners — every decision below is made by canonical bytes, never by this file
// ---------------------------------------------------------------------------------------------

const freshAttemptMod = (mut) => evalRegion('attemptRef', { SESSION, args: { session: SESSION, epoch: EPOCH, attempts: {} } }, mut)
const freshBindMod = (mut) => evalRegion('bindAttempt', {}, mut)

const classifyAttemptRef = (input, mod) => {
  try {
    const ref = mod.attemptRef(input.owner, input.taskId, input.epoch, input.attempt, input.opts)
    return { outcome: 'ok', ref, resultPath: ref.resultPath, root: ref.root, inputsDir: ref.inputsDir, frozen: Object.isFrozen(ref) }
  } catch (e) { return { outcome: 'refused', message: String(e.message) } }
}

const mintSequence = (mints) => {
  const mod = freshAttemptMod()
  return mints.map((m) => classifyAttemptRef(m, mod))
}

const shaSetOf = (prompt) => [...new Set(String(prompt).match(/[0-9a-f]{64}/gi) || [])].sort()

// how many times the ref's reserved snapshot slot is named in a bound prompt; 0 when the ref has none
const slotMentions = (prompt, dir) => (typeof dir === 'string' && dir ? String(prompt).split(dir).length - 1 : 0)

// `rawRef` is a HAND-BUILT ref that bypasses attemptRef — the shape bindAttempt's slot guard exists to refuse
const classifyBind = (input, mod, mut) => {
  const am = freshAttemptMod(mut)
  try {
    const r = input.ref
    const ref = Object.hasOwn(input, 'rawRef') ? deep(input.rawRef) : am.attemptRef(r.owner, r.taskId, r.epoch, r.attempt, r.opts)
    const prompt = mod.bindAttempt(input.prompt, ref, deep(input.inputs || []), deep(input.deps || []))
    return { outcome: 'ok', prompt, shaSet: shaSetOf(prompt), resultPath: ref.resultPath, inputsDir: ref.inputsDir,
      slotMentions: slotMentions(prompt, ref.inputsDir) }
  } catch (e) { return { outcome: 'refused', message: String(e.message) } }
}

const runRetry = async (input) => {
  const dispatched = []
  const logs = []
  const mod = evalRegion('retryMissing', {
    log: (m) => logs.push(String(m)),
    parallel: async (thunks) => Promise.all(thunks.map((f) => f())),
    tryAgent: async (label, prompt, opts) => {
      dispatched.push({ label, prompt, opts })
      return `STATUS: CLEAN (SYNTHETIC re-dispatch of ${label})`
    },
  })
  const items = deep(input.items)
  const results = deep(input.results)
  const denials = items.map((it) => mod.permitDenial(it))
  const out = await mod.retryMissing(items, results, input.tag)
  return { outcome: out === null ? 'hold' : 'redispatched', dispatches: dispatched.length, dispatched, denials, logs, out }
}

const AUDIT_WRITE = /Write YOUR reconstruction to (\S+), and write NOTHING else: (\S+) is the PRODUCER's record/
const AUDIT_READ = /READ — do not write — its on-disk artifact (\S+?)(?= and the git diff|\. )/

const runAudit = async (input, mut) => {
  const dispatched = []
  const writeTargets = []
  const readTargets = []
  const declaredUntouchable = []
  const cov = evalRegion('coverage', {}, mut)
  const mod = evalRegion('auditEmpty', {
    log: () => {},
    coverage: cov.coverage,
    parallel: async (thunks) => Promise.all(thunks.map((f) => f())),
    // SIMULATED WORKER. The prompt is the only channel the helper has to an agent, so the
    // simulation obeys the prompt's canonical instruction shape: it writes where it is told to
    // write and reads where it is told to read. That makes the write/read SETS the observable,
    // rather than the mere presence of a path somewhere in a string.
    tryAgent: async (label, prompt, opts) => {
      dispatched.push({ label, opts })
      const w = AUDIT_WRITE.exec(prompt)
      if (w) { writeTargets.push(w[1]); declaredUntouchable.push(w[2]) }
      const r = AUDIT_READ.exec(prompt)
      if (r) readTargets.push(r[1])
      return `STATUS: CLEAN (SYNTHETIC audit of ${label})`
    },
  }, mut)
  const items = deep(input.items)
  const results = deep(input.results)
  const before = results.slice()
  try {
    const out = await mod.auditEmpty(items, results, input.tag)
    const changed = out && out.some((v, i) => v !== before[i])
    return {
      outcome: out === null ? 'coverage-gap' : changed ? 'patched' : 'unchanged',
      dispatches: dispatched.length, dispatched, writeTargets, readTargets, declaredUntouchable, out,
      producerArtifactInWriteSet: items.some((it) => it && it.artifact && writeTargets.includes(it.artifact)),
    }
  } catch (e) {
    return {
      outcome: 'refused', message: String(e.message), dispatches: dispatched.length,
      writeTargets, readTargets, declaredUntouchable, producerArtifactInWriteSet: false,
    }
  }
}

// drives the review loop's control flow around the CANONICAL accounting decisions. the loop shape is
// this harness's; every refusal below is returned by canonical capReached / spendFix / spent.
// a malformed seed THROWS where ROUNDS_SPENT / totalFix are evaluated, i.e. when the block is inlined
// before the first agent(): that refusal IS the terminal — zero rounds, zero fix dispatches. only an
// INTEGRITY refusal is classified; an extraction assert or any other throw still fails the test.
const runBudget = (input, mut) => {
  let mod
  try { mod = evalRegion('accounting', { args: { autonomy: deep(input.autonomy) } }, mut) } catch (e) {
    if (!/^INTEGRITY:/.test(String(e && e.message))) throw e
    return { terminal: 'refused', roundsThisSegment: 0, fixesCharged: 0, note: null, message: String(e.message), seedReadAs: null, headroom: 0 }
  }
  const seeded = mod.ROUNDS_SPENT.review
  const cap = input.cap
  let roundsThisSegment = 0
  let fixesCharged = 0
  let terminal = 'completed'
  let note = null
  for (const repairs of input.rounds) {
    const capped = mod.capReached('review', seeded, roundsThisSegment, cap)
    if (capped) { terminal = 'round-cap'; note = capped.note; break }
    roundsThisSegment++
    let ceilingHit = false
    for (let i = 0; i < repairs; i++) {
      const c = mod.spendFix(`impl-redo#${roundsThisSegment}.${i + 1}`)
      if (c) { terminal = 'fix-ceiling'; note = c.note; ceilingHit = true; break }
      fixesCharged++
    }
    if (ceilingHit) break
  }
  return { terminal, roundsThisSegment, fixesCharged, note, seedReadAs: seeded, headroom: Math.max(0, cap - seeded) }
}
const budgetOutcome = (g) => `${g.terminal}/rounds=${g.roundsThisSegment}/fixes=${g.fixesCharged}`

const CASE = (id) => {
  const c = CASES.cases[id]
  assert.ok(c, `fixture case ${id} not found`)
  return c
}

// ---------------------------------------------------------------------------------------------
// 1. attemptRef — path identity, traversal refusal, attempt-number refusal
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'attemptRef')) {
  test(`attemptRef ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const got = classifyAttemptRef(c.input, freshAttemptMod())
    assert.equal(got.outcome, c.expect.outcome, `${id}: ${got.message || got.resultPath}`)
    if (c.expect.resultPath) {
      assert.equal(got.resultPath, sess(c.expect.resultPath))
      assert.equal(got.frozen, true, 'a minted ref must be frozen')
    }
    if (c.expect.inputsDir) assert.equal(got.inputsDir, sess(c.expect.inputsDir), `${id}: snapshot slot`)
    if (c.expect.messageIncludes) {
      assert.ok(got.message.includes(c.expect.messageIncludes), `${id}: got ${got.message}`)
      assert.match(got.message, /^INTEGRITY:/)
    }
  })
}

test('attemptRef refuses rather than sanitizes — no traversal survives in normalized form', () => {
  const mod = freshAttemptMod()
  for (const id of ['A2-traversal-defect', 'A2b-dotleading-defect', 'A2c-separator-defect', 'A2d-dotdot-defect']) {
    const got = classifyAttemptRef(CASE(id).input, mod)
    assert.equal(got.outcome, 'refused')
    assert.equal(got.resultPath, undefined, `${id} produced a path — that is sanitizing, not refusing`)
  }
})

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'attemptRefSequence')) {
  test(`attemptRef collision registry ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const got = mintSequence(c.input.mints)
    assert.deepEqual(got.map((g) => g.outcome), c.expect.outcomes)
    if (c.expect.distinctPaths != null) {
      const paths = new Set(got.filter((g) => g.outcome === 'ok').map((g) => g.resultPath))
      assert.equal(paths.size, c.expect.distinctPaths)
    }
    if (c.expect.messageIncludes) {
      const refused = got.find((g) => g.outcome === 'refused')
      assert.ok(refused.message.includes(c.expect.messageIncludes), refused.message)
      assert.match(refused.message, /not permission to overwrite/)
    }
  })
}

// ---------------------------------------------------------------------------------------------
// 2. bindAttempt — dependency references and correction-attempt prompt identity
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'bind')) {
  test(`bindAttempt ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const got = classifyBind(c.input, freshBindMod())
    assert.equal(got.outcome, c.expect.outcome, got.message || '')
    if (c.expect.shaSet) assert.deepEqual(got.shaSet, c.expect.shaSet.slice().sort())
    if (c.expect.inputsDir) assert.equal(got.inputsDir, sess(c.expect.inputsDir), `${id}: snapshot slot`)
    if (c.expect.slotMentions != null)
      assert.equal(got.slotMentions, c.expect.slotMentions, `${id}: slot ${got.inputsDir} named ${got.slotMentions}x`)
    if (c.expect.messageIncludes) {
      assert.ok(got.message.includes(c.expect.messageIncludes), got.message)
      assert.match(got.message, /^INTEGRITY:/)
    }
  })
}

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'bindPair')) {
  test(`bindAttempt correction tag ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const mod = freshBindMod()
    const a = classifyBind(c.input.a, mod)
    const b = classifyBind(c.input.b, mod)
    assert.equal(a.outcome, 'ok'); assert.equal(b.outcome, 'ok')
    assert.equal(a.prompt !== b.prompt, c.expect.promptsDiffer,
      `${id}: promptsDiffer expected ${c.expect.promptsDiffer}`)
    assert.deepEqual(a.shaSet, c.expect.shaSetA.slice().sort())
    assert.deepEqual(b.shaSet, c.expect.shaSetB.slice().sort())
    // the reserved OUTPUT path is part of the prompt, so a new attempt is a cache MISS by construction
    assert.equal(a.prompt.includes(a.resultPath), true)
    assert.equal(b.prompt.includes(b.resultPath), true)
    assert.equal(a.resultPath === b.resultPath, !c.expect.promptsDiffer)
  })
}

test('bindAttempt: the recoverable hash set is exactly the selected dependency set — no extra, none missing', () => {
  const mod = freshBindMod()
  const got = classifyBind(CASE('B1-correction-control').input.b, mod)
  const want = CASE('B1-correction-control').input.b.deps.map((d) => d.sha256).sort()
  assert.deepEqual(got.shaSet, want)
  const other = CASE('B1-correction-control').input.a.deps[0].sha256
  assert.equal(got.prompt.includes(other), false, 'a superseded dependency hash leaked into the corrected prompt')
})

// ---------------------------------------------------------------------------------------------
// 3. retryMissing — RetryPermit denial and the bounded allow
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'retryMissing')) {
  test(`retryMissing ${id} (${CASE(id).role})`, async () => {
    const c = CASE(id)
    const got = await runRetry(deep(c.input))
    assert.equal(got.outcome, c.expect.outcome, JSON.stringify(got.denials))
    assert.equal(got.dispatches, c.expect.dispatches)
    if (c.expect.denialIncludes) {
      const joined = got.denials.filter(Boolean).join(' | ')
      for (const frag of c.expect.denialIncludes) assert.ok(joined.includes(frag), `${id}: denials were: ${joined}`)
      assert.ok(got.logs.some((l) => /HOLD retryMissing/.test(l)), `${id}: the hold must be logged with its reason`)
      assert.ok(got.logs.some((l) => /Not an ordinary retry/.test(l)))
    }
    if (c.expect.denials) assert.deepEqual(got.denials, c.expect.denials)
    if (c.expect.untouchedIndex != null) {
      assert.equal(got.out[c.expect.untouchedIndex], sess(c.input.results[c.expect.untouchedIndex]))
    }
    for (const d of got.dispatched) {
      assert.match(d.prompt, new RegExp(String.raw`^\[retry ${c.input.tag}\] `),
        'a permitted re-dispatch must carry a fresh tag — a byte-identical prompt replays the dead round from cache')
    }
  })
}

test('retryMissing: a hold dispatches nothing at all', async () => {
  for (const id of ['R2-permit-missing-defect', 'R3-permit-hold-defect', 'R4-paid-slice-defect',
    'R5-user-skip-defect', 'R6-no-evidence-defect', 'R7-irreversible-defect', 'R8-not-unpaid-defect']) {
    const got = await runRetry(deep(CASE(id).input))
    assert.equal(got.dispatches, 0, `${id} dispatched despite a denied permit`)
    assert.equal(got.outcome, 'hold')
  }
})

test('retryMissing: the allow branch is bounded to one re-dispatch per missing slice', async () => {
  const got = await runRetry(deep(CASE('R9-two-slices-bounded-control').input))
  assert.equal(got.dispatches, 2)
  assert.deepEqual(got.dispatched.map((d) => d.label).sort(), ['retry:alpha:qual-redo-2', 'retry:beta:qual-redo-2'])
  assert.equal(got.out.filter((r) => r == null).length, 0)
})

// ---------------------------------------------------------------------------------------------
// 4. auditEmpty — separate audit artifact, null-vs-empty, reconstruction never impersonates
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'auditEmpty')) {
  test(`auditEmpty ${id} (${CASE(id).role})`, async () => {
    const c = CASE(id)
    const got = await runAudit(deep(c.input))
    assert.equal(got.outcome, c.expect.outcome, got.message || '')
    assert.equal(got.dispatches, c.expect.dispatches)
    if (c.expect.writeTargets) assert.deepEqual(got.writeTargets, c.expect.writeTargets.map(sess))
    if (c.expect.readTargets) assert.deepEqual(got.readTargets, c.expect.readTargets.map(sess))
    if (c.expect.producerArtifactInWriteSet != null)
      assert.equal(got.producerArtifactInWriteSet, c.expect.producerArtifactInWriteSet)
    if (c.expect.patchedPrefix) assert.ok(String(got.out[0]).startsWith(sess(c.expect.patchedPrefix)), String(got.out[0]).slice(0, 160))
    if (c.expect.auditAgentType) assert.equal(got.dispatched[0].opts.agentType, c.expect.auditAgentType)
    if (c.expect.auditPhase) assert.equal(got.dispatched[0].opts.phase, c.expect.auditPhase)
    if (c.expect.messageIncludes) {
      assert.ok(got.message.includes(c.expect.messageIncludes), got.message)
      assert.match(got.message, /^INTEGRITY:/)
    }
    if (c.expect.resultsAfterIsNull != null)
      assert.equal(got.out[0] === null, c.expect.resultsAfterIsNull)
  })
}

test('auditEmpty: the producer artifact is a READ target and never a write target', async () => {
  for (const id of ['D1-audit-separate-control', 'D1b-audit-no-files-owned-control']) {
    const c = CASE(id)
    const got = await runAudit(deep(c.input))
    const artifact = sess(c.input.items[0].artifact)
    const auditArtifact = sess(c.input.items[0].auditArtifact)
    assert.deepEqual(got.writeTargets, [auditArtifact])
    assert.deepEqual(got.readTargets, [artifact])
    assert.deepEqual(got.declaredUntouchable, [artifact])
    assert.equal(got.writeTargets.includes(artifact), false)
  }
})

// e1 shipped this as a KNOWN GAP asserting the aliased item was PATCHED like the control, with the
// producer's artifact in the write set. e2 closed it; the same case now has to be refused.
test('auditEmpty: auditArtifact === artifact is REFUSED before any dispatch, on every call (e1 KNOWN GAP closed)', async () => {
  const control = await runAudit(deep(CASE('D1-audit-separate-control').input))
  assert.equal(control.outcome, 'patched')
  assert.equal(control.producerArtifactInWriteSet, false)
  for (const id of ['D3-auditartifact-equals-artifact-defect', 'D3b-auditartifact-equals-artifact-no-empty-defect',
    'D3c-one-aliased-item-holds-all-defect']) {
    const c = CASE(id)
    assert.equal(c.shippedAsGuard, true)
    const got = await runAudit(deep(c.input))
    assert.equal(got.outcome, 'refused', `${id}: ${got.outcome}`)
    assert.match(got.message, /^INTEGRITY: auditEmpty item\(s\) whose auditArtifact IS the producer's artifact/)
    assert.equal(got.dispatches, 0, `${id} dispatched an audit aimed at the producer's own record`)
    assert.deepEqual(got.writeTargets, [])
    assert.equal(got.producerArtifactInWriteSet, false)
    assert.notEqual(got.outcome, control.outcome)
  }
})

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'reconstruction')) {
  test(`reconstruction identity ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const am = evalRegion('auditEmpty', { log: () => {}, coverage: () => null, parallel: async () => [], tryAgent: async () => '' })
    const sm = evalRegion('status', {})
    const text = sess(c.input.text)
    assert.equal(am.isReconstruction(text), c.expect.isReconstruction)
    assert.equal(!am.isReconstruction(text), c.expect.citableAsProducerTerminal)
    assert.equal(sm.statusOf(text), c.expect.gateStatus)
  })
}

test('reconstruction: the STATUS line alone cannot tell a reconstruction from the producer record', () => {
  const sm = evalRegion('status', {})
  const a = sess(CASE('E1-producer-terminal-control').input.text)
  const b = sess(CASE('E2-reconstruction-impersonation-defect').input.text)
  assert.equal(sm.statusOf(a), sm.statusOf(b))          // identical under a status-text check
  const am = evalRegion('auditEmpty', { log: () => {}, coverage: () => null, parallel: async () => [], tryAgent: async () => '' })
  assert.notEqual(am.isReconstruction(a), am.isReconstruction(b))  // separated only by the prefix predicate
})

// ---------------------------------------------------------------------------------------------
// 5. statusOf — quoted-status false-clean (observed live 2026-08-22, wf_f882957b-7c4)
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'status')) {
  test(`statusOf ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    assert.equal(evalRegion('status', {}).statusOf(c.input.text), c.expect.statusOf)
  })
}

// ---------------------------------------------------------------------------------------------
// 6. accounting (C7) — seeded rounds never expand a cap; rounds and fix dispatches are separate units
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'accounting')) {
  test(`accounting ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const got = runBudget(c.input)
    assert.equal(got.terminal, c.expect.terminal, JSON.stringify(got))
    if (c.expect.roundsThisSegment != null) assert.equal(got.roundsThisSegment, c.expect.roundsThisSegment)
    if (c.expect.fixesCharged != null) assert.equal(got.fixesCharged, c.expect.fixesCharged)
    if (c.expect.headroom != null) assert.equal(got.headroom, c.expect.headroom)
    if (c.expect.seedReadAs != null) assert.equal(got.seedReadAs, c.expect.seedReadAs)
    if (c.expect.noteIncludes) assert.ok(String(got.note).includes(c.expect.noteIncludes), String(got.note))
    if (c.expect.messageIncludes) {
      assert.ok(String(got.message).includes(c.expect.messageIncludes), String(got.message))
      assert.match(got.message, /^INTEGRITY:/)
    }
  })
}

// e1 asserted a hostile seed bought the SAME headroom as an honest zero (the full cap). e2: it buys
// NOTHING — the accounting block refuses at inline time, before any round or fix dispatch.
test('accounting: a malformed seed is REFUSED before any dispatch — it buys no round and no fix', () => {
  const honest = runBudget(CASE('S3-zero-seed-control').input)
  assert.equal(honest.headroom, 3)
  assert.equal(honest.roundsThisSegment, 3)
  for (const id of ['S3b-negative-seed-defect', 'S3c-nan-seed-defect', 'S3d-fractional-seed-defect',
    'S3e-numeric-string-seed-defect', 'S3f-malformed-verify-lane-seed-defect', 'S3g-malformed-fix-seed-defect']) {
    const hostile = runBudget(CASE(id).input)
    assert.equal(hostile.terminal, 'refused', `${id} was accepted: ${JSON.stringify(hostile)}`)
    assert.equal(hostile.roundsThisSegment, 0, `${id} ran a round`)
    assert.equal(hostile.fixesCharged, 0, `${id} charged a fix dispatch`)
    assert.ok(hostile.headroom < honest.headroom, `${id} kept headroom`)
    assert.match(hostile.message, /^INTEGRITY: malformed consumed-count seed /)
  }
  const nul = runBudget(CASE('S3h-null-seed-control').input)
  assert.equal(budgetOutcome(nul), budgetOutcome(honest), 'a null seed (none recorded) must read as nothing consumed')
})

test('accounting: globalFixCeiling is read from the ceiling arg only, never from a spent-count arg', () => {
  const mod = evalRegion('accounting', { args: { autonomy: { fixesAlreadySpent: 99, roundsAlreadySpent: { review: 0 } } } })
  assert.equal(mod.TOTAL_FIX, 30)                   // documented default, NOT 99
  assert.equal(mod.spendFix('probe') === null, false, 'a seed at/over the ceiling must refuse the next dispatch')
})

// ---------------------------------------------------------------------------------------------
// 7. files_owned disjointness (rule 14)
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'disjoint')) {
  test(`disjoint ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    assert.equal(evalRegion('disjoint', {}).disjoint(c.input.owners).length, c.expect.collisions)
  })
}

// ---------------------------------------------------------------------------------------------
// 8. C6 projection — the obligation matrix, run over the corrected control and every defect variant
// ---------------------------------------------------------------------------------------------

const PROJECTIONS = (() => {
  const lines = WF_SRC.split('\n')
  const s = lines.findIndex((l) => l.includes('<<< PROJECTIONS BEGIN'))
  const e = lines.findIndex((l) => l.includes('>>> PROJECTIONS END'))
  assert.ok(s >= 0 && e > s, 'projection markers missing from the workflow fixture')
  const block = lines.slice(s, e + 1).join('\n')
  assert.ok(WF_SRC.includes(block), 'projection block is not a contiguous substring of the fixture')
  const code = lines.slice(s, e + 1).filter((l) => !/^\s*\/\//.test(l)).join('\n')
  assert.equal(/\bagent\s*\(|\bparallel\s*\(|\bargs\./.test(code), false,
    'the projection block must be pure data — no workflow primitives, no args')
  return new Function('SESSION', 'EPOCH', `${block}\nreturn PROJECTIONS`)(SESSION, EPOCH)
})()

const planTasks = (() => {
  // the human-checklist table also has X- rows; the task table is the 11-column one
  const rows = PLAN_MD.split('\n').filter((l) => /^\| X-\d/.test(l) && l.split('|').length === 13)
  assert.equal(rows.length, 4, 'synthetic plan task table did not parse')
  return rows.map((l) => {
    const c = l.split('|').map((x) => x.trim())
    return {
      task_id: c[1], agent_type: c[2], phase: c[3], owner: c[4], attempt: Number(c[5]),
      path_shape: c[6], files_owned: c[7] === '—' ? [] : c[7].split(',').map((x) => x.trim()),
      blockedBy: c[8] === '—' ? [] : c[8].split(',').map((x) => x.trim()),
      type: c[10], result_sha256: c[11],
    }
  })
})()

const planACs = (() => {
  const rows = PLAN_MD.split('\n').filter((l) => /^\| AX-\d/.test(l))
  return rows.map((l) => {
    const c = l.split('|').map((x) => x.trim())
    return { ac: c[1], kind: c[2], blocking: c[3] === 'true', maps_to: c[4] }
  })
})()

const shaOfTask = (id) => {
  const t = planTasks.find((x) => x.task_id === id)
  assert.ok(t, `plan task ${id} not found`)
  return t.result_sha256
}

// the obligation matrix. plan side is parsed from the synthetic plan; every stage path and every
// bound prompt is produced by the CANONICAL attemptRef / bindAttempt / disjoint regions.
const projectionVerdict = (name) => {
  const proj = PROJECTIONS[name]
  assert.ok(proj, `projection ${name} not found`)
  const am = freshAttemptMod()
  const bm = freshBindMod()
  const dm = evalRegion('disjoint', {})
  const failing = new Set()
  const findings = []
  const fail = (ob, detail) => { failing.add(ob); findings.push({ obligation: ob, detail }) }

  const stageIds = proj.stages.map((s) => s.id)
  for (const t of planTasks) {
    const s = proj.stages.find((x) => x.id === t.task_id)
    if (t.type === 'HITL') {
      if (s) fail('O3-hitl-excluded', `${t.task_id} is type HITL but is projected as an autonomous stage`)
      if (!proj.excluded.some((x) => x.id === t.task_id)) fail('O3-hitl-excluded', `${t.task_id} missing from the excluded list`)
      continue
    }
    if (!s) { fail('O1-stage-coverage', `${t.task_id} has no projection stage`); continue }
    if (s.agent_type !== t.agent_type) fail('O4-agent-type', `${t.task_id}: plan ${t.agent_type} vs projection ${s.agent_type}`)
    const ref = am.attemptRef(s.owner, s.id, EPOCH, s.attempt, s.shape)
    const prompt = bm.bindAttempt(s.prompt, ref, s.inputs || [], s.dependencies || [])
    const gotShas = shaSetOf(prompt)
    const wantShas = [...new Set(t.blockedBy.map(shaOfTask))].sort()
    if (JSON.stringify(gotShas) !== JSON.stringify(wantShas))
      fail('O5-dependency-binding', `${t.task_id}: bound prompt carries ${JSON.stringify(gotShas)}, plan blockedBy needs ${JSON.stringify(wantShas)}`)
  }
  for (const id of stageIds) if (!planTasks.some((t) => t.task_id === id)) fail('O2-no-invention', `stage ${id} is not a plan task`)

  const deterministicStages = new Set(planACs.filter((a) => a.kind === 'deterministic').map((a) => a.maps_to))
  for (const ac of planACs.filter((a) => a.kind === 'semantic' && a.blocking)) {
    const s = proj.stages.find((x) => x.id === ac.maps_to)
    if (!s) { fail('O6-grade-distinct', `${ac.ac} maps to ${ac.maps_to} which is not projected`); continue }
    if (deterministicStages.has(s.id)) fail('O6-grade-distinct', `${ac.ac} shares a stage with a deterministic AC`)
    if (s.agent_type === 'team-verifier') fail('O6-grade-distinct', `${ac.ac} is graded by team-verifier — commands are the verifier's evidence, never the grader's verdict`)
  }

  const byBatch = proj.stages.reduce((m, s) => { (m[s.batch] = m[s.batch] || []).push(s); return m }, {})
  for (const [batch, group] of Object.entries(byBatch)) {
    const writers = group.filter((s) => (s.files_owned || []).length)
    const collisions = dm.disjoint(writers.map((s) => ({ name: s.id, files_owned: s.files_owned })))
    if (collisions.length) fail('O7-ownership-disjoint', `batch ${batch}: ${JSON.stringify(collisions)}`)
  }

  return { verdict: failing.size ? 'FAIL' : 'PASS', failingObligations: [...failing].sort(), findings }
}

for (const [name, spec] of Object.entries(CASES.scenarios.C6.variants)) {
  test(`C6 projection ${name} (${spec.role})`, () => {
    const got = projectionVerdict(name)
    assert.equal(got.verdict, spec.expect.verdict, JSON.stringify(got.findings, null, 1))
    if (spec.expect.failingObligations)
      assert.deepEqual(got.failingObligations, spec.expect.failingObligations.slice().sort(), JSON.stringify(got.findings, null, 1))
    if (spec.expect.missing != null) assert.equal(got.findings.length, spec.expect.missing + (spec.expect.invented || 0))
  })
}

test('C6: the obligation ids the matrix enforces are exactly the ones the fixture declares', () => {
  const declared = CASES.scenarios.C6.obligations.map((o) => o.id).sort()
  const enforced = [...new Set(Object.keys(CASES.scenarios.C6.variants)
    .flatMap((v) => projectionVerdict(v).failingObligations))]
  for (const id of enforced) assert.ok(declared.includes(id), `matrix produced undeclared obligation ${id}`)
  assert.deepEqual(declared, ['O1-stage-coverage', 'O2-no-invention', 'O3-hitl-excluded', 'O4-agent-type',
    'O5-dependency-binding', 'O6-grade-distinct', 'O7-ownership-disjoint'])
})

// ---------------------------------------------------------------------------------------------
// 9. C8 — stale consumed-snapshot bytes
// ---------------------------------------------------------------------------------------------

const adoptionVerdict = (declaredSha) => (declaredSha === CANON_SHA ? 'current' : 'stale')

test('C8 adoption: declared consumed-snapshot hash is compared to bytes observed now', () => {
  assert.equal(adoptionVerdict(CANON_SHA), CASE('C8-current-control').expect.verdict)
  const staleCase = CASE('C8-stale-defect')
  assert.equal(adoptionVerdict(staleCase.input.declaredSha), staleCase.expect.verdict)
  assert.notEqual(staleCase.input.declaredSha, CANON_SHA,
    'the superseded T-2 hash equals the current bytes — stage-templates.js appears to have been reverted')
  assert.match(CASES.canonicalSource.supersededSha.value, /^[0-9a-f]{64}$/)
})

// ---------------------------------------------------------------------------------------------
// 10. discrimination — every claimed guard must separate its control from its defect
// ---------------------------------------------------------------------------------------------

// e2 runners. every decision is made by canonical bytes, or by the named in-memory mutant of them.

// JSON cannot carry undefined / NaN / ±Infinity, so those seeds are named and decoded here
const SEED_SPECIAL = { undefined, NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY, '-Infinity': Number.NEGATIVE_INFINITY }
const seedValue = (input) => {
  if (!Object.hasOwn(input, 'seedSpecial')) return input.seed
  assert.ok(Object.hasOwn(SEED_SPECIAL, input.seedSpecial), `unknown seedSpecial ${input.seedSpecial}`)
  return SEED_SPECIAL[input.seedSpecial]
}
// spent() on ONE value. the region is evaluated with no seeds, so its own ROUNDS_SPENT / totalFix
// evaluation cannot throw first.
const runSeed = (input, mut) => {
  const mod = evalRegion('accounting', { args: { autonomy: {} } }, mut)
  try { return { outcome: 'value', value: mod.spent(seedValue(input)) } } catch (e) {
    if (!/^INTEGRITY:/.test(String(e && e.message))) throw e
    return { outcome: 'refused', message: String(e.message) }
  }
}
const seedOutcome = (g) => (g.outcome === 'refused' ? 'refused' : `value=${Object.is(g.value, -0) ? '-0' : g.value}`)

const runStale = (input, mut) => {
  const mod = evalRegion('staleSet', {}, mut)
  const changed = input.changedAsSet ? new Set(input.changed) : input.changed
  try { return { outcome: 'ok', stale: mod.staleSet(deep(input.edges), changed) } } catch (e) {
    const message = String(e && e.message)
    return /^INTEGRITY:/.test(message) ? { outcome: 'refused', message } : { outcome: 'threw', message }
  }
}
const staleOutcome = (g) => (g.outcome === 'ok' ? `stale=[${g.stale.join(',')}]` : g.outcome === 'refused' ? 'refused' : `threw:${g.message}`)

const integrityOf = (text, mut) => evalRegion('status', {}, mut).hasIntegrity(sess(text))

// drives one former bare-INTEGRITY site with a SIMULATED verifier whose every finalize returns `text`.
// the site's loop/gate code, the classifier, hasIntegrity, the accounting and attemptRef/bindAttempt are
// canonical regions; tryAgent, FINALIZE_PROMPT and the coder ref are mocks.
const runIntegritySite = async (region, text, mut) => {
  const sm = evalRegion('status', {}, mut)
  const acc = evalRegion('accounting', { args: { autonomy: {} } }, mut)
  const tr = evalRegion('transport', {}, mut)
  const am = freshAttemptMod(mut)
  const bm = freshBindMod(mut)
  const rt = evalRegion('route', { statusLineOf: sm.statusLineOf, hasIntegrity: sm.hasIntegrity, args: {} }, mut)
  const scope = {
    capReached: acc.capReached, ROUNDS_SPENT: acc.ROUNDS_SPENT, spendFix: acc.spendFix,
    attemptRef: am.attemptRef, seed: am.seed, TASK_KEY: 'integrity-site', EPOCH,
    tryAgent: async (label) => (/^fix-/.test(label) ? 'STATUS: CLEAN (SYNTHETIC fix)' : sess(text)),
    FINALIZE_PROMPT: (tag, ref) => `[${tag}] SYNTHETIC finalize -> ${ref.resultPath}`,
    implRef: (n) => am.attemptRef('coder-probe', 'integrity-site', EPOCH, n, { epochInPath: false }),
    implAttempt: 1, isTransport: tr.isTransport, hasIntegrity: sm.hasIntegrity, statusOf: sm.statusOf,
    ok: sm.ok, escalates: sm.escalates, log: () => {}, bindAttempt: bm.bindAttempt, files: 'fixture/src/**',
    args: {}, vRound: 0, aRound: 1,
    routeOfText: rt.routeOfText, stallRoute: rt.stallRoute, rulingInputs: rt.rulingInputs,
  }
  const out = await evalRegion(region, scope, mut)
  return out.integrity === true ? 'blocked-integrity' : out.status ? `returned-${out.status}` : 'passed'
}

const GRADE_TEXT = CASES.docs.gradeContradiction
const GRADE_ARTIFACT = CASES.docs.gradeArtifactStatus
const runGrade = (input, mut) => {
  const bm = freshBindMod(mut)
  const gm = evalRegion('grade', { args: deep(input.args), bindAttempt: bm.bindAttempt }, mut)
  const ref = freshAttemptMod(mut).attemptRef('goal-auditor', 'grade', EPOCH, input.attempt, { artifact: 'final-grade' })
  try {
    const prompt = gm.GRADE_PROMPT(input.tag, ref, sess(input.gradeInputs))
    return { outcome: 'ok', prompt, shaSet: shaSetOf(prompt),
      selfContradicting: prompt.includes(GRADE_TEXT.noDeps) && prompt.includes(GRADE_TEXT.readsSelected),
           requiresArtifactStatus: prompt.includes(GRADE_ARTIFACT.artifactTerminal) && prompt.includes(GRADE_ARTIFACT.listAbove) }
  } catch (e) {
    if (!/^INTEGRITY:/.test(String(e && e.message))) throw e
    return { outcome: 'refused', message: String(e.message) }
  }
}
const gradeOutcome = (g) => (g.outcome === 'ok' ? `ok${g.selfContradicting ? '/self-contradicting' : ''}${g.requiresArtifactStatus ? '' : '/no-artifact-status'}` : 'refused')
// WHICH dependency list reached bindAttempt, which an outcome alone cannot show: a grade that read the
// shared args.deps instead of the dedicated channel still renders 'ok'. the hashes come out of the bound
// prompt, so this reads the same bytes the grader would.
const gradeShaLine = (g) => (g.outcome === 'ok' ? `ok|shas=${g.shaSet.join(',')}` : 'refused')

const attemptSlotOutcome = (id, mut) => {
  const got = classifyAttemptRef(CASE(id).input, freshAttemptMod(mut))
  if (got.outcome !== 'ok') return 'refused'
  let bind = 'ok'
  try { freshBindMod().bindAttempt('SYNTHETIC slot probe', got.ref, [], []) } catch { bind = 'refused' }
  return `slot=${got.inputsDir === undefined ? 'absent' : got.inputsDir}|bind=${bind}`
}
const bindSlotOutcome = (id, mut) => {
  const got = classifyBind(CASE(id).input, freshBindMod(mut), mut)
  if (got.outcome !== 'ok') return 'refused'
  return typeof got.inputsDir === 'string' && got.inputsDir ? `ok/slotMentions=${got.slotMentions}` : 'ok/slot=absent'
}
const auditOutcome = (g) => `${g.outcome}/dispatches=${g.dispatches}/producerWritten=${g.producerArtifactInWriteSet}`

const serially = async (ids, fn) => { const out = []; for (const id of ids) out.push(await fn(id)); return out }
const PROBES = {
  attemptSlot: async (ids, mut) => ids.map((id) => attemptSlotOutcome(id, mut)),
  bindSlot: async (ids, mut) => ids.map((id) => bindSlotOutcome(id, mut)),
  audit: (ids, mut) => serially(ids, async (id) => auditOutcome(await runAudit(deep(CASE(id).input), mut))),
  budget: async (ids, mut) => ids.map((id) => budgetOutcome(runBudget(CASE(id).input, mut))),
  seed: async (ids, mut) => ids.map((id) => seedOutcome(runSeed(CASE(id).input, mut))),
  stale: async (ids, mut) => ids.map((id) => staleOutcome(runStale(CASE(id).input, mut))),
  integrity: async (ids, mut) => ids.map((id) => `finding=${integrityOf(CASE(id).input.text, mut)}`),
  verifySite: (ids, mut) => serially(ids, (id) => runIntegritySite('verifyIntegritySite', CASE(id).input.text, mut)),
  reverifySite: (ids, mut) => serially(ids, (id) => runIntegritySite('reverifyIntegritySite', CASE(id).input.text, mut)),
  grade: async (ids, mut) => ids.map((id) => gradeOutcome(runGrade(CASE(id).input, mut))),
  gradeShas: async (ids, mut) => ids.map((id) => gradeShaLine(runGrade(CASE(id).input, mut))),
  // d7 brake probes (section 19). defined below; the literal only references them.
  reviewBrake: (ids, mut) => serially(ids, async (id) => stopLine((await runReviewBrake(id, mut)).out)),
  verifyBrake: (ids, mut) => serially(ids, async (id) => stopLine((await runVerifyBrake(id, mut)).out)),
  validateBrake: (ids, mut) => serially(ids, async (id) => validateBrakeLine(await runValidateBrake(id, mut))),
  stallRounds: async (ids, mut) => { const r = brakeRegions(mut, {}); return ids.map((id) => routeFields(r.rt.stallRoute(BRAKE(id).stallRoundsLeft))) },
  agentThrow: (ids, mut) => serially(ids, async (id) => agentThrowLine(await runAgentThrowBrake(id, mut))),
  // d5 route probes (section 20). defined below; the literal only references them.
  routeText: async (ids, mut) => ids.map((id) => routeOf(id, mut)),
  stopSite: (ids, mut) => serially(ids, async (id) => routeFields(await SITE_RUNNERS[id](mut))),
  // measurement-lane probes (section 21). defined below; the literal only references them. their `cases`
  // are measurement SCENARIO ids from CASES.measure.scenarios, NOT ids from the top-level cases map.
  measurePrompt: (ids, mut) => serially(ids, async (id) => measurePromptLine(await runMeasureLane(id, mut))),
  measureRefs: (ids, mut) => serially(ids, async (id) => measureLine(await runMeasureLane(id, mut))),
  measureCite: (ids, mut) => serially(ids, async (id) => measureCiteLine(await runMeasureLane(id, mut))),
  measureFix: (ids, mut) => serially(ids, async (id) => measureFixLine(await runMeasureLane(id, mut))),
  measureCompose: (ids, mut) => serially(ids, async (id) => measureComposeLine(await runMeasureLane(id, mut))),
}

const outcomeOf = async (id) => {
  const c = CASE(id)
  switch (c.kind) {
    case 'attemptRef': return classifyAttemptRef(c.input, freshAttemptMod()).outcome
    case 'attemptRefSequence': return mintSequence(c.input.mints).map((g) => g.outcome).join('+')
    case 'bind': return classifyBind(c.input, freshBindMod()).outcome
    case 'bindPair': {
      const mod = freshBindMod()
      const a = classifyBind(c.input.a, mod), b = classifyBind(c.input.b, mod)
      return `promptsDiffer=${a.prompt !== b.prompt}`
    }
    case 'retryMissing': { const g = await runRetry(deep(c.input)); return `${g.outcome}/dispatches=${g.dispatches}` }
    case 'auditEmpty': { const g = await runAudit(deep(c.input)); return `${g.outcome}/dispatches=${g.dispatches}` }
    case 'reconstruction': {
      const am = evalRegion('auditEmpty', { log: () => {}, coverage: () => null, parallel: async () => [], tryAgent: async () => '' })
      return `citable=${!am.isReconstruction(sess(c.input.text))}`
    }
    case 'status': return evalRegion('status', {}).statusOf(c.input.text)
    case 'accounting': return budgetOutcome(runBudget(c.input))
    case 'seed': return seedOutcome(runSeed(c.input))
    case 'staleSet': return staleOutcome(runStale(c.input))
    case 'integrity': return `finding=${integrityOf(c.input.text)}`
    case 'grade': return gradeOutcome(runGrade(c.input))
    case 'disjoint': return `collisions=${evalRegion('disjoint', {}).disjoint(c.input.owners).length}`
    case 'adoption': return adoptionVerdict(c.input.declaredSha || CANON_SHA)
    default: throw new Error(`no outcome runner for kind ${c.kind}`)
  }
}

// THIS is the acceptance evidence. Each claimed guard has a corrected control and one or more
// deliberate defect fixtures. Both sides run the SAME assertion against the SAME canonical bytes;
// only the fixture input differs. A guard whose defect fixture produces the control's outcome is
// DECORATION and fails here. e1 carried ONE equality-polarity guard (the seed clamp: a hostile seed had to
// buy the SAME headroom as an honest zero). e2 made spent() fail closed, so a hostile seed is now REFUSED
// and every guard, that one included, must separate its control from its defects.
for (const g of CASES.guards) {
  test(`discrimination ${g.id} (${g.polarity})`, async (t) => {
    const control = await outcomeOf(g.control)
    t.diagnostic(`${g.id} control ${g.control} -> ${control}`)
    for (const d of g.defects) {
      const defect = await outcomeOf(d)
      t.diagnostic(`${g.id} defect  ${d} -> ${defect}`)
      assert.notEqual(defect, control,
        `${g.id}: defect ${d} produced the SAME outcome as control ${g.control} (${control}) — that guard is DECORATION`)
    }
    for (const c2 of g.alsoControl || []) {
      const extra = await outcomeOf(c2)
      assert.ok(extra != null)
      t.diagnostic(`${g.id} control ${c2} -> ${extra}`)
    }
  })
}

test('discrimination: C6 defect projections each differ from the corrected control', () => {
  const control = projectionVerdict('corrected')
  assert.equal(control.verdict, 'PASS')
  for (const name of Object.keys(CASES.scenarios.C6.variants).filter((n) => n !== 'corrected')) {
    const got = projectionVerdict(name)
    assert.notEqual(got.verdict, control.verdict, `${name} passed the same matrix as the corrected control`)
    assert.ok(got.failingObligations.length > 0)
  }
})

test('every claimed guard names a control, defects, a polarity and a deletion signal', () => {
  for (const g of CASES.guards) {
    assert.ok(g.control && CASES.cases[g.control], `${g.id} control missing`)
    assert.ok(Array.isArray(g.defects) && g.defects.length, `${g.id} has no defect fixture`)
    for (const d of g.defects) assert.ok(CASES.cases[d], `${g.id} defect ${d} missing`)
    assert.equal(g.polarity, 'differs-from-control', `${g.id}: only a guard that separates control from defect is accepted`)
    assert.ok(g.deletionSignal, `${g.id} has no deletion signal`)
    if (g.since === 'e2') {
      assert.ok(Array.isArray(g.mutants) && g.mutants.length, `${g.id} is an e2 guard with no in-memory mutant`)
      for (const m of g.mutants) assert.ok(MUT(m).guardIds.includes(g.id), `${m} does not name ${g.id}`)
    }
  }
})

// ---------------------------------------------------------------------------------------------
// 11. scenario coverage + honest boundaries (C1-C8)
// ---------------------------------------------------------------------------------------------

test('C1-C8 are all present, carry their original historical citations, and name a verdict owner where not mechanical', () => {
  const ids = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']
  assert.deepEqual(Object.keys(CASES.scenarios).sort(), ids)
  for (const id of ids) {
    const s = CASES.scenarios[id]
    assert.ok(s.historicalCitation, `${id} lost its historical citation`)
    assert.match(s.historicalCitation, /Synthetic/)
    assert.ok(s.designStatement && s.sourceLine, `${id} must cite design.md`)
    if (s.mechanicallyCheckable === false) {
      assert.ok(s.verdictOwner, `${id} is not mechanically checkable and must name a verdict owner`)
      assert.ok(s.why, `${id} must say why no assertion can settle it`)
    } else {
      assert.ok(s.notCoveredMechanically, `${id} must state what its assertions do NOT cover`)
    }
    for (const cid of s.mechanicalCases || []) assert.ok(CASES.cases[cid], `${id} references missing case ${cid}`)
  }
})

test('C2 lineage sub-check is mechanical only and says so', () => {
  const c2 = CASES.scenarios.C2
  assert.equal(c2.mechanicallyCheckable, false)
  assert.match(c2.mechanicalSubcheckOnly, /NOT evidence the claim is supported/)
  for (const [name, p] of Object.entries(c2.packets)) {
    assert.equal(p.synthetic, true, `${name} packet must be labelled synthetic`)
    assert.equal(p.lineageRetained, p.raw != null && p.normalizationRule != null,
      `${name}: lineageRetained must agree with the presence of raw bytes AND a stated rule`)
    assert.ok(p.expectedReviewVerdict, `${name} must state the verdict the independent review is expected to reach`)
  }
})

test('C4 four-state control keeps completed effect receipts and unrelated eligibility in every state', () => {
  const c4 = CASES.scenarios.C4
  assert.equal(c4.states.length, 4)
  for (const s of c4.states) {
    assert.match(s.completedEffectReceipt, /^unchanged/, `${s.state} withdrew a completed effect receipt`)
    assert.equal(s.unrelatedTaskEligibility, 'eligible', `${s.state} held an unrelated task`)
  }
  assert.equal(c4.states.filter((s) => s.affectedNewWork === 'HELD').length, 2)
  assert.equal(c4.states[3].freshGradeRequired, true, 'restored support must still require a fresh grade')
  assert.ok(c4.defectVariants.length >= 3)
  for (const d of c4.defectVariants) { assert.equal(d.synthetic, true); assert.match(d.expectedReviewVerdict, /^reject/) }
})

test('C5 weakening/restoration packets are complete and synthetic', () => {
  const c5 = CASES.scenarios.C5
  for (const [name, p] of Object.entries(c5.packets)) {
    assert.equal(p.synthetic, true, `${name} must be labelled synthetic`)
    assert.ok(p.expectedReviewVerdict, `${name} must state its expected review verdict`)
  }
  assert.match(c5.packets.defect.expectedReviewVerdict, /reject the CLASSIFICATION/)
  assert.equal(c5.packets.restoration.priorEffectState, 'unknown')
})

// ---------------------------------------------------------------------------------------------
// 12. AC-1 — every reserved attempt has a snapshot slot, and the bound prompt names it
// ---------------------------------------------------------------------------------------------

test('attemptRef: both shapes expose a per-attempt snapshot slot; the numbered-file slot is the terminal SIBLING', () => {
  const dir = classifyAttemptRef(CASE('A1-path-identity-control').input, freshAttemptMod())
  assert.equal(dir.inputsDir, `${dir.root}inputs/`)
  const ids = ['A1c-numbered-file-control', 'A1d-numbered-file-attempt-2-control', 'A1e-numbered-file-other-artifact-control']
  const got = ids.map((id) => classifyAttemptRef(CASE(id).input, freshAttemptMod()))
  for (const g of got) {
    assert.equal(g.outcome, 'ok')
    assert.equal(g.inputsDir, g.resultPath.replace(/\.md$/, '.inputs/'), 'the numbered-file slot is the terminal sibling')
    assert.ok(g.inputsDir.startsWith(g.root) && g.inputsDir !== g.root)
  }
  assert.equal(new Set(got.map((g) => g.inputsDir)).size, ids.length, 'two attempts or two artifacts of one owner share a slot')
})

test('bindAttempt: a numbered-file prompt names its sibling slot in step 1 even when it declares no inputs', () => {
  const c = CASE('B3-dep-hash-control')
  const got = classifyBind(c.input, freshBindMod())
  assert.equal(got.outcome, 'ok')
  assert.equal(got.inputsDir, sess(c.expect.inputsDir))
  const step1 = got.prompt.split('\n').find((l) => l.startsWith('1. WRITE your single reserved terminal'))
  assert.ok(step1, 'numbered-file branch step 1 not found')
  assert.ok(step1.includes(`Copy mutable consumed bytes into ${got.inputsDir}`), 'step 1 must say WHERE mutable bytes are copied')
})

// ---------------------------------------------------------------------------------------------
// 13. AC-4 — spent() fails closed on every malformed seed class
// ---------------------------------------------------------------------------------------------

const SEED_CASES = Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'seed')

for (const id of SEED_CASES) {
  test(`spent seed class ${CASE(id).class}: ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const got = runSeed(c.input)
    assert.equal(got.outcome, c.expect.outcome, got.message || seedOutcome(got))
    if (c.expect.outcome === 'value')
      assert.ok(Object.is(got.value, c.expect.value), `${id}: spent returned ${seedOutcome(got)}, want value=${c.expect.value}`)
    if (c.expect.messageIncludes) {
      assert.ok(got.message.includes(c.expect.messageIncludes), got.message)
      assert.match(got.message, /^INTEGRITY: malformed consumed-count seed /)
    }
  })
}

test('spent: the seed battery covers every class AC-4 names', () => {
  const classes = new Set(SEED_CASES.map((id) => CASE(id).class))
  assert.deepEqual(CASES.docs.ac4SeedClassesRequired.filter((k) => !classes.has(k)), [])
})

// the e1 floor-and-zero spent() survives only as an in-memory mutant. for every seed class the headroom it
// granted is >= what the fail-closed helper grants (a refusal grants none): identical on well-formed seeds,
// strictly less on malformed ones — the change only ever REMOVES headroom.
test('spent: fail-closed is a TIGHTENING of the e1 floor — never more headroom, strictly less on malformed seeds', () => {
  const floor = MUT('M-spent-floor-and-zero')
  const CAP = 3
  const headroom = (g) => (g.outcome === 'refused' ? 0 : Math.max(0, CAP - g.value))
  let strictlyLess = 0
  for (const id of SEED_CASES) {
    const c = CASE(id)
    const now = runSeed(c.input)
    const old = runSeed(c.input, floor)
    assert.ok(headroom(now) <= headroom(old), `${id}: fail-closed grants ${headroom(now)} > e1 ${headroom(old)}`)
    if (c.role === 'control') assert.equal(seedOutcome(now), seedOutcome(old), `${id}: a well-formed seed must read as it did in e1`)
    if (headroom(now) < headroom(old)) strictlyLess++
  }
  assert.ok(strictlyLess > 0, 'no malformed seed lost headroom — the change would be a no-op')
})

// ---------------------------------------------------------------------------------------------
// 14. AC-5 — staleSet
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'staleSet')) {
  test(`staleSet ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const got = runStale(c.input)
    assert.equal(got.outcome, c.expect.outcome, got.message || staleOutcome(got))
    if (c.expect.stale) {
      assert.ok(Array.isArray(got.stale), 'staleSet must return an array')
      assert.deepEqual(got.stale, c.expect.stale)
    }
    if (c.expect.messageIncludes) {
      assert.ok(got.message.includes(c.expect.messageIncludes), got.message)
      assert.match(got.message, /^INTEGRITY: staleSet /)
    }
  })
}

test('staleSet: pure and import-free — no IO, no workflow primitive, no clock, input untouched, order-free', () => {
  const code = regionText('staleSet').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  assert.equal(/\bimport\b|\brequire\s*\(|\bawait\b|\bargs\b|\bagent\s*\(|\bparallel\s*\(|\blog\s*\(|\bDate\b|Math\.random|\bprocess\./.test(code), false,
    'the staleSet region reaches outside its arguments')
  assert.deepEqual(runStale(CASE('T2b-diamond-reordered-set-control').input).stale, runStale(CASE('T2-diamond-control').input).stale)
  const input = CASE('T1-linear-control').input
  const edges = deep(input.edges), changed = input.changed.slice()
  const before = JSON.stringify([edges, changed])
  evalRegion('staleSet', {}).staleSet(edges, changed)
  assert.equal(JSON.stringify([edges, changed]), before, 'staleSet mutated its input')
})

// ---------------------------------------------------------------------------------------------
// 15. AC-6 — hasIntegrity: exact token, backtracking-proof, used at BOTH former bare sites
// ---------------------------------------------------------------------------------------------

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'integrity')) {
  test(`hasIntegrity ${id} (${CASE(id).role})`, () => {
    assert.equal(integrityOf(CASE(id).input.text), CASE(id).expect.finding)
  })
}

test('hasIntegrity: the backtracking trap — bold none-found, plain none-found and INTEGRITY:none are NOT findings; a bold-wrapped real finding IS', () => {
  const sm = evalRegion('status', {})
  for (const t of ['**INTEGRITY: none found.**', 'INTEGRITY: none found.', 'INTEGRITY:none']) assert.equal(sm.hasIntegrity(t), false, t)
  assert.equal(sm.hasIntegrity('**INTEGRITY: contract file edited by a coder**'), true)
})

test('hasIntegrity: BOTH former bare /INTEGRITY:/ sites call the helper, and no bare substring test survives', () => {
  const code = CANON_LINES.filter((l) => !/^\s*\/\//.test(l))
  assert.deepEqual(code.filter((l) => l.includes('/INTEGRITY:/')), [], 'a bare /INTEGRITY:/ test survives in canonical code')
  const sites = code.filter((l) => /\bintegrity:\s*true\b/.test(l))
  assert.deepEqual(sites.map((l) => (l.match(/stage: '([^']+)'/) || [])[1]).sort(), ['finalize', 'finalize-after-ac'])
  for (const l of sites) assert.match(l, /^\s*if \(hasIntegrity\((verify|reverify)\)\) return /)
  assert.equal(code.filter((l) => l.startsWith(declPrefix('hasIntegrity'))).length, 1)
})

test('hasIntegrity: at BOTH sites a clean none-found report passes and a lying CLEAN carrying a real finding blocks', async () => {
  for (const region of ['verifyIntegritySite', 'reverifyIntegritySite']) {
    for (const id of ['I2-bold-none-found-defect', 'I2b-plain-none-found-defect'])
      assert.equal(await runIntegritySite(region, CASE(id).input.text), 'passed', `${region} ${id}`)
    assert.equal(await runIntegritySite(region, CASE('I1c-lying-clean-finding-control').input.text), 'blocked-integrity', region)
    assert.equal(await runIntegritySite(region, CASE('I3g-lying-clean-no-op-finding-defect').input.text), 'blocked-integrity',
      `${region}: a lying CLEAN whose real finding begins with no- must block`)
  }
})

const skillSection = (heading) => {
  const lines = SKILL.split('\n')
  const s = lines.findIndex((l) => l.startsWith(heading))
  assert.ok(s >= 0, `SKILL.md section "${heading}" not found`)
  const e = lines.findIndex((l, i) => i > s && /^#{1,3} /.test(l))
  return lines.slice(s, e < 0 ? undefined : e).join('\n')
}
const rule12 = () => skillSection('### Rule 12 sub-note')
const integrityRows = () => rule12().split('\n')
  .map((l) => l.match(/^\| `hasIntegrity\('(.*)'\)` \| `(true|false)` \|/))
  .filter(Boolean).map((m) => ({ literal: m[1], expect: m[2] === 'true' }))

test('SKILL.md rule 12 sub-note: every hasIntegrity assertion row holds against the canonical helper', () => {
  const rows = integrityRows()
  for (const req of CASES.docs.rule12IntegrityRowsRequired)
    assert.ok(rows.some((r) => r.literal === req.literal && r.expect === req.expect), `row missing from SKILL.md: ${req.literal} -> ${req.expect}`)
  const sm = evalRegion('status', {})
  for (const r of rows) assert.equal(sm.hasIntegrity(r.literal), r.expect, `SKILL.md row hasIntegrity('${r.literal}') must be ${r.expect}`)
})

test('SKILL.md rule 12 sub-note: the regex it USED to quote, run as an in-memory mutant, FAILS the none-found row', () => {
  const m = MUT('M-integrity-moirai-form')
  assert.ok(mutateText('status', regionText('status'), m).includes(CASES.docs.rule12FormerlyQuoted),
    'the mutant is not the regex the sub-note used to quote')
  const mutant = evalRegion('status', {}, m)
  const noneRow = CASES.docs.rule12IntegrityRowsRequired.find((r) => r.expect === false)
  assert.equal(mutant.hasIntegrity(noneRow.literal), true, 'the formerly quoted form must MATCH the none-found literal — that is the defect')
  const failing = integrityRows().filter((r) => mutant.hasIntegrity(r.literal) !== r.expect).map((r) => r.literal)
  assert.ok(failing.includes(noneRow.literal), `mutant failed only: ${JSON.stringify(failing)}`)
  assert.equal(mutant.hasIntegrity('INTEGRITY:none'), false, 'its negative branch works only with no space after the colon')
})

// e2 PD-3. F-3 attempt 1 fed hasIntegrity no real finding that begins with no / no- / none / n/a-, so the suite
// stayed green while the leading-word helper read three of them as clean. these rows are the correction.
const confusableRows = () => CASES.docs.rule12IntegrityRowsRequired.filter((r) => r.confusable)
// e2 PD-4. F-3 attempt 2 put every marker on a line of its own, so the suite stayed green while a second INTEGRITY:
// marker packed behind a terminated clean phrase on the SAME line read clean (reviewer/review-1.md warning 1).
const sameLineRows = () => CASES.docs.rule12IntegrityRowsRequired.filter((r) => r.sameLine)
const integrityCases = (finding) => Object.entries(CASES.cases).filter(([, c]) => c.kind === 'integrity' && c.expect.finding === finding)

test('hasIntegrity: a real finding that BEGINS with no / no- / none / n/a- IS a finding, bold or not, and an unterminated clean phrase fails CLOSED', () => {
  const sm = evalRegion('status', {})
  const rows = confusableRows()
  assert.equal(rows.length, 5, 'the five PD-3 confusable positives must all be required')
  const positives = new Set(Object.values(CASES.cases).filter((c) => c.kind === 'integrity' && c.expect.finding === true).map((c) => c.input.text))
  for (const r of rows) {
    assert.equal(r.expect, true, `a confusable row must expect a finding: ${r.literal}`)
    assert.ok(positives.has(r.literal), `no integrity case feeds the confusable positive: ${r.literal}`)
    assert.equal(sm.hasIntegrity(r.literal), true, `a real finding read as clean: ${r.literal}`)
    assert.equal(sm.hasIntegrity(`**${r.literal}**`), true, `a bold-wrapped real finding read as clean: ${r.literal}`)
  }
  for (const [id, c] of Object.entries(CASES.cases).filter(([, c]) => c.kind === 'integrity' && c.expect.finding === false))
    assert.equal(sm.hasIntegrity(sess(c.input.text)), false, `negative ${id} became a finding`)
})

test('hasIntegrity: the leading-word helper F-2 attempt 1 shipped, run as an in-memory mutant, FAILS every confusable positive yet passes every negative', () => {
  const m = MUT('M-integrity-leading-word-form')
  assert.ok(mutateText('status', regionText('status'), m).includes(CASES.docs.rule12LeadingWordForm),
    'the mutant is not the helper F-3 attempt 1 was written against')
  const sm = evalRegion('status', {})
  const mutant = evalRegion('status', {}, m)
  for (const r of confusableRows()) {
    assert.equal(sm.hasIntegrity(r.literal), true, r.literal)
    assert.equal(mutant.hasIntegrity(r.literal), false, `the leading-word form must read this real finding as clean (the PD-3 false clean): ${r.literal}`)
  }
  // why attempt 1 stayed green: on every negative the suite carries, the leading-word form is already right
  for (const [id, c] of Object.entries(CASES.cases).filter(([, c]) => c.kind === 'integrity' && c.expect.finding === false))
    assert.equal(mutant.hasIntegrity(sess(c.input.text)), false, `${id}: expected the leading-word form to be right on this negative`)
  // it has no same-line alternative either, so it also fails the pd-4 same-line rows
  const failing = integrityRows().filter((r) => mutant.hasIntegrity(r.literal) !== r.expect).map((r) => r.literal).sort()
  assert.deepEqual(failing, [...confusableRows(), ...sameLineRows()].map((r) => r.literal).sort(),
    'against the SKILL.md rule 12 rows the leading-word mutant must fail exactly the confusable and the same-line positives')
})

test('SKILL.md rule 12 sub-note: quotes the canonical working form, not the defeated one, and no stale :431 / :512 citation', () => {
  const sec = rule12()
  assert.equal(sec.includes(CASES.docs.rule12LeadingWordForm), false, 'the sub-note quotes the leading-word form as a whole working regex')
  assert.ok(sec.includes(`\`${canonicalIntegrityLiteral()}\``), 'the sub-note must quote the regex hasIntegrity actually uses')
  assert.equal(sec.includes(CASES.docs.rule12FormerlyQuoted), false, 'the sub-note still quotes the backtracking-defeated form')
  assert.equal(/:431\b|:512\b/.test(sec), false, 'the sub-note still cites the stale stage-templates.js :431 / :512 bare sites')
})

test('hasIntegrity: a second INTEGRITY: marker on the SAME line as a terminated clean phrase IS a finding, bold or not; prose quoting the token on the NEXT line is not', () => {
  const sm = evalRegion('status', {})
  const rows = sameLineRows()
  assert.equal(rows.length, 3, 'the three PD-4 same-line positives must all be required')
  const positives = new Set(integrityCases(true).map(([, c]) => c.input.text))
  for (const r of rows) {
    assert.equal(r.expect, true, `a same-line row must expect a finding: ${r.literal}`)
    assert.ok(positives.has(r.literal), `no integrity case feeds the same-line positive: ${r.literal}`)
    assert.equal(sm.hasIntegrity(r.literal), true, `a finding behind a clean phrase on one line read as clean: ${r.literal}`)
    assert.equal(sm.hasIntegrity(`**${r.literal}**`), true, `bold-wrapped: ${r.literal}`)
  }
  for (const id of CASES.guards.find((g) => g.id === 'G-integrity-same-line').defects)
    assert.equal(sm.hasIntegrity(CASE(id).input.text), true, id)
  const lines = CASE('I4-next-line-quote-clean-control').input.text.split('\n')
  const at = lines.indexOf('INTEGRITY: none found.')
  assert.ok(at >= 0 && at + 1 < lines.length, 'the negative must carry the plain none-found marker line')
  const quote = lines[at + 1]
  assert.ok(quote.includes('INTEGRITY:') && !/^[\s*]*INTEGRITY:/.test(quote), 'the NEXT line must quote the token mid-prose, not begin with it')
  assert.equal(sm.hasIntegrity(lines.join('\n')), false, 'next-line prose quoting the token became a finding')
  assert.equal(sm.hasIntegrity([lines[at], quote].join('\n')), false, 'the two-line core alone must stay clean')
  // the same two lines joined onto ONE line are a finding: only the newline separates the verdicts
  assert.equal(sm.hasIntegrity(`${lines[at]} ${quote}`), true, 'the same bytes on one line must fail closed')
  for (const [id, c] of integrityCases(false)) assert.equal(sm.hasIntegrity(sess(c.input.text)), false, `negative ${id} became a finding`)
})

test('hasIntegrity: the line-anchored-only helper F-2 attempt 2 shipped, run as an in-memory mutant, FAILS every same-line positive yet passes every negative', () => {
  const m = MUT('M-integrity-same-line-removed')
  assert.ok(mutateText('status', regionText('status'), m).includes(CASES.docs.rule12LineAnchoredForm),
    'the mutant is not the helper F-3 attempt 2 was written against')
  const sm = evalRegion('status', {})
  const mutant = evalRegion('status', {}, m)
  const texts = [...sameLineRows().map((r) => r.literal),
    ...CASES.guards.find((g) => g.id === 'G-integrity-same-line').defects.map((id) => CASE(id).input.text)]
  for (const x of texts) {
    assert.equal(sm.hasIntegrity(x), true, x)
    assert.equal(mutant.hasIntegrity(x), false, `the line-anchored-only form must read this real finding as clean (the PD-4 false clean): ${x}`)
    assert.equal(mutant.hasIntegrity(`**${x}**`), false, `bold-wrapped, still clean under the mutant: ${x}`)
  }
  // why attempt 2 stayed green: on every negative and every confusable positive it is already right
  for (const [id, c] of integrityCases(false))
    assert.equal(mutant.hasIntegrity(sess(c.input.text)), false, `${id}: expected the line-anchored-only form to be right on this negative`)
  for (const r of confusableRows()) assert.equal(mutant.hasIntegrity(r.literal), true, r.literal)
  const failing = integrityRows().filter((r) => mutant.hasIntegrity(r.literal) !== r.expect).map((r) => r.literal).sort()
  assert.deepEqual(failing, sameLineRows().map((r) => r.literal).sort(),
    'against the SKILL.md rule 12 rows the line-anchored-only mutant must fail exactly the same-line positives')
})

test('hasIntegrity: at BOTH sites a lying CLEAN whose real finding is packed behind a clean phrase on one line blocks, and next-line quoting prose passes', async () => {
  for (const region of ['verifyIntegritySite', 'reverifyIntegritySite']) {
    assert.equal(await runIntegritySite(region, CASE('I4d-lying-clean-same-line-finding-defect').input.text), 'blocked-integrity', region)
    assert.equal(await runIntegritySite(region, CASE('I4-next-line-quote-clean-control').input.text), 'passed', region)
  }
})

test('SKILL.md rule 12 sub-note: no longer quotes the line-anchored-only form, and discloses every residual in both places, each still true of the helper', () => {
  const sec = rule12()
  const status = regionText('status')
  assert.equal(sec.includes(CASES.docs.rule12LineAnchoredForm), false, 'the sub-note quotes the line-anchored-only form as a whole working regex')
  const sm = evalRegion('status', {})
  const residuals = CASES.docs.rule12Residuals
  assert.equal(residuals.length, 2, 'both disclosed residual classes must be pinned')
  for (const r of residuals) {
    assert.ok(sec.includes(r.disclosedAs), `SKILL.md rule 12 sub-note does not disclose: ${r.disclosedAs}`)
    assert.ok(status.includes(r.disclosedAs), `the hasIntegrity comment does not disclose: ${r.disclosedAs}`)
    // the disclosure must be TRUE of the helper. once the helper reads this as a finding, retire the residual deliberately
    assert.equal(sm.hasIntegrity(r.literal), false, `a disclosed residual now reads as a finding; retire it from SKILL.md, the comment and this fixture: ${r.literal}`)
  }
  for (const where of [sec, status]) assert.ok(where.includes(CASES.docs.rule12BackstopLimit), 'the backstop limit is not disclosed in both places')
})

// ---------------------------------------------------------------------------------------------
// 16. AC-7 / AC-5 docs
// ---------------------------------------------------------------------------------------------

test('SKILL.md carries no dollar-digit sequence (AC-7), and the scan is live', () => {
  const DOLLAR_DIGIT = /\$[0-9]/
  const hits = SKILL.split('\n').flatMap((l, i) => (DOLLAR_DIGIT.test(l) ? [`${i + 1}: ${l.slice(0, 120)}`] : []))
  assert.deepEqual(hits, [], `${SKILL_PATH} carries dollar-digit sequences`)
  assert.equal(DOLLAR_DIGIT.test(`${SKILL}\n${'$'}7 planted`), true, 'the scan must catch a planted dollar-digit')
})

test('SKILL.md templates table documents staleSet and hasIntegrity', () => {
  for (const n of ['staleSet', 'hasIntegrity'])
    assert.ok(SKILL.split('\n').some((l) => l.startsWith(`| \`${n}\` |`)), `no templates-table row for ${n}`)
})

// ---------------------------------------------------------------------------------------------
// 17. AC-10 — GRADE_PROMPT refuses an empty dependency list, a missing tag and a missing snapshot
// ---------------------------------------------------------------------------------------------

test('GRADE_PROMPT: the self-contradiction detector phrases exist in canonical source (never vacuous)', () => {
  for (const p of Object.values(GRADE_TEXT)) assert.ok(CANON.includes(p), `phrase not in stage-templates.js: ${p}`)
  for (const p of Object.values(GRADE_ARTIFACT)) assert.ok(CANON.includes(p), `docs.gradeArtifactStatus literal absent from the canonical source: ${p}`)
})

test('d5: the review prompts state the list-above-verdict ordering in canonical source', () => {
  // Presence assertion over raw source bytes. It binds a live literal, so deleting the ordering sentence
  // fails it — but an EMPTIED fixture would pass vacuously, hence the count guard; and a literal parked in
  // a comment would also satisfy CANON.includes, which no source-text detector in this suite can see.
  const entries = Object.entries(CASES.docs.reviewListOrder)
  assert.equal(entries.length, 2, 'docs.reviewListOrder must carry both review builders — an emptied fixture would make every check below vacuous')
  for (const [k, p] of entries)
    assert.ok(CANON.includes(p), `${k}: the review-ordering detector is not in canonical source`)
})

for (const id of Object.keys(CASES.cases).filter((k) => CASES.cases[k].kind === 'grade')) {
  test(`GRADE_PROMPT ${id} (${CASE(id).role})`, () => {
    const c = CASE(id)
    const got = runGrade(c.input)
    assert.equal(got.outcome, c.expect.outcome, got.message || '')
    if (c.expect.shaSet) assert.deepEqual(got.shaSet, c.expect.shaSet.slice().sort())
    if (got.outcome === 'ok') assert.equal(got.selfContradicting, false, `${id}: the grade prompt contradicts itself`)
    if (got.outcome === 'ok') assert.equal(got.requiresArtifactStatus, true, `${id}: the grade prompt does not require the artifact's own terminal STATUS line`)
    if (c.expect.messageIncludes) {
      assert.ok(got.message.includes(c.expect.messageIncludes), got.message)
      assert.match(got.message, /^INTEGRITY:/)
    }
  })
}

// the DEDICATED grade-dependency channel. the outcome alone cannot see this guard — a grade that read the
// shared list still renders 'ok' — so every assertion below reads the bound HASH SET, i.e. which list
// actually reached bindAttempt.
test('GRADE_PROMPT: the dedicated grade channel is what the grade binds — the shared args.deps is not read', () => {
  const c = CASE('K6-grade-channel-selected-control')
  const channel = c.input.args.gradeDeps.map((d) => d.sha256)
  const shared = c.input.args.deps.map((d) => d.sha256)
  assert.notDeepEqual(channel, shared, 'the fixture must feed DIFFERENT hashes on the two channels or this proves nothing')
  const got = runGrade(c.input)
  assert.equal(got.outcome, 'ok', got.message || '')
  assert.deepEqual(got.shaSet, channel.slice().sort(), 'the grade did not bind the channel it was handed')
  for (const s of shared)
    assert.equal(got.prompt.includes(s), false, 'a hash from the SHARED dependency list reached the grade prompt')
})

test('GRADE_PROMPT: the grade channel falls back on ABSENCE only — a wired-but-empty channel is refused, never defaulted onto the shared list', () => {
  // absence in both spellings the canonical `== null` covers: no key at all (K1), and an explicit null (K6b).
  // this arm is what keeps every caller and every fixture predating the channel byte-unchanged.
  for (const id of ['K1-grade-deps-selected-control', 'K6b-grade-channel-null-falls-back-control']) {
    const c = CASE(id)
    const got = runGrade(c.input)
    assert.equal(got.outcome, 'ok', got.message || '')
    assert.deepEqual(got.shaSet, c.input.args.deps.map((d) => d.sha256).sort(),
      `${id}: an ABSENT channel must read the shared list exactly as it did before the channel existed`)
  }
  // wired-and-selected-nothing is NOT absence. a fallback here is strictly worse than the empty shared list
  // the refusal already catches: the dispatch would stop contradicting itself, so the guard goes quiet, and
  // the grade proceeds against a dependency set the orchestrator never selected for it.
  const sharedEmpty = runGrade(CASE('K2-grade-deps-empty-defect').input)
  assert.equal(sharedEmpty.outcome, 'refused')
  for (const id of ['K7-grade-channel-empty-defect', 'K7b-grade-channel-not-array-defect']) {
    const c = CASE(id)
    assert.ok(c.input.args.deps.length,
      `${id}: the shared list must be NON-empty here, or a silent fallback would have nothing to wrongly reach and the case is vacuous`)
    const got = runGrade(c.input)
    assert.equal(got.outcome, 'refused', `${id}: a wired-but-empty grade channel silently fell back to the shared list`)
    assert.match(got.message, /^INTEGRITY:/)
    assert.equal(got.message, sharedEmpty.message,
      `${id}: this must land on the SAME single refusal site an empty shared list does — a second throw is a second thing to delete`)
  }
})

test('GRADE_PROMPT: the pre-existing empty-dependency refusal still fires for the shared list itself', () => {
  for (const id of ['K2-grade-deps-empty-defect', 'K2b-grade-deps-absent-defect', 'K2c-grade-deps-not-array-defect']) {
    const got = runGrade(CASE(id).input)
    assert.equal(got.outcome, 'refused', `${id}: the empty-deps refusal stopped firing when the channel landed`)
    assert.ok(got.message.includes('EMPTY selected dependency list'), got.message)
  }
})

// ---------------------------------------------------------------------------------------------
// 18. in-memory mutants — each e2 guard removed or inverted in the extracted STRING, never on disk
// ---------------------------------------------------------------------------------------------

for (const m of CASES.mutants.entries) {
  test(`mutant ${m.id} (${m.ac}) — ${m.guard}`, async (t) => {
    assert.ok(CASES.regions[m.region], `${m.id}: unknown region ${m.region}`)
    assert.notEqual(m.find, m.replace)
    assert.ok(m.checks.length > 0, `${m.id} has no check`)
    for (const ck of m.checks) {
      const probe = PROBES[ck.probe]
      assert.ok(probe, `${m.id}: no probe ${ck.probe}`)
      const control = await probe(ck.cases)
      const before = APPLIED.get(m.id) || 0
      const mutant = await probe(ck.cases, m)
      assert.ok((APPLIED.get(m.id) || 0) > before, `${m.id}: the ${ck.probe} probe never evaluated region ${m.region}`)
      t.diagnostic(`${m.id} ${ck.probe} control ${JSON.stringify(control)}`)
      t.diagnostic(`${m.id} ${ck.probe} mutant  ${JSON.stringify(mutant)}`)
      assert.deepEqual(control, ck.control.map(sess), `${m.id}: the unmutated region no longer behaves as declared`)
      assert.deepEqual(mutant, ck.mutant.map(sess), `${m.id}: the mutant's behaviour changed`)
      assert.notDeepEqual(mutant, control, `${m.id}: the mutant is indistinguishable from the canonical region — the guard is DECORATION`)
    }
  })
}

test('every mutant is unique, names its AC and guard, and every AC with an e2 guard has one', () => {
  const ids = CASES.mutants.entries.map((m) => m.id)
  assert.equal(new Set(ids).size, ids.length)
  const guardIds = new Set(CASES.guards.map((g) => g.id))
  for (const m of CASES.mutants.entries) {
    assert.match(m.ac, /^AC-\d+$/)
    assert.ok(m.guard && m.mutation, `${m.id} must say what guard it removes and how`)
    for (const gid of m.guardIds || []) assert.ok(guardIds.has(gid), `${m.id} names unknown guard ${gid}`)
  }
  const acs = new Set(CASES.mutants.entries.map((m) => m.ac))
  for (const ac of ['AC-1', 'AC-3', 'AC-4', 'AC-5', 'AC-6', 'AC-10']) assert.ok(acs.has(ac), `no mutant for ${ac}`)
})

// ---------------------------------------------------------------------------------------------
// 19. d7 brakes — the review / verify / validate stalls, the regression path after a full-scope
// regrade, the final-round stall and the platform agent-cap label.
//
// Same discipline as everything above: each loop is SLICED WHOLE out of the real file by anchor and
// evaluated with the canonical status / accounting / transport / attemptRef / bindAttempt / route /
// gate regions supplied into its scope. Only the dispatch seam this suite already disclaims — agent,
// tryAgent, runImplement and the two prompt builders — is mocked, so every verdict below is reached
// by canonical bytes. Nothing here re-implements a helper.
// ---------------------------------------------------------------------------------------------

const BRAKE = (id) => {
  const s = CASES.brakes[id]
  assert.ok(s, `fixture brake scenario ${id} not found`)
  return s
}
// the VALUE of a top-level canonical constant, read out of the bytes under test rather than re-typed,
// so a later change to a cap moves these probes with it instead of silently falsifying them.
const canonValue = (n) => {
  const line = CANON_LINES.find((l) => l.startsWith(declPrefix(n)))
  assert.ok(line, `canonical constant ${n} not found`)
  const v = Number(line.slice(declPrefix(n).length))
  assert.ok(Number.isInteger(v) && v > 0, `${n} is not a positive integer literal: ${line}`)
  return v
}
// one scripted round per array element; the LAST element repeats for every further round, so a loop
// whose brake was removed runs out at its own cap instead of hanging on an exhausted script.
const scripted = (list) => (n) => sess(list[Math.min(n, list.length - 1)])
const roundOf = (label) => Number(String(label).split('#')[1]) - 1

const noteClass = (n) => (!n ? '-'
  : /^no progress/.test(String(n)) ? 'no-progress'
  : /round cap \d+ reached/.test(String(n)) ? 'round-cap-note'
  : /fix ceiling \d+ exhausted/.test(String(n)) ? 'fix-ceiling-note' : 'other')
const routeFields = (v) => `route=${v.route || 'untagged'}|gate=${v.gate || '-'}|trigger=${v.trigger || '-'}` +
  `|assessor=${v.assessor === undefined ? '-' : String(v.assessor)}`
// a STOP is any return carrying a stage; a loop that exits normally returns its exports, which carry none
const stopLine = (v) => (v && v.stage ? `${v.stage}|${v.status}|${routeFields(v)}|note=${noteClass(v.note)}` : 'no-stop')

// the canonical regions every brake harness shares. each value is an EXPORT of a region sliced from
// stage-templates.js — a stub is handed in only where the mock seam above says so.
const brakeRegions = (mut, autonomy) => {
  const sm = evalRegion('status', {}, mut)
  const rt = evalRegion('route', { statusLineOf: sm.statusLineOf, hasIntegrity: sm.hasIntegrity, args: {} }, mut)
  return {
    sm,
    rt,
    acc: evalRegion('accounting', { args: { autonomy: deep(autonomy || {}) } }, mut),
    tr: evalRegion('transport', {}, mut),
    am: freshAttemptMod(mut),
    bm: freshBindMod(mut),
    gt: evalRegion('gate', { statusOf: sm.statusOf, ok: sm.ok, escalates: sm.escalates, routeOfText: rt.routeOfText }, mut),
  }
}

const runReviewBrake = async (id, mut) => {
  const sc = BRAKE(id)
  const r = brakeRegions(mut, sc.autonomy)
  const impl = scripted(sc.impl), spec = scripted(sc.spec), qual = scripted(sc.qual)
  const logs = [], dispatched = []
  let implRound = 0
  const out = await evalRegion('reviewLoop', {
    capReached: r.acc.capReached, ROUNDS_SPENT: r.acc.ROUNDS_SPENT, spendFix: r.acc.spendFix,
    MAX_REDISPATCH: canonValue('MAX_REDISPATCH'),
    attempt: 0, status: null, escalated: null, feedback: [], implAttempt: 1,
    runImplement: async () => impl(implRound++),
    tryAgent: async (label) => {
      dispatched.push(String(label))
      if (String(label).startsWith('spec#')) return spec(roundOf(label))
      if (String(label).startsWith('qual#')) return qual(roundOf(label))
      return 'STATUS: CLEAN (SYNTHETIC fix)'
    },
    isTransport: r.tr.isTransport, statusOf: r.sm.statusOf, ok: r.sm.ok, escalates: r.sm.escalates,
    log: (m) => logs.push(String(m)),
    implRef: (n) => r.am.attemptRef('coder-probe', 'brake-review', EPOCH, n, { epochInPath: false }),
    bindAttempt: r.bm.bindAttempt, attemptRef: r.am.attemptRef, TASK_KEY: 'brake-review', EPOCH,
    seed: r.am.seed, args: {},
    stallRoute: r.rt.stallRoute, routeOfText: r.rt.routeOfText, rulingInputs: r.rt.rulingInputs,
  }, mut)
  return { out, logs, dispatched }
}

const runVerifyBrake = async (id, mut) => {
  const sc = BRAKE(id)
  const r = brakeRegions(mut, sc.autonomy)
  const finalize = scripted(sc.finalize)
  const logs = [], fixes = []
  const out = await evalRegion('verifyIntegritySite', {
    capReached: r.acc.capReached, ROUNDS_SPENT: r.acc.ROUNDS_SPENT, spendFix: r.acc.spendFix,
    attemptRef: r.am.attemptRef, seed: r.am.seed, TASK_KEY: 'brake-verify', EPOCH,
    tryAgent: async (label) => {
      const l = String(label)
      if (l.startsWith('finalize#')) return finalize(roundOf(l))
      fixes.push(l)
      return 'STATUS: CLEAN (SYNTHETIC mechanical fix)'
    },
    FINALIZE_PROMPT: (tag, ref) => `[${tag}] SYNTHETIC finalize -> ${ref.resultPath}`,
    implRef: (n) => r.am.attemptRef('coder-probe', 'brake-verify', EPOCH, n, { epochInPath: false }),
    implAttempt: 1, isTransport: r.tr.isTransport, hasIntegrity: r.sm.hasIntegrity, statusOf: r.sm.statusOf,
    ok: r.sm.ok, escalates: r.sm.escalates, log: (m) => logs.push(String(m)), bindAttempt: r.bm.bindAttempt,
    files: 'fixture/src/**', args: {},
    routeOfText: r.rt.routeOfText, stallRoute: r.rt.stallRoute, rulingInputs: r.rt.rulingInputs,
  }, mut)
  return { out, logs, fixes }
}

const runValidateBrake = async (id, mut) => {
  const sc = BRAKE(id)
  const r = brakeRegions(mut, sc.autonomy)
  const grade = scripted(sc.validate)
  const full = scripted(sc.validateFull || ['STATUS: CLEAN (SYNTHETIC full-scope regrade)'])
  const refs = [], fixes = [], logs = []
  const scope = {
    capReached: r.acc.capReached, ROUNDS_SPENT: r.acc.ROUNDS_SPENT, spendFix: r.acc.spendFix,
    attemptRef: r.am.attemptRef, seed: r.am.seed, TASK_KEY: 'brake-validate', EPOCH,
    tryAgent: async (label) => {
      const l = String(label)
      if (l === 'validate-full') return full(0)
      if (l.startsWith('validate#')) return grade(roundOf(l))
      if (l.startsWith('fix-ac#')) { fixes.push(l); return 'STATUS: CLEAN (SYNTHETIC ac fix)' }
      return 'STATUS: CLEAN (SYNTHETIC re-verify)'
    },
    VALIDATE_PROMPT: (tag, only, ref) => { refs.push(ref.resultPath); return `[${tag}] SYNTHETIC validate${only ? ` (only ${only})` : ''} -> ${ref.resultPath}` },
    FINALIZE_PROMPT: (tag, ref) => `[${tag}] SYNTHETIC finalize -> ${ref.resultPath}`,
    bindAttempt: r.bm.bindAttempt,
    implRef: (n) => r.am.attemptRef('coder-probe', 'brake-validate', EPOCH, n, { epochInPath: false }),
    implAttempt: 1, isTransport: r.tr.isTransport, statusOf: r.sm.statusOf, statusLineOf: r.sm.statusLineOf,
    ok: r.sm.ok, escalates: r.sm.escalates, log: (m) => logs.push(String(m)),
    stallRoute: r.rt.stallRoute, routeOfText: r.rt.routeOfText, rulingInputs: r.rt.rulingInputs,
    hasIntegrity: r.sm.hasIntegrity, gate: r.gt.gate, vRound: 0, files: 'fixture/src/**', args: {},
  }
  try {
    return { out: await evalRegion('validateLoop', scope, mut), refs, fixes, logs }
  } catch (e) {
    // a reserved-path collision is the canonical attemptRef refusing, not a harness failure: report it
    if (!/^INTEGRITY: attempt path collision/.test(String(e && e.message))) throw e
    return { out: null, collision: true, refs, fixes, logs, message: String(e.message) }
  }
}
// the reserved refs ride in the outcome: distinct-ref count is half of what the :860 fix claims
const validateBrakeLine = (g) => (g.collision ? 'refused-collision'
  : `${stopLine(g.out)}|refs=${g.refs.length}/${new Set(g.refs).size}|fixes=${g.fixes.length}`)

const runAgentThrowBrake = async (id, mut) => {
  const sc = BRAKE(id)
  const r = brakeRegions(mut, {})
  const logs = []
  const mod = await evalRegion('tryAgent', {
    agent: async () => { const e = new Error(sc.throw.message); e.name = sc.throw.name; throw e },
    log: (m) => logs.push(String(m)),
  }, mut)
  const text = await mod.tryAgent(sc.label, 'SYNTHETIC prompt', { label: sc.label })
  return { text, logs, status: r.sm.statusOf(text), transport: r.tr.isTransport(text), route: r.rt.routeOfText(text) }
}
// a transport text is caught by isTransport before any routing, so reporting a route for it would claim
// something the script never asks
const agentThrowLine = (g) => (g.transport ? `${g.status}|transport` : `${g.status}|route=${g.route.route}|gate=${g.route.gate || '-'}`)

test('d7: review stall — same failedFindings two rounds stops before the cap', async () => {
  const g = await runReviewBrake('R1-review-stall-same-signature')
  const v = g.out
  assert.equal(v.stage, 'review')
  assert.equal(v.status, 'errors_remaining')
  assert.match(String(v.note), /^no progress/)
  assert.equal(v.detail, 'spec:AC-1 core/spec-a.ts', 'the stop carries the signature it saw twice')
  assert.equal(v.route, 'triage')
  assert.equal(v.trigger, 'stall')
  assert.equal(v.assessor, 'team-investigator')
  assert.equal(v.attempts, 1)
  assert.ok(v.attempts + 1 < canonValue('MAX_REDISPATCH'), 'the brake must stop with rounds still left, not at the cap')
  assert.ok(g.logs.some((l) => /identical failedFindings/.test(l)), 'the stall must log what it saw')
  assert.deepEqual(g.dispatched, ['spec#1', 'spec#2'], 'the second identical spec verdict ends the loop — no third round')
})

test('d7: review stall — differing signature continues; empty or absent line never trips', async () => {
  const diff = await runReviewBrake('R2-review-differing-signature')
  assert.equal(stopLine(diff.out), 'no-stop', 'a changing signature is progress — the loop reaches its clean exit')
  assert.equal(diff.out.lastReview, 'spec:AC-2 core/spec-b.ts')
  assert.equal(diff.out.reviewSig('spec', 'STATUS: ERRORS_REMAINING\nfailedFindings:  AC-9 core/x.ts  '), 'spec:AC-9 core/x.ts',
    'the signature is normalized by trim only, and carries its stage')
  const quiet = await runReviewBrake('R3-review-absent-signature')
  assert.equal(stopLine(quiet.out), 'no-stop', 'a missing signal is not evidence of a repeat')
  assert.equal(quiet.out.lastReview, '')
  assert.equal(quiet.out.reviewSig('spec', 'STATUS: ERRORS_REMAINING (no list emitted)'), '')
  assert.equal(quiet.out.reviewSig('qual', 'STATUS: ERRORS_REMAINING\nfailedFindings:'), '')
  assert.equal(quiet.out.reviewStall('spec', 'STATUS: ERRORS_REMAINING\nfailedFindings:'), null)
  assert.equal(quiet.out.reviewStall('spec', 'STATUS: ERRORS_REMAINING\nfailedFindings:'), null,
    'two empty lists running are still two missing signals')
})

test('d7: verify stall — identical failedGates two rounds stops before the cap', async () => {
  const g = await runVerifyBrake('V1-verify-stall-same-gates')
  const v = g.out
  assert.equal(v.stage, 'finalize')
  assert.equal(v.status, 'errors_remaining')
  assert.match(String(v.note), /^no progress/)
  assert.equal(v.detail, 'failedGates: lint core/a.ts')
  assert.equal(v.route, 'triage')
  assert.equal(v.trigger, 'stall')
  assert.equal(v.assessor, 'team-investigator')
  assert.deepEqual(g.fixes, ['fix-mech#1'], 'exactly one fix round separated the two identical verdicts')
})

test('d7: validate stall — identical failedACs two rounds stops before the cap', async () => {
  const g = await runValidateBrake('A1-validate-stall-same-acs')
  const v = g.out
  assert.equal(v.stage, 'validate')
  assert.equal(v.status, 'errors_remaining')
  assert.match(String(v.note), /^no progress/)
  assert.equal(v.detail, 'AC-1 core/a.ts')
  assert.equal(v.route, 'triage')
  assert.equal(v.trigger, 'stall')
  assert.equal(v.assessor, 'team-investigator')
  assert.deepEqual(g.fixes, ['fix-ac#1'])
  assert.equal(new Set(g.refs).size, g.refs.length, 'every reserved validation record is distinct')
})

test('d7: validate :860 — regression after full-scope regrade is fixed, then stalls; every validation ref distinct', async () => {
  const g = await runValidateBrake('A2-validate-860-regression')
  const v = g.out
  assert.equal(v.stage, 'validate')
  assert.equal(v.status, 'errors_remaining')
  assert.match(String(v.note), /^no progress/)
  assert.equal(v.detail, 'AC-2 core/b.ts',
    'the full-scope regression is THIS round-s verdict, so the next identical grade is recognised as a repeat')
  assert.equal(v.route, 'triage')
  assert.equal(v.trigger, 'stall')
  assert.deepEqual(g.fixes, ['fix-ac#1', 'fix-ac#2'])
  assert.equal(g.refs.length, 4, 'validate#1, validate#2, validate-full, validate#3')
  assert.equal(new Set(g.refs).size, g.refs.length, 'a reserved validation record was entered twice')
  assert.deepEqual(g.refs.map((p) => p.replace(/^.*\//, '')),
    ['validation-1.md', 'validation-2.md', 'validation-3.md', 'validation-4.md'],
    'after a full-scope regrade every later round skips the number that regrade consumed')
})

test('d7: stall on the final round routes human round-cap', async () => {
  const r = brakeRegions(undefined, {})
  assert.deepEqual(r.rt.stallRoute(0), { route: 'human', gate: 'round-cap' })
  assert.deepEqual(r.rt.stallRoute(1), { route: 'triage', trigger: 'stall', assessor: 'team-investigator' })
  const g = await runVerifyBrake('V2-verify-final-round-stall')
  const v = g.out
  assert.equal(v.stage, 'finalize')
  assert.match(String(v.note), /^no progress/, 'it is still the stall stop, reached one round before the cap stop')
  assert.equal(v.detail, 'failedGates: lint core/a.ts')
  assert.equal(v.route, 'human')
  assert.equal(v.gate, 'round-cap')
  assert.equal(v.trigger, undefined)
  assert.equal(v.assessor, undefined)
})

test('d7: tryAgent labels the platform agent cap before budget', async () => {
  const named = await runAgentThrowBrake('G1-agent-cap-name-only')
  assert.match(named.text, /^STATUS: BLOCKED \(agent cap reached at validate#1: /)
  assert.equal(named.status, 'blocked')
  assert.deepEqual(named.route, { route: 'human', gate: 'agent-cap' })
  assert.ok(named.logs.some((l) => /agent cap hit/.test(l)))
  const byMessage = await runAgentThrowBrake('G2-agent-cap-message-only')
  assert.deepEqual(byMessage.route, { route: 'human', gate: 'agent-cap' })
  assert.match(byMessage.text, /budget\.remaining\(\)/,
    'the platform ceiling names budget.remaining() in its own message — which is why it is tested first')
  const budget = await runAgentThrowBrake('G3-budget-throw')
  assert.match(budget.text, /^STATUS: BLOCKED \(budget exhausted at validate#1: /)
  assert.deepEqual(budget.route, { route: 'human', gate: 'budget' })
  const other = await runAgentThrowBrake('G4-other-throw')
  assert.equal(other.transport, true)
  assert.equal(other.status, 'errors')
  assert.equal(/agent cap reached|budget exhausted/.test(other.text), false, 'neither label claims a residual throw')
})

// the d7 brake helpers this suite EXECUTES from canonical bytes. scanned STRICTLY (a declaration anywhere —
// line start, inline, object literal, or inside a JSON string) so a harness that quietly re-types the
// signature compare instead of slicing it is caught. planted text is built from the name, so this file
// never carries a literal declaration of its own.
const D7_BRAKE_HELPERS = ['reviewSig', 'reviewStall']
test('counterfeit guard: no review-signature helper is declared in a test or fixture file', () => {
  for (const [file, src] of Object.entries(SCANNED)) {
    const offenders = D7_BRAKE_HELPERS.filter((n) => strictDecl(n).some((re) => re.test(src)))
    assert.deepEqual(offenders, [], `${file} declares instead of executing: ${offenders.join(',')}`)
  }
  for (const n of D7_BRAKE_HELPERS) {
    assert.ok(regionText('reviewLoop').includes(declPrefix(n)), `${n} is not declared in the canonical review loop`)
    for (const plant of [`\nconst ${n} = (stage, t) => ''`, `  function ${n}(stage, t) { return '' }`,
      `{ "x": "let ${n} = null" }`, `const mod = { ${n}: (stage, t) => '' }`])
      assert.ok(strictDecl(n).some((re) => re.test(plant)), `the scan missed ${JSON.stringify(plant)}`)
    assert.deepEqual(strictDecl(n).filter((re) => re.test(`const mod = { ${n}: rl.${n} }`)), [],
      'passing a canonical export through a scope object is not a re-type')
  }
})

// ---------------------------------------------------------------------------------------------
// 20. d5 route tag + ruling carrier — every stop the script returns names its own route, the route
// helper classifies the collision shapes an INTEGRITY marker line misses, the review returns keep
// their original keys, and the carrier adds nothing to any prompt while no ruling is recorded.
//
// Same discipline as sections 18-19. The one new move is the carrier comparison: it slices the SAME
// region out of a SECOND snapshot of the canonical file — the t0 commit's copy, read with `git show`
// — and renders both sides with identical inputs, so any difference in rendered prompt bytes can
// only come from a difference in the file's own bytes. Nothing here re-implements a helper.
// ---------------------------------------------------------------------------------------------

const ROUTE_TEXT = (id) => {
  const t = CASES.routes.texts[id]
  assert.ok(t, `fixture route text ${id} not found`)
  return t
}
const routeOf = (id, mut) => routeFields(brakeRegions(mut, {}).rt.routeOfText(sess(ROUTE_TEXT(id).text)))

// drives one INTEGRITY-checking site and hands back the STOP OBJECT (runIntegritySite classifies it
// instead; these assertions read the route fields, so they need the return itself).
const runSiteStop = async (region, text, mut) => {
  const r = brakeRegions(mut, {})
  return evalRegion(region, {
    tryAgent: async (label) => (/^fix-/.test(String(label)) ? 'STATUS: CLEAN (SYNTHETIC fix)' : sess(text)),
    FINALIZE_PROMPT: (tag, ref) => `[${tag}] SYNTHETIC finalize -> ${ref.resultPath}`,
    attemptRef: r.am.attemptRef, seed: r.am.seed, TASK_KEY: 'route-site', EPOCH, vRound: 0, aRound: 1,
    implRef: (n) => r.am.attemptRef('coder-probe', 'route-site', EPOCH, n, { epochInPath: false }),
    implAttempt: 1, isTransport: r.tr.isTransport, hasIntegrity: r.sm.hasIntegrity,
  }, mut)
}

// one runner per stop site the script can return. each REACHES its site through canonical regions and
// returns the stop the script itself built; no stop is constructed here.
const paidSiteScope = (r, extra) => ({ statusOf: r.sm.statusOf, ok: r.sm.ok, log: () => {}, humanRoute: r.rt.humanRoute, ...extra })
const SITE_RUNNERS = {
  capReached: async (mut) => brakeRegions(mut, {}).acc.capReached('review', 3, 0, 3),
  spendFix: async (mut) => {
    const acc = evalRegion('accounting', { args: { autonomy: { globalFixCeiling: 1 } } }, mut)
    acc.spendFix('fix-mech#1')
    return acc.spendFix('fix-mech#2')
  },
  'gate-blocked': async (mut) => brakeRegions(mut, {}).gt.gate('finish', sess(ROUTE_TEXT('Z6-route-plain-blocked').text)),
  'gate-errors': async (mut) => brakeRegions(mut, {}).gt.gate('finish', 'STATUS: ERRORS_REMAINING (SYNTHETIC finisher)'),
  'review-stall': async (mut) => (await runReviewBrake('R1-review-stall-same-signature', mut)).out,
  'review-escalation': async (mut) => (await runReviewBrake('R4-review-impl-blocked', mut)).out,
  'review-needs-context': async (mut) => (await runReviewBrake('R5-review-spec-needs-context', mut)).out,
  'review-integrity': async (mut) => (await runReviewBrake('R6-review-qual-integrity', mut)).out,
  'review-cap': async (mut) => (await runReviewBrake('R7-review-cap-at-end', mut)).out,
  'verify-integrity': async (mut) => (await runVerifyBrake('V3-verify-integrity-finding', mut)).out,
  'verify-blocked': async (mut) => (await runVerifyBrake('V4-verify-blocked-plain', mut)).out,
  'verify-stall': async (mut) => (await runVerifyBrake('V1-verify-stall-same-gates', mut)).out,
  'validate-blocked': async (mut) => (await runValidateBrake('A3-validate-blocked', mut)).out,
  'validate-stall': async (mut) => (await runValidateBrake('A1-validate-stall-same-acs', mut)).out,
  'reverify-integrity': async (mut) => runSiteStop('reverifyIntegritySite', CASE('I1c-lying-clean-finding-control').input.text, mut),
  'parked-nhe': async (mut) => evalRegion('parkedGate', {
    parked: new Set(['AC-12 rendered-UI evidence — NEEDS_HUMAN_EVIDENCE']), humanRoute: brakeRegions(mut, {}).rt.humanRoute }, mut),
  'preflight-blocked': async (mut) => evalRegion('preflightGate',
    paidSiteScope(brakeRegions(mut, {}), { pre: 'STATUS: BLOCKED (the queue worker is down — do not spend)' }), mut),
  'preflight-errors': async (mut) => evalRegion('preflightGate',
    paidSiteScope(brakeRegions(mut, {}), { pre: 'STATUS: ERRORS_REMAINING (SYNTHETIC: one precondition assertion failed)' }), mut),
  'calibrate-gate': async (mut) => evalRegion('calibrateGate',
    { args: {}, log: () => {}, humanRoute: brakeRegions(mut, {}).rt.humanRoute }, mut),
  'calibrate-result-blocked': async (mut) => evalRegion('calibrateResult',
    paidSiteScope(brakeRegions(mut, {}), { calib: 'STATUS: BLOCKED (the vendor cost field came back null)' }), mut),
  'calibrate-result-errors': async (mut) => evalRegion('calibrateResult',
    paidSiteScope(brakeRegions(mut, {}), { calib: 'STATUS: ERRORS_REMAINING (SYNTHETIC: rehearsal not clean)' }), mut),
  'measure-integrity': async (mut) => (await runMeasureLane('M6-integrity-stop', mut)).out,
  // the measurement lane's two gate stops. both gate on whether the stage's RECORD was produced — the
  // compose one before anything is exercised, the disposition one after every journey already was.
  'compose-gate': async (mut) => (await runMeasureLane('M8-compose-blocked', mut)).out,
  'disposition-gate': async (mut) => (await runMeasureLane('M9-disposition-blocked', mut)).out,
  // reached through the canonical gate helper like the two 'finish' rows, not by driving a lane. it has a
  // row at all because the canon sweep below asked for one: gate('grade') is a real stop site that the
  // fixture-to-runner exhaustiveness had no way to notice was undeclared.
  'grade-gate': async (mut) => brakeRegions(mut, {}).gt.gate('grade', sess(ROUTE_TEXT('Z6-route-plain-blocked').text)),
}

test('d5: routeOfText — INTEGRITY, reserved-terminal collision, agent cap, budget, NEEDS_CONTEXT, plain BLOCKED', () => {
  const ids = Object.keys(CASES.routes.texts)
  assert.ok(ids.length >= 8, `only ${ids.length} route texts — the collision shapes are not all covered`)
  for (const id of ids) assert.equal(routeOf(id), ROUTE_TEXT(id).expect, `${id}: ${ROUTE_TEXT(id).claim}`)
  const rt = brakeRegions(undefined, {}).rt
  // the three collision/marker shapes are integrity however the report spells them
  for (const id of ['Z3-route-collision-integrity-word', 'Z4-route-marker-on-status-line', 'Z5-route-collision-not-located', 'Z8-route-marker-line'])
    assert.deepEqual(rt.routeOfText(sess(ROUTE_TEXT(id).text)), { route: 'human', gate: 'integrity' }, id)
  // the control: an ordinary BLOCKED report stays a triage trigger and names no assessor
  assert.deepEqual(rt.routeOfText(sess(ROUTE_TEXT('Z6-route-plain-blocked').text)),
    { route: 'triage', trigger: 'blocked', assessor: null })
  assert.equal(rt.ASSESSOR.blocked, null, 'the orchestrator picks the assessor for a plain blocked report from the report itself')
  assert.equal(rt.ASSESSOR['needs-context'], 'team-researcher')
  assert.equal(rt.ASSESSOR.stall, 'team-investigator')
})

test('d5: every stop site carries its route', async () => {
  const seen = []
  for (const site of CASES.routes.sites) {
    const run = SITE_RUNNERS[site.id]
    assert.ok(run, `no runner for stop site ${site.id}`)
    const stop = await run()
    assert.equal(stop.stage, site.stage, `${site.id}: stage`)
    assert.equal(stop.status, site.status, `${site.id}: status`)
    assert.equal(routeFields(stop), site.expect, `${site.id}: ${site.claim}`)
    seen.push(site.id)
  }
  assert.deepEqual(seen.slice().sort(), Object.keys(SITE_RUNNERS).sort(),
    'every declared site is run and every runner is declared in the fixture')
  // the vocabulary is closed: canonical source may use a SUBSET of the ratified set, never a value outside it
  const vocab = CASES.routes.vocab
  const used = [...new Set((CANON.match(/humanRoute\('[a-z-]+'\)/g) || []).map((s) => s.slice("humanRoute('".length, -2)))]
  assert.ok(used.length > 0, 'canonical source names no human gate at all')
  assert.deepEqual(used.filter((g) => !vocab.gate.includes(g)), [], 'a human gate outside the ratified closed set')
  assert.deepEqual(Object.keys(brakeRegions(undefined, {}).rt.ASSESSOR).sort(), vocab.trigger.slice().sort())
})

// the exhaustiveness above runs between the FIXTURE and the RUNNERS and reaches the canonical file
// NOWHERE. Both sides are written by the same hand at the same time, so a stop stage-templates.js can
// return that neither knows about is invisible to it — which is precisely how the measurement lane shipped
// three stop sites with no row. This narrows that for the one stop class a scan can enumerate honestly: the
// LITERAL gate() call sites. What the scan still cannot reach is recorded in the fixture as data a reviewer
// can argue with, never left implied.
test('d5: every literal gate() call site in canonical source has a declared stop site', () => {
  const reach = CASES.routes.canonReach
  const code = CANON_LINES.filter((l) => !/^\s*\/\//.test(l)).join('\n')
  const stages = [...new Set((code.match(/\bgate\('[a-z-]+'/g) || []).map((s) => s.slice("gate('".length, -1)))].sort()
  assert.ok(stages.length >= reach.minGateSites,
    `the sweep found only ${stages.length} gate call sites — it has stopped describing the file it guards`)
  const declared = new Set(CASES.routes.sites.map((s) => s.stage))
  const exempt = new Map(reach.gateStagesNotDeclared.map((e) => [e.stage, e.why]))
  assert.deepEqual(stages.filter((s) => !declared.has(s) && !exempt.has(s)), [],
    'canonical gate() stops with NO declared stop site — add a row to routes.sites with a runner, or name the ' +
    'stage in routes.canonReach.gateStagesNotDeclared with a reason. An undeclared gate site is a stop nobody ' +
    'ever asserted carries its route.')
  for (const [s, why] of exempt) {
    assert.ok(stages.includes(s), `${s} is exempted from a gate site the file no longer has — a stale exemption shrinks the checked set`)
    assert.ok(why.length > 40, `the exemption for ${s} carries no reason a reviewer can argue with`)
  }
  // the disclosed hole, asserted LIVE so the disclosure cannot rot into a paragraph about a file that moved:
  // phaseGate forwards to gate() with a stage its CALLER picks, which no literal sweep can enumerate.
  assert.ok(CANON.includes(reach.variableStageSite),
    `canonReach.variableStageSite is gone from the canonical file — the limit it discloses is stale: ${reach.variableStageSite}`)
})

test('d5: no untagged stop line survives in stage-templates.js', () => {
  const stopish = /status: ?'(blocked|needs_human_evidence)'|blocked: ?true|note: ?'no progress|round cap|fix ceiling/
  const stops = CANON_LINES.map((l, i) => [i + 1, l]).filter(([, l]) => stopish.test(l) && !/^\s*\/\//.test(l))
  assert.ok(stops.length >= 12, `the sweep matched only ${stops.length} stop lines — it has stopped describing the file it guards`)
  const untagged = stops.filter(([, l]) => !/route|Route\(/.test(l))
  assert.deepEqual(untagged.map(([n, l]) => `${n}: ${l.trim().slice(0, 100)}`), [],
    'these stop returns carry no route tag — an untagged stop reads as human and narrows autonomy silently')
})

test('d5: review returns — BLOCKED carries status, detail tail and route; cap-at-end carries note + round-cap; reviewer INTEGRITY → integrity; original keys kept', async () => {
  const esc = (await runReviewBrake('R4-review-impl-blocked')).out
  assert.equal(esc.stage, 'review')
  assert.equal(esc.status, 'blocked')
  assert.equal(esc.blocked, true, 'original key')
  assert.deepEqual(esc.feedback, [], 'original key')
  assert.equal(esc.escalated.at, 'impl#1', 'original key')
  assert.equal(esc.detail, 'STATUS: BLOCKED (plan contradicts AC-4)',
    'the stop carries the ESCALATING stage-s own text, never the loop summary')
  assert.equal(esc.route, 'triage')
  assert.equal(esc.trigger, 'blocked')
  assert.equal(esc.assessor, null)
  const nc = (await runReviewBrake('R5-review-spec-needs-context')).out
  assert.equal(nc.escalated.at, 'spec#1')
  assert.match(String(nc.detail), /NEEDS_CONTEXT/, 'the reviewer-s own text, not the implement text')
  assert.equal(nc.trigger, 'needs-context')
  assert.equal(nc.assessor, 'team-researcher')
  const integ = (await runReviewBrake('R6-review-qual-integrity')).out
  assert.equal(integ.escalated.at, 'qual#1')
  assert.deepEqual([integ.route, integ.gate], ['human', 'integrity'],
    'the review loop runs no integrity check of its own, so the tag can only come from the reviewer text')
  assert.equal(integ.trigger, undefined, 'a kept gate carries no triage trigger')
  const cap = (await runReviewBrake('R7-review-cap-at-end')).out
  assert.equal(cap.stage, 'review')
  assert.equal(cap.status, 'errors_remaining')
  assert.equal(cap.blocked, true, 'original key')
  assert.match(String(cap.note), new RegExp(`^review round cap ${canonValue('MAX_REDISPATCH')} reached \\(8 seeded from build-state \\+ 2 this segment\\)`))
  assert.equal(cap.route, 'human')
  assert.equal(cap.gate, 'round-cap')
  assert.equal(cap.feedback.length, 2, 'both rounds of feedback still reach the human')
})

// ---- the carrier comparison: the seven builders, rendered from two snapshots of the canonical file

const ST_REL = CASES.canonicalSource.path
const T0_SRC = execFileSync('git', ['show', `${CASES.carrier.t0}:${ST_REL}`],
  { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

// regionText's anchor discipline applied to ANY snapshot of the canonical file. `only` narrows the
// exports when a probe needs a loop DRIVEN rather than read: an older snapshot cannot export names it
// never declared, and the prompts are captured at the dispatch seam anyway.
const regionOfSnapshot = (src, name) => {
  const spec = CASES.regions[name]
  assert.ok(spec, `unknown region ${name}`)
  const lines = src.split('\n')
  const starts = lines.reduce((a, l, i) => (l.includes(spec.startAnchor) ? a.concat(i) : a), [])
  assert.equal(starts.length, 1, `region ${name}: start anchor must occur exactly once in this snapshot, found ${starts.length}`)
  const e = lines.findIndex((l, i) => i > starts[0] && l.includes(spec.endAnchor))
  assert.ok(e > starts[0], `region ${name}: end anchor not found in this snapshot`)
  const text = lines.slice(starts[0], e).join('\n')
  assert.ok(text.trim().length > 0 && src.includes(text), `region ${name} is not a contiguous, non-empty slice of this snapshot`)
  return text
}
const evalSnapshot = (src, name, scope, only) => {
  const spec = CASES.regions[name]
  const body = `${regionOfSnapshot(src, name)}\nreturn { ${(only || spec.exports).join(', ')} }`
  return new (spec.async ? AsyncFunction : Function)(...spec.scope, body)(...spec.scope.map((k) => scope[k]))
}
const constOfSnapshot = (src, n) => {
  const line = src.split('\n').find((l) => l.startsWith(declPrefix(n)))
  assert.ok(line, `canonical constant ${n} not found in this snapshot`)
  return Number(line.slice(declPrefix(n).length))
}
// word-level drift between two renders of the same prompt. runs of fewer than HUNK_GAP common tokens
// between two changes stay INSIDE one hunk, so an insertion whose words incidentally align with the prose
// around it reads as one change instead of confetti. each hunk keeps BOTH sides — `before` is what t0
// rendered there, `after` what the tree renders now — which is the only way a REORDER (a deletion plus an
// insertion of the same bytes) can be told apart from a fresh insertion. a single-span helper cannot: it
// was written when the only expected drift was one contiguous insertion.
const HUNK_GAP = 6
const wordsOf = (s) => s.split(/(\s+)/).filter((x) => x !== '')
const changeHunks = (a, b) => {
  const x = wordsOf(a), y = wordsOf(b)
  const w = y.length + 1
  const dp = new Uint32Array((x.length + 1) * w)
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      dp[i * w + j] = x[i] === y[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
  const ops = []
  let i = 0, j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { ops.push({ k: '=', t: x[i] }); i++; j++ }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ k: '-', t: x[i] }); i++ }
    else { ops.push({ k: '+', t: y[j] }); j++ }
  }
  while (i < x.length) { ops.push({ k: '-', t: x[i] }); i++ }
  while (j < y.length) { ops.push({ k: '+', t: y[j] }); j++ }
  const changed = ops.map((o) => o.k !== '=')
  const hunks = []
  for (let s = 0; s < ops.length; s++) {
    if (!changed[s]) continue
    let e = s, gap = 0
    for (let p = s + 1; p < ops.length && gap < HUNK_GAP; p++) {
      if (changed[p]) { e = p; gap = 0 } else gap++
    }
    const span = ops.slice(s, e + 1)
    hunks.push({
      before: span.filter((o) => o.k !== '+').map((o) => o.t).join(''),
      after: span.filter((o) => o.k !== '-').map((o) => o.t).join(''),
    })
    s = e
  }
  return hunks
}

// a hunk is attributable only to a change DECLARED in cases.json for this builder. `insertion`: the marker
// arrived here — absent from the before side, present after. `move`: a reorder lands as TWO hunks, one
// where the old phrasing left and one where the new arrived, so it matches either side. the list name the
// reorder was ABOUT (`failedGates:`) is the unchanged anchor between those hunks and matches neither.
const DECLARED = CASES.carrier.declaredChanges
const attributions = (key, h) => DECLARED.filter((d) => d.builders.includes(key) && (d.kind === 'move'
  ? h.before.includes(d.from) || h.after.includes(d.to)
  : h.after.includes(d.marker) && !h.before.includes(d.marker)))

// renders all SEVEN prompt builders from one snapshot with FIXED inputs. the three that live inside a
// loop are captured by driving that loop just far enough to dispatch them. each render step gets its
// OWN attemptRef module, so a step never trips the canonical collision refusal on a path an earlier
// step already reserved.
const renderBuilders = async (src, rulings, extraArgs) => {
  const sm = evalSnapshot(src, 'status', {})
  const args = { deps: [], inputs: [sess('<SESSION>research/a.md')], contracts: [sess('<SESSION>definition-of-done.md')],
    contract: sess('<SESSION>definition-of-done.md') }
  if (rulings) args.rulings = deep(rulings)
  // an extra args channel for the invariance comparison below. absent by default, so every existing caller
  // -- the t0 attribution and the ruling probe -- renders exactly the bytes it did before.
  if (extraArgs) Object.assign(args, deep(extraArgs))
  // a snapshot older than the route block has no carrier at all — the builders there reference none
  const hasRoute = src.split('\n').filter((l) => l.includes(CASES.regions.route.startAnchor)).length === 1
  const rt = hasRoute ? evalSnapshot(src, 'route', { statusLineOf: sm.statusLineOf, hasIntegrity: sm.hasIntegrity, args }) : null
  const bm = evalSnapshot(src, 'bindAttempt', {})
  const acc = evalSnapshot(src, 'accounting', { args: { autonomy: {} } })
  const tr = evalSnapshot(src, 'transport', {})
  const gt = evalSnapshot(src, 'gate', { statusOf: sm.statusOf, ok: sm.ok, escalates: sm.escalates, routeOfText: rt ? rt.routeOfText : undefined })
  const TASK = 'carrier-probe'
  const withAm = (extra) => {
    const am = evalSnapshot(src, 'attemptRef', { SESSION, args: { session: SESSION, epoch: EPOCH, attempts: {} } })
    return { am, scope: {
      attemptRef: am.attemptRef, seed: am.seed, bindAttempt: bm.bindAttempt, TASK_KEY: TASK, EPOCH,
      implRef: (n) => am.attemptRef('coder-probe', TASK, EPOCH, n, { epochInPath: false }), implAttempt: 1,
      capReached: acc.capReached, ROUNDS_SPENT: acc.ROUNDS_SPENT, spendFix: acc.spendFix,
      isTransport: tr.isTransport, statusOf: sm.statusOf, statusLineOf: sm.statusLineOf, ok: sm.ok,
      escalates: sm.escalates, hasIntegrity: sm.hasIntegrity, gate: gt.gate, log: () => {},
      args, files: 'fixture/src/**', vRound: 0,
      rulingInputs: rt ? rt.rulingInputs : undefined,
      stallRoute: rt ? rt.stallRoute : undefined, routeOfText: rt ? rt.routeOfText : undefined,
      ...extra,
    } }
  }
  const out = {}
  const im = withAm({ name: 'probe', task: 'the fixture task', context: 'SYNTHETIC context. ',
    tryAgent: async (label, p) => { out.impl = p; return 'STATUS: CLEAN (SYNTHETIC implement)' } })
  await evalSnapshot(src, 'implement', im.scope).runImplement('', 1)

  const fp = withAm({})
  const fm = evalSnapshot(src, 'finalizePrompt', { bindAttempt: bm.bindAttempt, rulingInputs: fp.scope.rulingInputs, args })
  out.finalize = fm.FINALIZE_PROMPT('initial', fp.am.attemptRef('verifier', TASK, EPOCH, 1, { artifact: 'results' }),
    [fp.scope.implRef(1).resultPath])

  const vp = withAm({})
  const vm = evalSnapshot(src, 'validatePrompt', { bindAttempt: bm.bindAttempt, rulingInputs: vp.scope.rulingInputs, args })
  out.validate = vm.VALIDATE_PROMPT('initial', null, vp.am.attemptRef('verifier', TASK, EPOCH, 1, { artifact: 'validation' }),
    [args.contract, vp.scope.implRef(1).resultPath])

  // spec + qual: one review round, both reviewers clean, so the loop breaks on its own
  const rv = withAm({ attempt: 0, status: null, escalated: null, feedback: [],
    MAX_REDISPATCH: constOfSnapshot(src, 'MAX_REDISPATCH'),
    runImplement: async () => 'STATUS: CLEAN (SYNTHETIC implement)',
    tryAgent: async (label, p) => {
      const l = String(label)
      if (l.startsWith('spec#')) { out.spec = p; return 'STATUS: CLEAN (SYNTHETIC spec review)' }
      if (l.startsWith('qual#')) { out.qual = p; return 'STATUS: CLEAN (SYNTHETIC quality review)' }
      return 'STATUS: CLEAN (SYNTHETIC)'
    } })
  await evalSnapshot(src, 'reviewLoop', rv.scope, [])

  // fix-mech: one failing verify round, then clean — exactly one mechanical fix is dispatched
  const vf = withAm({ FINALIZE_PROMPT: fm.FINALIZE_PROMPT,
    tryAgent: async (label, p) => {
      const l = String(label)
      if (l.startsWith('fix-mech#')) { out['fix-mech'] = p; return 'STATUS: CLEAN (SYNTHETIC mechanical fix)' }
      return roundOf(l) === 0 ? 'STATUS: ERRORS_REMAINING (SYNTHETIC verifier)\nfailedGates: lint core/a.ts'
        : 'STATUS: CLEAN (SYNTHETIC verifier)'
    } })
  await evalSnapshot(src, 'verifyIntegritySite', vf.scope, [])

  // fix-ac: one failing grade, one AC fix, then a clean round and its full-scope regrade
  const va = withAm({ VALIDATE_PROMPT: vm.VALIDATE_PROMPT, FINALIZE_PROMPT: fm.FINALIZE_PROMPT,
    tryAgent: async (label, p) => {
      const l = String(label)
      if (l.startsWith('fix-ac#')) { out['fix-ac'] = p; return 'STATUS: CLEAN (SYNTHETIC ac fix)' }
      if (l.startsWith('validate#')) return roundOf(l) === 0
        ? 'STATUS: ERRORS_REMAINING (SYNTHETIC grade)\nfailedACs: AC-1 core/a.ts' : 'STATUS: CLEAN (SYNTHETIC grade)'
      return 'STATUS: CLEAN (SYNTHETIC)'
    } })
  await evalSnapshot(src, 'validateLoop', va.scope, [])
  return out
}

const CARRIER_BUILDERS = ['impl', 'spec', 'qual', 'finalize', 'fix-mech', 'validate', 'fix-ac']

// the FINISH dispatch, rendered from canonical bytes the way the seven builders are — and deliberately NOT
// one of them. At t0 this stage was an UNBOUND tryAgent call, so there is no t0 render of a bound finish
// prompt for the attribution above to compare against; the test below states that as an executable limit and
// pins the body instead. The reserved attempt is MINTED here rather than mocked — `seed('finish') + 1` really
// runs — so the ref this returns is the exact write-once path a cache-missing replay re-mints onto. Each call
// builds its OWN attemptRef module, so repeated renders never trip the canonical collision refusal.
const FINISH = CASES.finish
const renderFinish = async (extraArgs, mut) => {
  const am = freshAttemptMod(mut), bm = freshBindMod(mut)
  const sm = evalRegion('status', {}, mut)
  const gt = evalRegion('gate', { statusOf: sm.statusOf, ok: sm.ok, escalates: sm.escalates, routeOfText: undefined }, mut)
  const args = Object.assign({ deps: [] }, extraArgs ? deep(extraArgs) : {})
  let body = null, bound = null
  const out = await evalRegion('finishSite', {
    attemptRef: am.attemptRef, seed: am.seed, TASK_KEY: 'carrier-probe', EPOCH,
    implRef: (n) => am.attemptRef('coder-probe', 'carrier-probe', EPOCH, n, { epochInPath: false }), implAttempt: 1,
    // the same pass-through seam the measurement lane uses: the canonical carrier still renders, and the
    // wrapper only keeps the BODY the dispatch authored (what the pin freezes) beside the BOUND form (what
    // the dependency channel moves). One is worthless as a proxy for the other, which is why both are kept.
    bindAttempt: (p, ref, inputs, deps) => { body = String(p); return (bound = String(bm.bindAttempt(p, ref, inputs, deps))) },
    tryAgent: async () => 'STATUS: CLEAN (SYNTHETIC finisher)',
    gate: gt.gate, args,
  }, mut)
  assert.ok(!out.finishGate, 'a CLEAN finisher gated the run — this render never reached the prompt it claims to measure')
  return { body, bound, ref: out.finishRef }
}

test('d5: ruling carrier — every byte of drift vs the t0 snapshot is a DECLARED, carrier-free change; a recorded ruling reaches only the stage it names; an unknown key throws', async (t) => {
  assert.notEqual(T0_SRC, CANON, 'the two snapshots are the same bytes — this comparison would be vacuous')
  const t0 = await renderBuilders(T0_SRC)
  const now = await renderBuilders(CANON)
  assert.deepEqual(Object.keys(t0).sort(), CARRIER_BUILDERS.slice().sort(), 'all seven builders rendered from the t0 snapshot')
  assert.deepEqual(Object.keys(now).sort(), CARRIER_BUILDERS.slice().sort(), 'all seven builders rendered from the working tree')
  for (const k of CARRIER_BUILDERS)
    assert.ok(now[k].length > 200 && t0[k].length > 200, `${k}: a prompt this short is not the builder-s output`)
  // the claim this test makes, restated 2026-09-12 when it first failed for the right reason: NOT that
  // these prompts are frozen against a 2026-09-11 snapshot forever — that claim conflated the carrier with
  // every other edit to the file, and died the first time a legitimate non-carrier edit landed. The claim is
  // ATTRIBUTION. Every hunk of drift must match a DECLARED, carrier-free change; an undeclared hunk still
  // fails, so the freeze survives, it just stops pretending to be about the carrier. Re-pointing t0 at a
  // newer commit is not a fix — the notEqual above is what stops that — and neither is loosening this to a
  // `contains`.
  const seen = new Set()
  for (const k of CARRIER_BUILDERS) {
    for (const h of changeHunks(t0[k], now[k])) {
      t.diagnostic(`${k}: -${h.before.length} +${h.after.length} bytes ${JSON.stringify(h.after.slice(0, 120))}`)
      assert.equal(`${h.before}${h.after}`.includes('(PD-'), false,
        `${k}: a changed span carries carrier bytes while NO ruling is recorded`)
      const hit = attributions(k, h)
      assert.equal(hit.length, 1, `${k}: ${hit.length ? 'AMBIGUOUS' : 'UNDECLARED'} prompt drift vs t0 — ` +
        `declare it in cases.json carrier.declaredChanges with a reason, or revert it. before=` +
        `${JSON.stringify(h.before.slice(0, 160))} after=${JSON.stringify(h.after.slice(0, 160))}`)
      seen.add(`${hit[0].id}@${k}`)
    }
  }
  // and the declarations answer for themselves: the bytes they permit must really ship, must really be new,
  // and must really still happen. a declaration nobody exercises is a standing permit, not a record of one.
  for (const d of DECLARED) {
    const arrived = d.kind === 'move' ? d.to : d.marker
    assert.ok(CANON.includes(arrived),
      `${d.id}: the bytes it permits are nowhere in the canonical file — the allowance describes text that does not ship`)
    for (const k of d.builders) {
      assert.ok(seen.has(`${d.id}@${k}`),
        `${d.id} permits a change to ${k} that no longer happens — a standing permit, not a record of one`)
      assert.equal(t0[k].includes(arrived), false, `${d.id}: ${k} already rendered these bytes at t0 — that is no change`)
      assert.ok(now[k].includes(arrived), `${d.id}: ${k} does not render the bytes it declares`)
      if (d.kind !== 'move') continue
      assert.ok(t0[k].includes(d.from), `${d.id}: the t0 render of ${k} never carried the text this move relocates`)
      assert.equal(now[k].includes(d.from), false, `${d.id}: ${k} still renders the OLD placement — a move that moved nothing`)
    }
  }
  const withRuling = await renderBuilders(CANON, CASES.carrier.ruling)
  for (const k of CARRIER_BUILDERS.filter((x) => x !== 'fix-mech'))
    assert.equal(withRuling[k], now[k], `${k}: a ruling recorded for another stage must not reach this prompt`)
  assert.notEqual(withRuling['fix-mech'], now['fix-mech'], 'the ruling never reached the stage it names')
  assert.ok(withRuling['fix-mech'].includes(sess('<SESSION>build-state.md (PD-7)')),
    'a recorded ruling reaches its stage as an INPUT path the agent reads')
  const rt = brakeRegions(undefined, {}).rt
  assert.deepEqual(rt.rulingInputs(CASES.carrier.unknownStageKey), [],
    'with no ruling recorded at all there is nothing to validate and nothing to add')
  const sm = evalRegion('status', {})
  const hostile = (rulings) => evalRegion('route', { statusLineOf: sm.statusLineOf, hasIntegrity: sm.hasIntegrity, args: { rulings } })
  const unknown = hostile({ [CASES.carrier.unknownStageKey]: [{ id: 'PD-9', path: sess('<SESSION>build-state.md') }] })
  assert.throws(() => unknown.rulingInputs('impl'), (e) => /^INTEGRITY: unknown ruling stage key/.test(e.message),
    `${CASES.carrier.unknownStageKey}: ${CASES.carrier.unknownKeyClaim}`)
  const malformed = hostile({ 'fix-mech': [{ id: 'seven', path: sess('<SESSION>build-state.md') }] })
  assert.throws(() => malformed.rulingInputs('impl'), (e) => /^INTEGRITY: malformed ruling/.test(e.message),
    'an entry without a PD-n id is a ledger defect, never a value to guess past')
  assert.throws(() => hostile({ 'fix-mech': 'PD-7' }).rulingInputs('fix-mech'), (e) => /^INTEGRITY: args.rulings/.test(e.message))
})

// the d5 route + carrier helpers this suite EXECUTES from canonical bytes. scanned STRICTLY (a
// declaration anywhere — line start, inline, object literal, or inside a JSON string) so a harness that
// quietly re-types a route tag instead of slicing it is caught. planted text is built from the name, so
// this file never carries a literal declaration of its own.
const D5_ROUTE_HELPERS = ['triageRoute', 'humanRoute', 'routeOfText', 'stallRoute', 'rulingInputs', 'reviewSig', 'reviewStall']
test('d5: counterfeit guard — no route / carrier / review-signature helper is declared in tests or fixtures', () => {
  for (const [file, src] of Object.entries(SCANNED)) {
    const offenders = D5_ROUTE_HELPERS.filter((n) => strictDecl(n).some((re) => re.test(src)))
    assert.deepEqual(offenders, [], `${file} declares instead of executing: ${offenders.join(',')}`)
  }
  const canonical = `${regionText('route')}\n${regionText('reviewLoop')}`
  for (const n of D5_ROUTE_HELPERS) {
    assert.ok(canonical.includes(declPrefix(n)), `${n} is not declared in the canonical route block or review loop`)
    for (const plant of [`\nconst ${n} = (a) => ({})`, `  function ${n}(a) { return {} }`,
      `{ "x": "let ${n} = null" }`, `const mod = { ${n}: (a) => ({}) }`, `const mod = { ${n}: a => ({}) }`])
      assert.ok(strictDecl(n).some((re) => re.test(plant)), `the scan missed ${JSON.stringify(plant)}`)
    assert.deepEqual(strictDecl(n).filter((re) => re.test(`const mod = { ${n}: rt.${n} }`)), [],
      'passing a canonical export through a scope object is not a re-type')
  }
})

// ---------------------------------------------------------------------------------------------
// 21. the live-surface measurement lane — COMPOSE → MEASURE → DISPOSITION
//
// Same discipline as sections 18-20: the lane is SLICED WHOLE out of the real file by anchor and driven
// with the canonical status / route / gate / accounting / attemptRef / bindAttempt / coverage /
// auditEmpty / retryMissing regions supplied into its scope. Only the dispatch seam this file already
// disclaims is mocked, so every decision below is reached by canonical bytes.
//
// WHAT THIS SECTION PROVES AND WHAT IT DOES NOT — stated plainly, because this is the one lane that
// claims to reach a RUNNING PRODUCT, and the gap is the whole point. These tests assert what the lane
// REQUESTS and how the lane BEHAVES around that request. Nothing here dispatches a measurer, opens a
// browser, calls a CLI, issues an HTTP request or touches any surface: no journey below was ever
// exercised, and every journey text is a fabricated string this file typed. A prompt that asks for no
// verdict is NOT evidence that an agent gave none; a prompt that demands a negative control is NOT
// evidence that one was run. That residual closes in a live run and nowhere else — least of all here.
// ---------------------------------------------------------------------------------------------

const MEASURE = CASES.measure
const MEASURE_SCN = (id) => {
  const s = MEASURE.scenarios[id]
  assert.ok(s, `fixture measurement scenario ${id} not found`)
  return s
}

// drives the lane end to end. TWO instrumented seams, both PASS-THROUGH to the canonical helper:
//   bindAttempt — the canonical helper still renders every prompt; the wrapper only records WHICH input
//     paths each stage DECLARED, and the prompt BODY the lane handed in. Once they are rendered into prose
//     a declared input is indistinguishable from one the prompt merely mentions, and two assertions below
//     are exactly about that difference; the body is what the born-after-t0 digest freeze pins.
//   spendFix — a TRIPWIRE for a call that does not currently happen. It delegates, so a call added later
//     both counts here and really spends, and the post-run ceiling probe sees it.
const runMeasureLane = async (id, mut, extraArgs) => {
  const sc = MEASURE_SCN(id)
  const r = brakeRegions(mut, sc.autonomy)
  const logs = [], dispatched = [], bound = [], fixCharges = [], concerns = [], prompts = {}
  const fired = new Map()
  // one scripted text per DISPATCH of a journey; the last element repeats, so a lane whose cap or
  // fan-out bound was removed stops at its own cap instead of hanging on an exhausted script
  const nextText = (key) => {
    const list = sc.journeys && sc.journeys[key]
    assert.ok(list, `${id}: journey ${key} was dispatched but the scenario scripts no text for it`)
    const n = fired.get(key) || 0
    fired.set(key, n + 1)
    return sess(list[Math.min(n, list.length - 1)])
  }
  const par = async (thunks) => Promise.all(thunks.map((f) => f()))
  const journeyOf = (label) => String(label).slice(String(label).indexOf(':') + 1).split(':')[0]
  const cov = evalRegion('coverage', {}, mut)
  const ae = evalRegion('auditEmpty', { log: (m) => logs.push(String(m)), coverage: cov.coverage, parallel: par,
    tryAgent: async (label) => { dispatched.push(String(label)); return sess(sc.diskAudit || 'STATUS: CLEAN (SYNTHETIC disk audit)') } }, mut)
  const rm = evalRegion('retryMissing', { log: (m) => logs.push(String(m)), parallel: par,
    tryAgent: async (label) => { dispatched.push(String(label)); return nextText(journeyOf(label)) } }, mut)
  const scope = {
    attemptRef: r.am.attemptRef, seed: r.am.seed, EPOCH,
    bindAttempt: (p, ref, inputs, deps) => {
      const rec = { ref, inputs: (inputs || []).slice(), body: String(p) }
      bound.push(rec)
      // the BOUND form is kept alongside the body. `body` is the prompt BEFORE the carrier goes on, so it
      // cannot see a dependency list at all and a channel-invariance comparison against it would be vacuous.
      // the digest pin keeps reading `body`, which is what leaves those three pins untouched by this.
      return (rec.bound = String(r.bm.bindAttempt(p, ref, inputs, deps)))
    },
    tryAgent: async (label, p) => {
      const l = String(label)
      dispatched.push(l)
      prompts[l] = String(p)
      if (l === 'compose') return sess(sc.compose)
      if (l === 'disposition') return sess(sc.disposition || 'STATUS: CLEAN (SYNTHETIC disposition)')
      return nextText(journeyOf(l))
    },
    gate: r.gt.gate, isTransport: r.tr.isTransport, statusOf: r.sm.statusOf, ok: r.sm.ok,
    escalates: r.sm.escalates, hasIntegrity: r.sm.hasIntegrity, isReconstruction: ae.isReconstruction,
    humanRoute: r.rt.humanRoute, capReached: r.acc.capReached, ROUNDS_SPENT: r.acc.ROUNDS_SPENT,
    spendFix: (stage) => { fixCharges.push(String(stage)); return r.acc.spendFix(stage) },
    parallel: par, auditEmpty: ae.auditEmpty, retryMissing: rm.retryMissing, coverage: cov.coverage,
    concerns, log: (m) => logs.push(String(m)), gradeAttempt: sc.gradeAttempt || 1,
    args: Object.assign(deep(sc.args || {}), extraArgs ? deep(extraArgs) : {}),
  }
  const observed = () => {
    const composeBind = bound.find((b) => b.ref.taskId === 'compose')
    const dispoBind = bound.find((b) => b.ref.taskId === 'disposition')
    const measureBinds = bound.filter((b) => b !== composeBind && b !== dispoBind)
    return { prompts, bound, composeBind, dispoBind, measureBinds,
      measureRefs: measureBinds.map((b) => b.ref.resultPath),
      dispatched, logs, concerns, fixCharges, acc: r.acc, am: r.am }
  }
  try {
    return { out: await evalRegion('measureLane', scope, mut), ...observed() }
  } catch (e) {
    // a reserved-path collision is the canonical attemptRef refusing, not a harness failure: report it
    if (!/^INTEGRITY: attempt path collision/.test(String(e && e.message))) throw e
    return { out: null, collision: true, message: String(e.message), ...observed() }
  }
}

// the reserved refs ride in the outcome: a dispatch count above the DISTINCT-ref count is two dispatches
// pointed at one immutable record — the shape the collision registry cannot see (M-measure-attempt-by-round)
const measureLine = (g) => (g.collision ? 'refused-collision'
  : `${stopLine(g.out)}|refs=${g.measureRefs.length}/${new Set(g.measureRefs).size}` +
    `|rounds=${g.out && g.out.mRound != null ? g.out.mRound : '-'}|fixes=${g.fixCharges.length}`)
const measurePromptLine = (g) => {
  const p = g.prompts['measure:checkout'] || ''
  const demanded = MEASURE.verdictDemands.filter((d) => p.includes(d.phrase)).map((d) => d.id)
  const missing = MEASURE.statusRule.filter((s) => !p.includes(s.phrase)).map((s) => s.id)
  return `demands=[${demanded.join(',')}]|rulesMissing=[${missing.join(',')}]`
}
const measureCiteLine = (g) => {
  const declared = g.dispoBind ? g.dispoBind.inputs : []
  const ms = (g.out && g.out.measurements) || []
  const inDeclared = (m) => declared.includes(m.path)
  const cited = ms.filter((m) => m.cited)
  return `declared=${declared.length}|citedIn=${cited.filter(inDeclared).length}/${cited.length}` +
    `|uncitedIn=${ms.filter((m) => !m.cited).filter(inDeclared).length}`
}
const measureFixLine = (g) => `fixes=${g.fixCharges.length}|ceilingIntact=${g.acc.spendFix('probe-after-lane') === null}`
const measureComposeLine = (g) => {
  const ins = g.composeBind ? g.composeBind.inputs : []
  return `approachDeclared=${ins.some((i) => i.includes(MEASURE.approachFile))}|composeInputs=${ins.length}`
}

test('measurement lane: every detector phrase is present in canonical source — no detector can pass vacuously', () => {
  const groups = { verdictDemands: MEASURE.verdictDemands, statusRule: MEASURE.statusRule,
    measureRequires: MEASURE.measureRequires, composeDelta: MEASURE.composeDelta,
    dispositionEvidence: MEASURE.dispositionEvidence }
  for (const [name, rows] of Object.entries(groups)) {
    assert.ok(rows.length >= 4, `${name} carries only ${rows.length} detectors — an emptied list makes every check below vacuous`)
    assert.equal(new Set(rows.map((x) => x.id)).size, rows.length, `${name}: duplicate detector id`)
    for (const row of rows)
      assert.ok(CANON.includes(row.phrase), `${name}: detector absent from stage-templates.js — re-anchor it, never soften it: ${row.phrase}`)
  }
})

test('measurement lane: the measure prompt REQUESTS no verdict about the product, and defines its STATUS line by the MEASUREMENT', async () => {
  const g = await runMeasureLane('M1-three-journeys-one-gated')
  const p = g.prompts['measure:checkout']
  assert.ok(p && p.length > 200, 'no measure prompt was captured at the dispatch seam')
  // WHAT THIS ASSERTION DOES PROVE: the rendered prompt carries NONE of the four judgement DEMANDS that
  // the canonical verdict-asking builders really make, and carries ALL of the clauses that redefine the
  // terminal line as a statement about the measurement. The demand list is harvested VERBATIM from those
  // builders rather than invented here, and the test below re-proves each phrase still ships in the
  // builder it came from — so neither half can quietly rot into a check of nothing.
  // WHAT IT DOES NOT PROVE: that the prompt is exhaustively verdict-free. It is a scan for known demand
  // SHAPES, not a proof of absence over all English — a demand phrased in words nobody has written yet
  // passes it. And it says nothing whatever about whether a measurer OBEYS the prompt: no agent ran.
  // M-measure-verdict-demanded plants a real demand into these bytes to show the scan bites.
  for (const d of MEASURE.verdictDemands)
    assert.equal(p.includes(d.phrase), false, `the measure prompt asks for a verdict (${d.id}): ${d.why}`)
  for (const s of MEASURE.statusRule)
    assert.ok(p.includes(s.phrase), `the measure prompt lost the status-is-about-the-measurement rule (${s.id}) — ${MEASURE.statusRuleWhy}`)
  for (const m of MEASURE.measureRequires)
    assert.ok(p.includes(m.phrase), `the measure prompt dropped a non-negotiable (${m.id})`)
  assert.equal(measurePromptLine(g), 'demands=[]|rulesMissing=[]')
})

test('measurement lane: each verdict demand it refuses is one a canonical builder really makes — the contrast is live on both sides', async () => {
  const now = await renderBuilders(CANON)
  for (const d of MEASURE.verdictDemands) {
    assert.ok(CARRIER_BUILDERS.includes(d.builder), `${d.id} names ${d.builder}, which is not a rendered builder`)
    assert.ok(now[d.builder].includes(d.phrase),
      `${d.id}: the ${d.builder} prompt no longer makes this demand — re-harvest it from that builder or drop the row. ` +
      `A demand nobody makes proves nothing about the measure prompt refusing it.`)
  }
})

test('measurement lane: a measurement round charges its OWN cap and NEVER the global fix ceiling', async () => {
  const g = await runMeasureLane('M3-cap-exhausts')
  assert.equal(stopLine(g.out), 'no-stop', 'an unmeasured journey at the cap is recorded incompleteness, never a run-halting stop')
  assert.equal(g.out.MAX_MEASURE, canonValue('MAX_MEASURE'))
  assert.equal(g.out.mRound, canonValue('MAX_MEASURE'), 'the lane must spend exactly its own cap')
  assert.deepEqual(g.fixCharges, [], 'a measurer is not a coder and fixes nothing — a measurement round must charge no fix dispatch')
  assert.equal(g.acc.spendFix('probe-after-lane'), null,
    'the lane spent from the global ceiling mechanical repair depends on')
  assert.ok(g.concerns.some((c) => c.stage === 'measure' && /unmeasured at the measurement cap: checkout/.test(c.line)))
  assert.ok(g.logs.some((l) => new RegExp(`measure round cap ${canonValue('MAX_MEASURE')} reached`).test(l)),
    'the cap must arrive with its ledger')
  // source-level backstop to the behavioural one above: the lane names spendFix nowhere in its own bytes
  const code = regionText('measureLane').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  assert.equal(/\bspendFix\s*\(/.test(code), false, 'the measurement lane calls spendFix in canonical source')
  const seeded = await runMeasureLane('M3b-cap-seeded-from-build-state')
  assert.equal(seeded.out.mRound, 1, 'a seeded consumed-round count must only REDUCE headroom, here as everywhere')
  assert.deepEqual(seeded.fixCharges, [])
})

test('measurement lane: only a journey declared exactly `autonomous` is dispatched — gated and UNDECLARED both go to the human-gated checklist', async () => {
  const g = await runMeasureLane('M1-three-journeys-one-gated')
  assert.deepEqual(g.out.JOURNEYS.map((j) => j.key), ['checkout', 'deploy', 'search'])
  assert.deepEqual(g.out.gatedJourneys.map((j) => j.key), ['deploy'])
  // the gated journey IS scripted in the fixture, so the only reason it is never measured is the gating —
  // not a missing text the harness would have thrown on
  assert.ok(MEASURE.scenarios['M1-three-journeys-one-gated'].journeys.deploy, 'the gated journey must be scripted for this to mean anything')
  assert.deepEqual(g.dispatched.filter((l) => l.startsWith('measure:')).sort(), ['measure:checkout', 'measure:search'])
  assert.ok(g.concerns.some((c) => /human-gated checklist \(not run here\): deploy/.test(c.line)),
    'a prod-gated journey is never silently dropped — it returns as a checklist item')
  const u = await runMeasureLane('M2-undeclared-side-is-gated')
  assert.deepEqual(u.dispatched.filter((l) => l.startsWith('measure:')), ['measure:checkout'],
    'a blank or unrecognised side is UNDECLARED, not safe — it is never exercised in-workflow')
  assert.deepEqual(u.out.gatedJourneys.map((j) => j.key), ['legacy', 'audit', 'deploy'])
})

test('measurement lane: every dispatch of a journey reserves its OWN terminal — the permitted retry and the later round included', async () => {
  const g = await runMeasureLane('M4-retry-then-second-round')
  assert.equal(g.collision, undefined, g.message || '')
  assert.equal(g.measureRefs.length, 3, 'initial, permitted retry, second round')
  assert.equal(new Set(g.measureRefs).size, 3, 'two dispatches were pointed at ONE immutable reserved record')
  assert.deepEqual(g.measureRefs.map((p) => p.replace(/^.*\/checkout\//, '')), ['1/result.md', '2/result.md', '3/result.md'],
    'attempt numbers are monotonic per journey; an abandoned number stays consumed')
  assert.ok(g.dispatched.includes('retry:checkout:measure-gap-m1'), 'the permitted retry never ran')
  const all = g.bound.map((b) => b.ref.resultPath)
  assert.equal(new Set(all).size, all.length, 'the lane reserved one path twice across compose / measure / disposition')
  // the record the disposition is told to read is the attempt that actually produced text; the dead
  // attempt's record stays on disk but is never cited
  assert.equal(g.dispoBind.inputs.includes(g.measureRefs[0]), false, 'the dead attempt was cited as the record to read')
  assert.equal(measureLine(g), 'no-stop|refs=3/3|rounds=2|fixes=0')
})

test('measurement lane: compose is told to RECORD the delta against stale create-side scaffolding — and never DECLARES that file as an input', async () => {
  const g = await runMeasureLane('M1-three-journeys-one-gated')
  const p = g.prompts.compose
  for (const d of MEASURE.composeDelta)
    assert.ok(p.includes(d.phrase), `the compose prompt dropped ${d.id} — a stale suggestion would be silently discarded instead of recorded`)
  // the sharp one, and the reason this is asserted on the DECLARED INPUT LIST rather than on the prose:
  // bindAttempt step 3 tells an agent that a missing declared input is STATUS: BLOCKED, and this file is
  // allowed to be absent. So it is read conditionally in the prompt body and must NOT be declared.
  assert.ok(p.includes(MEASURE.approachFile), 'the compose prompt never mentions the approach file at all')
  assert.deepEqual(g.composeBind.inputs.filter((i) => i.includes(MEASURE.approachFile)), [],
    `${MEASURE.approachFile} is a DECLARED input: ${MEASURE.approachFileWhy}`)
  assert.deepEqual(g.composeBind.inputs,
    [sess('<SESSION>definition-of-done.md'), '<session>team-plan.md', '<session>baseline.diff'])
  assert.equal(measureComposeLine(g), 'approachDeclared=false|composeInputs=3')
})

test('measurement lane: the disposition consumes prompt.md, the grade record and every CITABLE measurement — and no reconstruction', async () => {
  const g = await runMeasureLane('M5-reconstruction-not-cited')
  const declared = g.dispoBind.inputs
  for (const fixed of MEASURE.dispositionFixedInputs)
    assert.ok(declared.includes(fixed), `the disposition does not consume ${fixed}`)
  assert.ok(declared.includes(g.out.composeRef.resultPath), 'the disposition does not consume the journey manifest')
  // re-deriving the SAME identity through the canonical helper is the legitimate idempotent re-mint, so
  // the expected grade path comes from attemptRef rather than being typed here
  const gradePath = g.am.attemptRef('goal-auditor', 'grade', EPOCH, 1, { artifact: 'final-grade' }).resultPath
  assert.ok(declared.includes(gradePath), 'the disposition does not consume the grade record')
  const cited = g.out.measurements.filter((m) => m.cited)
  const recon = g.out.measurements.filter((m) => !m.cited)
  assert.deepEqual(cited.map((m) => m.key), ['checkout'])
  assert.deepEqual(recon.map((m) => m.key), ['search'], 'the lost-return slice must be reconstructed and marked uncitable')
  for (const m of cited) assert.ok(declared.includes(m.path), `${m.key}: a citable measurement was not named to the disposition`)
  for (const m of recon) assert.equal(declared.includes(m.path), false,
    `${m.key}: a reconstruction was cited as the producer's terminal — reconstruction and observation must stay distinguishable`)
  for (const d of MEASURE.dispositionEvidence)
    assert.ok(g.prompts.disposition.includes(d.phrase),
      `the disposition prompt dropped ${d.id} — reading a measurer's CLEAN as a pass reintroduces, one reader downstream, the verdict the fan-out refused to ask for`)
  assert.equal(measureCiteLine(g), 'declared=7|citedIn=1/1|uncitedIn=0')
})

test('measurement lane: a compose with no journeys line exercises NOTHING and records that; the run still accounts for itself', async () => {
  const g = await runMeasureLane('M7-no-journeys-line')
  assert.deepEqual(g.out.JOURNEYS, [])
  assert.deepEqual(g.dispatched.filter((l) => l.startsWith('measure:')), [])
  assert.ok(g.concerns.some((c) => /compose recorded no journeys line/.test(c.line)),
    'nothing measured must never read as a lane that ran clean')
  assert.ok(g.dispatched.includes('disposition'))
})

test('measurement lane: FEED not GATE — the only stop it returns of its own is a measurer INTEGRITY condition', async () => {
  const g = await runMeasureLane('M6-integrity-stop')
  assert.equal(g.out.stage, 'measure')
  assert.equal(g.out.status, 'blocked')
  assert.deepEqual([g.out.route, g.out.gate], ['human', 'integrity'])
  assert.equal(g.out.integrity, undefined, 'the integrity:true key stays frozen to the two finalize sites (section 15)')
  assert.equal(g.dispatched.includes('disposition'), false, 'the lane returned before the disposition')
  // no journey OBSERVATION is ever handed to gate(): the only two gate() calls gate on whether the
  // RECORD was produced, never on what a journey saw. a flaky browser degrades a grade, it never holds
  // a good run hostage.
  const code = regionText('measureLane').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  assert.deepEqual(code.match(/gate\('[a-z-]+'/g), ["gate('compose'", "gate('disposition'"])
})

test('measurement lane: the compose and disposition gates stop on whether the RECORD was produced — never on what a journey observed', async () => {
  const c = await runMeasureLane('M8-compose-blocked')
  assert.equal(stopLine(c.out), 'compose|blocked|route=triage|gate=-|trigger=blocked|assessor=null|note=-')
  assert.deepEqual(c.dispatched, ['compose'],
    'a compose that produced no manifest must exercise nothing — there are no rows to fan out over and nothing to disposition')
  assert.equal(c.out.JOURNEYS, undefined, 'the lane returned its stop, not its exports')
  const d = await runMeasureLane('M9-disposition-blocked')
  assert.equal(stopLine(d.out), 'disposition|blocked|route=triage|gate=-|trigger=blocked|assessor=null|note=-')
  assert.deepEqual(d.dispatched.filter((l) => l.startsWith('measure:')), ['measure:checkout'],
    'the disposition gate sits DOWNSTREAM of the whole fan-out — every journey was measured before it fired')
  // the distinction the lane rests on: both stops are the stage agent's own BLOCKED report, routed on that
  // agent's own text. Neither is reached by reading a journey's observation — M1 measures a surface and
  // returns no stop at all, which is what FEED not GATE means when nothing is wrong with the RECORDS.
  assert.match(String(d.out.detail), /^STATUS: BLOCKED/)
  assert.equal(stopLine((await runMeasureLane('M1-three-journeys-one-gated')).out), 'no-stop')
})

test('measurement lane: its prompts are NOT under the t0 attribution freeze, and cannot be against THIS t0', () => {
  // recorded as an executable limit rather than left implicit. Section 20 compares two snapshots of the
  // canonical file; the t0 commit predates this lane entirely, so its region anchor is absent there and
  // the seven-builder freeze cannot be widened to compose/measure/disposition without re-pointing t0 —
  // which the notEqual guard in section 20 exists to stop. Widening is not merely unwise here, it is
  // INCOHERENT: attribution compares a t0 render against today's, and there is no t0 render of a builder
  // that did not exist at t0. The declared digest pin in the next test is what stands in — the detector
  // lists above cannot, because they bind the phrases they name and leave every byte between them free.
  // This assertion retires itself: re-point t0 past this lane and it goes red, asking for the widening.
  assert.equal(T0_SRC.split('\n').filter((l) => l.includes(CASES.regions.measureLane.startAnchor)).length, 0,
    'the t0 snapshot now carries the measurement lane — widen CARRIER_BUILDERS + renderBuilders to its prompts')
  for (const k of ['compose', 'measure', 'disposition'])
    assert.equal(CARRIER_BUILDERS.includes(k), false, `${k} is now a carrier builder — this limit is stale`)
})

// the substitute freeze. WHAT IT IS WORTH, said plainly: less than the t0 one, and the difference is the
// anchor. t0 is a commit no edit from this working tree can rewrite; this baseline lives in the same fixture
// whoever edits a prompt already owns. So it stops ACCIDENTAL drift outright and makes deliberate drift a
// RECORDED act — it does not stop a hand that re-pins the digest instead of declaring the change, which is
// the same residual as re-pointing t0 and is stated rather than papered over. What it covers that no
// detector list can: the bytes no detector names.
const bodyDigest = (s) => createHash('sha256').update(s).digest('hex')
// the prompt bodies the LANE authors, picked out of the bind log by the reserved task id each stage mints.
// captured before bindAttempt binds the carrier on: the carrier's contribution to these three is already
// frozen by the seven-builder attribution (same helper, and DC-1 is what a carrier edit looks like when it
// lands there), so digesting the bound form would freeze the carrier twice and move all three pins on every
// carrier edit.
const measureBodies = (g) => {
  const spec = MEASURE.bornAfterT0.renderedFrom
  const pick = (taskId) => {
    const b = g.bound.find((x) => x.ref.taskId === taskId)
    assert.ok(b, `no prompt was bound under the reserved id ${taskId} — the render spec is stale`)
    return b.body
  }
  return { compose: pick(spec.compose), measure: pick(spec.measure), disposition: pick(spec.disposition) }
}

test('measurement lane: the three prompts born AFTER t0 are frozen by declared digest — an undeclared edit to their bytes fails here', async (t) => {
  const decl = MEASURE.bornAfterT0
  assert.ok(Array.isArray(decl.changes), 'bornAfterT0.changes must exist as a list — it is where a re-pin is recorded')
  const g = await runMeasureLane(decl.renderedFrom.scenario)
  const bodies = measureBodies(g)
  assert.deepEqual(Object.keys(decl.builders).sort(), Object.keys(bodies).sort(),
    'the pin must cover exactly the three builders born after t0 — a dropped key is an unfrozen prompt')
  const digests = {}
  for (const [k, body] of Object.entries(bodies)) {
    assert.equal(CARRIER_BUILDERS.includes(k), false, `${k} is a carrier builder — it belongs to the t0 attribution, not to this pin`)
    assert.ok(body.length > 400, `${k}: ${body.length} bytes is not this builder's output — the capture seam moved`)
    digests[k] = bodyDigest(body)
    t.diagnostic(`${k}: ${body.length} bytes sha256 ${digests[k]}`)
  }
  assert.equal(new Set(Object.values(digests)).size, Object.keys(bodies).length,
    'two builders carry the same digest — one of these pins is freezing nothing')
  for (const [k, d] of Object.entries(decl.builders)) {
    assert.equal(bodies[k].length, d.bytes, `${k}: the prompt is ${bodies[k].length} bytes, pinned at ${d.bytes}`)
    assert.equal(digests[k], d.sha256,
      `${k}: these prompt bytes CHANGED and nothing declared it. The t0 attribution cannot see this lane, so this pin is ` +
      `the whole freeze: record the edit in cases.json measure.bornAfterT0.changes with a reason and a marker, then re-pin ` +
      `sha256 to ${digests[k]} and bytes to ${bodies[k].length}.`)
  }
  // the pin proven LIVE against a real prompt-byte edit, and without writing the file it guards: an already
  // declared mutant rewrites one clause of the MEASURE prompt in memory, so that builder's digest must move
  // while the other two stand still. a pin that cannot tell a rewritten prompt from the pinned one is
  // decoration, and one that moves all three together is pinning the harness rather than the prompts.
  const mutated = measureBodies(await runMeasureLane(decl.renderedFrom.scenario, MUT(decl.livenessMutant)))
  assert.notEqual(bodyDigest(mutated.measure), digests.measure,
    `${decl.livenessMutant} rewrote a clause of the measure prompt and its digest did not move`)
  assert.equal(bodyDigest(mutated.compose), digests.compose, 'an edit to the measure prompt moved the compose pin — the pins are not independent')
  assert.equal(bodyDigest(mutated.disposition), digests.disposition, 'an edit to the measure prompt moved the disposition pin — the pins are not independent')
  // the declarations answer for themselves, the discipline carrier.declaredChanges keeps: bytes a change
  // permits must really ship, or the entry is a standing permit rather than the record of one.
  for (const c of decl.changes) {
    assert.ok(bodies[c.builder], `${c.id} names ${c.builder}, which is not a pinned builder`)
    assert.ok(bodies[c.builder].includes(c.marker),
      `${c.id} permits bytes the ${c.builder} prompt does not render — a standing permit, not a record of one`)
  }
})

// ---- FINISH: the binding is younger than t0, so the attribution freeze cannot hold it and a digest does

test('finish: the bound finish prompt is outside the t0 attribution freeze BY NECESSITY, and its body is pinned in its place', async (t) => {
  // recorded as an executable limit, in the same terms as the measurement lane's above and for an adjacent but
  // different reason: not that the STAGE is younger than t0, but that the BINDING is. At t0 this dispatch
  // carried no reserved attempt and no carrier, and its prompt ORDERED the verdict into progress.md — the one
  // file that may never hold one. A t0-vs-today hunk comparison would therefore report the entire carrier as
  // undeclared drift while proving nothing about the prompt. This assertion retires itself: re-point t0 past
  // the binding and it goes red, asking for the widening.
  assert.equal(T0_SRC.split('\n').filter((l) => l.includes(CASES.regions.finishSite.startAnchor)).length, 0,
    'the t0 snapshot now carries the BOUND finish dispatch — widen CARRIER_BUILDERS + renderBuilders to it')
  assert.equal(CARRIER_BUILDERS.includes('finish'), false, 'finish is now a carrier builder — this limit is stale')
  assert.ok(T0_SRC.includes(FINISH.t0Order),
    `the order this binding exists to escape is absent from the t0 snapshot — re-anchor it, never drop the check: ${FINISH.t0Order}`)
  const f = await renderFinish()
  // the defect the rebinding fixed, asserted at the site that actually had it and not only by the generic sweep
  assert.equal(f.body.includes('progress.md'), false, FINISH.t0OrderWhy)
  // MINTED by canonical bytes rather than typed here: this is the write-once record a replayed finish would
  // land on a second time, which is the whole reason the stage belongs on a relaunch's seed-bumping list
  assert.equal(f.ref.resultPath, sess(FINISH.reservedTerminal), FINISH.reservedTerminalWhy)
  assert.equal(f.body.length, FINISH.bodyPin.bytes,
    `the finish prompt is ${f.body.length} bytes, pinned at ${FINISH.bodyPin.bytes}`)
  assert.equal(bodyDigest(f.body), FINISH.bodyPin.sha256,
    `these prompt bytes CHANGED and nothing declared it. No t0 render can reach this stage, so this pin is the whole ` +
    `freeze: record the edit in cases.json finish.changes with a reason and a marker, then re-pin sha256 to ` +
    `${bodyDigest(f.body)} and bytes to ${f.body.length}.`)
  t.diagnostic(`finish body ${f.body.length} bytes sha256 ${bodyDigest(f.body)} → reserved ${f.ref.resultPath}`)
  // the pin proven LIVE against a real prompt-byte edit, in memory, without writing the file it guards
  const m = FINISH.pinLiveness
  const before = APPLIED.get(m.id) || 0
  const mutant = await renderFinish(undefined, m)
  assert.ok((APPLIED.get(m.id) || 0) > before, `${m.id}: this render never evaluated region ${m.region}`)
  assert.notEqual(bodyDigest(mutant.body), bodyDigest(f.body),
    `${m.id} rewrote a clause of the finish prompt and its digest did not move`)
  // and the declarations answer for themselves, exactly as the measure pin's do
  for (const c of FINISH.changes)
    assert.ok(f.body.includes(c.marker),
      `${c.id} permits bytes the finish prompt does not render — a standing permit, not a record of one`)
})

// ---------------------------------------------------------------------------------------------
// 22. the grade channel's reason for existing — feeding it moves no other heavy stage's prompt bytes
// ---------------------------------------------------------------------------------------------

// THE INVARIANT. `args.deps` is ONE channel that ELEVEN heavy stages read, and bindAttempt interpolates it
// into every one of their prompts. Feeding a LATER grade through it therefore re-renders all eleven: each
// misses the in-run cache (rule 6) and REPLAYS, and a replayed stage re-mints the SAME attemptRef path, so a
// second record lands on consumed write-once reserved bytes. attemptRef's MINTED registry is per-EXECUTION and
// cannot fire across launches, so nothing catches it. A dedicated grade channel is worth having exactly and
// only if it is inert everywhere else — which is what this asserts, over all eleven stages, BY BYTES.
//
// ELEVEN IS NOT TYPED HERE, IT IS DERIVED — because the hand-kept count was wrong twice: the prose said nine
// and meant ten (fix-ac had always been a consumer and went unnamed), then finish became an eleventh the day
// it was rebound through bindAttempt, and this test's `stages.length === 10` still passed while claiming to
// cover "all of them". A completeness claim checked against a literal is only ever as true as the last person
// to edit the literal. So the set is READ OUT of canonical bytes: every non-comment line that hands the shared
// list to a bind is a consumer, minus the grade's own fallback line, which carries the same literal while
// being the channel FED rather than a stage reading it. A twelfth consumer added tomorrow moves that number
// and fails this test until its prompt is rendered here too.
//
// The comparison is proven able to SEE a change before it is trusted to report none: the same records sent
// down the SHARED channel must move every one of those prompts. Without that control, a render harness that
// had quietly gone inert would pass this test while proving nothing.
const SHARED = CASES.sharedChannel
const sharedChannelSites = () => CANON_LINES.filter((l) => l.includes(SHARED.literal) &&
  !l.trim().startsWith('//') && !l.includes(SHARED.fedChannelMarker))
const measureBoundPrompts = (g) => {
  const spec = MEASURE.bornAfterT0.renderedFrom
  const pick = (taskId) => {
    const b = g.bound.find((x) => x.ref.taskId === taskId)
    assert.ok(b, `no prompt was bound under the reserved id ${taskId} — the render spec is stale`)
    return b.bound
  }
  return { compose: pick(spec.compose), measure: pick(spec.measure), disposition: pick(spec.disposition) }
}

test('grade channel: feeding a later grade moves NOT ONE BYTE of any other heavy stage prompt — and the shared channel moves all of them', async (t) => {
  const c = CASE('K6-grade-channel-selected-control')
  const feed = () => ({ gradeDeps: deep(c.input.args.gradeDeps) })
  const sharedFeed = () => ({ deps: deep(c.input.args.deps) })
  const scenario = MEASURE.bornAfterT0.renderedFrom.scenario

  const base = await renderBuilders(CANON)
  const fed = await renderBuilders(CANON, undefined, feed())
  const shared = await renderBuilders(CANON, undefined, sharedFeed())
  const mBase = measureBoundPrompts(await runMeasureLane(scenario))
  const mFed = measureBoundPrompts(await runMeasureLane(scenario, undefined, feed()))
  const mShared = measureBoundPrompts(await runMeasureLane(scenario, undefined, sharedFeed()))
  const fBase = await renderFinish(), fFed = await renderFinish(feed()), fShared = await renderFinish(sharedFeed())

  // the derivation is checked against something real before it is trusted to stand in for a count. the line it
  // SUBTRACTS must still be there: rewrite the grade's fallback and the subtraction is either removing nothing
  // (count too high, and the mismatch below is then the only thing that notices) or removing a genuine consumer
  // that has since grown the same marker (count too low, and a real stage goes uncovered while the test passes).
  const sites = sharedChannelSites()
  assert.equal(CANON_LINES.filter((l) => l.includes(SHARED.literal) && l.includes(SHARED.fedChannelMarker)).length, 1,
    `the fed-channel line this derivation subtracts is not where cases.json says it is — ${SHARED.fedChannelWhy}`)
  assert.ok(sites.length >= SHARED.minConsumers,
    `only ${sites.length} call sites hand the shared list to a bind — the literal ${JSON.stringify(SHARED.literal)} was ` +
    `refactored and the derivation has gone BLIND, which is worse than the stale number it replaced`)
  assert.equal(sites.length, SHARED.consumers.length,
    `canonical bytes carry ${sites.length} shared-channel call sites while the fixture roster names ` +
    `${SHARED.consumers.length} — one of the two was edited without the other`)

  const stages = [...CARRIER_BUILDERS.map((k) => [k, base[k], fed[k], shared[k]]),
    ['finish', fBase.bound, fFed.bound, fShared.bound],
    ...Object.keys(mBase).map((k) => [k, mBase[k], mFed[k], mShared[k]])]
  assert.equal(stages.length, sites.length,
    `stage-templates.js feeds the shared args.deps at ${sites.length} call sites and this test renders ${stages.length} ` +
    `prompts. A consumer nobody renders here is a consumer this invariant does not cover — render it, never lower the count.`)
  assert.deepEqual(stages.map(([k]) => k).sort(), SHARED.consumers.slice().sort(),
    'the stages rendered here and the roster in cases.json name different sets — a count can match while the members do not')
  // the channel reaches the CARRIER and stops there: the body each dispatch authored is the same bytes under both
  // feeds. Stated as an assertion because the finish pin digests that body — a body either channel could move
  // would make that pin a measurement of the dependency list rather than of the prompt.
  assert.equal(fShared.body, fBase.body,
    'the shared channel moved the finish prompt BODY — the digest pin above is then freezing the carrier, not the prompt')
  assert.equal(fFed.body, fBase.body, 'the grade channel moved the finish prompt BODY')
  for (const [k, b, f, s] of stages) {
    assert.ok(b.length > 200, `${k}: a prompt this short is not the builder's output — the capture seam moved`)
    assert.notEqual(s, b,
      `${k}: feeding the SHARED args.deps did not move this prompt, so this comparison is BLIND and the invariance it reports is worthless`)
    assert.equal(f, b,
      `${k}: feeding the GRADE channel moved this prompt's bytes. That is precisely the defect the channel exists to prevent — ` +
      `${k} now misses the cache, replays, and re-mints its already-consumed reserved attempt path.`)
  }
  t.diagnostic(`${sites.length} shared-channel call sites derived from canonical bytes; the grade channel is inert across ` +
    `all ${stages.length} rendered heavy stages and the shared channel moves all ${stages.length}`)
  // "inert everywhere" is also satisfied by a channel NOTHING reads, so the reach is asserted too
  const g = runGrade(c.input)
  assert.equal(g.outcome, 'ok', g.message || '')
  assert.deepEqual(g.shaSet, c.input.args.gradeDeps.map((d) => d.sha256).sort(),
    'the channel is inert at the grade as well — it feeds nothing, which is not the claim')
})

// ---------------------------------------------------------------------------------------------
// role-file roster: the close-the-artifact obligation, as prose, in every file that owes a verdict
// ---------------------------------------------------------------------------------------------

// WHAT THIS PROVES AND WHAT IT DOES NOT, stated plainly because the gap is wide. It proves the
// INSTRUCTION is present in the role file's bytes. It is NOT behavioural coverage: nothing here dispatches
// an agent, so an agent that reads the clause and still leaves its verdict only in chat passes this test
// untouched. The obligation is prose in ~25 files across two trees and went missing three times; this
// catches the file that never got the sentence, and nothing beyond that.
// The roster is READ FROM THE TREE, never listed here — a hard-coded lane table is the defect that already
// shipped twice in this effort, so a role file added tomorrow is checked tomorrow with no edit here. The
// only fixture data is the EXCLUSION set (reasoned, and asserted to still exist) plus the two directories
// to search, which is the limit cases.json records: a third agent tree would go unseen.
const ROLE_TREES = CASES.roleFiles.trees
// the readdir derivation itself is shared: the ccc-routing roster at the bottom of this file sweeps a
// different tree set for a different obligation, and two hand-rolled copies of a readdir is how the two
// rosters drift into disagreeing about what a role file even is
const filesIn = (trees) => trees
  .flatMap((t) => readdirSync(join(REPO, t.dir)).filter((f) => f.endsWith(t.ext)).map((f) => `${t.dir}/${f}`))
  .sort()
const rosterFiles = () => filesIn(ROLE_TREES)
const roleSrc = (p) => readFileSync(join(REPO, p), 'utf8')
// role prose is hand-wrapped, so a required phrase legitimately straddles a line break. matching raw bytes
// makes this gate fail on LAYOUT rather than on the missing obligation — it did, on a file whose clause was
// fully present, and the same wrap had already swallowed phrases in two others. collapse whitespace on both
// sides so the scan reads meaning; a rewrap is then not a fix, because there is nothing left to fix.
const flat = (s) => s.toLowerCase().replace(/\s+/g, ' ')
const lacksClause = (src) => CASES.roleFiles.requiredClause.filter((ph) => !flat(src).includes(flat(ph)))
// one verdict per role file, so the live-scan probe below exercises the SAME code path the roster test does
const roleVerdict = (src) => ({ missing: lacksClause(src), bare: flat(src).includes(flat(CASES.roleFiles.bareIdiom)) })

test('role roster: every role file owing a verdict artifact tells the agent to CLOSE that artifact with its STATUS line', (t) => {
  const roster = rosterFiles()
  assert.ok(roster.length >= CASES.roleFiles.minRoster,
    `derived only ${roster.length} role files — the derivation is broken, not the tree`)
  for (const tree of ROLE_TREES)
    assert.ok(roster.some((p) => p.startsWith(`${tree.dir}/`)), `${tree.dir} contributed NO role file`)
  const excluded = new Map(CASES.roleFiles.exclusions.map((e) => [e.path, e.why]))
  assert.equal(excluded.size, CASES.roleFiles.exclusions.length, 'an exclusion is listed twice')
  for (const [p, why] of excluded) {
    assert.ok(roster.includes(p), `exclusion names ${p}, which is not in the tree — a stale exclusion silently shrinks the checked set`)
    assert.ok(why.length > 40, `the exclusion for ${p} carries no reason a reviewer can argue with`)
    assert.ok(lacksClause(roleSrc(p)).length > 0,
      `${p} is excluded as owing no verdict artifact, yet it states the close obligation — the exclusion is wrong`)
  }
  const required = roster.filter((p) => !excluded.has(p))
  assert.ok(required.length >= CASES.roleFiles.minRequired,
    `only ${required.length} role files survive the exclusion list — it has swallowed the roster`)
  // ONE report over both defects, not an assertion each: the first failing assert hides the rest of the
  // sweep, and an obligation that reveals its worklist three files at a time is how this went missing twice.
  const offenders = []
  for (const p of required) {
    const v = roleVerdict(roleSrc(p))
    const defects = [...(v.missing.length ? [`states no close obligation (absent: ${v.missing.join(' / ')})`] : []),
      ...(v.bare ? ['carries the message-only idiom'] : [])]
    if (defects.length) offenders.push(`${p} — ${defects.join('; ')}`)
  }
  t.diagnostic(`${roster.length} role files on disk, ${excluded.size} excluded by fixture, ${required.length} required to carry the clause`)
  assert.deepEqual(offenders, [], `role files owning a durable verdict artifact that never say the STATUS line must CLOSE ` +
    `that artifact, or still place it only in the final message:\n  ${offenders.join('\n  ')}`)
})

// the scan proven live against IN-MEMORY mutants of real role-file bytes: the suite never writes the files
// it measures, and these belong to other owners. control + mutant, same roleVerdict the roster test calls.
test('role roster: the clause scan is live — a role file with the clause cut out, or the bare idiom restored, is caught', () => {
  const compliant = rosterFiles().filter((p) => !roleVerdict(roleSrc(p)).missing.length)
  assert.ok(compliant.length >= 2, 'no role file on disk carries the clause — there is nothing to mutate')
  for (const p of compliant) {
    const src = roleSrc(p)
    assert.deepEqual(roleVerdict(src), { missing: [], bare: false }, `${p}: control`)
    // the cut tolerates the same hand-wrapping the scan does. a raw regex leaves a phrase that straddles a
    // line break in place, the scan then still reads it, and the probe fails on LAYOUT instead of proving
    // the scan bites — the mutant must not keep the brittleness the scan was just fixed to shed.
    const spanning = (ph) => new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'), 'ig')
    const cut = CASES.roleFiles.requiredClause.reduce((s, ph) => s.split(spanning(ph)).join(''), src)
    assert.deepEqual(roleVerdict(cut).missing, CASES.roleFiles.requiredClause,
      `${p}: the scan still passes this file after its clause was removed`)
    assert.equal(roleVerdict(`${cut}\n- ${CASES.roleFiles.bareIdiom}\n`).bare, true,
      `${p}: the scan cannot see the message-only idiom planted back in`)
  }
})

// ---------------------------------------------------------------------------------------------
// prompt sweep: every stage prompt that ASKS for a STATUS line owes the close-the-artifact clause
// ---------------------------------------------------------------------------------------------
//
// WHAT THIS PROVES AND WHAT IT DOES NOT, in the same terms as the roster above and section 21: these
// assert what the PROMPT REQUESTS. Nothing here dispatches an agent — no stage ran, no artifact was
// written, nothing read one back — so a producer that is handed the clause and still leaves its verdict
// only in a reply passes every assertion below untouched. A prompt that asks is not an agent that obeys.
//
// The site set is DERIVED FROM THE FILE, never listed: a string-aware walk finds every ask and takes the
// INNERMOST call group around it, or the concatenation chain when the ask sits inside no call at all. Six
// line numbers in a fixture is the defect this effort shipped twice — the seventh prompt added tomorrow is
// the one nobody checks. The walk's end state is asserted too, so a file it can no longer lex fails loudly
// instead of sweeping nothing.
const SWEEP = CASES.closeSweep
// comments are lexed and MASKED rather than line-stripped, and the two are not the same: `// NO
// closeArtifact() here` sits four lines above the one site that owes no clause, so a raw substring test
// would credit that site from a comment saying the opposite. Masking preserves offsets, so spans still
// line up with the raw bytes.
const lexPromptSites = (src) => {
  const hits = []
  for (const a of SWEEP.asks) { let i = -1; while ((i = src.indexOf(a.phrase, i + 1)) >= 0) hits.push(i) }
  const owner = new Map(), stack = [], tmpl = [], comments = []
  let st = 'code', depth = 0, prev = '', inClass = false, cAt = 0, stray = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (st === 'code') {
      if (c === '/' && src[i + 1] === '/') { st = 'lc'; cAt = i; continue }
      // a regex literal only ever follows an operator or an opener here; after a name or a `)` the slash
      // is division (`modules.length / 2`). getting this wrong is what the end-state assertion catches.
      if (c === '/' && /[([{,;:=!&|?+\-*%^~<>]/.test(prev)) { st = 're'; inClass = false; continue }
      if (c === '\\') { i++; continue }
      if (c === "'" || c === '"') { st = c; continue }
      if (c === '`') { st = 'tp'; continue }
      if (c === '(') { stack.push({ start: i, callee: (src.slice(Math.max(0, i - 60), i).match(/([A-Za-z_$][\w$.]*)\s*$/) || [])[1] || '' }); depth++ }
      else if (c === ')') {
        const g = stack.pop(); depth--
        if (!g) { stray++; continue }
        // inner groups close first, so the FIRST group to claim an ask is the innermost one containing it
        for (const h of hits) if (h > g.start && h < i && !owner.has(h)) owner.set(h, { ...g, end: i })
      } else if (c === '}' && tmpl.length && tmpl[tmpl.length - 1] === depth) { tmpl.pop(); st = 'tp' }
      if (!/\s/.test(c)) prev = c
      continue
    }
    if (st === 'lc') { if (c === '\n') { comments.push([cAt, i]); st = 'code'; prev = '' } continue }
    if (st === "'" || st === '"') { if (c === '\\') i++; else if (c === st) { st = 'code'; prev = c } continue }
    if (st === 're') {
      if (c === '\\') i++
      else if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) { st = 'code'; prev = '/' }
      continue
    }
    if (c === '\\') { i++; continue }                                  // template literal from here
    if (c === '`') { st = 'code'; prev = c; continue }
    if (c === '$' && src[i + 1] === '{') { tmpl.push(depth); st = 'code'; prev = '{'; i++ }
  }
  const mask = src.split('')
  for (const [a, b] of comments) for (let i = a; i < b; i++) mask[i] = ' '
  const masked = mask.join('')
  const lines = src.split('\n'), maskedLines = masked.split('\n')
  const lineOf = (i) => src.slice(0, i).split('\n').length
  // an ask outside every call group is a plain concatenation chain (`const RESEARCHER = ... + ...`): walk
  // the `+` continuations out to both ends, which is the whole expression and nothing of its neighbours.
  const chainOf = (ln) => {
    let a = ln - 1, b = ln - 1
    while (a > 0 && /\+$/.test(lines[a - 1].trim()) && !/^\s*\/\//.test(lines[a - 1])) a--
    while (b < lines.length - 1 && /\+$/.test(lines[b].trim())) b++
    return [a + 1, b + 1]
  }
  const sites = new Map()
  for (const h of hits.filter((x) => !comments.some(([a, b]) => x > a && x < b)).sort((x, y) => x - y)) {
    const g = owner.get(h)
    const [s, e] = g ? [lineOf(g.start), lineOf(g.end)] : chainOf(lineOf(h))
    const span = `${s}-${e}`
    if (!sites.has(span)) sites.set(span, { span, callee: g ? g.callee : null,
      raw: lines.slice(s - 1, e).join('\n'), code: maskedLines.slice(s - 1, e).join('\n') })
  }
  return { sites: [...sites.values()], masked, end: { state: st, depth, open: stack.length, tmpl: tmpl.length, stray } }
}
const SITES = lexPromptSites(CANON)
const creditsOf = (site) => SWEEP.mechanisms.filter((m) => site.code.includes(m.marker)).map((m) => m.id)

test('close sweep: the canonical file lexes clean, and every swept prompt is a contiguous slice of it', (t) => {
  assert.deepEqual(SITES.end, { state: 'code', depth: 0, open: 0, tmpl: 0, stray: 0 },
    `the walk did not end in code at depth zero, so it is no longer reading stage-templates.js correctly and ` +
    `every site it reports is suspect: ${JSON.stringify(SITES.end)}`)
  assert.ok(SITES.sites.length >= SWEEP.minSites,
    `the walk found only ${SITES.sites.length} prompt sites — ${SWEEP.minWhy}`)
  for (const s of SITES.sites) {
    assert.ok(CANON.includes(s.raw), `site ${s.span} is not a contiguous slice of the canonical file — extraction is broken`)
    assert.ok(s.raw.length > 80, `site ${s.span} is ${s.raw.length} bytes — too short to be a prompt`)
  }
  // neither half of the detector may pass vacuously: an ask nobody spells and a mechanism nobody names
  // would both make the sweep quietly report nothing
  for (const a of SWEEP.asks) assert.ok(CANON.includes(a.phrase), `ask detector absent from canonical source (${a.id}): ${a.phrase}`)
  for (const m of SWEEP.mechanisms) assert.ok(CANON.includes(m.marker), `mechanism absent from canonical source (${m.id}): ${m.marker}`)
  t.diagnostic(`${SITES.sites.length} prompt sites swept from ${CANON_PATH}`)
})

test('close sweep: every prompt asking for a STATUS line carries the close-the-artifact obligation, or the fixture says why not', (t) => {
  const excluded = new Map(SWEEP.exclusions.map((e) => [e.anchor, e.why]))
  assert.equal(excluded.size, SWEEP.exclusions.length, 'an exclusion is listed twice')
  for (const e of SWEEP.exclusions) {
    assert.equal(CANON.split(e.anchor).length - 1, 1,
      `an exclusion anchor must occur EXACTLY once in the canonical file, or it names something other than one site: ${e.anchor}`)
    assert.equal(SITES.sites.filter((s) => s.code.includes(e.anchor)).length, 1,
      `exclusion ${e.anchor} does not match exactly one swept prompt — a stale exclusion silently shrinks the checked set`)
    assert.ok(e.why.length > 40, `the exclusion for ${e.anchor} carries no reason a reviewer can argue with`)
  }
  // ONE report over every site, not an assertion each: a first failing assert hides the rest of the sweep,
  // and an obligation that reveals its worklist one prompt at a time is how this went missing twice.
  const offenders = []
  for (const s of SITES.sites) {
    const credits = creditsOf(s)
    const anchors = [...excluded.keys()].filter((a) => s.code.includes(a))
    t.diagnostic(`${s.span.padEnd(10)} ${(s.callee || '(chain)').padEnd(12)} ${credits.join('+') || (anchors.length ? 'EXCLUDED' : 'NONE')}`)
    // naming the carrier is not routing through it: the ask must sit INSIDE the bindAttempt call whose
    // closeTerminal it is being credited with, not merely somewhere in the same expression.
    if (credits.includes('bindAttempt')) assert.equal(s.callee, 'bindAttempt',
      `site ${s.span} names the carrier but its ask is not one of its arguments — the mechanism is mentioned, not used`)
    if (anchors.length) {
      assert.deepEqual(credits, [],
        `site ${s.span} is excluded as owing no close obligation, yet it carries one (${credits.join('+')}) — the exclusion is wrong, delete it`)
      continue
    }
    if (!credits.length) offenders.push(`${s.span} (${s.callee || 'concatenation chain'}): ${s.raw.trim().slice(0, 120)}`)
  }
  assert.deepEqual(offenders, [],
    `these prompts ask the producer for a STATUS line and never tell it to CLOSE the durable record with that ` +
    `same line, so the verdict lives only in a reply that is gone by the next resume, fresh boot or evidence ` +
    `selection. Interpolate the canonical clause — do not hand-type a new dialect of it — or declare the site ` +
    `in cases.json closeSweep.exclusions with a reason:\n  ${offenders.join('\n  ')}`)
})

test('close sweep: both credited mechanisms really state the obligation, in the same three phrases the role files owe', () => {
  const am = evalRegion('auditEmpty', { log: () => {}, coverage: () => null, parallel: async () => [], tryAgent: async () => '' })
  const probe = sess('<SESSION>verifier/close-sweep-probe.md')
  const renderedClose = am.closeArtifact(probe)
  assert.ok(renderedClose.includes(probe), 'the unbound clause does not name the artifact it closes')
  const ref = freshAttemptMod().attemptRef('verifier', 'close-sweep', EPOCH, 1, { artifact: 'results' })
  const bound = freshBindMod().bindAttempt('SYNTHETIC probe body', ref, [], [])
  assert.ok(bound.includes(ref.resultPath), 'the bound carrier does not name the terminal it closes')
  // the SAME phrases the role-file roster requires, read from the same fixture row: one obligation, one
  // wording, whether it is stated in a role file or interpolated into a prompt
  for (const ph of CASES.roleFiles.requiredClause) {
    assert.ok(flat(renderedClose).includes(flat(ph)), `the unbound clause states no "${ph}" — a credited mechanism that obliges nothing`)
    assert.ok(flat(bound).includes(flat(ph)), `the bound carrier states no "${ph}" — a credited mechanism that obliges nothing`)
  }
})

test('close sweep: the credit is live — renaming either mechanism in memory strips it from exactly the sites that used it', () => {
  const base = new Map(SITES.sites.map((s) => [s.span, creditsOf(s)]))
  for (const m of SWEEP.mechanisms) {
    // an in-memory rename, never a write: the marker is fixture data, so this types no canonical identifier
    const mutant = lexPromptSites(CANON.split(m.marker).join(m.marker.replace('(', 'X(')))
    const lost = []
    for (const s of mutant.sites) {
      const had = base.get(s.span) || []
      const now = creditsOf(s)
      if (!had.includes(m.id)) { assert.deepEqual(now, had, `${s.span} changed although it never used ${m.id}`); continue }
      assert.equal(now.includes(m.id), false, `${s.span} kept its ${m.id} credit after the mechanism was renamed away — the credit is DECORATION`)
      lost.push(s.span)
    }
    assert.ok(lost.length > 0, `no swept prompt is credited to ${m.id} — the mechanism is dead fixture data`)
  }
})

// ---- the finisher's conflict: progress.md is the ONE file that may not carry a terminal verdict
const PROGRESS = SWEEP.progressRule
const EVIDENCE_DOC = readFileSync(join(REPO, PROGRESS.citedIn), 'utf8')
// sentences split on a period + whitespace and on newlines, and NEVER on a semicolon: `Write
// <session>finisher/progress.md; END with STATUS.` is ONE order, and the semicolon is exactly where a
// splitter would lose it. STATUS is matched shouted, which is how every prompt in the file spells it.
const progressVerdicts = (text) => String(text).split(/\.\s|\n/).map((s) => s.trim())
  .filter((s) => s.includes('progress.md') && /STATUS/.test(s))

test('close sweep: no stage prompt orders a terminal verdict into a progress.md', () => {
  assert.ok(EVIDENCE_DOC.includes(PROGRESS.prohibition),
    `the duty this rests on is gone from ${PROGRESS.citedIn} — re-anchor it, never drop the check: ${PROGRESS.prohibition}`)
  const offenders = SITES.sites.flatMap((s) => progressVerdicts(s.code).map((x) => `${s.span}: ${x.slice(0, 140)}`))
  assert.deepEqual(offenders, [],
    `these prompts name progress.md in the same breath as the STATUS ask, which ORDERS the one violation the ` +
    `protocol names outright (${PROGRESS.citedIn}: ${PROGRESS.prohibition}). Bind the stage instead, so its ` +
    `verdict lands on a reserved write-once terminal:\n  ${offenders.join('\n  ')}`)
  // the carrier is where progress.md is legitimately named, so it is checked RENDERED rather than exempted
  const am = freshAttemptMod(), bm = freshBindMod()
  const dir = am.attemptRef('coder-close-sweep', 'close-sweep', EPOCH, 1)
  const numbered = am.attemptRef('verifier', 'close-sweep', EPOCH, 1, { artifact: 'results' })
  for (const ref of [dir, numbered]) {
    assert.equal(ref.resultPath.endsWith('progress.md'), false,
      `a reserved terminal resolved to a progress.md (${ref.resultPath}) — the close obligation would order the verdict into it`)
    assert.deepEqual(progressVerdicts(bm.bindAttempt('SYNTHETIC probe body', ref, [], [])), [],
      'the carrier itself orders a verdict into progress.md')
  }
  assert.ok(bm.bindAttempt('SYNTHETIC probe body', dir, [], []).includes('progress.md'),
    'the directory-shape prompt no longer names progress.md at all — this check just went vacuous')
  // the unbound twin takes its path as an argument, so the same defect arrives as a CALL SITE rather than
  // as prose, where no sentence rule can see it
  const closeMarker = SWEEP.mechanisms.find((m) => m.id === 'closeArtifact').marker
  assert.deepEqual(SITES.masked.split(closeMarker).slice(1).filter((s) => /^[^)]*progress\.md/.test(s)).map((s) => s.slice(0, 60)), [],
    'a close-the-artifact call is pointed at a progress.md — the clause would order the verdict into the one file that may not hold it')
  // live, against the order the finisher dispatch really carried until it was bound. assembled from the
  // fixture's own ask so this file types no copy of a canonical prompt.
  const planted = `Write <session>finisher/progress.md; ${SWEEP.asks.find((a) => a.id === 'ask-status').phrase}.`
  assert.equal(progressVerdicts(planted).length, 1, `the sentence rule cannot see a verdict ordered into progress.md: ${planted}`)
  assert.deepEqual(progressVerdicts('Write <session>finisher/progress.md FIRST, and never a verdict.'), [],
    'the sentence rule flags a prompt that names progress.md without ordering a verdict into it')
})

// ---------------------------------------------------------------------------------------------
// role-file roster: the ccc routing, inline, in every role file that has to LOCATE code
// ---------------------------------------------------------------------------------------------
//
// WHAT THIS PROVES AND WHAT IT DOES NOT — the gap here is the widest in this file, so it is stated first
// and stated bluntly. It proves the routing IS PRESENT IN THE ROLE FILE'S BYTES. It is NOT behavioural
// coverage: nothing here dispatches an agent, nothing runs `ccc`, and an agent that reads the routing and
// still reaches for Bash `grep` passes every assertion below untouched. That is not a hypothetical corner
// — it is the measured status quo this gate was cut from: `ccc` was invoked 2 times in 107,791 tool calls
// against 27,821 plain greps, WHILE a correct routing already existed in a skill. A file-presence check
// could not have caught any of those 107,789, and claiming otherwise would make this the most misleading
// test in the suite. It catches the role file that never got the lines. That is the whole claim.
//
// WHY INLINE AT ALL, rather than read from the skill that owns the procedure: `skills:` frontmatter
// declares investigation-methodology on every required file below and it is measured NOT DELIVERED — a
// live probe reported it absent from context and had to read the file off disk — and the skill is
// `user-invocable: false` + `disable-model-invocation: true`, so an agent noticing the hole cannot pull it
// in. It is unreachable by any path. Same silent-field-drop class as the `observer:` field documented in
// docs/observer-agents.md. The loader is not ours to fix, so the mitigation is to carry the lines inline —
// the pattern the .codex twins were forced into years earlier — and this gate is what keeps them carried.
//
// The roster is READ FROM THE TREE for the same reason the close-the-artifact roster above is: a role file
// added tomorrow is checked tomorrow, with no edit here. Only the EXCLUSIONS are fixture data, because
// "this role never has to locate code" is a judgement a reviewer must be able to argue with.
const ROUTING = CASES.cccRouting
const routingRoster = () => filesIn(ROUTING.trees)
// same flat() the close-the-artifact roster uses, for the same reason and out of the same lesson: these
// blocks are hand-wrapped prose, so a required phrase straddles a line break and a raw-bytes match fails
// on LAYOUT rather than on a missing instruction. One normalizer, one meaning, both obligations.
const lacksRouting = (src) => ROUTING.requiredRouting.filter((ph) => !flat(src).includes(flat(ph)))

test('ccc roster: every role file that has to LOCATE code carries the routing inline, not a pointer to an undelivered skill', (t) => {
  const roster = routingRoster()
  assert.ok(roster.length >= ROUTING.minRoster,
    `derived only ${roster.length} role files — the derivation is broken, not the tree`)
  for (const tree of ROUTING.trees)
    assert.ok(roster.some((p) => p.startsWith(`${tree.dir}/`)), `${tree.dir} contributed NO role file`)
  const excluded = new Map(ROUTING.exclusions.map((e) => [e.path, e.why]))
  assert.equal(excluded.size, ROUTING.exclusions.length, 'an exclusion is listed twice')
  for (const [p, why] of excluded) {
    assert.ok(roster.includes(p), `exclusion names ${p}, which is not in the tree — a stale exclusion silently shrinks the checked set`)
    assert.ok(why.length > 40, `the exclusion for ${p} carries no reason a reviewer can argue with`)
    assert.ok(lacksRouting(roleSrc(p)).length > 0,
      `${p} is excluded as never having to locate code, yet it carries the full routing — the exclusion is wrong, delete it`)
  }
  const required = roster.filter((p) => !excluded.has(p))
  assert.ok(required.length >= ROUTING.minRequired,
    `only ${required.length} role files survive the exclusion list — it has swallowed the roster`)
  // ONE report over the whole sweep, not an assertion per file: the first failing assert hides the rest of
  // the worklist, and an obligation that reveals itself three files at a time is how the close-the-artifact
  // clause went missing three times in the same tree.
  const offenders = []
  for (const p of required) {
    const missing = lacksRouting(roleSrc(p))
    if (missing.length) offenders.push(`${p} — absent: ${missing.join(' / ')}`)
  }
  t.diagnostic(`${roster.length} role files on disk, ${excluded.size} excluded by fixture, ${required.length} required to carry the routing`)
  assert.deepEqual(offenders, [], `these role files have to LOCATE code and carry no inline ccc routing, so the only copy they ` +
    `get is the \`skills:\` frontmatter that is measured NOT to arrive — and the harness will meanwhile tell them twice to ` +
    `use Bash \`grep\`. Carry the block inline; do not hand-type a new dialect of it:\n  ${offenders.join('\n  ')}`)
})

// the scan proven live against IN-MEMORY mutants of real role-file bytes: the suite never writes the files
// it measures, and these belong to other owners. same lacksRouting the roster test above calls.
test('ccc roster: the routing scan is live — a role file with the routing cut out is caught', () => {
  const compliant = routingRoster().filter((p) => !lacksRouting(roleSrc(p)).length)
  assert.ok(compliant.length >= 2, 'no role file on disk carries the routing — there is nothing to mutate')
  for (const p of compliant) {
    const src = roleSrc(p)
    assert.deepEqual(lacksRouting(src), [], `${p}: control`)
    // the cut tolerates the same hand-wrapping the scan does, or the mutant leaves a phrase straddling a
    // line break, the scan still reads it, and the probe fails on LAYOUT instead of proving the scan bites
    const spanning = (ph) => new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'), 'ig')
    const cut = ROUTING.requiredRouting.reduce((s, ph) => s.split(spanning(ph)).join(''), src)
    assert.deepEqual(lacksRouting(cut), ROUTING.requiredRouting,
      `${p}: the scan still passes this file after its routing was removed`)
  }
})

// the codex lane, held to a DELIBERATELY WEAKER bar — see cccRouting.parityWhy. That lane never had a
// skill-preload mechanism, so it inlined routing long before this effort and every twin already carries
// some; but in its own wording and at varying depth, so demanding the full three phrases there would fail
// 15 files that route correctly. Failing on dialect is not a standard, it is a rewrite order.
test('ccc roster: every codex twin names both routing verbs inline, the lane having no skill preload to drop', (t) => {
  const twins = filesIn([ROUTING.parityTree])
  assert.ok(twins.length >= ROUTING.minParity,
    `derived only ${twins.length} codex twins — the derivation is broken, not the tree`)
  const offenders = twins.filter((p) => ROUTING.parityVerbs.some((v) => !flat(roleSrc(p)).includes(flat(v))))
  assert.deepEqual(offenders, [], `these codex role files name no inline routing at all, on the one lane that cannot fall ` +
    `back on a skill:\n  ${offenders.join('\n  ')}`)
  // the concession is asserted to still BE a concession. if every twin ever clears the full bar, this
  // weaker tier is no longer protecting anything real and is just a soft spot nobody has noticed.
  const full = twins.filter((p) => !lacksRouting(roleSrc(p)).length)
  assert.notEqual(full.length, twins.length,
    'every codex twin now carries the FULL routing — this verb-only tier has gone redundant, raise it to requiredRouting')
  t.diagnostic(`${twins.length} codex twins carry both verbs; ${full.length} of them state the full routing`)
})
