#!/usr/bin/env node
// builds a grade seal after the final grade: graded inputs that live only under team-session/ plus _grade/
// copies of the grade file and closure record go into team-kit-seals/<effort>/<tag>/ (references/grade-seal.md).
// never runs git add/commit: prints WROTE lines and the path-limited NEXT commit line for the orchestrator.
// node grade-seal.mjs <abs session dir> --disposition "<text>" [--grade <session-relative grade file>] [--reseal] [--max-bundle-bytes N]
// exit 0 sealed, 1 cannot seal (nothing written), 2 usage/environment

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BUNDLE_METHOD,
  BUNDLE_NAME,
  CLOSURE_REL,
  DEFAULT_GRADE_REL,
  EXIT,
  GRADE_COPY_PREFIX,
  GRADE_SEAL_NAME,
  INDEX_NAME,
  MANIFEST_NAME,
  MAX_BUNDLE_BYTES,
  SEAL_ROOT,
  buildBundle,
  bundleTools,
  classifyEntry,
  git,
  gradeSealTag,
  parseGradeInventory,
  renderGradeSealMd,
  renderManifest,
  repoRootOf,
  scanSecrets,
  sha256Bytes,
  sha256File,
  upsertIndexRow,
} from './grade-seal-lib.mjs';

export const USAGE = 'usage: grade-seal.mjs <abs session dir> --disposition "<text>" [--grade <session-relative grade file>] [--reseal] [--max-bundle-bytes N]';
// failure listings name at most this many paths, then the count
const LIST_LIMIT = 20;

const usage = (why) => ({ code: EXIT.USAGE, lines: [`USAGE: ${why}`, USAGE], written: [] });
const fail = (lines) => ({ code: EXIT.FAIL, lines, written: [] });
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const validCap = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_BUNDLE_BYTES;

