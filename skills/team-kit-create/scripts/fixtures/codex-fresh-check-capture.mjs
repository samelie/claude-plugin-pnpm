#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sources = [
  { path: '/Users/selie/.codex/sessions/2026/10/25/rollout-2026-10-25T23-39-33-01a176ef-900c-7c30-94fc-645d4bfff722.jsonl', lines: [0, 1259], lane: 'parent' },
  { path: '/Users/selie/.codex/sessions/2026/10/26/rollout-2026-10-26T16-40-35-01a17a96-589e-7f93-9493-1520e6f2c3b6.jsonl', lines: [0, 245], lane: 'child' },
  { path: '/Users/selie/.codex/sessions/2026/10/26/rollout-2026-10-26T16-57-46-01a17aa6-12cf-72a1-8b8b-9e4a03c20e60.jsonl', lines: [28, 38, 59], lane: 'native-batch' },
]

const pick = (value, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]))
export const captureFreshCheckShapes = () => ({
  version: 1,
  kind: 'codex-fresh-check-projected-wire-shapes',
  note: 'actual explorer fork:all investigation plus native plan-review literal batches; mutation tests change role/fork/path explicitly; no native check success claimed',
  entries: sources.flatMap((source) => {
    const lines = readFileSync(source.path, 'utf8').trimEnd().split('\n')
    return source.lines.map((line) => {
      const bytes = lines[line]
      const record = JSON.parse(bytes)
      const projected = pick(record, ['type', 'ordinal'])
      if (record.type === 'session_meta') {
        projected.payload = pick(record.payload, ['id', 'session_id', 'cwd', 'cli_version', 'subagent_history_start_ordinal', 'source'])
        if (projected.payload.source?.subagent?.thread_spawn) {
          projected.payload.source = { subagent: { thread_spawn: pick(projected.payload.source.subagent.thread_spawn, ['parent_thread_id', 'agent_path', 'agent_role']) } }
        }
      } else if (record.payload?.name === 'spawn_agent') {
        const args = pick(JSON.parse(record.payload.arguments), ['task_name', 'agent_type', 'fork_turns'])
        projected.payload = { ...pick(record.payload, ['type', 'name', 'namespace']), arguments: JSON.stringify(args) }
      } else if (record.payload?.item?.type === 'CommandExecution') {
        projected.payload = { type: record.payload.type, item: pick(record.payload.item, ['type', 'command', 'cwd', 'parsed_cmd', 'exit_code']) }
      } else if (record.payload?.type === 'custom_tool_call' && record.payload.name === 'exec') {
        if (typeof record.payload.input !== 'string' || !/^(?:\/\/ @exec: [^\n]+\n)?text\(await tools\.mcp__context_mode__ctx_execute\(/.test(record.payload.input)) throw new Error('expected literal native batch source')
        projected.payload = pick(record.payload, ['type', 'name', 'input'])
      } else throw new Error(`unsupported source shape at ${source.path}:${line}`)
      return { lane: source.lane, provenance: { path: source.path, line, ordinal: record.ordinal, sha256: createHash('sha256').update(bytes).digest('hex') }, record: projected }
    })
  }),
})

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rendered = `${JSON.stringify(captureFreshCheckShapes(), null, 2)}\n`
  if (process.argv[2] === '--check') {
    const fixture = readFileSync(fileURLToPath(new URL('./codex-fresh-check-shapes.json', import.meta.url)), 'utf8')
    if (fixture !== rendered) throw new Error('captured fixture differs from source projection')
    console.log('codex fresh-check projected wire provenance: PASS')
  } else console.log(rendered.trimEnd())
}
