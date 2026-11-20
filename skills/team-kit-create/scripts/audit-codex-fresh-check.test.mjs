import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { auditFreshCheck, loadDeclarations, mapSectionRanges } from './audit-codex-fresh-check.mjs'
import { commandReads, wrapperReads } from './audit-codex-fresh-check-commands.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/codex-fresh-check-shapes.json', import.meta.url), 'utf8'))
const repoRoot = '/Volumes/DriveHard/samelie-monorepo'
const session = `${repoRoot}/team-session/native-fixture`
const projected = (lane) => structuredClone(fixture.entries.filter((entry) => entry.lane === lane).map((entry) => entry.record))
const base = () => {
  const parent = projected('parent')
  const child = projected('child')
  // these explicit mutations test the real captured shapes; the source was explorer/fork:all.
  const args = JSON.parse(parent[1].payload.arguments)
  parent[1].payload.arguments = JSON.stringify({ ...args, agent_type: 'team-plan-reviewer', fork_turns: 'none' })
  child[0].payload.source.subagent.thread_spawn.agent_role = 'team-plan-reviewer'
  return { parent, child, session, checkId: 'plan-review', repoRoot }
}
const readCommand = (options, command, file = `${session}/requirements.md`) => {
  const item = options.child[1].payload.item
  item.command[2] = command
  item.parsed_cmd = [{ type: 'read', cmd: command, name: file.split('/').at(-1), path: file }]
  return options
}
const custom = (input, ordinal = 246) => ({ type: 'response_item', ordinal, payload: { type: 'custom_tool_call', name: 'exec', input } })

test('unmodified real projection cannot claim fresh native plan review', () => {
  const result = auditFreshCheck({ ...base(), parent: projected('parent'), child: projected('child') })
  assert.equal(result.status, 'FAIL')
  assert.match(result.roleFreshness.reasons.join(' '), /role|fork/)
  assert.equal(result.observedReads.count, 1)
})

test('matching role and explicit fresh dispatch plus real read shape pass the observed audit', () => {
  const result = auditFreshCheck(base())
  assert.equal(result.status, 'PASS')
  assert.equal(result.dispatchHeader.status, 'UNOBSERVABLE')
  assert.notEqual(result.roleFreshness.childId, result.roleFreshness.parentId)
  assert.equal(result.observedReads.observations[0].ordinal, 245)
})

for (const [name, mutate] of [
  ['fork all', (options) => { const args = JSON.parse(options.parent[1].payload.arguments); args.fork_turns = 'all'; options.parent[1].payload.arguments = JSON.stringify(args) }],
  ['missing explicit fork', (options) => { const args = JSON.parse(options.parent[1].payload.arguments); delete args.fork_turns; options.parent[1].payload.arguments = JSON.stringify(args) }],
  ['wrong native role', (options) => { options.child[0].payload.source.subagent.thread_spawn.agent_role = 'team-coder' }],
  ['wrong parent thread', (options) => { options.child[0].payload.source.subagent.thread_spawn.parent_thread_id = 'other' }],
  ['wrong hierarchical path', (options) => { options.child[0].payload.source.subagent.thread_spawn.agent_path = '/other/native_probe_evidence' }],
]) test(`rejects ${name}`, () => {
  const options = base()
  mutate(options)
  assert.equal(auditFreshCheck(options).status, 'FAIL')
})

test('missing dispatch is indeterminate', () => {
  const options = base()
  options.parent.pop()
  assert.equal(auditFreshCheck(options).status, 'INDETERMINATE')
})

test('inherited forbidden reads are excluded using native history ordinal', () => {
  const options = readCommand(base(), `cat ${session}/planner/secret.md`, `${session}/planner/secret.md`)
  const inherited = structuredClone(options.child[1])
  inherited.ordinal = 229
  options.child[1] = projected('child')[1]
  options.child.splice(1, 0, inherited)
  const result = auditFreshCheck(options)
  assert.equal(result.status, 'PASS')
  assert.equal(result.observedReads.count, 1)
})

test('zero reads do not pass', () => {
  const options = base()
  options.child.pop()
  assert.equal(auditFreshCheck(options).status, 'INDETERMINATE')
})

for (const file of ['designer/explore.md', 'plan-review.md', '../other-session/requirements.md']) test(`rejects out-of-set ${file}`, () => {
  const absolute = `${session}/${file}`
  assert.equal(auditFreshCheck(readCommand(base(), `cat ${absolute}`, absolute)).status, 'FAIL')
})

