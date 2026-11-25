import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { auditFreshCheck, loadDeclarations } from './audit-codex-fresh-check.mjs'
import { commandReads, wrapperReads } from './audit-codex-fresh-check-commands.mjs'

const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'teamkit-instruction-audit-')))
const repoRoot = path.join(temporary, 'repo')
const session = path.join(repoRoot, 'team-session/check')
const external = path.join(temporary, 'registry/context-mode/SKILL.md')
const fixture = JSON.parse(readFileSync(new URL('./fixtures/codex-fresh-check-shapes.json', import.meta.url), 'utf8'))
const makeFile = (file, bytes = 'fixture instruction content\n') => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes); return file }
makeFile(path.join(session, 'requirements.md'))
makeFile(external)
after(() => { rmSync(temporary, { recursive: true, force: true }) })

const options = () => {
  const parent = structuredClone(fixture.entries.filter((entry) => entry.lane === 'parent').map((entry) => entry.record))
  const child = structuredClone(fixture.entries.filter((entry) => entry.lane === 'child').map((entry) => entry.record))
  const args = JSON.parse(parent[1].payload.arguments)
  parent[1].payload.arguments = JSON.stringify({ ...args, agent_type: 'team-plan-reviewer', fork_turns: 'none' })
  child[0].payload.cwd = repoRoot
  child[0].payload.source.subagent.thread_spawn.agent_role = 'team-plan-reviewer'
  const command = `cat '${session}/requirements.md'`
  Object.assign(child[1].payload.item, { cwd: repoRoot, command: ['/bin/zsh', '-lc', command], parsed_cmd: [{ type: 'read', cmd: command, path: `${session}/requirements.md` }] })
  return { parent, child, session, repoRoot, checkId: 'plan-review' }
}
const wrapper = (input) => ({ type: 'response_item', ordinal: 246, payload: { type: 'custom_tool_call', name: 'exec', input } })
const shell = (command) => `text(await tools.mcp__context_mode__ctx_execute({language:"shell",code:${JSON.stringify(command)}}));`
const includeRead = (config, file) => { config.child.push(wrapper(shell(`cat '${file}'`))); return config }
const manifest = (file = external, skill = 'context-mode:context-mode') => ({ version: 1, source: 'active-skill-registry', entries: [{ skill, path: file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }] })

test('exact external runtime instruction is denied without manifest', () => {
  assert.equal(auditFreshCheck(includeRead(options(), external)).status, 'FAIL')
})

test('root-attested exact canonical instruction and matching current digest permit only that file', () => {
  const config = includeRead(options(), external)
  config.manifest = manifest()
  const result = auditFreshCheck(config)
  assert.equal(result.status, 'PASS')
  assert.match(result.instructionManifest.provenance, /caller-attested/)
  assert.match(result.instructionManifest.basis, /historical/)
  assert.match(result.instructionManifest.sha256, /^[a-f0-9]{64}$/)
  assert.equal(result.observedReads.observations.at(-1).permission, 'exact runtime instruction entrypoint')
})

for (const relative of ['notes.md', 'descendant/SKILL.md']) test(`instruction manifest grants no neighbor or prefix: ${relative}`, () => {
  const file = makeFile(path.join(path.dirname(external), relative))
  const config = includeRead(options(), file)
  config.manifest = manifest()
  assert.equal(auditFreshCheck(config).status, 'FAIL')
})

test('digest mismatch invalidates manifest', () => {
  const config = includeRead(options(), external)
  config.manifest = manifest()
  config.manifest.entries[0].sha256 = '0'.repeat(64)
  const result = auditFreshCheck(config)
  assert.equal(result.status, 'FAIL')
  assert.match(result.instructionManifest.reason, /sha256/)
})

test('undeclared skill invalidates manifest', () => {
  const config = includeRead(options(), external)
  config.manifest = manifest(external, 'unregistered-skill')
  assert.equal(auditFreshCheck(config).instructionManifest.status, 'FAIL')
})

for (const mutate of [
  (entry) => { entry.path = path.dirname(entry.path) },
  (entry) => { entry.path += '/**' },
  (entry) => { entry.path = entry.path.replace('/context-mode/', '/context-mode/../context-mode/') },
  (entry) => { entry.path = makeFile(path.join(temporary, 'registry/map.md')) },
]) test(`non-exact entrypoint manifest is rejected: ${mutate.toString().slice(0, 60)}`, () => {
  const config = includeRead(options(), external)
  config.manifest = manifest()
  mutate(config.manifest.entries[0])
  assert.equal(auditFreshCheck(config).instructionManifest.status, 'FAIL')
})

