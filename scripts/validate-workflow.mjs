#!/usr/bin/env node
// workflow-script validator — axis a (structural / safety) advisory lint, not a correctness guarantee.
// platform checks restate the documented runtime rules (code.claude.com/docs/en/workflows.md → "edit a
// saved script", "behavior and limits"; re-checked at cc 2.1.296): meta first + literal with name and
// description, phases titles matching phase() calls, Date.now/Math.random/argless new Date throw, no
// module loading, no fs/shell from the script. rule10 coverage / rule11 tryAgent / prod-gate are
// team-kit policy (team-kit-run SKILL.md rules table), not platform limits.
// reusable for any workflow script. axis b (script vs plan/design fidelity) is an llm review — team-kit-run.
//
// Two severities:
//   ERROR   → hard fail (exit 1): the script cannot run or breaks the contract — syntax invalid,
//             no `export const meta`, meta missing name/description.
//   WARNING → review (exit 0): heuristic safety smells a human (or Axis B) should confirm — regex
//             can't perfectly tell code from a prompt string, so these never hard-fail by default.
//
// Usage:
//   node scripts/validate-workflow.mjs <file.js> [--json] [--warn-only]
//   node scripts/validate-workflow.mjs --selftest
//
// --warn-only downgrades ERRORs to WARNINGs (advisory run, never exit 1).
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length

// Scan a source for every match of `re`, returning {check,message,line} records.
const scan = (src, re, check, message) => {
  const out = []
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m
  while ((m = g.exec(src)) !== null) {
    out.push({ check, message: message(m), line: lineOf(src, m.index) })
    if (m.index === g.lastIndex) g.lastIndex++ // zero-width guard
  }
  return out
}

// skeleton of a js snippet: comments dropped, every string/template literal collapsed to "".
// interp flags a template literal carrying ${…} (a non-literal value).
const skeleton = (text) => {
  let out = ''
  let interp = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const n = text[i + 1]
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { const e = text.indexOf('*/', i + 2); i = e === -1 ? text.length : e + 2; continue }
    if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\') i++
        else if (c === '`' && text[i] === '$' && text[i + 1] === '{') interp = true
        i++
      }
      i++
      out += '""'
      continue
    }
    out += c
    i++
  }
  return { out, interp }
}

// extract the `export const meta = { ... }` object text via string/comment-aware brace balancing.
const extractMeta = (src) => {
  const m = /export\s+const\s+meta\s*=\s*\{/.exec(src)
  if (!m) return null
  let depth = 0
  let i = m.index + m[0].length - 1
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e === -1 ? src.length : e + 2; continue }
    if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++ }
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1) }
    i++
  }
  return null // unbalanced braces — malformed meta (parse-check will also flag it)
}

