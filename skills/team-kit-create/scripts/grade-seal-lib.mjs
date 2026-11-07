// shared library for grade-seal.mjs + check-grade-seal.mjs: a grade seal keeps the graded inputs that live
// only under gitignored team-session/ (plus _grade/ copies of the grade file and its closure record) in a
// tracked team-kit-seals/<effort>/<tag>/ dir committed on main (references/grade-seal.md).
// exit codes shared by both clis: 0 ok, 1 fail, 2 usage, 3 not gated

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';

export const EXIT = Object.freeze({ OK: 0, FAIL: 1, USAGE: 2, NOT_GATED: 3 });
export const INVENTORY_LINE_RE = /^([0-9a-f]{64})  (\S.*)$/;
export const GRADE_SEAL_DOD_ROW_RE = /^\|\s*AC-[^|]*\bgrade-seal-gate\b[^\n]*\|\s*true\s*\|\s*$/m;
export const SECRET_PATTERNS = Object.freeze([
  Object.freeze({ name: 'sk-ant', re: /sk-ant-[A-Za-z0-9_-]{8,}/ }),
  Object.freeze({ name: 'aws-akia', re: /AKIA[0-9A-Z]{16}/ }),
  Object.freeze({ name: 'pem-begin', re: /-----BEGIN/ }),
]);
export const SEAL_ROOT = 'team-kit-seals';
export const BUNDLE_NAME = 'inputs.tar.zst';
export const MANIFEST_NAME = 'MANIFEST.sha256';
export const GRADE_SEAL_NAME = 'GRADE-SEAL.md';
export const INDEX_NAME = 'INDEX.md';
export const DEFAULT_GRADE_REL = 'goal-auditor/final-grade.md';
export const CLOSURE_REL = 'build-state.md';
export const GRADE_COPY_PREFIX = '_grade/';
// hard cap; options may only lower it: a > 100 MB blob on shared main blocks every session's push
export const MAX_BUNDLE_BYTES = 50_000_000;
// spawnSync defaults to 1 MiB and fails on large tracked blobs
export const SPAWN_MAX_BUFFER = 1 << 30;
export const BUNDLE_METHOD =
  'mtree LC_ALL=C sorted, mode=0644 uid=0 gid=0 uname=root gname=wheel time=0.0; /usr/bin/tar --format=pax --no-xattrs --no-acls --no-fflags --no-mac-metadata; zstd -19 --long=27 -T1; grade + closure copies under _grade/';

const TAR = '/usr/bin/tar';
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const isAscii = (s) => Buffer.byteLength(s, 'utf8') === s.length;

// LC_ALL=C byte order
export const byteCompare = (a, b) => {
  if (isAscii(a) && isAscii(b)) return a < b ? -1 : a > b ? 1 : 0;
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
};

export const git = (repoRoot, args, opts = {}) => {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { input: opts.input, maxBuffer: SPAWN_MAX_BUFFER });
  const stdout = r.stdout ?? Buffer.alloc(0);
  return {
    rc: r.status ?? 1,
    stdout: opts.buffer ? stdout : stdout.toString('utf8'),
    stderr: r.stderr ? r.stderr.toString('utf8') : String(r.error ?? ''),
  };
};

export const sha256Bytes = (buf) => createHash('sha256').update(buf).digest('hex');