for (const file of [`${session}/private/SKILL.md`, `${repoRoot}/team-session/another/SKILL.md`]) test(`instruction grant cannot bypass session isolation: ${file}`, () => {
  makeFile(file)
  const config = includeRead(options(), file)
  config.manifest = manifest(file)
  const result = auditFreshCheck(config)
  assert.equal(result.instructionManifest.status, 'PASS')
  assert.equal(result.status, 'FAIL')
})

test('API validates against canonical declared instruction skill names', () => {
  assert.deepEqual(loadDeclarations().instructionSkills, ['context-mode:context-mode', 'ccc'])
})

test('literal absolute shell reads do not depend on cwd metadata', () => {
  assert.deepEqual(commandReads(`cat '${external}'`), { reads: [{ path: external, range: null }] })
  assert.deepEqual(commandReads(`sed -n '1,2p' '${external}'`), { reads: [{ path: external, range: [1, 2] }] })
  assert.ok(commandReads('cat relative.md').unknown)
  const config = includeRead(options(), `${session}/requirements.md`)
  delete config.child[0].payload.cwd
  assert.equal(auditFreshCheck(config).status, 'PASS')
})

test('literal batch preserves each independent read and write', () => {
  const source = `${shell(`cat '${session}/requirements.md'`)}\n${shell(`cat '${external}'`)}\n`
  const result = wrapperReads(source)
  assert.equal(result.reads.length, 2)
  assert.equal(result.unknown, undefined)
  const config = options()
  config.manifest = manifest()
  config.child.push(wrapper(source))
  assert.equal(auditFreshCheck(config).status, 'PASS')
})

test('forbidden literal batch member produces FAIL', () => {
  const config = options()
  config.child.push(wrapper(`${shell(`cat '${session}/requirements.md'`)}\n${shell(`cat '${session}/planner/secret.md'`)}`))
  const result = auditFreshCheck(config)
  assert.equal(result.status, 'FAIL')
  assert.equal(result.observedReads.count, 3)
})

test('unsupported residual remains unknown while supported reads remain observed', () => {
  const config = options()
  config.child.push(wrapper(`${shell(`cat '${session}/requirements.md'`)}\nconst arbitrary = ALL_TOOLS;\n${shell(`cat '${session}/design.md'`)}`))
  const result = auditFreshCheck(config)
  assert.equal(result.status, 'INDETERMINATE')
  assert.equal(result.observedReads.count, 3)
})

test('ALL_TOOLS discovery remains unknown without file-string scraping', () => {
  const source = 'text(ALL_TOOLS.filter(x => /ctx_execute|ctx_execute_file/.test(x.name)));'
  assert.ok(wrapperReads(source).unknown)
  assert.equal(wrapperReads(source).reads.length, 0)
})

test('first-line well-formed exec pragma is inert; malformed or executable tail remains unknown', () => {
  const source = shell(`cat '${external}'`)
  assert.equal(wrapperReads(`// @exec: {"max_output_tokens":20000}\n${source}`).unknown, undefined)
  assert.ok(wrapperReads(`// @exec: {"max_output_tokens":20000}; arbitrary()\n${source}`).unknown)
  assert.ok(wrapperReads(`// @exec: {"unknown":20000}\n${source}`).unknown)
})

test('commented wrappers are not observed reads', () => {
  const source = `${shell(`cat '${external}'`)}\n// ${shell(`cat '${session}/secret.md'`)}\n/* ${shell(`cat '${session}/another-secret.md'`)} */`
  const result = wrapperReads(source)
  assert.equal(result.reads.length, 1)
  assert.ok(result.unknown)
})

test('actual captured native batches and pragma retain all literal reads', () => {
  const entries = fixture.entries.filter((entry) => entry.lane === 'native-batch')
  assert.equal(entries.length, 3)
  const observations = entries.map((entry) => wrapperReads(entry.record.payload.input))
  assert.deepEqual(observations.map((entry) => entry.reads.length), [2, 8, 1])
  assert.equal(observations.every((entry) => !entry.unknown), true)
})
