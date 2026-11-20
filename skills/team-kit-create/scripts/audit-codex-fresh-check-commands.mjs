import path from 'node:path'

// intentionally closed grammar: unsupported execution remains unknown, never an inferred clean read.
const literal = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/s
const decode = (value) => {
  if (!literal.test(value)) throw new Error('nonliteral string')
  if (value[0] === '"') return JSON.parse(value)
  const body = value.slice(1, -1)
  let decoded = ''
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== '\\') { decoded += body[index]; continue }
    index += 1
    if (body[index] !== "'" && body[index] !== '\\') throw new Error('unsupported javascript string escape')
    decoded += body[index]
  }
  if (/[\n\r]/.test(decoded)) throw new Error('multiline single-quoted string')
  return decoded
}

const words = (command) => {
  const result = []
  const token = /("[^"\\]*"|'[^']*'|[^\s'";|&<>`$\\()]+)/gy
  let cursor = 0
  while (cursor < command.length) {
    token.lastIndex = cursor
    const match = token.exec(command)
    if (!match) return null
    // shell quoting uses different escape rules from javascript; escapes are rejected before tokenization.
    result.push(/^['"]/.test(match[1]) ? match[1].slice(1, -1) : match[1])
    cursor = token.lastIndex
    // shell concatenates adjacent quoted/unquoted pieces into one word; this grammar requires explicit boundaries.
    if (cursor < command.length && !/[ \t]/.test(command[cursor])) return null
    while (cursor < command.length && /[ \t]/.test(command[cursor])) cursor += 1
  }
  return result
}

export const commandReads = (command, cwd) => {
  if (typeof command !== 'string') return { reads: [], unknown: 'missing literal command' }
  if (/[$`\\\n\r#]/.test(command)) return { reads: [], unknown: 'shell expansion, escapes, comments or multiline command' }
  const tokens = words(command.trim())
  if (!tokens?.length) return { reads: [], unknown: 'unsupported shell syntax' }
  const knownPath = (file) => path.isAbsolute(file) || path.isAbsolute(cwd || '')
  const absolute = (file) => path.isAbsolute(file) ? path.normalize(file) : path.resolve(cwd, file)
  if (tokens[0] === 'cat') {
    const files = tokens.slice(tokens[1] === '--' ? 2 : 1)
    if (files.length && files.every((file) => knownPath(file) && !/^[-~=]/.test(file) && !/[?*\[\]{}^]/.test(file))) {
      return { reads: files.map((file) => ({ path: absolute(file), range: null })) }
    }
  }
  if (tokens[0] === 'sed' && tokens[1] === '-n' && tokens.length === 4) {
    const range = /^(\d+),(\d+)p$/.exec(tokens[2])
    if (range && knownPath(tokens[3]) && Number.isSafeInteger(Number(range[2])) && Number(range[1]) > 0 && Number(range[2]) >= Number(range[1]) && !/^[-~=]/.test(tokens[3]) && !/[?*\[\]{}^]/.test(tokens[3])) {
      return { reads: [{ path: absolute(tokens[3]), range: [Number(range[1]), Number(range[2])] }] }
    }
  }
  if (tokens[0] === 'pwd' && tokens.length === 1) return { reads: [] }
  return { reads: [], unknown: 'unsupported command may read files' }
}

// parse literal object arguments without evaluating agent code or installing a parser.
const objectArgument = (source) => {
  let cursor = 0
  const whitespace = () => { while (/\s/.test(source[cursor] || '') && cursor < source.length) cursor += 1 }
  const string = () => {
    const match = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/s.exec(source.slice(cursor))
    if (!match) throw new Error('nonliteral value')
    cursor += match[0].length
    return decode(match[0])
  }
  whitespace()
  if (source[cursor++] !== '{') throw new Error('literal object required')
  const result = {}
  while (true) {
    whitespace()
    if (source[cursor] === '}') { cursor += 1; break }
    const keyMatch = /^[A-Za-z_$][\w$]*/.exec(source.slice(cursor))
    const key = keyMatch ? (cursor += keyMatch[0].length, keyMatch[0]) : string()
    whitespace()
    if (source[cursor++] !== ':') throw new Error('missing colon')
    whitespace()
    const value = string()
    if (Object.hasOwn(result, key)) throw new Error('duplicate key')
    result[key] = value
    whitespace()
    if (source[cursor] === ',') { cursor += 1; continue }
    if (source[cursor] !== '}') throw new Error('unsupported property')
  }
  whitespace()
  if (cursor !== source.length) throw new Error('trailing expression')
  return result
}