export const sha256File = (absPath) => {
  const hash = createHash('sha256');
  const buf = Buffer.alloc(1 << 20);
  const fd = openSync(absPath, 'r');
  try {
    for (let n = readSync(fd, buf, 0, buf.length, null); n > 0; n = readSync(fd, buf, 0, buf.length, null)) hash.update(buf.subarray(0, n));
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
};

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

export const repoRootOf = (dir) => {
  let d = dir;
  while (!existsSync(d) && dirname(d) !== d) d = dirname(d);
  if (!existsSync(d)) return null;
  const r = git(d, ['rev-parse', '--show-toplevel']);
  return r.rc === 0 && r.stdout.trim() ? r.stdout.trim() : null;
};

export const parseGradeInventory = (text, repoRoot, sessionDir) => {
  const seen = new Map();
  const errors = [];
  let rawLines = 0;
  let duplicateLines = 0;
  const sessionRel = sessionDir && sessionDir.startsWith(`${repoRoot}/`) ? sessionDir.slice(repoRoot.length + 1) : sessionDir;
  text.split('\n').forEach((raw, i) => {
    const m = INVENTORY_LINE_RE.exec(raw);
    if (!m) return;
    rawLines += 1;
    const [, sha256, written] = m;
    const p = written.replace(/^(\.\/)+/, '');
    if (p.split('/').includes('..')) {
      errors.push(`'..' segment in inventory path: ${p} (line ${i + 1})`);
      return;
    }
    let path;
    if (isAbsolute(p)) {
      if (!p.startsWith(`${repoRoot}/`)) {
        errors.push(`input outside the repo: ${p} — copy it into the session dir before grading and inventory the copy`);
        return;
      }
      path = p.slice(repoRoot.length + 1);
    } else if (existsSync(join(repoRoot, p))) {
      path = p;
    } else if (sessionDir && existsSync(join(sessionDir, p))) {
      errors.push(`session-relative path: ${p} — write it repo-relative (${sessionRel}/${p}) or absolute (run shasum -a 256 from the repo root or on absolute paths)`);
      return;
    } else {
      path = p;
    }
    if (path.startsWith(GRADE_COPY_PREFIX)) {
      errors.push(`reserved ${GRADE_COPY_PREFIX} prefix in inventory path: ${p} (line ${i + 1})`);
      return;
    }
    const prior = seen.get(path);
    if (!prior) {
      seen.set(path, { sha256, path, line: i + 1 });
    } else if (prior.sha256 === sha256) {
      duplicateLines += 1;
    } else {
      errors.push(`same path with 2 shas: ${path} (line ${prior.line} ${prior.sha256}, line ${i + 1} ${sha256})`);
    }
  });
  const entries = [...seen.values()].sort((a, b) => byteCompare(a.path, b.path));
  return { entries, rawLines, duplicateLines, errors };
};

export const committedSealTags = (repoRoot, effort) => {
  const prefix = `${SEAL_ROOT}/${effort}/`;
  const r = git(repoRoot, ['ls-tree', '-r', '--name-only', 'main', '--', prefix]);
  if (r.rc !== 0) return [];
  const tags = r.stdout.split('\n').flatMap((line) => {
    if (!line.startsWith(prefix)) return [];
    const parts = line.slice(prefix.length).split('/');
    return parts.length === 2 && parts[1] === GRADE_SEAL_NAME ? [parts[0]] : [];
  });
  return [...new Set(tags)].sort(byteCompare);
};

const worktreeSealTags = (repoRoot, effort) => {
  const dir = join(repoRoot, SEAL_ROOT, effort);
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && isFile(join(dir, d.name, GRADE_SEAL_NAME)))
      .map((d) => d.name);
  } catch {
    return [];
  }
};

export const isGradeSealGated = (sessionDir, repoRoot) => {
  const effort = basename(sessionDir);
  const dod = join(sessionDir, 'definition-of-done.md');
  const byDodRow = isFile(dod) && GRADE_SEAL_DOD_ROW_RE.test(readFileSync(dod, 'utf8'));
  const sealInWorktree = worktreeSealTags(repoRoot, effort).length >= 1;
  const sealOnMain = committedSealTags(repoRoot, effort).length >= 1;
  const bySeal = sealInWorktree || sealOnMain;
  return { gated: byDodRow || bySeal, byDodRow, bySeal, sealInWorktree, sealOnMain };
};

export const gradeSealTag = (gradeRel, gradeSha256) => `${basename(gradeRel, '.md')}-${gradeSha256.slice(0, 12)}`;

const SAFE_BYTE = /[A-Za-z0-9._/+=@,-]/;
export const mtreeEscape = (rel) =>
  [...Buffer.from(rel, 'utf8')]
    .map((byte) => {
      const ch = String.fromCharCode(byte);
      return byte < 0x80 && SAFE_BYTE.test(ch) ? ch : `\\${byte.toString(8).padStart(3, '0')}`;
    })
    .join('');

