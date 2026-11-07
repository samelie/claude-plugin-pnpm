import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

export const validateInstructionManifest = (manifest, declarations) => {
  if (!exactKeys(manifest, ['version', 'source', 'entries']) || manifest.version !== 1 || manifest.source !== 'active-skill-registry' || !Array.isArray(manifest.entries)) throw new Error('unsupported instruction manifest schema')
  const declared = declarations.instructionSkills
  if (!Array.isArray(declared) || declared.some((skill) => typeof skill !== 'string')) throw new Error('canonical instructionSkills declaration is missing or invalid')
  const paths = new Set()
  for (const entry of manifest.entries) {
    if (!exactKeys(entry, ['skill', 'path', 'sha256']) || !declared.includes(entry.skill)) throw new Error('instruction entry uses undeclared skill or invalid schema')
    if (typeof entry.path !== 'string' || !path.isAbsolute(entry.path) || path.normalize(entry.path) !== entry.path || path.basename(entry.path) !== 'SKILL.md') throw new Error('instruction path must be an exact canonical absolute SKILL.md entrypoint')
    if (paths.has(entry.path)) throw new Error('duplicate instruction path')
    paths.add(entry.path)
    if (!statSync(entry.path).isFile() || realpathSync(entry.path) !== entry.path) throw new Error('instruction entrypoint must be a canonical regular file')
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || digest(readFileSync(entry.path)) !== entry.sha256) throw new Error('instruction entrypoint sha256 mismatch')
  }
  return {
    status: 'PASS', source: manifest.source, entries: manifest.entries.map((entry) => ({ ...entry })),
    sha256: digest(JSON.stringify(manifest)),
    hashBasis: 'manifest serialized with JSON.stringify',
    provenance: 'active-registry attribution is caller-attested; schema, canonical exact paths and current bytes are mechanically checked',
    basis: 'current instruction bytes; equality with bytes at historical read time is not proven',
  }
}
