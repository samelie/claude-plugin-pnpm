#!/usr/bin/env node
// Manifest guard: plugin.json `agents[]` must exactly match `agents/*.md` on disk.
// A drift (deleted or added agent not reflected in the manifest) silently breaks
// plugin load — this turns that into a failing check instead. Wired as `lint`.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))

const declared = new Set(
  (manifest.agents || []).map((p) => p.replace(/^\.\/agents\//, '').replace(/\.md$/, '')),
)
const onDisk = new Set(
  readdirSync(join(root, 'agents'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, '')),
)

const missing = [...declared].filter((a) => !onDisk.has(a)) // declared but file absent
const unlisted = [...onDisk].filter((a) => !declared.has(a)) // file present but not declared

if (missing.length === 0 && unlisted.length === 0) {
  console.log(`manifest OK — ${declared.size} agents declared, all present on disk`)
  process.exit(0)
}

if (missing.length)
  console.error(`✗ declared in plugin.json but missing on disk:\n  ${missing.join('\n  ')}`)
if (unlisted.length)
  console.error(`✗ present in agents/ but not declared in plugin.json:\n  ${unlisted.join('\n  ')}`)
console.error('\nFix plugin.json `agents[]` to match agents/*.md — this drift silently breaks plugin load.')
process.exit(1)