const blobSha = (repoRoot, rev, path) => {
  const r = git(repoRoot, ['cat-file', 'blob', `${rev}:${path}`], { buffer: true });
  return r.rc === 0 ? sha256Bytes(r.stdout) : null;
};

export const classifyEntry = (repoRoot, e) => {
  const base = git(repoRoot, ['merge-base', 'origin/main', 'HEAD']);
  const baseSha = base.rc === 0 ? base.stdout.trim() : '';
  if (baseSha && blobSha(repoRoot, baseSha, e.path) === e.sha256) return { kind: 'tracked', commit: baseSha };
  if (blobSha(repoRoot, 'HEAD', e.path) === e.sha256) {
    const head = git(repoRoot, ['rev-parse', 'HEAD']);
    if (head.rc === 0) return { kind: 'tracked', commit: head.stdout.trim() };
  }
  const log = git(repoRoot, ['log', '-n', '50', '--format=%H', 'HEAD', '--', e.path]);
  if (log.rc === 0) {
    for (const commit of log.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
      if (blobSha(repoRoot, commit, e.path) === e.sha256) return { kind: 'tracked', commit };
    }
  }
  const abs = join(repoRoot, e.path);
  if (isFile(abs)) return sha256File(abs) === e.sha256 ? { kind: 'bundled' } : { kind: 'error', reason: 'input changed since grade' };
  return { kind: 'error', reason: 'input missing' };
};

const firstLine = (buf) => (buf ? buf.toString('utf8').split('\n')[0].trim() : '');

// checks the bundle toolchain; throws USAGE: when /usr/bin/tar is not bsdtar or zstd is missing
export const bundleTools = () => {
  const tar = spawnSync(TAR, ['--version'], { maxBuffer: SPAWN_MAX_BUFFER });
  const tarLine = firstLine(tar.stdout);
  if (tar.status !== 0 || !tarLine.includes('bsdtar')) throw new Error(`USAGE: ${TAR} is not bsdtar (${tarLine || String(tar.error ?? 'not found')})`);
  const zstd = spawnSync('zstd', ['--version'], { maxBuffer: SPAWN_MAX_BUFFER });
  if (zstd.status !== 0) throw new Error(`USAGE: zstd --version failed (${String(zstd.error ?? firstLine(zstd.stderr))})`);
  return { tar: tarLine, zstd: firstLine(zstd.stdout) };
};

