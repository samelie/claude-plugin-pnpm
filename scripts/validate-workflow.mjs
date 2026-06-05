#!/usr/bin/env node
// Workflow-script validator — Axis A (structural / safety) ADVISORY lint for team-kit workflow scripts.
// ADVISORY, NOT a correctness guarantee: it encodes DATED, REVERSE-ENGINEERED preview-API rules
// (rule7 forbidden-APIs / rule10 coverage / rule11 tryAgent / prod-gate). The workflow JS API is
// vendor-unpublished + research-preview — when it shifts these invariants go stale. Re-verify on every
// Claude Code upgrade; treat as a disposable guardrail, NOT load-bearing infra.
// Reusable for ANY workflow script (.js), not just team-kit ones. Axis B (semantic fidelity
// of the script vs the plan/design markdown ground-truth) is an LLM review — see team-kit-run, NOT here.
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

// Extract the `export const meta = { ... }` object text via brace balancing (robust vs regex).
const extractMeta = (src) => {
  const m = /export\s+const\s+meta\s*=\s*\{/.exec(src)
  if (!m) return null
  let i = m.index + m[0].length - 1 // at the opening brace
  let depth = 0, end = -1
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  if (end === -1) return null // unbalanced braces — malformed meta (parse-check will also flag it)
  return src.slice(m.index, end)
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
  [/\bimport\s+[^.]/, 'import statement (scripts have no import — rule 7)'],
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
  }

  // Conditional invariants (rules 10/11) — only when the relevant primitive is used.
  if (/\bparallel\s*\(/.test(src) && !/\bcoverage\s*\(/.test(src))
    warnings.push({ check: 'rule10', message: 'parallel() used without a coverage() assert — a dropped fan-out element can read as covered' })
  if (/\bawait\s+agent\s*\(/.test(src) && !/\btryAgent\b/.test(src))
    warnings.push({ check: 'rule11', message: 'await agent() used without a tryAgent wrapper — a transport throw aborts the whole run' })

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
