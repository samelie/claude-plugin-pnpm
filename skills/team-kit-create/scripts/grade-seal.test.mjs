import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import {
  gradeSealTag,
  isGradeSealGated,
  mtreeEscape,
  parseGradeInventory,
  parseGradeSealMd,
  sha256Bytes,
  sha256File,
} from './grade-seal-lib.mjs';

const script = fileURLToPath(new URL('./grade-seal.mjs', import.meta.url));
const EFFORT = 'fx-effort';
const GRADE_REL = 'goal-auditor/final-grade.md';
// built at runtime so this file never carries a value-shaped credential itself
const SECRET = ['sk', 'ant', `api03${'Zx9Qw'.repeat(3)}`].join('-');
const DOD_ROW = '| AC-5 grade-seal-gate | graded inputs sealed | T-9 | deterministic | `check-grade-seal.mjs` → exit 0 | true |';

const bases = [];
after(() => {
  for (const base of bases) rmSync(base, { recursive: true, force: true });
});

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const commitAll = (repo, message) => {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
};
const put = (abs, text) => {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return abs;
};

// repo with a committed docs/tracked.md, a gitignored session holding two inputs and a closure record
const fixture = ({ effort = EFFORT, origin = false } = {}) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'grade-seal-')));
  bases.push(base);
  const repo = join(base, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@t');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'commit.gpgsign', 'false');
  put(join(repo, '.gitignore'), 'team-session/\n');
  put(join(repo, 'docs/tracked.md'), 'tracked v1\n');
  commitAll(repo, 'init');
  if (origin) {
    const bare = join(base, 'origin.git');
    spawnSync('git', ['init', '-q', '--bare', bare]);
    git(repo, 'remote', 'add', 'origin', bare);
    git(repo, 'push', '-q', '-u', 'origin', 'main');
  }
  const session = join(repo, 'team-session', effort);
  const inputs = [put(join(session, 'inputs/a.json'), '{"a":1}\n'), put(join(session, 'inputs/b.json'), '{"b":2}\n')];
  put(join(session, 'build-state.md'), '# build state\n\nclosed\n');
  return { base, repo, session, inputs, tracked: join(repo, 'docs/tracked.md') };
};

const writeGrade = (f, paths, extra = '') => {
  const lines = paths.map((p) => `${sha256File(p)}  ${p}`);
  return put(join(f.session, GRADE_REL), `# Final grade\n\n## Appendix A\n\n${lines.join('\n')}\n${extra}`);
};
const seal = (f, ...args) => spawnSync(process.execPath, [script, f.session, '--disposition', 'fixture closed', ...args], { encoding: 'utf8' });
const outOf = (r) => `${r.stdout}${r.stderr}`;
const sealDir = (f) => join(f.repo, 'team-kit-seals', EFFORT, gradeSealTag(GRADE_REL, sha256File(join(f.session, GRADE_REL))));
const rel = (f, abs) => abs.slice(f.repo.length + 1);
const noSealWritten = (f) => assert.equal(existsSync(join(f.repo, 'team-kit-seals')), false, 'team-kit-seals/ was written');

