#!/usr/bin/env node
// grade-seal check: a gated effort (definition-of-done.md carries the grade-seal-gate row, or
// team-kit-seals/<effort>/ already holds a grade seal) passes only when the grade file's shasum -a 256
// inventory is covered by a grade seal committed on main. all seal bytes are read from the main tree,
// never the worktree (references/grade-seal.md).
// node check-grade-seal.mjs <abs session dir> [--grade <session-relative grade file>] [--from-seal [<tag>]]
// exit 0 gated + sealed + verified, 1 gated + failing, 2 usage/environment, 3 not gated

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
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
  SPAWN_MAX_BUFFER,
  bundleTools,
  committedSealTags,
  git,
  gradeSealTag,
  isGradeSealGated,
  parseGradeInventory,
  parseGradeSealMd,
  renderManifest,
  repoRootOf,
  sha256Bytes,
  sha256File,
} from './grade-seal-lib.mjs';

export const USAGE = 'usage: check-grade-seal.mjs <abs session dir> [--grade <session-relative grade file>] [--from-seal [<tag>]]';
// failure listings name at most this many paths, then the count
const LIST_LIMIT = 20;
const TAR = '/usr/bin/tar';

const usage = (why) => ({ code: EXIT.USAGE, lines: [`USAGE: ${why}`, USAGE] });
const failed = (lines) => ({ code: EXIT.FAIL, lines });
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const validCap = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_BUNDLE_BYTES;
// bsdtar lists precomposed names decomposed on macOS: member names compare in NFC
const nfc = (s) => s.normalize('NFC');
const listed = (items, total, what) => [
  ...items.slice(0, LIST_LIMIT),
  ...(items.length > LIST_LIMIT ? [`FAIL: ${items.length} of ${total} ${what}`] : []),
];

// realpath of the nearest existing ancestor plus the missing tail (a --from-seal session dir may be gone)
const resolveLoose = (p) => {
  const tail = [];
  let d = p;
  while (!existsSync(d) && dirname(d) !== d) {
    tail.unshift(basename(d));
    d = dirname(d);
  }
  return existsSync(d) ? join(realpathSync(d), ...tail) : p;
};

const mainBlob = (repoRoot, rel) => git(repoRoot, ['cat-file', 'blob', `main:${rel}`], { buffer: true });
const onMain = (repoRoot, rel) => git(repoRoot, ['cat-file', '-e', `main:${rel}`]).rc === 0;

