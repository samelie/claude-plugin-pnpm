#!/usr/bin/env node
// PreToolUse nudge: a Bash/Grep/Glob/Read that reads past efforts under team-session/ gets one
// additionalContext line pointing at the team-knowledge skill (store first, rg for gaps).
// never blocks and never sets permissionDecision (that would bypass permission prompts).
// silent unless: target is the team-session root / a glob across efforts, or an effort the store
// covers (synced in tk-sync state.json; live wip efforts are never synced, so the current effort
// stays silent). writes into team-session (redirects, tee, mkdir, cp) are ignored.
// once per session + agent (marker file under tmpdir). fail-silent: any error → exit 0, no output.
// TK_NUDGE=0 disables. state dir mirrors resolveStateDir in packages/team-knowledge/src/sync/state-dir.ts (inline: no ts loader on
// every tool call); state.json path mirrors src/sync/state.ts.

import { mkdirSync, openSync, closeSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MESSAGE = 'team-session/ holds past team-kit efforts: research them with the team-knowledge skill first '
  + '(mcp__team-knowledge__tk_query, or npx tsx packages/team-knowledge/src/query-cli.ts query "<q>"), '
  + 'open the cited path:lines, and rg team-session only for gaps or efforts the store does not cover. '
  + 'Ignore for the current effort\'s own files.'

const READ_VERB = /(^|[\s;|&(`])(rg|grep|egrep|ugrep|ag|find|bfs|fd|cat|head|tail|less|sed|awk|ls|tree|jq|wc|bat|xargs)(?=\s|$)/
const REDIRECT = /(?:\d?>>?|&>)\s*(?:"[^"]*"|'[^']*'|\S+)|\btee\s+(?:-a\s+)?(?:"[^"]*"|'[^']*'|\S+)/g
// the dir name only: team-session-writing (a skill) or team-session-x is not the evidence store
const TARGET = /team-session(?![\w-])(?:\/([^\s'"`;|&)]*))?/g
const GLOB = /[*?{[]/

const targetText = (tool, input) => {
  if (!input || typeof input !== 'object') return ''
  if (tool === 'Read') return String(input.file_path ?? '')
  if (tool === 'Grep') return String(input.path ?? '')
  if (tool === 'Glob') return [input.path, input.pattern].filter(Boolean).join('/')
  if (tool === 'Bash') {
    const read = String(input.command ?? '').replace(REDIRECT, ' ')
    return READ_VERB.test(read) ? read : ''
  }
  return ''
}

// broad = team-session root or a glob over effort dirs; efforts = named effort dirs
export const targets = (text) => {
  let broad = false
  const efforts = new Set()
  for (const m of text.matchAll(TARGET)) {
    const segment = (m[1] ?? '').split('/')[0]
    if (!segment || GLOB.test(segment)) broad = true
    else if (!/^[._]/.test(segment)) efforts.add(segment)
  }
  return { broad, efforts: [...efforts] }
}

// --state flag aside, same order as tk sync: TK_STATE_DIR > TK_EXPORTER_STATE > config.json stateDir > DriveHard default
const stateDir = (env) => {
  const named = env.TK_STATE_DIR || env.TK_EXPORTER_STATE
  if (named) return named
  try {
    const file = env.TK_CONFIG_FILE ?? join(homedir(), '.config', 'team-knowledge', 'config.json')
    const configured = JSON.parse(readFileSync(file, 'utf8'))?.stateDir
    if (typeof configured === 'string' && configured.startsWith('/')) return configured
  } catch {}
  return '/Volumes/DriveHard/samelie-runtime/team-knowledge-exporter'
}

const syncedEfforts = (env) => {
  try {
    const root = stateDir(env)
    const state = JSON.parse(readFileSync(join(root, 'tk-sync', 'state.json'), 'utf8'))
    return new Set(Object.keys(state?.synced ?? {}))
  } catch {
    return new Set()
  }
}

export const shouldNudge = (payload, env = process.env) => {
  if (env.TK_NUDGE === '0' || !payload || typeof payload !== 'object') return false
  const text = targetText(payload.tool_name, payload.tool_input)
  if (!text.includes('team-session')) return false
  const { broad, efforts } = targets(text)
  if (broad) return true
  if (!efforts.length) return false
  const synced = syncedEfforts(env)
  return efforts.some(e => synced.has(e))
}

// true only for the first call per session + agent
const firstTime = (payload) => {
  const dir = join(tmpdir(), 'claude-tk-nudge')
  const key = `${payload.session_id ?? 'nosession'}__${payload.agent_id ?? 'main'}`.replace(/[^\w.-]/g, '_')
  try {
    mkdirSync(dir, { recursive: true })
    closeSync(openSync(join(dir, key), 'wx'))
    return true
  } catch {
    return false
  }
}

const main = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  let payload
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return
  }
  if (!shouldNudge(payload) || !firstTime(payload)) return
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: MESSAGE } }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {})
