import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { shouldNudge, targets } from './tk-research-nudge.mjs'

const hook = join(dirname(fileURLToPath(import.meta.url)), 'tk-research-nudge.mjs')
const TS = '/repo/team-session'
const SYNCED = `${TS}/20261103-headscale-vps-migrate/map.md`
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'tk-nudge-'))
  mkdirSync(join(root, 'state', 'tk-sync'), { recursive: true })
  writeFileSync(join(root, 'state', 'tk-sync', 'state.json'), JSON.stringify({ synced: { '20261103-headscale-vps-migrate': {} } }))
  return { root, env: { TK_EXPORTER_STATE: join(root, 'state') } }
}
const bash = command => ({ tool_name: 'Bash', tool_input: { command } })
const read = file_path => ({ tool_name: 'Read', tool_input: { file_path } })

test('targets: root and globs are broad, effort dirs named, underscore dirs ignored', () => {
  assert.deepEqual(targets(`rg -n x ${TS}/`), { broad: true, efforts: [] })
  assert.deepEqual(targets(`${TS}/*/map.md`), { broad: true, efforts: [] })
  assert.deepEqual(targets(`${TS}/a-effort/map.md`), { broad: false, efforts: ['a-effort'] })
  assert.deepEqual(targets(`${TS}/_observability/x.ndjson`), { broad: false, efforts: [] })
  assert.deepEqual(targets('cat .claude/skills/team-session-writing/SKILL.md'), { broad: false, efforts: [] })
})

test('nudges broad reads and synced efforts, silent on live efforts and writes', () => {
  const { env } = fixture()
  assert.equal(shouldNudge(bash(`rg --no-ignore -n D-3 ${TS}/`), env), true)
  assert.equal(shouldNudge({ tool_name: 'Glob', tool_input: { path: TS, pattern: '*/grade*.md' } }, env), true)
  assert.equal(shouldNudge({ tool_name: 'Grep', tool_input: { pattern: 'x', path: TS } }, env), true)
  assert.equal(shouldNudge(read(SYNCED), env), true)
  assert.equal(shouldNudge(read(`${TS}/20261117-live-wip/map.md`), env), false)
  assert.equal(shouldNudge(bash(`cat > ${TS}/20261117-live-wip/x.md <<EOF`), env), false)
  assert.equal(shouldNudge(bash(`echo hi | tee -a ${TS}/x/log.md`), env), false)
  assert.equal(shouldNudge(bash(`mkdir -p ${TS}/new-effort`), env), false)
  assert.equal(shouldNudge(bash('rg -n foo src/'), env), false)
  assert.equal(shouldNudge({ tool_name: 'Edit', tool_input: { file_path: SYNCED } }, env), false)
  assert.equal(shouldNudge(bash(`rg x ${TS}/`), { ...env, TK_NUDGE: '0' }), false)
})

test('state dir: TK_STATE_DIR wins, then config.json stateDir (same order as tk sync)', () => {
  const { root } = fixture()
  const config = join(root, 'config.json')
  writeFileSync(config, JSON.stringify({ stateDir: join(root, 'state') }))
  assert.equal(shouldNudge(read(SYNCED), { TK_STATE_DIR: join(root, 'state'), TK_EXPORTER_STATE: '/nonexistent' }), true)
  assert.equal(shouldNudge(read(SYNCED), { TK_CONFIG_FILE: config }), true)
  assert.equal(shouldNudge(bash('cat .claude/skills/team-session-writing/SKILL.md'), { TK_CONFIG_FILE: config }), false)
})

test('missing state: named efforts silent, broad still nudges', () => {
  const env = { TK_EXPORTER_STATE: '/nonexistent' }
  assert.equal(shouldNudge(read(SYNCED), env), false)
  assert.equal(shouldNudge(bash(`find ${TS} -name map.md`), env), true)
})

test('hook process: once per session + agent, additionalContext only, no permission decision', () => {
  const { root, env } = fixture()
  const run = payload => spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), env: { ...process.env, ...env, TMPDIR: root }, encoding: 'utf8' })
  const payload = { session_id: 's1', ...bash(`rg x ${TS}/`) }
  const first = run(payload)
  assert.equal(first.status, 0)
  const out = JSON.parse(first.stdout).hookSpecificOutput
  assert.equal(out.hookEventName, 'PreToolUse')
  assert.match(out.additionalContext, /team-knowledge skill/)
  assert.equal(out.permissionDecision, undefined)
  assert.equal(run(payload).stdout, '')
  assert.notEqual(run({ ...payload, agent_id: 'a1' }).stdout, '')
  assert.equal(run({ session_id: 's2', ...bash('ls src') }).stdout, '')
  const bad = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' })
  assert.equal(bad.status, 0)
  assert.equal(bad.stdout, '')
})