const decompress = (bundle) => {
  const r = spawnSync('zstd', ['-dc', bundle], { maxBuffer: 1 << 30 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
};
const members = (bundle) => {
  const r = spawnSync('/usr/bin/tar', ['-tf', '-'], { input: decompress(bundle), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.split('\n').filter(Boolean).map((m) => m.replace(/^\.\//, ''));
};
const extract = (f, bundle) => {
  const dir = mkdtempSync(join(f.base, 'x-'));
  const r = spawnSync('/usr/bin/tar', ['-xf', '-', '-C', dir], { input: decompress(bundle) });
  assert.equal(r.status, 0, String(r.stderr));
  return dir;
};
const sealFiles = (f) => {
  const dir = sealDir(f);
  return {
    manifest: readFileSync(join(dir, 'MANIFEST.sha256'), 'utf8'),
    bundle: readFileSync(join(dir, 'inputs.tar.zst')),
    record: readFileSync(join(dir, 'GRADE-SEAL.md'), 'utf8'),
    index: readFileSync(join(f.repo, 'team-kit-seals/INDEX.md'), 'utf8'),
  };
};
const happy = () => {
  const f = fixture();
  writeGrade(f, [...f.inputs, f.tracked]);
  const r = seal(f);
  assert.equal(r.status, 0, outOf(r));
  return { f, r };
};

test('GS-1 parse: abs stripped, rel kept, ./ stripped, dup deduped, conflict + dotdot + _grade prefix rejected', () => {
  const f = fixture();
  const sha = (c) => c.repeat(64);
  const ok = parseGradeInventory(
    [`${sha('a')}  ${f.inputs[0]}`, `${sha('b')}  docs/tracked.md`, `${sha('b')}  ./docs/tracked.md`, 'prose line', `${sha('c')}  ./team-session/${EFFORT}/inputs/b.json`].join('\n'),
    f.repo,
    f.session,
  );
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.entries.map((e) => [e.path, e.sha256]), [
    ['docs/tracked.md', sha('b')],
    [`team-session/${EFFORT}/inputs/a.json`, sha('a')],
    [`team-session/${EFFORT}/inputs/b.json`, sha('c')],
  ]);
  assert.equal(ok.rawLines, 4);
  assert.equal(ok.duplicateLines, 1);
  const bad = parseGradeInventory([`${sha('a')}  docs/tracked.md`, `${sha('d')}  docs/tracked.md`, `${sha('e')}  docs/../etc/passwd`, `${sha('f')}  _grade/x.md`].join('\n'), f.repo, f.session);
  assert.equal(bad.errors.length, 3, bad.errors.join('\n'));
  assert.match(bad.errors.join('\n'), /same path with 2 shas: docs\/tracked\.md/);
  assert.match(bad.errors.join('\n'), /'\.\.' segment/);
  assert.match(bad.errors.join('\n'), /_grade\/ prefix/);
});

test('GS-2 tag: final-grade-<12hex>', () => {
  const sha = sha256Bytes(Buffer.from('grade'));
  assert.equal(gradeSealTag(GRADE_REL, sha), `final-grade-${sha.slice(0, 12)}`);
  assert.match(gradeSealTag(GRADE_REL, sha), /^final-grade-[0-9a-f]{12}$/);
});

test('GS-3 gating: dod row true / row false / worktree seal / committed seal / neither', () => {
  const f = fixture();
  const session = (effort, dod) => {
    const dir = join(f.repo, 'team-session', effort);
    mkdirSync(dir, { recursive: true });
    if (dod) writeFileSync(join(dir, 'definition-of-done.md'), `# DoD\n\n| AC | statement | maps_to | type | verify | blocking |\n|---|---|---|---|---|---|\n${dod}\n`);
    return dir;
  };
  const rowTrue = isGradeSealGated(session('e-row', DOD_ROW), f.repo);
  assert.equal(rowTrue.gated, true);
  assert.equal(rowTrue.byDodRow, true);
  assert.equal(isGradeSealGated(session('e-false', DOD_ROW.replace(/\| true \|$/, '| false |')), f.repo).gated, false);
  put(join(f.repo, 'team-kit-seals/e-wt/final-grade-000000000000/GRADE-SEAL.md'), '# Grade seal\n');
  const wt = isGradeSealGated(session('e-wt'), f.repo);
  assert.deepEqual([wt.gated, wt.sealInWorktree, wt.sealOnMain], [true, true, false]);
  put(join(f.repo, 'team-kit-seals/e-main/final-grade-111111111111/GRADE-SEAL.md'), '# Grade seal\n');
  commitAll(f.repo, 'seal');
  rmSync(join(f.repo, 'team-kit-seals/e-main'), { recursive: true });
  const main = isGradeSealGated(session('e-main'), f.repo);
  assert.deepEqual([main.gated, main.bySeal, main.sealInWorktree, main.sealOnMain], [true, true, false, true]);
  assert.deepEqual(isGradeSealGated(session('e-none'), f.repo), { gated: false, byDodRow: false, bySeal: false, sealInWorktree: false, sealOnMain: false });
});

test('GS-4 mtree escape: space + utf8', () => {
  assert.equal(mtreeEscape('a b/é.txt'), 'a\\040b/\\303\\251.txt');
  assert.equal(mtreeEscape('team-session/x_y/a.b+c=d@e,f-g'), 'team-session/x_y/a.b+c=d@e,f-g');
  assert.equal(mtreeEscape('tab\there'), 'tab\\011here');
});

test('GS-5 seal: happy path writes 4 paths, manifest sorted repo-relative, tracked block, index row, NEXT commit line', () => {
  const { f, r } = happy();
  const tag = gradeSealTag(GRADE_REL, sha256File(join(f.session, GRADE_REL)));
  const sealRel = `team-kit-seals/${EFFORT}/${tag}`;
  const written = [`${sealRel}/MANIFEST.sha256`, `${sealRel}/inputs.tar.zst`, `${sealRel}/GRADE-SEAL.md`, 'team-kit-seals/INDEX.md'];
  const lines = r.stdout.trim().split('\n');
  assert.deepEqual(lines, [
    'SECRET-SCAN: 0 hits over 4 files',
    ...written.map((p) => `WROTE ${p}`),
    `NEXT: git commit -m "chore(team-kit-seals): grade seal ${EFFORT} ${tag}" -- ${written.join(' ')}`,
  ]);
  for (const p of written) assert.ok(existsSync(join(f.repo, p)), p);
  assert.deepEqual(readdirSync(join(f.repo, sealRel)).sort(), ['GRADE-SEAL.md', 'MANIFEST.sha256', 'inputs.tar.zst']);
  const s = sealFiles(f);
  const expected = [f.tracked, ...f.inputs].map((p) => `${sha256File(p)}  ${rel(f, p)}\n`).join('');
  assert.equal(s.manifest, expected);
  const rec = parseGradeSealMd(s.record);
  assert.equal(rec.error, undefined, rec.error);
  assert.deepEqual([rec.inputs, rec.bundled, rec.tracked], [3, 2, 1]);
  assert.equal(rec.effort, EFFORT);
  assert.equal(rec.disposition, 'fixture closed');
  assert.equal(rec.manifestSha256, sha256Bytes(Buffer.from(s.manifest)));
  assert.equal(rec.bundleSha256, sha256Bytes(s.bundle));
  assert.equal(rec.bundleBytes, s.bundle.length);
  assert.equal(rec.bundleCapBytes, 50000000);
  assert.equal(rec.sealedHead, git(f.repo, 'rev-parse', 'HEAD'));
  assert.match(s.record, new RegExp(`^# Grade seal: ${EFFORT} / ${tag}$`, 'm'));
  assert.match(s.record, /^```tracked\n[0-9a-f]{40}\t[0-9a-f]{64}\tdocs\/tracked\.md\n```$/m);
  assert.deepEqual(rec.trackedRows, [{ commit: git(f.repo, 'rev-parse', 'HEAD'), sha256: sha256File(f.tracked), path: 'docs/tracked.md' }]);
  assert.match(s.index, /^# Grade seals$/m);
  assert.match(s.index, new RegExp(`^\\| ${EFFORT} \\| ${tag} \\| \\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ \\| ${sealRel}/GRADE-SEAL\\.md \\|$`, 'm'));
});

test('GS-6 seal: --reseal reproduces identical bundle bytes', () => {
  const { f } = happy();
  const first = sealFiles(f);
  const r = seal(f, '--reseal');
  assert.equal(r.status, 0, outOf(r));
  const second = sealFiles(f);
  assert.ok(first.bundle.equals(second.bundle), 'bundle bytes differ after --reseal');
  assert.equal(second.manifest, first.manifest);
  assert.equal(second.index.match(new RegExp(`^\\| ${EFFORT} \\|`, 'gm')).length, 1);
});

test('GS-7 seal: bundle members exact (inputs + _grade copies), no ._ entries, extracted shas match', () => {
  const { f } = happy();
  const bundle = join(sealDir(f), 'inputs.tar.zst');
  const sessionRel = `team-session/${EFFORT}`;
  assert.deepEqual(members(bundle), [
    `_grade/${sessionRel}/build-state.md`,
    `_grade/${sessionRel}/${GRADE_REL}`,
    `${sessionRel}/inputs/a.json`,
    `${sessionRel}/inputs/b.json`,
  ]);
  assert.equal(members(bundle).filter((m) => m.split('/').at(-1).startsWith('._')).length, 0);
  const x = extract(f, bundle);
  for (const line of sealFiles(f).manifest.trim().split('\n')) {
    const [sha, path] = line.split('  ');
    if (path === 'docs/tracked.md') continue;
    assert.equal(sha256File(join(x, path)), sha, path);
  }
});

test('GS-8 seal: existing seal without --reseal exits 1 and changes nothing', () => {
  const { f } = happy();
  const before = sealFiles(f);
  const r = seal(f);
  assert.equal(r.status, 1, outOf(r));
  assert.match(outOf(r), /grade seal exists at team-kit-seals\//);
  assert.doesNotMatch(r.stdout, /^WROTE /m);
  assert.deepEqual(sealFiles(f), before);
});

test('GS-9 seal: missing input exits 1 naming path, writes nothing', () => {
  const f = fixture();
  writeGrade(f, [...f.inputs, f.tracked]);
  unlinkSync(f.inputs[1]);
  const r = seal(f);
  assert.equal(r.status, 1, outOf(r));
  assert.match(outOf(r), new RegExp(`input missing: team-session/${EFFORT}/inputs/b\\.json`));
  noSealWritten(f);
});

test('GS-10 seal: changed input exits 1 naming path', () => {
  const f = fixture();
  writeGrade(f, [...f.inputs, f.tracked]);
  writeFileSync(f.inputs[0], '{"a":"changed"}\n');
  const r = seal(f);
  assert.equal(r.status, 1, outOf(r));
  assert.match(outOf(r), new RegExp(`input changed since grade: team-session/${EFFORT}/inputs/a\\.json`));
  noSealWritten(f);
});

test('GS-11 seal: value-shaped sk-ant hit (input or closure record) exits 1 without printing the value; bare sk-ant- prefix passes', () => {
  const inInput = fixture();
  writeFileSync(inInput.inputs[0], `{"a":1}\n{"key":"${SECRET}"}\n`);
  writeGrade(inInput, inInput.inputs);
  const r1 = seal(inInput);
  assert.equal(r1.status, 1, outOf(r1));
  assert.match(r1.stdout, new RegExp(`^SECRET-SCAN HIT team-session/${EFFORT}/inputs/a\\.json:2 sk-ant$`, 'm'));
  assert.ok(!outOf(r1).includes(SECRET), 'secret value printed');
  assert.ok(!outOf(r1).includes(SECRET.slice(7)), 'secret tail printed');
  noSealWritten(inInput);

  const inClosure = fixture();
  writeFileSync(join(inClosure.session, 'build-state.md'), `# build state\n\nleaked ${SECRET}\n`);
  writeGrade(inClosure, inClosure.inputs);
  const r2 = seal(inClosure);
  assert.equal(r2.status, 1, outOf(r2));
  assert.match(r2.stdout, new RegExp(`^SECRET-SCAN HIT team-session/${EFFORT}/build-state\\.md:3 sk-ant$`, 'm'));
  assert.ok(!outOf(r2).includes(SECRET), 'secret value printed');
  noSealWritten(inClosure);

  const bare = fixture();
  writeFileSync(bare.inputs[0], 'scrub regex sk-ant-[A-Za-z0-9_-]{8,} and the sk-ant- prefix in prose\n');
  writeGrade(bare, bare.inputs);
  const r3 = seal(bare);
  assert.equal(r3.status, 0, outOf(r3));
  assert.match(r3.stdout, /^SECRET-SCAN: 0 hits over 4 files$/m);
});

test('GS-12 seal: all-tracked inventory writes a bundle holding only the _grade copies', () => {
  const f = fixture();
  writeGrade(f, [f.tracked]);
  const r = seal(f);
  assert.equal(r.status, 0, outOf(r));
  assert.match(r.stdout, /^SECRET-SCAN: 0 hits over 2 files$/m);
  const rec = parseGradeSealMd(sealFiles(f).record);
  assert.deepEqual([rec.inputs, rec.bundled, rec.tracked], [1, 0, 1]);
  assert.deepEqual(members(join(sealDir(f), 'inputs.tar.zst')), [`_grade/team-session/${EFFORT}/build-state.md`, `_grade/team-session/${EFFORT}/${GRADE_REL}`]);
});

test('GS-13 seal: usage errors exit 2', () => {
  const f = fixture();
  writeGrade(f, f.inputs);
  const cases = [
    [],
    ['team-session/fx-effort', '--disposition', 'x'],
    [join(f.repo, 'team-session/missing'), '--disposition', 'x'],
    [f.session],
    [f.session, '--disposition'],
    [f.session, '--disposition', ''],
    [f.session, '--disposition', 'x', '--bogus'],
    [f.session, 'extra', '--disposition', 'x'],
    [f.session, '--disposition', 'x', '--grade', join(f.session, GRADE_REL)],
    [f.session, '--disposition', 'x', '--grade', '../other/final-grade.md'],
  ];
  for (const args of cases) {
    const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2, `${JSON.stringify(args)}: ${outOf(r)}`);
    assert.match(r.stderr, /usage: grade-seal\.mjs/);
  }
  noSealWritten(f);
});

test('GS-14 seal: tracked history fallback records older matching commit', () => {
  const f = fixture();
  const older = git(f.repo, 'rev-parse', 'HEAD');
  const gradedSha = sha256File(f.tracked);
  writeGrade(f, [f.tracked]);
  writeFileSync(f.tracked, 'tracked v2\n');
  const head = commitAll(f.repo, 'v2');
  assert.notEqual(head, older);
  const r = seal(f);
  assert.equal(r.status, 0, outOf(r));
  assert.deepEqual(parseGradeSealMd(sealFiles(f).record).trackedRows, [{ commit: older, sha256: gradedSha, path: 'docs/tracked.md' }]);
});

test('GS-15 seal: empty inventory exits 1', () => {
  const f = fixture();
  put(join(f.session, GRADE_REL), '# Final grade\n\nno inventory here\n');
  const r = seal(f);
  assert.equal(r.status, 1, outOf(r));
  assert.match(outOf(r), /no parseable shasum -a 256 inventory lines/);
  noSealWritten(f);
});

test('GS-16 parse: session-relative path rejected naming the repo-relative fix', () => {
  const f = fixture();
  const inv = parseGradeInventory(`${sha256File(f.inputs[0])}  inputs/a.json\n`, f.repo, f.session);
  assert.equal(inv.entries.length, 0);
  assert.deepEqual(inv.errors, [
    `session-relative path: inputs/a.json — write it repo-relative (team-session/${EFFORT}/inputs/a.json) or absolute (run shasum -a 256 from the repo root or on absolute paths)`,
  ]);
});

test('GS-17 parse: absolute path outside the repo rejected with copy-into-session guidance', () => {
  const f = fixture();
  const outside = put(join(f.base, 'elsewhere/x.json'), '{}\n');
  const inv = parseGradeInventory(`${sha256File(outside)}  ${outside}\n`, f.repo, f.session);
  assert.equal(inv.entries.length, 0);
  assert.deepEqual(inv.errors, [`input outside the repo: ${outside} — copy it into the session dir before grading and inventory the copy`]);
});

test('GS-18 seal: bundle over --max-bundle-bytes exits 1, writes nothing, says re-present storage', () => {
  const f = fixture();
  writeGrade(f, f.inputs);
  const temps = () => new Set(readdirSync(tmpdir()).filter((n) => n.startsWith('grade-seal-')));
  const before = temps();
  const r = seal(f, '--max-bundle-bytes', '1');
  assert.equal(r.status, 1, outOf(r));
  assert.match(r.stdout, /^FAIL: bundle \d+ B exceeds cap 1 B — re-present storage \(D-4\); nothing written$/m);
  noSealWritten(f);
  assert.deepEqual([...temps()].filter((n) => !before.has(n)), [], 'temp bundle dir left behind');
});

test('GS-19 seal: --max-bundle-bytes 0, non-numeric or above 50000000 exits 2', () => {
  const f = fixture();
  writeGrade(f, f.inputs);
  for (const n of ['0', 'abc', '50000001', '-5', '1.5', '010']) {
    const r = seal(f, '--max-bundle-bytes', n);
    assert.equal(r.status, 2, `${n}: ${outOf(r)}`);
  }
  noSealWritten(f);
  const ok = seal(f, '--max-bundle-bytes', '50000000');
  assert.equal(ok.status, 0, outOf(ok));
});

test('GS-20 seal: tracked input over 1 MiB classifies tracked', () => {
  const f = fixture();
  const big = put(join(f.repo, 'docs/big.jsonl'), `${'{"row":"0123456789abcdef"}\n'.repeat(80_000)}`);
  assert.ok(readFileSync(big).length > 1 << 20);
  const commit = commitAll(f.repo, 'big');
  writeGrade(f, [big, f.inputs[0]]);
  const r = seal(f);
  assert.equal(r.status, 0, outOf(r));
  const rec = parseGradeSealMd(sealFiles(f).record);
  assert.deepEqual([rec.bundled, rec.tracked], [1, 1]);
  assert.deepEqual(rec.trackedRows, [{ commit, sha256: sha256File(big), path: 'docs/big.jsonl' }]);
});

test('GS-21 seal: tracked row prefers merge-base(origin/main, HEAD) over an unpushed HEAD', () => {
  const f = fixture({ origin: true });
  const pushed = git(f.repo, 'rev-parse', 'origin/main');
  put(join(f.repo, 'docs/other.md'), 'unpushed\n');
  const head = commitAll(f.repo, 'unpushed');
  assert.notEqual(head, pushed);
  writeGrade(f, [f.tracked]);
  const r = seal(f);
  assert.equal(r.status, 0, outOf(r));
  const rec = parseGradeSealMd(sealFiles(f).record);
  assert.deepEqual(rec.trackedRows.map((t) => t.commit), [pushed]);
  assert.equal(rec.sealedHead, head);
});

test('GS-22 seal: bundle carries _grade copies of grade file and closure record matching the recorded shas', () => {
  const { f } = happy();
  const rec = parseGradeSealMd(sealFiles(f).record);
  const sessionRel = `team-session/${EFFORT}`;
  assert.equal(rec.gradeFile, `${sessionRel}/${GRADE_REL}`);
  assert.equal(rec.gradeCopy, `_grade/${sessionRel}/${GRADE_REL}`);
  assert.equal(rec.closureRecord, `${sessionRel}/build-state.md`);
  assert.equal(rec.closureCopy, `_grade/${sessionRel}/build-state.md`);
  assert.equal(rec.gradeSha256, sha256File(join(f.session, GRADE_REL)));
  assert.equal(rec.closureSha256, sha256File(join(f.session, 'build-state.md')));
  const x = extract(f, join(sealDir(f), 'inputs.tar.zst'));
  assert.equal(sha256File(join(x, rec.gradeCopy)), rec.gradeSha256);
  assert.equal(sha256File(join(x, rec.closureCopy)), rec.closureSha256);
});

test('GS-23 seal: missing grade file exits 1 naming the lifecycle', () => {
  const f = fixture();
  const r = seal(f);
  assert.equal(r.status, 1, outOf(r));
  assert.match(r.stdout, /^FAIL: grade file absent — seal after the final grade \(grade-seal\.md → Lifecycle\)$/m);
  noSealWritten(f);
});