export const buildBundle = (repoRoot, members, gradeCopies, outFile) => {
  bundleTools();
  const named = [
    ...members.map((rel) => ({ name: rel, abs: join(repoRoot, rel) })),
    ...gradeCopies.map((rel) => ({ name: `${GRADE_COPY_PREFIX}${rel}`, abs: join(repoRoot, rel) })),
  ].sort((a, b) => byteCompare(a.name, b.name));
  const attrs = 'type=file mode=0644 uid=0 gid=0 uname=root gname=wheel time=0.0';
  const spec = ['#mtree', ...named.map((m) => `./${mtreeEscape(m.name)} ${attrs} contents=${mtreeEscape(m.abs)}`)].join('\n') + '\n';
  const work = mkdtempSync(join(tmpdir(), 'grade-seal-tar-'));
  try {
    const specFile = join(work, 'spec.mtree');
    const tarFile = join(work, 'inputs.tar');
    writeFileSync(specFile, spec);
    const env = { ...process.env, COPYFILE_DISABLE: '1', LC_ALL: 'C' };
    const tar = spawnSync(TAR, ['-cf', tarFile, '--format=pax', '--no-xattrs', '--no-acls', '--no-fflags', '--no-mac-metadata', `@${specFile}`], { env, maxBuffer: SPAWN_MAX_BUFFER });
    if (tar.status !== 0) throw new Error(`tar failed: ${firstLine(tar.stderr) || String(tar.error ?? tar.status)}`);
    const zstd = spawnSync('zstd', ['-19', '--long=27', '-T1', '-q', '-f', '-o', outFile, tarFile], { env, maxBuffer: SPAWN_MAX_BUFFER });
    if (zstd.status !== 0) throw new Error(`zstd failed: ${firstLine(zstd.stderr) || String(zstd.error ?? zstd.status)}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return { sha256: sha256File(outFile), bytes: statSync(outFile).size, members: named.map((m) => m.name) };
};

export const scanSecrets = (absPath, relPath) =>
  readFileSync(absPath, 'latin1')
    .split('\n')
    .flatMap((line, i) => SECRET_PATTERNS.filter((p) => p.re.test(line)).map((p) => ({ path: relPath, line: i + 1, pattern: p.name })));

const tagOf = (rec) => gradeSealTag(rec.gradeFile, rec.gradeSha256);

export const renderGradeSealMd = (rec) =>
  [
    `# Grade seal: ${rec.effort} / ${tagOf(rec)}`,
    '',
    `Effort: ${rec.effort}`,
    `Grade file: ${rec.gradeFile}`,
    `Grade file sha256: ${rec.gradeSha256}`,
    `Grade copy: ${rec.gradeCopy}`,
    `Disposition: ${rec.disposition}`,
    `Closure record: ${rec.closureRecord}`,
    `Closure record sha256: ${rec.closureSha256}`,
    `Closure copy: ${rec.closureCopy}`,
    `Sealed at (UTC): ${rec.sealedAtUtc}`,
    `Sealed HEAD: ${rec.sealedHead}`,
    `Inputs: ${rec.inputs} (bundled ${rec.bundled}, tracked ${rec.tracked})`,
    `Bundle: ${rec.bundle}`,
    `Bundle sha256: ${rec.bundleSha256}`,
    `Bundle bytes: ${rec.bundleBytes}`,
    `Bundle cap bytes: ${rec.bundleCapBytes}`,
    `Manifest sha256: ${rec.manifestSha256}`,
    `Method: ${rec.method}`,
    `Tool versions: ${rec.toolVersions}`,
    '',
    '## Verify',
    '',
    // the record carries no machine path, so the session dir stays the layout's placeholder
    'node .claude/skills/team-kit-run/scripts/check-grade-seal.mjs <abs session dir>',
    `node .claude/skills/team-kit-run/scripts/check-grade-seal.mjs <abs session dir> --from-seal ${tagOf(rec)}`,
    '',
    '## Tracked inputs',
    '',
    '```tracked',
    ...[...rec.trackedRows].sort((a, b) => byteCompare(a.path, b.path)).map((r) => `${r.commit}\t${r.sha256}\t${r.path}`),
    '```',
    '',
  ].join('\n');

const KEYS = [
  ['effort', 'Effort'],
  ['gradeFile', 'Grade file'],
  ['gradeSha256', 'Grade file sha256'],
  ['gradeCopy', 'Grade copy'],
  ['disposition', 'Disposition'],
  ['closureRecord', 'Closure record'],
  ['closureSha256', 'Closure record sha256'],
  ['closureCopy', 'Closure copy'],
  ['sealedAtUtc', 'Sealed at (UTC)'],
  ['sealedHead', 'Sealed HEAD'],
  ['inputs', 'Inputs'],
  ['bundle', 'Bundle'],
  ['bundleSha256', 'Bundle sha256'],
  ['bundleBytes', 'Bundle bytes'],
  ['bundleCapBytes', 'Bundle cap bytes'],
  ['manifestSha256', 'Manifest sha256'],
  ['method', 'Method'],
  ['toolVersions', 'Tool versions'],
];

export const parseGradeSealMd = (text) => {
  const lines = text.split('\n');
  const head = lines.slice(0, Math.max(0, lines.indexOf('## Verify')) || lines.length);
  const values = {};
  for (const [field, key] of KEYS) {
    const hits = head.filter((line) => line.startsWith(`${key}: `));
    if (hits.length !== 1) return { error: `${GRADE_SEAL_NAME}: key "${key}" ${hits.length ? 'repeated' : 'missing'}` };
    values[field] = hits[0].slice(key.length + 2);
  }
  const counts = /^(\d+) \(bundled (\d+), tracked (\d+)\)$/.exec(values.inputs);
  if (!counts) return { error: `${GRADE_SEAL_NAME}: malformed Inputs: ${values.inputs}` };
  if (values.bundle !== BUNDLE_NAME) return { error: `${GRADE_SEAL_NAME}: Bundle is not ${BUNDLE_NAME}` };
  for (const field of ['gradeSha256', 'bundleSha256', 'manifestSha256']) if (!HEX64.test(values[field])) return { error: `${GRADE_SEAL_NAME}: ${field} is not 64-hex` };
  if (values.closureSha256 !== 'absent' && !HEX64.test(values.closureSha256)) return { error: `${GRADE_SEAL_NAME}: Closure record sha256 is neither 64-hex nor absent` };
  if (!HEX40.test(values.sealedHead)) return { error: `${GRADE_SEAL_NAME}: Sealed HEAD is not 40-hex` };
  for (const field of ['bundleBytes', 'bundleCapBytes']) if (!/^\d+$/.test(values[field])) return { error: `${GRADE_SEAL_NAME}: ${field} is not an integer` };
  const open = lines.indexOf('```tracked');
  const close = open >= 0 ? lines.indexOf('```', open + 1) : -1;
  if (open < 0 || close < 0) return { error: `${GRADE_SEAL_NAME}: tracked inputs block missing` };
  const trackedRows = [];
  for (const line of lines.slice(open + 1, close)) {
    const [commit, sha256, path, extra] = line.split('\t');
    if (extra !== undefined || !HEX40.test(commit ?? '') || !HEX64.test(sha256 ?? '') || !path) return { error: `${GRADE_SEAL_NAME}: malformed tracked row: ${line}` };
    trackedRows.push({ commit, sha256, path });
  }
  return {
    ...values,
    inputs: Number(counts[1]),
    bundled: Number(counts[2]),
    tracked: Number(counts[3]),
    bundleBytes: Number(values.bundleBytes),
    bundleCapBytes: Number(values.bundleCapBytes),
    trackedRows,
  };
};

export const renderManifest = (entries) =>
  [...entries]
    .sort((a, b) => byteCompare(a.path, b.path))
    .map((e) => `${e.sha256}  ${e.path}\n`)
    .join('');

const INDEX_HEADER = '| effort | grade tag | sealed (UTC) | seal |';
const INDEX_SEPARATOR = '|---|---|---|---|';
const indexRow = (r) => `| ${r.effort} | ${r.tag} | ${r.sealedAtUtc} | ${SEAL_ROOT}/${r.effort}/${r.tag}/${GRADE_SEAL_NAME} |`;
const rowKey = (line) => {
  const cells = line.split('|').map((c) => c.trim());
  return { effort: cells[1] ?? '', tag: cells[2] ?? '' };
};

export const upsertIndexRow = (indexText, row) => {
  const fresh = [
    '# Grade seals',
    '',
    'Sealed efforts (graded team-session/ inputs kept in git). Evidence-store rule: `.claude/rules/team-session-evidence.md` (Codex: `AGENTS.md`); grade seal rule: `.claude/skills/team-kit-create/references/grade-seal.md`.',
    '',
    INDEX_HEADER,
    INDEX_SEPARATOR,
  ];
  const lines = indexText === null ? [...fresh, ''] : indexText.replace(/\n$/, '').split('\n').concat('');
  let at = lines.indexOf(INDEX_HEADER);
  if (at < 0 || lines[at + 1] !== INDEX_SEPARATOR) {
    const tail = lines.length && lines.at(-1) === '' ? lines.slice(0, -1) : lines;
    lines.splice(0, lines.length, ...tail, '', INDEX_HEADER, INDEX_SEPARATOR, '');
    at = lines.indexOf(INDEX_HEADER);
  }
  let end = at + 2;
  while (end < lines.length && lines[end].startsWith('|')) end += 1;
  const rows = lines
    .slice(at + 2, end)
    .filter((line) => {
      const k = rowKey(line);
      return !(k.effort === row.effort && k.tag === row.tag);
    })
    .concat(indexRow(row))
    .sort((a, b) => {
      const ka = rowKey(a);
      const kb = rowKey(b);
      return byteCompare(ka.effort, kb.effort) || byteCompare(ka.tag, kb.tag);
    });
  return [...lines.slice(0, at + 2), ...rows, ...lines.slice(end)].join('\n');
};
