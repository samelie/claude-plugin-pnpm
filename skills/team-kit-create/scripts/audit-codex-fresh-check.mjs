#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { commandReads, wrapperReads } from './audit-codex-fresh-check-commands.mjs'
import { validateInstructionManifest } from './audit-codex-fresh-check-instructions.mjs'

export const loadDeclarations = (file = fileURLToPath(new URL('../references/fresh-checks.md', import.meta.url))) => {
  const fences = [...readFileSync(file, 'utf8').matchAll(/```json\s*\n([\s\S]*?)\n```/g)]
  if (fences.length !== 1) throw new Error('expected one canonical json declaration')
  const value = JSON.parse(fences[0][1])
  if (value.version !== 1 || !Array.isArray(value.checks)) throw new Error('unsupported declaration version')
  return value
}

export const readRollout = (file) => readFileSync(file, 'utf8').trimEnd().split('\n').map((line, index) => {
  const record = JSON.parse(line)
  return { ...record, ordinal: Number.isSafeInteger(record.ordinal) ? record.ordinal : index }
})

const beneath = (file, directory) => file === directory || file.startsWith(`${directory}${path.sep}`)
const glob = (pattern, value) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`).test(value)
const cwdPath = (value) => typeof value === 'string' && value.startsWith('file://') ? fileURLToPath(value) : value
const worst = (statuses) => statuses.includes('FAIL') ? 'FAIL' : statuses.includes('INDETERMINATE') ? 'INDETERMINATE' : 'PASS'

export const mapSectionRanges = (text) => {
  const lines = text.split('\n')
  const starts = lines.flatMap((line, index) => line.startsWith('## ') ? [{ name: line.slice(3).trim(), start: index + 1 }] : [])
  const result = { Destination: [[1, (starts[0]?.start || lines.length + 1) - 1]] }
  for (let index = 0; index < starts.length; index += 1) {
    const { name, start } = starts[index]
    ;(result[name] ||= []).push([start, (starts[index + 1]?.start || lines.length + 1) - 1])
  }
  return result
}

const sessionVerdict = ({ file, read, declaration, session, repoRoot, mapText }) => {
  if (beneath(file, session)) {
    const relative = path.relative(session, file).split(path.sep).join('/')
    if (declaration.deny.some((entry) => glob(entry, relative))) return { status: 'FAIL', reason: 'explicit denied session read' }
    const entries = declaration.allow.filter((entry) => glob(entry.split('#')[0], relative))
    if (entries.some((entry) => !entry.includes('#'))) return { status: 'PASS' }
    if (entries.length && relative === 'map.md') {
      if (!read.range) return { status: 'FAIL', reason: 'whole map read exceeds section allowance' }
      if (typeof mapText !== 'string') return { status: 'INDETERMINATE', reason: 'map snapshot unavailable for range validation' }
      const sections = mapSectionRanges(mapText)
      const ranges = entries.flatMap((entry) => sections[entry.split('#')[1]] || [])
      if (read.range[1] > mapText.split('\n').length) return { status: 'FAIL', reason: 'map range exceeds snapshot line count' }
      for (let line = read.range[0]; line <= read.range[1]; line += 1) {
        if (!ranges.some(([start, end]) => line >= start && line <= end)) return { status: 'FAIL', reason: 'map range exceeds allowed sections' }
      }
      return { status: 'PASS' }
    }
    return { status: 'FAIL', reason: declaration.writes.some((entry) => glob(entry, relative)) ? 'output path grants write only, no read' : 'session path outside declared read set' }
  }
  if (beneath(file, path.join(repoRoot, 'team-session'))) return { status: 'FAIL', reason: 'another session artifact is not repo source' }
  return null
}

const readVerdict = ({ read, declaration, session, repoRoot, mapText, instructionManifest }) => {
  const recorded = path.resolve(read.path)
  let file = recorded
  try { file = realpathSync(file) } catch {
    // historical or missing paths retain their recorded lexical location.
  }
  let currentSession
  for (const location of new Set([recorded, file])) {
    const verdict = sessionVerdict({ file: location, read, declaration, session, repoRoot, mapText })
    if (verdict && verdict.status !== 'PASS') return verdict
    if (location === file) currentSession = verdict
  }
  if (currentSession) return currentSession
  if (beneath(file, repoRoot) && declaration.repo === 'any') return { status: 'PASS' }
  if (recorded === file && instructionManifest.status === 'PASS' && instructionManifest.entries.some((entry) => entry.path === file)) return { status: 'PASS', permission: 'exact runtime instruction entrypoint' }
  return { status: 'FAIL', reason: 'outside allowed repository source and exact runtime instructions' }
}

const identity = (parent, child, declaration) => {
  const parentMeta = parent[0]?.type === 'session_meta' ? parent[0].payload : null
  const childMeta = child[0]?.type === 'session_meta' ? child[0].payload : null
  const spawn = childMeta?.source?.subagent?.thread_spawn
  if (!parentMeta?.id || !childMeta?.id || !spawn) return { status: 'INDETERMINATE', reasons: ['missing first-record thread metadata'] }
  const reasons = []
  if (spawn.parent_thread_id !== parentMeta.id) reasons.push('child parent_thread_id differs from parent id')
  if (spawn.agent_role !== declaration.agentType.codex) reasons.push('child native role differs from declaration')
  const taskName = spawn.agent_path?.split('/').at(-1)
  const candidates = parent.flatMap((record) => {
    if (record.type !== 'response_item' || record.payload?.type !== 'function_call' || record.payload?.name !== 'spawn_agent') return []
    try {
      const args = JSON.parse(record.payload.arguments)
      return args.task_name === taskName ? [{ args, ordinal: record.ordinal }] : []
    } catch { return [] }
  })
  if (candidates.length !== 1) return { status: reasons.length ? 'FAIL' : 'INDETERMINATE', reasons: [...reasons, 'missing or ambiguous matching parent spawn'], childId: childMeta.id }
  const dispatch = candidates[0]
  if (dispatch.args.agent_type !== spawn.agent_role) reasons.push('parent dispatched role differs from child native role')
  if (dispatch.args.fork_turns !== 'none') reasons.push('parent did not explicitly dispatch fork_turns:none')
  const parentPath = parentMeta.source?.subagent?.thread_spawn?.agent_path || '/root'
  if (spawn.agent_path !== `${parentPath}/${dispatch.args.task_name}`) reasons.push('child agent_path differs from parent task path')
  return { status: reasons.length ? 'FAIL' : 'PASS', reasons, parentId: parentMeta.id, childId: childMeta.id, dispatchOrdinal: dispatch.ordinal, taskName }
}

export const auditFreshCheck = ({ parent, child, session, checkId, declarations = loadDeclarations(), repoRoot, mapText, manifest }) => {
  if (!path.isAbsolute(session || '')) throw new Error('session must be absolute')
  session = path.resolve(session)
  repoRoot ||= session.split(`${path.sep}team-session${path.sep}`)[0]
  if (!path.isAbsolute(repoRoot) || repoRoot === session) throw new Error('repository root cannot be inferred; supply repoRoot')
  const declaration = declarations.checks.find((check) => check.id === checkId)
  if (!declaration) throw new Error(`unknown fresh check: ${checkId}`)
  let instructionManifest = { status: 'ABSENT', entries: [], reason: 'no runtime instruction manifest supplied' }
  if (manifest !== undefined) {
    try { instructionManifest = validateInstructionManifest(manifest, declarations) } catch (error) {
      instructionManifest = { status: 'FAIL', entries: [], reason: error.message }
    }
  }
  const roleFreshness = identity(parent, child, declaration)
  const boundary = child[0]?.payload?.subagent_history_start_ordinal
  const observations = []
  const writes = []
  const unknowns = []
  const observe = (result, record, source) => {
    for (const read of result.reads) observations.push({ ordinal: record.ordinal, source, ...read, ...readVerdict({ read, declaration, session, repoRoot, mapText, instructionManifest }) })
    if (result.unknown) unknowns.push({ ordinal: record.ordinal, source, reason: result.unknown })
    for (const file of result.writes || []) {
      const relative = path.relative(session, path.resolve(file)).split(path.sep).join('/')
      const allowed = beneath(path.resolve(file), session) && declaration.writes.some((entry) => glob(entry, relative))
      writes.push({ ordinal: record.ordinal, source, path: file, status: allowed ? 'PASS' : 'FAIL', ...(allowed ? {} : { reason: 'patch target outside declared writes' }) })
    }
  }
  const defaultCwd = cwdPath(child[0]?.payload?.cwd)
  for (const record of child.slice(1)) {
    if (Number.isSafeInteger(boundary) && record.ordinal < boundary) continue
    const payload = record.payload
    if (record.type === 'event_msg' && payload?.type === 'item_completed' && payload.item?.type === 'CommandExecution') {
      const item = payload.item
      const cwd = cwdPath(item.cwd) || defaultCwd
      const command = Array.isArray(item.command) && ['-lc', '-c'].includes(item.command.at(-2)) ? item.command.at(-1) : null
      const result = commandReads(command, cwd)
      const parsed = (item.parsed_cmd || []).filter((entry) => entry.type === 'read' && typeof entry.path === 'string')
      // native parsed paths are observed even if the enclosing command has unsupported residual execution.
      for (const entry of parsed) {
        const entryResult = commandReads(entry.cmd, cwd)
        const absolute = path.resolve(cwd || repoRoot, entry.path)
        if (!result.reads.some((read) => read.path === absolute)) result.reads.push({ path: absolute, range: entryResult.reads.find((read) => read.path === absolute)?.range || null })
      }
      observe(result, record, 'native CommandExecution')
    }
    if (record.type === 'response_item' && payload?.type === 'custom_tool_call') {
      if (payload.name === 'exec') observe(wrapperReads(payload.input, defaultCwd), record, 'functions.exec')
      else unknowns.push({ ordinal: record.ordinal, source: payload.name || 'unknown custom tool', reason: 'unsupported custom tool may read files' })
    }
    if (record.type === 'response_item' && payload?.type === 'function_call' && ['spawn_agent', 'followup_task'].includes(payload.name)) {
      unknowns.push({ ordinal: record.ordinal, source: payload.name, reason: 'descendant execution is outside this parent-child evidence pair' })
    }
    if (record.type === 'response_item' && payload?.type === 'function_call' && !['spawn_agent', 'wait_agent', 'send_message', 'list_agents', 'followup_task', 'interrupt_agent'].includes(payload.name)) {
      unknowns.push({ ordinal: record.ordinal, source: payload.name || 'unknown function', reason: 'unsupported direct function call may read files' })
    }
  }
  const observedReads = { status: worst([...observations.map((entry) => entry.status), ...(unknowns.length || !observations.length ? ['INDETERMINATE'] : [])]), count: observations.length, observations, unknowns }
  const observedWrites = { status: worst(writes.map((entry) => entry.status)), count: writes.length, observations: writes }
  return { schemaVersion: 1, checkId, session, status: worst([roleFreshness.status, observedReads.status, observedWrites.status, instructionManifest.status === 'FAIL' ? 'FAIL' : 'PASS']), roleFreshness, observedReads, observedWrites, instructionManifest,
    dispatchHeader: { status: 'UNOBSERVABLE', binding: 'caller-supplied checkId and session', reason: 'encrypted message/header is not independently observable; role and fork verified separately' },
    scope: 'supported recorded read calls and add-file writes only; not an operating-system filesystem trace, proof of successful file access, or proof of encrypted prompt contents' }
}

export const auditFreshCheckFiles = ({ parentRollout, childRollout, session, checkId, declarationPath, instructionManifestPath }) => {
  const declarations = loadDeclarations(declarationPath)
  const canonicalSession = realpathSync(session)
  let mapText
  try { mapText = readFileSync(path.join(canonicalSession, 'map.md'), 'utf8') } catch {
    // map absence is reported when needed.
  }
  const manifestBytes = instructionManifestPath === undefined ? undefined : readFileSync(instructionManifestPath)
  const manifest = manifestBytes === undefined ? undefined : JSON.parse(manifestBytes.toString('utf8'))
  const report = auditFreshCheck({ parent: readRollout(parentRollout), child: readRollout(childRollout), session: canonicalSession, checkId, declarations, mapText, manifest })
  if (instructionManifestPath) {
    report.instructionManifest.path = path.resolve(instructionManifestPath)
    report.instructionManifest.fileSha256 = createHash('sha256').update(manifestBytes).digest('hex')
  }
  report.evidence = { parentRollout: path.resolve(parentRollout), childRollout: path.resolve(childRollout), declarationPath: declarationPath || fileURLToPath(new URL('../references/fresh-checks.md', import.meta.url)), mapBasis: mapText === undefined ? 'unavailable' : 'current map.md; historical equality not proven' }
  return report
}

const main = () => {
  const args = process.argv.slice(2)
  const options = {}
  const names = { '--parent': 'parentRollout', '--child': 'childRollout', '--session': 'session', '--check': 'checkId', '--declaration': 'declarationPath', '--instructions': 'instructionManifestPath' }
  for (let index = 0; index < args.length; index += 2) {
    if (!names[args[index]] || !args[index + 1]) throw new Error('usage: --parent <rollout> --child <rollout> --session <absolute directory> --check <id> [--declaration <fresh-checks.md>] [--instructions <manifest.json>]')
    options[names[args[index]]] = args[index + 1]
  }
  if (!options.parentRollout || !options.childRollout || !options.session || !options.checkId) throw new Error('parent, child, session and check are required')
  const report = auditFreshCheckFiles(options)
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    console.log(JSON.stringify({ status: 'INDETERMINATE', reason: error.message }))
    process.exitCode = 2
  }
}