// decompress + list + extract the committed bundle; bytes were already checked against cap and sha
const openBundle = (bytes, work) => {
  const zst = join(work, BUNDLE_NAME);
  const tarFile = join(work, 'inputs.tar');
  const dir = join(work, 'x');
  writeFileSync(zst, bytes);
  const d = spawnSync('zstd', ['-d', '-q', '-f', '-o', tarFile, zst], { maxBuffer: SPAWN_MAX_BUFFER });
  if (d.status !== 0) return { error: `FAIL: bundle does not decompress: ${String(d.stderr ?? d.error ?? '').trim()}` };
  const t = spawnSync(TAR, ['-tf', tarFile], { maxBuffer: SPAWN_MAX_BUFFER });
  if (t.status !== 0) return { error: `FAIL: bundle does not list: ${String(t.stderr ?? t.error ?? '').trim()}` };
  const members = t.stdout
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((m) => nfc(m.replace(/^\.\//, '')));
  mkdirSync(dir);
  const x = spawnSync(TAR, ['-xf', tarFile, '-C', dir], { maxBuffer: SPAWN_MAX_BUFFER });
  if (x.status !== 0) return { error: `FAIL: bundle does not extract: ${String(x.stderr ?? x.error ?? '').trim()}` };
  return { members, dir };
};

const bundleBytes = (repoRoot, sealRel, cap, rec) => {
  const rel = `${sealRel}/${BUNDLE_NAME}`;
  const size = git(repoRoot, ['cat-file', '-s', `main:${rel}`]);
  const n = Number(size.stdout.trim());
  if (size.rc !== 0 || !Number.isInteger(n)) return { error: `FAIL: cannot read main:${rel}` };
  if (n > cap) return { error: `FAIL: bundle ${n} B exceeds cap ${cap} B — do not push; re-present storage (D-4)` };
  const blob = mainBlob(repoRoot, rel);
  if (blob.rc !== 0) return { error: `FAIL: cannot read main:${rel}` };
  if (sha256Bytes(blob.stdout) !== rec.bundleSha256) return { error: 'FAIL: bundle sha mismatch' };
  return { bytes: blob.stdout };
};

const originContains = (repoRoot, sealRel) => {
  const commit = git(repoRoot, ['log', '-n', '1', '--format=%H', 'main', '--', sealRel]).stdout.trim();
  if (!commit || git(repoRoot, ['rev-parse', '--verify', '-q', 'origin/main']).rc !== 0) return 'unknown';
  const r = git(repoRoot, ['merge-base', '--is-ancestor', commit, 'origin/main']);
  return r.rc === 0 ? 'yes' : r.rc === 1 ? 'no' : 'unknown';
};

export const checkGradeSeal = (sessionDir, opts = {}) => {
  // step 0: args + environment
  if (typeof sessionDir !== 'string' || !isAbsolute(sessionDir)) return usage('session dir must be an absolute path');
  const fromSeal = opts.fromSeal !== undefined && opts.fromSeal !== false;
  if (fromSeal && opts.fromSeal !== true && (typeof opts.fromSeal !== 'string' || !/^[^/\s]+$/.test(opts.fromSeal))) return usage(`bad --from-seal tag: ${opts.fromSeal}`);
  if (!fromSeal && !isDir(sessionDir)) return usage(`session dir not found: ${sessionDir}`);
  if (opts.maxBundleBytes !== undefined && !validCap(opts.maxBundleBytes)) return usage(`maxBundleBytes must be an integer 1..${MAX_BUNDLE_BYTES}`);
  if (opts.grade !== undefined && (typeof opts.grade !== 'string' || !opts.grade || isAbsolute(opts.grade) || opts.grade.split('/').includes('..'))) {
    return usage(`--grade must be session-relative: ${opts.grade}`);
  }
  const cap = Math.min(MAX_BUNDLE_BYTES, opts.maxBundleBytes ?? MAX_BUNDLE_BYTES);
  const session = resolveLoose(sessionDir);
  const repoRoot = repoRootOf(session);
  if (!repoRoot) return usage(`not inside a git repo: ${sessionDir}`);
  if (!session.startsWith(`${repoRoot}/`)) return usage(`session dir lies outside the repo root ${repoRoot}`);
  const sessionRel = session.slice(repoRoot.length + 1);
  const effort = basename(session);

  // step 1: gating
  if (!isGradeSealGated(session, repoRoot).gated) {
    return { code: EXIT.NOT_GATED, lines: [`not gated: ${effort} — definition-of-done.md carries no grade-seal-gate row and ${SEAL_ROOT}/${effort}/ holds no grade seal`] };
  }
  try {
    bundleTools();
  } catch (err) {
    return { code: EXIT.USAGE, lines: [String(err?.message ?? err)] };
  }

  const work = mkdtempSync(join(tmpdir(), 'check-grade-seal-'));
  try {
    // step 2: grade bytes + inventory
    let gradeRepoRel;
    let gradeBytes;
    let tag;
    let rec;
    let opened;
    let bundleChecked = false;
    if (!fromSeal) {
      gradeRepoRel = `${sessionRel}/${opts.grade ?? DEFAULT_GRADE_REL}`;
      const gradeAbs = join(repoRoot, gradeRepoRel);
      if (!existsSync(gradeAbs)) {
        return failed([`FAIL: grade file ${gradeRepoRel} absent — the grade-seal gate runs after the final grade (grade-seal.md → Lifecycle); session files lost → --from-seal`]);
      }
      gradeBytes = readFileSync(gradeAbs);
    } else {
      const tags = committedSealTags(repoRoot, effort);
      if (opts.fromSeal === true) {
        if (tags.length === 0) return failed([`FAIL: no committed grade seal for ${effort}`]);
        if (tags.length > 1) return usage(`pass a tag: ${tags.join(' ')}`);
        tag = tags[0];
      } else {
        tag = opts.fromSeal;
      }
      const sealRel = `${SEAL_ROOT}/${effort}/${tag}`;
      if (!onMain(repoRoot, `${sealRel}/${GRADE_SEAL_NAME}`)) {
        return failed([existsSync(join(repoRoot, sealRel)) ? 'FAIL: grade seal not committed on main (untracked or staged only)' : `FAIL: no grade seal at ${sealRel}`]);
      }
      rec = parseGradeSealMd(mainBlob(repoRoot, `${sealRel}/${GRADE_SEAL_NAME}`).stdout.toString('utf8'));
      if (rec.error) return failed([`FAIL: ${rec.error}`]);
      if (rec.effort !== effort) return failed([`FAIL: ${GRADE_SEAL_NAME} Effort ${rec.effort} is not ${effort}`]);
      if (opts.grade !== undefined && rec.gradeFile !== `${sessionRel}/${opts.grade}`) {
        return failed([`FAIL: --grade ${sessionRel}/${opts.grade} differs from the sealed grade file ${rec.gradeFile}`]);
      }
      gradeRepoRel = rec.gradeFile;
      const b = bundleBytes(repoRoot, sealRel, cap, rec);
      if (b.error) return failed([b.error]);
      opened = openBundle(b.bytes, work);
      if (opened.error) return failed([opened.error]);
      bundleChecked = true;
      const copy = join(opened.dir, `${GRADE_COPY_PREFIX}${gradeRepoRel}`);
      if (!existsSync(copy)) return failed([`FAIL: bundle holds no grade copy ${GRADE_COPY_PREFIX}${gradeRepoRel}`]);
      gradeBytes = readFileSync(copy);
    }
    const gradeSha256 = sha256Bytes(gradeBytes);
    const inventory = parseGradeInventory(gradeBytes.toString('utf8'), repoRoot, fromSeal ? null : session);
    if (inventory.errors.length) return failed(inventory.errors.map((e) => `FAIL: ${e}`));
    if (!inventory.entries.length) return failed([`FAIL: no parseable shasum -a 256 inventory lines in ${gradeRepoRel}`]);
    const entries = inventory.entries;
    const manifestSha = new Map(entries.map((e) => [nfc(e.path), e.sha256]));

    // step 3: tag + seal committed on main
    const computedTag = gradeSealTag(gradeRepoRel, gradeSha256);
    if (fromSeal && computedTag !== tag) return failed([`FAIL: grade copy hashes to tag ${computedTag}, not the selected ${tag}`]);
    tag = computedTag;
    const sealRel = `${SEAL_ROOT}/${effort}/${tag}`;
    const required = [`${sealRel}/${GRADE_SEAL_NAME}`, `${sealRel}/${MANIFEST_NAME}`, `${sealRel}/${BUNDLE_NAME}`, `${SEAL_ROOT}/${INDEX_NAME}`];
    if (!required.every((rel) => onMain(repoRoot, rel))) {
      if (existsSync(join(repoRoot, sealRel))) return failed(['FAIL: grade seal not committed on main (untracked or staged only)']);
      const headTree = git(repoRoot, ['ls-tree', '-r', '-z', '--name-only', 'HEAD']);
      const trackedPaths = new Set(headTree.rc === 0 ? headTree.stdout.split('\0').filter(Boolean) : []);
      const untracked = entries.filter((e) => !trackedPaths.has(e.path)).map((e) => `FAIL: untracked-only input: ${e.path}`);
      return failed([`FAIL: no grade seal at ${sealRel}`, ...listed(untracked, entries.length, 'inputs untracked-only')]);
    }

    // step 4: MANIFEST + GRADE-SEAL.md (main)
    if (!rec) {
      rec = parseGradeSealMd(mainBlob(repoRoot, `${sealRel}/${GRADE_SEAL_NAME}`).stdout.toString('utf8'));
      if (rec.error) return failed([`FAIL: ${rec.error}`]);
    }
    const manifestBytes = mainBlob(repoRoot, `${sealRel}/${MANIFEST_NAME}`).stdout;
    const step4 = [];
    if (!manifestBytes.equals(Buffer.from(renderManifest(entries), 'utf8'))) step4.push(`FAIL: ${MANIFEST_NAME} on main differs from the inventory of ${gradeRepoRel}`);
    if (rec.gradeSha256 !== gradeSha256) step4.push(`FAIL: ${GRADE_SEAL_NAME} Grade file sha256 ${rec.gradeSha256} is not the grade file sha ${gradeSha256}`);
    if (rec.manifestSha256 !== sha256Bytes(manifestBytes)) step4.push(`FAIL: ${GRADE_SEAL_NAME} Manifest sha256 is not the sha of ${MANIFEST_NAME} on main`);
    if (rec.gradeFile !== gradeRepoRel) step4.push(`FAIL: ${GRADE_SEAL_NAME} Grade file ${rec.gradeFile} is not ${gradeRepoRel}`);
    if (rec.effort !== effort) step4.push(`FAIL: ${GRADE_SEAL_NAME} Effort ${rec.effort} is not ${effort}`);
    if (step4.length) return failed(step4);

    // step 5: partition (tracked rows vs bundled inputs)
    const trackedSet = new Set(rec.trackedRows.map((r) => nfc(r.path)));
    const stray = rec.trackedRows.filter((r) => !manifestSha.has(nfc(r.path))).map((r) => `FAIL: tracked row not in ${MANIFEST_NAME}: ${r.path}`);
    if (trackedSet.size !== rec.trackedRows.length) stray.push('FAIL: tracked inputs block lists a path twice');
    const bundledSet = new Set(entries.map((e) => nfc(e.path)).filter((p) => !trackedSet.has(p)));
    if (rec.inputs !== entries.length || rec.tracked !== rec.trackedRows.length || rec.bundled !== bundledSet.size) {
      stray.push(`FAIL: ${GRADE_SEAL_NAME} Inputs ${rec.inputs} (bundled ${rec.bundled}, tracked ${rec.tracked}) does not match ${entries.length} (bundled ${bundledSet.size}, tracked ${rec.trackedRows.length})`);
    }
    if (stray.length) return failed(listed(stray, rec.trackedRows.length, 'tracked rows stray'));

    // step 6: tracked rows reachable from main with matching content
    const badTracked = rec.trackedRows.flatMap((r) => {
      if (r.sha256 !== manifestSha.get(nfc(r.path))) return [`FAIL: tracked row sha differs from ${MANIFEST_NAME}: ${r.path}`];
      if (git(repoRoot, ['merge-base', '--is-ancestor', r.commit, 'main']).rc !== 0) return [`FAIL: tracked commit ${r.commit} not reachable from main: ${r.path}`];
      const blob = git(repoRoot, ['cat-file', 'blob', `${r.commit}:${r.path}`], { buffer: true });
      return blob.rc === 0 && sha256Bytes(blob.stdout) === r.sha256 ? [] : [`FAIL: tracked content at ${r.commit.slice(0, 12)} does not match: ${r.path}`];
    });
    if (badTracked.length) return failed(listed(badTracked, rec.trackedRows.length, 'tracked inputs failing'));

    // step 7: bundle (cap, sha, members, extracted shas)
    if (!bundleChecked) {
      const b = bundleBytes(repoRoot, sealRel, cap, rec);
      if (b.error) return failed([b.error]);
      opened = openBundle(b.bytes, work);
      if (opened.error) return failed([opened.error]);
    }
    const expected = new Set([...bundledSet, nfc(rec.gradeCopy), ...(rec.closureCopy === 'absent' ? [] : [nfc(rec.closureCopy)])]);
    const got = new Set(opened.members);
    const memberFails = [
      ...[...expected].filter((m) => !got.has(m)).map((m) => `FAIL: bundle lacks member: ${m}`),
      ...[...got].filter((m) => !expected.has(m)).map((m) => `FAIL: bundle holds unexpected member: ${m}`),
      ...[...got].filter((m) => basename(m).startsWith('._')).map((m) => `FAIL: bundle holds AppleDouble member: ${m}`),
    ];
    if (got.size !== opened.members.length) memberFails.push('FAIL: bundle lists a member twice');
    if (memberFails.length) return failed(listed(memberFails, expected.size, 'bundle member mismatches'));
    const shaFails = [...bundledSet].filter((p) => sha256File(join(opened.dir, p)) !== manifestSha.get(p)).map((p) => `FAIL: bundled input sha differs from ${MANIFEST_NAME}: ${p}`);
    if (sha256File(join(opened.dir, rec.gradeCopy)) !== rec.gradeSha256) shaFails.push(`FAIL: grade copy sha differs from Grade file sha256: ${rec.gradeCopy}`);
    if (rec.closureCopy !== 'absent' && sha256File(join(opened.dir, rec.closureCopy)) !== rec.closureSha256) shaFails.push(`FAIL: closure copy sha differs from Closure record sha256: ${rec.closureCopy}`);
    if (shaFails.length) return failed(listed(shaFails, bundledSet.size, 'bundle members failing'));

    // step 8: INDEX.md row
    const index = mainBlob(repoRoot, `${SEAL_ROOT}/${INDEX_NAME}`).stdout.toString('utf8');
    if (!index.split('\n').some((line) => line.startsWith(`| ${effort} | ${tag} |`))) return failed([`FAIL: ${SEAL_ROOT}/${INDEX_NAME} on main holds no row | ${effort} | ${tag} |`]);

    // step 9: informational, never changes the exit
    const info = [];
    if (fromSeal) {
      info.push('INFO: verified from seal (session files not read)');
    } else {
      const closureAbs = join(session, CLOSURE_REL);
      const closure = !existsSync(closureAbs)
        ? 'absent'
        : sha256File(closureAbs) === rec.closureSha256
          ? 'matches seal'
          : 'drift (expected after a post-grade gate verdict; reseal only per grade-seal.md → Reseal)';
      info.push(`INFO: closure record sha ${closure}`);
    }
    info.push(`INFO: origin/main contains seal commit: ${originContains(repoRoot, sealRel)}`);
    return {
      code: EXIT.OK,
      lines: [...info, `OK: grade seal verified ${effort} ${tag} (${entries.length} inputs: ${bundledSet.size} bundled, ${rec.trackedRows.length} tracked)${fromSeal ? ' [from seal]' : ''}`],
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
    if (arg === '--from-seal') {
      // a tag never holds '/', so an absolute session dir after the flag stays positional
      const next = argv[i + 1];
      opts.fromSeal = next !== undefined && !next.startsWith('-') && !next.includes('/') ? argv[(i += 1)] : true;
    } else if (arg === '--grade') {
      if (i + 1 >= argv.length) return { error: '--grade needs a value' };
      opts.grade = argv[(i += 1)];
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
  const result = parsed.error ? usage(parsed.error) : checkGradeSeal(parsed.sessionDir, parsed.opts);
  const out = result.code === EXIT.USAGE ? console.error : console.log;
  for (const line of result.lines) out(line);
  process.exit(result.code);
}