test('deny wins over allow and own output cannot be read', () => {
  const options = base()
  options.checkId = 'refuter'
  options.declarations = structuredClone(loadDeclarations())
  const declaration = options.declarations.checks.find((check) => check.id === 'refuter')
  declaration.agentType.codex = 'team-plan-reviewer'
  const denied = `${session}/researcher/research-findings-refute-sample.md`
  assert.equal(auditFreshCheck(readCommand(options, `cat ${denied}`, denied)).status, 'FAIL')
  const allowed = `${session}/researcher/research-findings-sample.md`
  assert.equal(auditFreshCheck(readCommand(options, `cat ${allowed}`, allowed)).status, 'PASS')
})

const mapText = '# Session\nDestination: deliver\n\n## Premises\nprivate\n## Not yet specified\nnone\n## Out of scope\nexcluded'
test('map section ranges match canonical header and level-two section boundaries', () => {
  assert.deepEqual(mapSectionRanges(mapText), { Destination: [[1, 3]], Premises: [[4, 5]], 'Not yet specified': [[6, 7]], 'Out of scope': [[8, 9]] })
})

for (const [command, expected] of [
  [`cat ${session}/map.md`, 'FAIL'],
  [`sed -n '1,3p' ${session}/map.md`, 'PASS'],
  [`sed -n '1,4p' ${session}/map.md`, 'FAIL'],
  [`sed -n '6,9p' ${session}/map.md`, 'PASS'],
]) test(`section-scoped read: ${command}`, () => {
  const options = readCommand(base(), command, `${session}/map.md`)
  options.mapText = mapText
  assert.equal(auditFreshCheck(options).status, expected)
})

test('map without snapshot is indeterminate for explicit range', () => {
  assert.equal(auditFreshCheck(readCommand(base(), `sed -n '1,3p' ${session}/map.md`, `${session}/map.md`)).status, 'INDETERMINATE')
})

test('simple literal shell wrappers yield observed reads', () => {
  for (const input of [
    `text(await tools.exec_command({cmd: "cat ${session}/requirements.md"}));`,
    `await tools.mcp__context_mode__ctx_execute({language:'shell',code:'cat ${session}/requirements.md'})`,
    `text(await tools.mcp__context_mode__ctx_execute_file({path:'${session}/requirements.md',language:'javascript',code:'console.log(FILE_CONTENT)'}))`,
    `text(await tools.mcp__context_mode__ctx_execute_file({path:'${session}/requirements.md',language:'python',code:'print(FILE_CONTENT)'}));`,
    `text(await tools.mcp__context_mode__ctx_execute({language:'shell',code:'cat requirements.md',cwd:'${session}'}));`,
  ]) {
    const options = base()
    options.child.push(custom(input))
    const result = auditFreshCheck(options)
    assert.equal(result.status, 'PASS', JSON.stringify(result.observedReads.unknowns))
    assert.equal(result.observedReads.count, 2)
  }
})

for (const input of [
  `const file='${session}/requirements.md'; text(await tools.exec_command({cmd:'cat '+file}));`,
  `text(await tools.mcp__context_mode__ctx_execute({language:'python',code:'print(open("secret").read())'}));`,
  `text(await tools.exec_command({cmd:'python -c "print(1)"'}));`,
  `// '${session}/secret.md'\ntext(await tools.clock__curr_time({}));`,
  'gAAAAopaque-encrypted-input',
]) test(`unsupported wrapper stays unknown: ${input.slice(0, 55)}`, () => {
  const options = base()
  options.child.push(custom(input))
  const result = auditFreshCheck(options)
  assert.equal(result.status, 'INDETERMINATE')
  assert.equal(result.observedReads.count, 1)
  assert.equal(result.observedReads.unknowns[0].ordinal, 246)
})

test('literal file wrapper records path but arbitrary processing is unknown', () => {
  const result = wrapperReads(`await tools.mcp__context_mode__ctx_execute_file({path:'${session}/requirements.md',language:'javascript',code:'require("fs").readFileSync("secret")'})`, repoRoot)
  assert.equal(result.reads[0].path, `${session}/requirements.md`)
  assert.match(result.unknown, /additional files/)
})

test('shell command substitution cannot masquerade as literal reads', () => {
  assert.equal(commandReads('cat "$(cat secret)"', repoRoot).reads.length, 0)
  assert.ok(commandReads('cat "$(cat secret)"', repoRoot).unknown)
})