export const buildGradeSeal = (sessionDir, opts) => {
  if (typeof sessionDir !== 'string' || !isAbsolute(sessionDir)) return usage('session dir must be an absolute path');
  if (!isDir(sessionDir)) return usage(`session dir not found: ${sessionDir}`);
  if (typeof opts?.disposition !== 'string' || !opts.disposition.trim()) return usage('--disposition "<text>" is required');
  if (/[\r\n]/.test(opts.disposition)) return usage('--disposition must be one line');
  if (opts.maxBundleBytes !== undefined && !validCap(opts.maxBundleBytes)) return usage(`--max-bundle-bytes must be an integer 1..${MAX_BUNDLE_BYTES}`);
  const gradeRel = opts.grade ?? DEFAULT_GRADE_REL;
  if (isAbsolute(gradeRel) || gradeRel.split('/').includes('..')) return usage(`--grade must be session-relative: ${gradeRel}`);
  const cap = Math.min(MAX_BUNDLE_BYTES, opts.maxBundleBytes ?? MAX_BUNDLE_BYTES);

  const session = realpathSync(sessionDir);
  const repoRoot = repoRootOf(session);
  if (!repoRoot) return usage(`not inside a git repo: ${sessionDir}`);
  if (!session.startsWith(`${repoRoot}/`)) return usage(`session dir lies outside the repo root ${repoRoot}`);
  const sessionRel = session.slice(repoRoot.length + 1);
  const effort = basename(session);

  const gradeAbs = join(session, gradeRel);
  if (!existsSync(gradeAbs)) return fail(['FAIL: grade file absent — seal after the final grade (grade-seal.md → Lifecycle)']);
  const gradeRepoRel = `${sessionRel}/${gradeRel}`;

  const inventory = parseGradeInventory(readFileSync(gradeAbs, 'utf8'), repoRoot, session);
  if (inventory.errors.length) return fail(inventory.errors.map((e) => `FAIL: ${e}`));
  if (!inventory.entries.length) return fail([`FAIL: no parseable shasum -a 256 inventory lines in ${gradeRepoRel}`]);

  const bundled = [];
  const trackedRows = [];
  const unsealable = [];
  for (const e of inventory.entries) {
    const c = classifyEntry(repoRoot, e);
    if (c.kind === 'tracked') trackedRows.push({ commit: c.commit, sha256: e.sha256, path: e.path });
    else if (c.kind === 'bundled') bundled.push(e.path);
    else unsealable.push(`FAIL: ${c.reason}: ${e.path}`);
  }
  if (unsealable.length) {
    const more = unsealable.length > LIST_LIMIT ? [`FAIL: ${unsealable.length} of ${inventory.entries.length} inputs cannot be sealed`] : [];
    return fail([...unsealable.slice(0, LIST_LIMIT), ...more]);
  }

  const closureAbs = join(session, CLOSURE_REL);
  const closureRepoRel = `${sessionRel}/${CLOSURE_REL}`;
  const hasClosure = existsSync(closureAbs);
  const gradeCopies = hasClosure ? [gradeRepoRel, closureRepoRel] : [gradeRepoRel];

  const scanned = [...bundled, ...gradeCopies];
  const hits = scanned.flatMap((rel) => scanSecrets(join(repoRoot, rel), rel));
  if (hits.length) return fail(hits.map((h) => `SECRET-SCAN HIT ${h.path}:${h.line} ${h.pattern}`));
  const lines = [`SECRET-SCAN: 0 hits over ${scanned.length} files`];

  const gradeSha256 = sha256File(gradeAbs);
  const tag = gradeSealTag(gradeRel, gradeSha256);
  const sealRel = `${SEAL_ROOT}/${effort}/${tag}`;
  const sealAbs = join(repoRoot, sealRel);
  if (sealRel.split('/').includes('team-session') || sealAbs === session || sealAbs.startsWith(`${session}/`)) {
    return usage(`seal dir ${sealRel} would lie inside the session dir or under team-session/ — refused`);
  }
  if (existsSync(sealAbs) && !opts.reseal) return fail([...lines, `FAIL: grade seal exists at ${sealRel} — pass --reseal to rebuild it`]);

  const head = git(repoRoot, ['rev-parse', 'HEAD']);
  if (head.rc !== 0) return usage('repo has no HEAD commit');

  const work = mkdtempSync(join(tmpdir(), 'grade-seal-'));
  try {
    const tmpBundle = join(work, BUNDLE_NAME);
    let bundle;
    let tools;
    try {
      tools = bundleTools();
      bundle = buildBundle(repoRoot, bundled, gradeCopies, tmpBundle);
    } catch (err) {
      const message = String(err?.message ?? err);
      return message.startsWith('USAGE:') ? { code: EXIT.USAGE, lines: [...lines, message], written: [] } : fail([...lines, `FAIL: ${message}`]);
    }
    if (bundle.bytes > cap) return fail([...lines, `FAIL: bundle ${bundle.bytes} B exceeds cap ${cap} B — re-present storage (D-4); nothing written`]);

    const manifest = renderManifest(inventory.entries);
    const sealedAtUtc = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const record = {
      effort,
      gradeFile: gradeRepoRel,
      gradeSha256,
      gradeCopy: `${GRADE_COPY_PREFIX}${gradeRepoRel}`,
      disposition: opts.disposition,
      closureRecord: closureRepoRel,
      closureSha256: hasClosure ? sha256File(closureAbs) : 'absent',
      closureCopy: hasClosure ? `${GRADE_COPY_PREFIX}${closureRepoRel}` : 'absent',
      sealedAtUtc,
      sealedHead: head.stdout.trim(),
      inputs: inventory.entries.length,
      bundled: bundled.length,
      tracked: trackedRows.length,
      bundle: BUNDLE_NAME,
      bundleSha256: bundle.sha256,
      bundleBytes: bundle.bytes,
      bundleCapBytes: MAX_BUNDLE_BYTES,
      manifestSha256: sha256Bytes(Buffer.from(manifest, 'utf8')),
      method: BUNDLE_METHOD,
      toolVersions: `${tools.tar}; ${tools.zstd}; node ${process.version}`,
      trackedRows,
    };

    mkdirSync(sealAbs, { recursive: true });
    writeFileSync(join(sealAbs, MANIFEST_NAME), manifest);
    copyFileSync(tmpBundle, join(sealAbs, BUNDLE_NAME));
    writeFileSync(join(sealAbs, GRADE_SEAL_NAME), renderGradeSealMd(record));
    const indexAbs = join(repoRoot, SEAL_ROOT, INDEX_NAME);
    writeFileSync(indexAbs, upsertIndexRow(existsSync(indexAbs) ? readFileSync(indexAbs, 'utf8') : null, { effort, tag, sealedAtUtc }));

    const written = [`${sealRel}/${MANIFEST_NAME}`, `${sealRel}/${BUNDLE_NAME}`, `${sealRel}/${GRADE_SEAL_NAME}`, `${SEAL_ROOT}/${INDEX_NAME}`];
    return {
      code: EXIT.OK,
      lines: [...lines, ...written.map((p) => `WROTE ${p}`), `NEXT: git commit -m "chore(team-kit-seals): grade seal ${effort} ${tag}" -- ${written.join(' ')}`],
      written,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

export const parseArgs = (argv) => {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reseal') opts.reseal = true;
    else if (arg === '--disposition' || arg === '--grade' || arg === '--max-bundle-bytes') {
      if (i + 1 >= argv.length) return { error: `${arg} needs a value` };
      const value = argv[(i += 1)];
      if (arg === '--disposition') opts.disposition = value;
      else if (arg === '--grade') opts.grade = value;
      else if (!/^[1-9][0-9]*$/.test(value) || Number(value) > MAX_BUNDLE_BYTES) return { error: `--max-bundle-bytes must be an integer 1..${MAX_BUNDLE_BYTES}` };
      else opts.maxBundleBytes = Number(value);
    } else if (arg.startsWith('-')) return { error: `unknown flag: ${arg}` };
    else positional.push(arg);
  }
  if (positional.length !== 1) return { error: positional.length ? `extra argument: ${positional.slice(1).join(' ')}` : 'session dir missing' };
  return { sessionDir: positional[0], opts };
};

const isMain = () => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};

if (isMain()) {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.error ? usage(parsed.error) : buildGradeSeal(parsed.sessionDir, parsed.opts);
  const out = result.code === EXIT.USAGE ? console.error : console.log;
  for (const line of result.lines) out(line);
  process.exit(result.code);
}