// documented: meta must be the first statement and a plain literal, else /<name> drops from autocomplete
const metaShape = (src, meta) => {
  const out = []
  const lead = skeleton(src.slice(0, src.indexOf(meta))).out.replace(/^#!.*\n/, '')
  if (lead.trim() !== '') out.push({ check: 'meta-first', message: '`export const meta` is not the first statement' })
  const { out: body, interp } = skeleton(meta.replace(/^export\s+const\s+meta\s*=\s*/, ''))
  const ident = [...body.matchAll(/[{[,:]\s*([A-Za-z_$][\w$.]*)\s*(?=[,}\]\n(])/g)]
    .map(m => m[1]).filter(v => !['true', 'false', 'null'].includes(v))
  if (interp || /\.\.\./.test(body) || /[\w$)\]]\s*\(/.test(body) || ident.length)
    out.push({ check: 'meta-literal', message: `meta holds a non-literal value (${interp ? 'template ${…}' : ident[0] || 'spread/call'}) — documented: /<name> drops from / autocomplete` })
  return out
}

// Syntax check via a throwaway temp .mjs + `node --check`. Workflow scripts are NOT plain modules:
// the body runs inside an async function (top-level `await` AND top-level `return` are valid) and
// `export const meta` is extracted by the runtime. So we strip the meta export and wrap the rest in
// an async IIFE before checking — otherwise top-level `return` would (wrongly) read as a syntax error.
// Undeclared globals (agent/parallel/args/…) are NOT syntax errors, so they pass correctly.
const parseCheck = (src) => {
  const meta = extractMeta(src)
  const body = meta ? src.replace(meta, '') : src
  const wrapped = '(async () => {\n' + body + '\n})()\n'
  let dir
  try {
    dir = mkdtempSync(join(tmpdir(), 'wfval-'))
    const f = join(dir, 'candidate.mjs')
    writeFileSync(f, wrapped)
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
    if (r.status === 0) return { ok: true }
    return { ok: false, error: (r.stderr || r.stdout || 'parse failed').trim().split('\n').slice(0, 4).join(' ') }
  } catch (e) {
    return { ok: false, error: 'parse-check could not run: ' + ((e && e.message) || e) }
  } finally {
    if (dir) try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// Heuristic safety/determinism patterns (WARNINGS — may legitimately appear inside prompt strings).
const FORBIDDEN = [
  [/\bimport\s+[^.(]/, 'import statement (scripts have no import — rule 7)'],
  [/(?<![.\w$])import\s*\(/, 'dynamic import() (documented: a script containing import() fails before the run starts — rule 7)'],
  [/\brequire\s*\(/, 'require() (scripts have no require — rule 7)'],
  [/\bDate\.now\s*\(/, 'Date.now() (throws in workflow scripts — rule 7; pass via args)'],
  [/\bMath\.random\s*\(/, 'Math.random() (throws in workflow scripts — rule 7)'],
  [/\bnew\s+Date\s*\(\s*\)/, 'argless new Date() (throws in workflow scripts — rule 7)'],
  [/\bprocess\.[a-zA-Z]/, 'process.* (no Node process in workflow scripts)'],
  [/\b(?:fs|child_process|node:fs|node:child_process)\b/, 'fs/child_process reference (scripts have no filesystem — only agents act)'],
]

// Prod / irreversible / paid mutations that must NEVER be inside the autonomous workflow (prod-gating).
const PROD = [
  [/\bpulumi\s+(?:up|destroy)\b/, 'pulumi up/destroy'],
  [/\bkubectl\s+(?:apply|delete|scale|patch|rollout|drain|cordon|edit|replace|create)\b/, 'kubectl mutation'],
  [/\bhelm\s+(?:install|upgrade|uninstall|delete|rollback)\b/, 'helm mutation'],
  [/\bterraform\s+(?:apply|destroy)\b/, 'terraform apply/destroy'],
  [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/, 'rm -rf'],
  [/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i, 'destructive SQL'],
  [/\bgit\s+push\b/, 'git push'],
  [/\b(?:npm|pnpm|yarn)\s+publish\b/, 'package publish'],
  [/\b(?:migrate|migration)\s+(?:up|deploy|run)\b/, 'db migration'],
]

const validate = (src) => {
  const errors = []
  const warnings = []

  const parsed = parseCheck(src)
  if (!parsed.ok) errors.push({ check: 'parse', message: 'invalid ESM syntax: ' + parsed.error })

  const meta = extractMeta(src)
  if (!meta) {
    errors.push({ check: 'meta', message: 'missing `export const meta = { ... }` (required literal)' })
  } else {
    if (!/\bname\s*:/.test(meta)) errors.push({ check: 'meta', message: 'meta missing `name`' })
    if (!/\bdescription\s*:/.test(meta)) errors.push({ check: 'meta', message: 'meta missing `description`' })
    for (const w of metaShape(src, meta)) warnings.push(w)
  }

  // Conditional invariants (rules 10/11) — only when the relevant primitive is used.
  if (/\bparallel\s*\(/.test(src) && !/\bcoverage\s*\(/.test(src))
    warnings.push({ check: 'rule10', message: 'parallel() used without a coverage() assert — a dropped fan-out element can read as covered' })
  if (/\bawait\s+agent\s*\(/.test(src) && !/\btryAgent\b/.test(src))
    warnings.push({ check: 'rule11', message: 'await agent() used without a tryAgent wrapper — a directly awaited agent() that throws (e.g. stalled on all 6 attempts) ends the run' })

  // phase-title parity (documented contract): every phase()/opts.phase string must appear in meta.phases.
  if (meta) {
    const metaTitles = new Set([...meta.matchAll(/title\s*:\s*(['"`])([^'"`]+)\1/g)].map(m => m[2]))
    const used = new Set([
      ...[...src.matchAll(/(?<!\.)\bphase\s*\(\s*(['"`])([^'"`]+)\1/g)].map(m => m[2]),
      ...[...src.matchAll(/\bphase\s*:\s*(['"`])([^'"`]+)\1/g)].map(m => m[2]),
    ])
    for (const t of used) if (!metaTitles.has(t))
      warnings.push({ check: 'phase-parity', message: `phase "${t}" used but not listed in meta.phases — titles are matched exactly; the stage lands outside its group` })
  }

  for (const [re, msg] of FORBIDDEN) for (const w of scan(src, re, 'rule7', () => msg)) warnings.push(w)
  for (const [re, label] of PROD) for (const w of scan(src, re, 'prod-gate', () => 'possible prod/irreversible action (' + label + ') — must be human-gated, not in the workflow')) warnings.push(w)

  return { pass: errors.length === 0, errors, warnings }
}

// ---------------- CLI ----------------
const report = (file, r, json) => {
  if (json) { console.log(JSON.stringify({ file, ...r }, null, 2)); return }
  const tag = r.pass ? '✓ PASS' : '✗ FAIL'
  console.log(`${tag}  ${file}  (${r.errors.length} errors, ${r.warnings.length} warnings)`)
  for (const e of r.errors) console.log(`  ERROR  [${e.check}]${e.line ? ' L' + e.line : ''}: ${e.message}`)
  for (const w of r.warnings) console.log(`  warn   [${w.check}]${w.line ? ' L' + w.line : ''}: ${w.message}`)
}

const SELFTEST_CASES = [
  {
    name: 'good',
    src: "export const meta = { name: 'x', description: 'y' }\nconst coverage = (r,n)=>r.length===n\nconst tryAgent = async (l,p,o)=>{try{return await agent(p,o)}catch(e){return 'STATUS: ERRORS_REMAINING'}}\nconst r = await parallel([()=>agent('a')])\ncoverage(r,1)\nawait tryAgent('x','p')\n",
    expectPass: true, expectWarn: [],
  },
  { name: 'bad-syntax', src: 'export const meta = { name: "x", description: "y"\nconst a = (', expectPass: false, expectErr: ['parse'] },
  { name: 'no-meta', src: "const x = 1\nawait agent('p')\n", expectPass: false, expectErr: ['meta'] },
  { name: 'meta-incomplete', src: "export const meta = { name: 'x' }\n", expectPass: false, expectErr: ['meta'] },
  { name: 'warn-parallel', src: "export const meta = { name: 'x', description: 'y' }\nconst r = await parallel([()=>agent('a')])\n", expectPass: true, expectWarn: ['rule10'] },
  { name: 'warn-await-agent', src: "export const meta = { name: 'x', description: 'y' }\nconst x = await agent('p')\n", expectPass: true, expectWarn: ['rule11'] },
  { name: 'top-level-return', src: "export const meta = { name: 'x', description: 'y' }\nconst x = await agent('p')\nreturn { ok: true }\n", expectPass: true, expectErr: [] },
  { name: 'warn-prod', src: "export const meta = { name: 'x', description: 'y' }\nawait agent('run: kubectl delete pod foo')\n", expectPass: true, expectWarn: ['prod-gate'] },
  { name: 'warn-phase-parity', src: "export const meta = { name: 'x', description: 'y', phases: [{ title: 'Research' }] }\nphase('Research')\nphase('Audit')\n", expectPass: true, expectWarn: ['phase-parity'] },
  { name: 'warn-dynamic-import', src: "export const meta = { name: 'x', description: 'y' }\nconst m = await import('node:fs')\n", expectPass: true, expectWarn: ['rule7'] },
  { name: 'warn-dynamic-import-var', src: "export const meta = { name: 'x', description: 'y' }\nconst n = 'a'\nconst m = await import(n)\n", expectPass: true, expectWarn: ['rule7'] },
  { name: 'no-warn-member-import', src: "export const meta = { name: 'x', description: 'y' }\nconst o = { import: (v) => v }\nconst m = o.import(1)\n", expectPass: true, expectWarn: [], expectNoWarn: ['rule7'] },
  { name: 'warn-meta-first', src: "const N = 'x'\nexport const meta = { name: 'x', description: 'y' }\n", expectPass: true, expectWarn: ['meta-first'] },
  { name: 'warn-meta-literal', src: "// lead comment\nexport const meta = { name: NAME, description: 'y' }\n", expectPass: true, expectWarn: ['meta-literal'], expectNoWarn: ['meta-first'] },
  { name: 'meta-literal-ok', src: "// a (comment) with parens\nexport const meta = {\n  name: 'x', // trailing (note)\n  description: 'has { brace } and (parens)',\n  phases: [{ title: 'A', model: 'opus' }],\n  flag: true,\n}\nphase('A')\n", expectPass: true, expectNoWarn: ['meta-first', 'meta-literal'] },
  { name: 'phase-parity-ok', src: "export const meta = { name: 'x', description: 'y', phases: [{ title: 'Research' }, { title: 'Audit' }] }\nphase('Research')\nconst x = await agent('p', { phase: 'Audit' })\n", expectPass: true, expectWarn: ['rule11'] },
]

const selftest = () => {
  let failed = 0
  for (const c of SELFTEST_CASES) {
    const r = validate(c.src)
    const errChecks = r.errors.map((e) => e.check)
    const warnChecks = r.warnings.map((w) => w.check)
    const problems = []
    if (c.expectPass !== undefined && r.pass !== c.expectPass) problems.push(`pass=${r.pass} expected ${c.expectPass}`)
    for (const e of c.expectErr || []) if (!errChecks.includes(e)) problems.push(`missing error ${e}`)
    for (const w of c.expectWarn || []) if (!warnChecks.includes(w)) problems.push(`missing warning ${w}`)
    for (const w of c.expectNoWarn || []) if (warnChecks.includes(w)) problems.push(`unexpected warning ${w}`)
    if (problems.length) { failed++; console.error(`✗ selftest ${c.name}: ${problems.join('; ')}`) }
    else console.log(`✓ selftest ${c.name}`)
  }
  if (failed) { console.error(`\n${failed} selftest case(s) failed`); process.exit(1) }
  console.log(`\nall ${SELFTEST_CASES.length} selftest cases passed`)
}

const args = process.argv.slice(2)
if (args.includes('--selftest')) {
  selftest()
} else {
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) { console.error('usage: validate-workflow.mjs <file.js> [--json] [--warn-only] | --selftest'); process.exit(2) }
  const json = args.includes('--json')
  const warnOnly = args.includes('--warn-only')
  let src
  try { src = readFileSync(file, 'utf8') } catch (e) { console.error('cannot read ' + file + ': ' + ((e && e.message) || e)); process.exit(2) }
  const r = validate(src)
  report(file, r, json)
  process.exit(!r.pass && !warnOnly ? 1 : 0)
}