test('parsed native read is retained even with unknown shell residual', () => {
  const file = `${session}/designer/explore.md`
  const result = auditFreshCheck(readCommand(base(), `cat ${file}; python hidden.py`, file))
  assert.equal(result.status, 'FAIL')
  assert.equal(result.observedReads.count, 1)
  assert.equal(result.observedReads.unknowns.length, 1)
})

test('literal add-file patch can write the declared artifact without gaining reads', () => {
  const options = base()
  const patch = `*** Begin Patch\n*** Add File: ${session}/plan-review.md\n+Readiness: READY\n*** End Patch`
  options.child.push(custom(`text(await tools.apply_patch(${JSON.stringify(patch)}));`))
  const result = auditFreshCheck(options)
  assert.equal(result.status, 'PASS')
  assert.equal(result.observedReads.count, 1)
  assert.equal(result.observedWrites.count, 1)
  options.child[2].payload.input = `text(await tools.apply_patch(${JSON.stringify(patch.replace('/plan-review.md', '/requirements.md'))}));`
  assert.equal(auditFreshCheck(options).status, 'FAIL')
})

test('updates and dynamic patch input remain unknown', () => {
  for (const input of ['await tools.apply_patch(variable)', `await tools.apply_patch(${JSON.stringify(`*** Begin Patch\n*** Update File: ${session}/plan-review.md\n@@\n-a\n+b\n*** End Patch`)})`]) {
    assert.ok(wrapperReads(input, repoRoot).unknown)
  }
})

test('new child delegation cannot hide unobserved descendant reads', () => {
  const options = base()
  options.child.push({ type: 'response_item', ordinal: 247, payload: { type: 'function_call', name: 'spawn_agent', arguments: '{}' } })
  assert.equal(auditFreshCheck(options).status, 'INDETERMINATE')
})

for (const command of [
  `cat '${repoRoot}/team-'session/native-fixture/map.md`,
  `cat ${repoRoot}/team-"session/native-fixture/map.md"`,
  `cat '${repoRoot}/team-'"session/native-fixture/map.md"`,
  `sed -n '1,3p' -f${session}/map.md`,
  `sed -n '1,3p' --file=${session}/map.md`,
  `sed -n '1,3p' ~/map.md`,
  `sed -n '1,3p' ~root/map.md`,
  `sed -n '1,3p' =python`,
  `cat =python`,
  `cat ${repoRoot}/team-\\session/native-fixture/map.md`,
  `cat ${repoRoot}/team-session/native-fixture/map.md(N)`,
]) test(`shell grammar cannot greenlight unsupported word or option: ${command}`, () => {
  const parsed = commandReads(command, repoRoot)
  assert.ok(parsed.unknown)
  assert.equal(parsed.reads.length, 0)
  const options = base()
  options.child.push(custom(`text(await tools.mcp__context_mode__ctx_execute({language:'shell',code:${JSON.stringify(command)},cwd:${JSON.stringify(repoRoot)}}));`))
  const result = auditFreshCheck(options)
  assert.equal(result.status, 'INDETERMINATE')
  assert.equal(result.observedReads.unknowns.at(-1).ordinal, 246)
})

for (const escape of [String.raw`\u0073`, String.raw`\x73`, String.raw`\u{73}`]) test(`javascript escaped session path cannot become a false literal: ${escape}`, () => {
  const input = `await tools.mcp__context_mode__ctx_execute_file({path:'${repoRoot}/team-${escape}ession/native-fixture/map.md',language:'javascript',code:'console.log(FILE_CONTENT)'})`
  assert.ok(wrapperReads(input, repoRoot).unknown)
  const options = base()
  options.child.push(custom(input))
  const result = auditFreshCheck(options)
  assert.equal(result.status, 'INDETERMINATE')
  assert.equal(result.observedReads.count, 1)
})

test('json-compatible double-quoted unicode escapes are decoded before path classification', () => {
  const input = String.raw`await tools.mcp__context_mode__ctx_execute_file({path:"/Volumes/DriveHard/samelie-monorepo/team-\u0073ession/native-fixture/map.md",language:"javascript",code:"console.log(FILE_CONTENT)"})`
  const options = base()
  options.child.push(custom(input))
  assert.equal(auditFreshCheck(options).status, 'FAIL')
})