const singleWrapperReads = (source, cwd) => {
  if (typeof source !== 'string') return { reads: [], unknown: 'encrypted or absent exec input' }
  let body = source.trim().replace(/;$/, '').trim()
  if (body.startsWith('text(') && body.endsWith(')')) body = body.slice(5, -1).trim()
  const patch = /^await\s+tools\.apply_patch\(([\s\S]*)\)$/.exec(body)
  if (patch) {
    let lines
    try { lines = decode(patch[1].trim()).trimEnd().split('\n') } catch { return { reads: [], unknown: 'nonliteral patch' } }
    if (lines.shift() !== '*** Begin Patch' || lines.pop() !== '*** End Patch') return { reads: [], unknown: 'unsupported patch envelope' }
    const writes = []
    let inFile = false
    for (const line of lines) {
      if (line.startsWith('*** Add File: ')) {
        const file = line.slice('*** Add File: '.length)
        if (!path.isAbsolute(file)) return { reads: [], unknown: 'patch file must be absolute' }
        writes.push(file)
        inFile = true
      } else if (!inFile || !line.startsWith('+')) return { reads: [], unknown: 'only literal add-file patches are supported' }
    }
    return writes.length ? { reads: [], writes } : { reads: [], unknown: 'empty patch' }
  }
  const match = /^await\s+tools\.(exec_command|mcp__context_mode__ctx_execute_file|mcp__context_mode__ctx_execute)\s*\(([\s\S]*)\)\s*$/.exec(body)
  if (!match) return { reads: [], unknown: 'unsupported javascript wrapper or dynamic expression' }
  let args
  try { args = objectArgument(match[2]) } catch { return { reads: [], unknown: 'nonliteral or unsupported wrapper arguments' } }
  if (match[1] === 'exec_command') {
    if (Object.keys(args).some((key) => !['cmd', 'workdir'].includes(key))) return { reads: [], unknown: 'unsupported exec options' }
    return commandReads(args.cmd, args.workdir || cwd)
  }
  if (match[1] === 'mcp__context_mode__ctx_execute' && args.language === 'shell') {
    if (Object.keys(args).some((key) => !['language', 'code', 'cwd'].includes(key))) return { reads: [], unknown: 'unsupported context shell options' }
    return commandReads(args.code, args.cwd || cwd)
  }
  if (match[1] === 'mcp__context_mode__ctx_execute_file') {
    if (!path.isAbsolute(args.path || '')) return { reads: [], unknown: 'nonabsolute context file path' }
    const reads = [{ path: args.path, range: null }]
    if (args.language === 'javascript' && /^\s*console\.log\(FILE_CONTENT\);?\s*$/.test(args.code || '')) return { reads }
    if (args.language === 'python' && /^\s*print\(FILE_CONTENT\)\s*$/.test(args.code || '')) return { reads }
    return { reads, unknown: 'context file processing may read additional files' }
  }
  return { reads: [], unknown: 'unsupported context execution language' }
}

const statements = (source) => {
  const chunks = []
  const stack = []
  let start = 0
  let quote = null
  let comment = null
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]
    if (comment === 'line') {
      if (character === '\n') { comment = null; if (!stack.length) { chunks.push(source.slice(start, index)); start = index + 1 } }
      continue
    }
    if (comment === 'block') {
      if (character === '*' && next === '/') { comment = null; index += 1 }
      continue
    }
    if (quote) {
      if (character === '\\') { index += 1; continue }
      if (character === quote) quote = null
      continue
    }
    if (character === '/' && next === '/') { comment = 'line'; index += 1; continue }
    if (character === '/' && next === '*') { comment = 'block'; index += 1; continue }
    // regex literals and template interpolation need a full javascript parser; keep the remaining source opaque.
    if (character === '/' || character === '`') { chunks.push(source.slice(start)); return chunks }
    if (character === '"' || character === "'") { quote = character; continue }
    if ('({['.includes(character)) stack.push(character)
    if (')}]'.includes(character)) {
      const expected = { ')': '(', '}': '{', ']': '[' }[character]
      if (stack.pop() !== expected) { chunks.push(source.slice(start)); return chunks }
    }
    if (!stack.length && (character === ';' || character === '\n')) {
      const chunk = source.slice(start, index).trim()
      if (chunk) chunks.push(chunk)
      start = index + 1
    }
  }
  const tail = source.slice(start).trim()
  if (tail) chunks.push(tail)
  return chunks
}

export const wrapperReads = (source, cwd) => {
  if (typeof source !== 'string') return { reads: [], unknown: 'encrypted or absent exec input' }
  const pragma = /^\/\/ @exec: ([^\r\n]+)\r?\n/.exec(source)
  if (pragma) {
    try {
      const value = JSON.parse(pragma[1])
      if (value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, number]) => ['max_output_tokens', 'yield_time_ms'].includes(key) && Number.isSafeInteger(number) && number > 0)) source = source.slice(pragma[0].length)
    } catch {
      // malformed pragma remains unsupported source.
    }
  }
  const result = { reads: [], writes: [] }
  const unknowns = []
  for (const [index, statement] of statements(source).entries()) {
    const observed = singleWrapperReads(statement, cwd)
    result.reads.push(...observed.reads)
    result.writes.push(...(observed.writes || []))
    if (observed.unknown) unknowns.push(`statement ${index + 1}: ${observed.unknown}`)
  }
  if (unknowns.length) result.unknown = unknowns.join('; ')
  if (!result.reads.length && !result.writes.length && !unknowns.length) result.unknown = 'empty executable source'
  return result
}
