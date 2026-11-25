import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  BANNER_GATE_EXEMPT, CONFIG_REL, afkMdPath, askGateOutput, bannerGateReason, denyReason, localDate, nudgeText, parseConfigText, pendingBannerLoad, renderBanner, resolveConfig, stopNudgeOutput,
} from './teamkit-config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'teamkit-config.mjs');
const example = join(here, '../../../team-kit.local.example.json');

const AFK_EVERY = 'mode: AFK — every decision gate adopts the orchestrator recommendation, recorded UNRATIFIED (ratify later: /team-kit-resume R3); safety seams park; sealed plan enters /team-kit-run';
const AFK_DECISION = 'mode: AFK — decision gates adopt the recommendation, recorded UNRATIFIED; create stops at the Step 7 seal';
const INTERACTIVE_SEALED = 'mode: interactive — gates ask you; sealed plan enters /team-kit-run without a launch prompt';
const INTERACTIVE_SHORT = 'mode: interactive — gates ask you';
const INTERACTIVE_LONG = 'mode: interactive — gates ask you; Step 7 ends with the launch handoff';
const NOTE = 'note: afk removes TeamKit questions, not permission prompts — unattended runs need auto mode + one earlier approved Workflow launch';
const lines = (...rows) => `${rows.join('\n')}\n`;

// doc-d2 texts spelled out independently of the reader so a drift in either fails
const docDeny = (afkMd, date) => `TeamKit afk=true (.claude/team-kit.local.json): no questions this session. If this session's banner line 1 showed afk=false, or the banner did not run, this does not apply: ask in plain text and end the turn. Inside a TeamKit pipeline: adopt your recommended option (none marked → the option you would recommend), record it per ${afkMd} §Record — UNRATIFIED (afk, ${date}) — and continue. Never pick a missing target (no task, ambiguous session dir, unresolved run field): end with the notice ${afkMd} defines. Safety seams park (${afkMd} §Seams); never present-and-wait. Outside a TeamKit pipeline: ask in plain text and end the turn. To restore questions: set afk=false (read live) or open a new session.`;
const docNudge = (afkMd) => `TeamKit afk=true: if this session's banner line 1 showed afk=false, or the banner did not run, this does not apply: ask in plain text (if not yet asked) and end the turn. Otherwise, if this turn ended awaiting a human decision inside a TeamKit pipeline, adopt your recommendation (none marked → the option you would recommend) per ${afkMd} and continue. Stopping is correct when the plan is sealed, the run ended, the remainder is parked in Blocked on you, a missing-target notice ended the turn, or this turn was not TeamKit pipeline work.`;

// the suite may run inside a claude session; strip every variable the reader reads
const baseEnv = () => {
  const env = { ...process.env };
  for (const name of ['CLAUDE_PROJECT_DIR', 'TEAMKIT_CONFIG_LOG', 'HITL_RELAY']) delete env[name];
  return env;
};

const withDir = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'teamkit-config-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};

const writeConfig = async (dir, text) => {
  await mkdir(join(dir, '.claude'), { recursive: true });
  await writeFile(join(dir, CONFIG_REL), text);
};

const cli = (args, { input = '', env = {}, cwd } = {}) => spawnSync(process.execPath, [script, ...args], { input, env: { ...baseEnv(), ...env }, cwd, encoding: 'utf8' });

const bannerFor = async (text) => withDir(async (dir) => {
  if (text !== null) await writeConfig(dir, text);
  return renderBanner(resolveConfig(dir));
});

const resolveConfigFrom = (text) => ({ ...parseConfigText(text), file: 'present' });

// the child's process.cwd() is the realpath (macos tmpdir sits behind /var → /private/var)
const childCwd = (dir) => spawnSync(process.execPath, ['-e', 'process.stdout.write(process.cwd())'], { cwd: dir, encoding: 'utf8' }).stdout;

const collapsedParseMessage = (text) => {
  try { JSON.parse(text); } catch (error) { return error.message.replace(/\s+/g, ' '); }
  throw new Error('expected a parse failure');
};

test('banner: absent file renders the approved absent state', async () => {
  assert.equal(await bannerFor(null), lines(
    'TeamKit config v1 · afk=false · autoRun=false',
    'source: .claude/team-kit.local.json (absent — defaults)',
    INTERACTIVE_LONG,
  ));
});

test('banner: both true renders the approved both-true state', async () => {
  assert.equal(await bannerFor('{"afk": true, "autoRun": true}'), lines(
    'TeamKit config v1 · afk=true · autoRun=true',
    'source: .claude/team-kit.local.json',
    AFK_EVERY,
    NOTE,
  ));
});

test('banner: afk only renders the approved afk-only state with the autoRun-absent suffix', async () => {
  assert.equal(await bannerFor('{"afk": true}'), lines(
    'TeamKit config v1 · afk=true · autoRun=false',
    'source: .claude/team-kit.local.json (autoRun absent — default false)',
    AFK_DECISION,
    NOTE,
  ));
});

test('banner: autoRun only renders the approved autoRun-only state', async () => {
  assert.equal(await bannerFor('{"afk": false, "autoRun": true}'), lines(
    'TeamKit config v1 · afk=false · autoRun=true',
    'source: .claude/team-kit.local.json',
    INTERACTIVE_SEALED,
  ));
});

test('banner: malformed JSON warns with the parser message and forces both false', async () => {
  const text = '{"afk": true,}';
  assert.equal(await bannerFor(text), lines(
    'TeamKit config v1 · afk=false · autoRun=false',
    'source: .claude/team-kit.local.json',
    `WARNING: not valid JSON (${collapsedParseMessage(text)}) — both flags forced false`,
    INTERACTIVE_SHORT,
  ));
  const multiline = '{\n  "afk":\n  yes\n}';
  const { warnings } = parseConfigText(multiline);
  assert.deepEqual(warnings, [`WARNING: not valid JSON (${collapsedParseMessage(multiline)}) — both flags forced false`]);
  assert.doesNotMatch(warnings[0], /\s{2}|\n/);
});

test('banner: non-boolean value warns with value and type and forces both false', async () => {
  assert.equal(await bannerFor('{"afk": "yes"}'), lines(
    'TeamKit config v1 · afk=false · autoRun=false',
    'source: .claude/team-kit.local.json',
    'WARNING: "afk" is "yes" (string), expected true or false — both flags forced false',
    INTERACTIVE_SHORT,
  ));
  assert.equal(await bannerFor('{"afk": true, "autoRun": null}'), lines(
    'TeamKit config v1 · afk=false · autoRun=false',
    'source: .claude/team-kit.local.json',
    'WARNING: "autoRun" is null (null), expected true or false — both flags forced false',
    INTERACTIVE_SHORT,
  ));
  assert.deepEqual(parseConfigText('{"autoRun": [1], "afk": 1}').warnings, [
    'WARNING: "autoRun" is [1] (array), expected true or false — both flags forced false',
    'WARNING: "afk" is 1 (number), expected true or false — both flags forced false',
  ]);
  assert.deepEqual(parseConfigText('{"zz": 1, "afk": "on"}'), {
    afk: false, autoRun: false, missing: ['autoRun'],
    warnings: ['WARNING: unknown key "zz" ignored', 'WARNING: "afk" is "on" (string), expected true or false — both flags forced false'],
  });
});

test('banner: unknown key warns with did-you-mean, is ignored, known keys keep values', async () => {
  assert.equal(await bannerFor('{"afk": true, "autorun": true}'), lines(
    'TeamKit config v1 · afk=true · autoRun=false',
    'source: .claude/team-kit.local.json',
    'WARNING: unknown key "autorun" ignored — did you mean "autoRun"?',
    AFK_DECISION,
  ));
});

test('banner: "//" key is silent; an unknown key with no case-insensitive match has no suggestion', async () => {
  assert.equal(await bannerFor('{"//": "x"}'), lines(
    'TeamKit config v1 · afk=false · autoRun=false',
    'source: .claude/team-kit.local.json (afk, autoRun absent — default false)',
    INTERACTIVE_LONG,
  ));
  assert.equal(await bannerFor('{}'), await bannerFor('{"//": "x"}'));
  assert.equal(await bannerFor('{"//": {"nested": 1}, "autoRun": true}'), lines(
    'TeamKit config v1 · afk=false · autoRun=true',
    'source: .claude/team-kit.local.json (afk absent — default false)',
    INTERACTIVE_SEALED,
  ));
  assert.deepEqual(parseConfigText('{"afk": false, "autoRun": false, "afkk": true}').warnings, ['WARNING: unknown key "afkk" ignored']);
  assert.deepEqual(parseConfigText('{"AFK": true, "autoRun": true}'), {
    afk: false, autoRun: true, missing: ['afk'], warnings: ['WARNING: unknown key "AFK" ignored — did you mean "afk"?'],
  });
});

test('banner: top-level non-object and an unreadable config warn and force both false', async () => {
  for (const [text, kind] of [['[]', 'array'], ['null', 'null'], ['"afk"', 'string'], ['7', 'number'], ['true', 'boolean']]) {
    assert.equal(await bannerFor(text), lines(
      'TeamKit config v1 · afk=false · autoRun=false',
      'source: .claude/team-kit.local.json',
      `WARNING: top level is ${kind}, expected an object — both flags forced false`,
      INTERACTIVE_SHORT,
    ));
  }
  await withDir(async (dir) => {
    await mkdir(join(dir, CONFIG_REL), { recursive: true });
    const config = resolveConfig(dir);
    assert.deepEqual(config, { afk: false, autoRun: false, file: 'present', missing: [], warnings: ['WARNING: unreadable (EISDIR) — both flags forced false'] });
    assert.equal(renderBanner(config), lines(
      'TeamKit config v1 · afk=false · autoRun=false',
      'source: .claude/team-kit.local.json',
      'WARNING: unreadable (EISDIR) — both flags forced false',
      INTERACTIVE_SHORT,
    ));
  });
  await withDir(async (dir) => {
    await writeFile(join(dir, '.claude'), 'not a dir');
    assert.equal(resolveConfig(dir).file, 'absent');
  });
  assert.deepEqual(parseConfigText('﻿{"afk": true, "autoRun": true}'), { afk: true, autoRun: true, missing: [], warnings: [] });
});

test('banner: example file resolves both false with no warning', () => {
  const config = { ...parseConfigText(readFileSync(example, 'utf8')), file: 'present' };
  assert.deepEqual(config, { afk: false, autoRun: false, file: 'present', missing: [], warnings: [] });
  assert.equal(renderBanner(config), lines(
    'TeamKit config v1 · afk=false · autoRun=false',
    'source: .claude/team-kit.local.json',
    INTERACTIVE_LONG,
  ));
});

test('banner: bytes are stable across runs and carry no timestamp or absolute path', async () => {
  await withDir(async (dir) => {
    for (const text of [null, '{"afk": true, "autoRun": true}', '{"afk": true,}', '{"afk": "yes"}']) {
      if (text !== null) await writeConfig(dir, text);
      const first = cli(['banner', dir]);
      const second = cli(['banner', dir]);
      assert.equal(first.status, 0);
      assert.equal(first.stdout, second.stdout);
      assert.equal(first.stdout, renderBanner(resolveConfig(dir)));
      assert.ok(!first.stdout.includes(dir), first.stdout);
      assert.ok(!first.stdout.includes(here), first.stdout);
      assert.doesNotMatch(first.stdout, /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/);
    }
  });
});

test('cli banner: exit 0 for absent and malformed configs; project dir falls back to CLAUDE_PROJECT_DIR then cwd; an import with no argv[1] runs no main and does not throw', async () => {
  const absent = lines('TeamKit config v1 · afk=false · autoRun=false', 'source: .claude/team-kit.local.json (absent — defaults)', INTERACTIVE_LONG);
  const afkOnly = renderBanner(resolveConfigFrom('{"afk": true}'));
  await withDir(async (root) => {
    const absentDir = join(root, 'absent');
    const malformedDir = join(root, 'malformed');
    const envDir = join(root, 'env');
    const cwdDir = join(root, 'cwd');
    for (const dir of [absentDir, malformedDir, envDir, cwdDir]) await mkdir(dir, { recursive: true });
    await writeConfig(malformedDir, '{"afk": true,}');
    await writeConfig(envDir, '{"afk": true}');
    await writeConfig(cwdDir, '{"afk": false, "autoRun": true}');

    const absentRun = cli(['banner', absentDir]);
    assert.equal(absentRun.status, 0);
    assert.equal(absentRun.stdout, absent);
    const malformedRun = cli(['banner', malformedDir]);
    assert.equal(malformedRun.status, 0);
    assert.match(malformedRun.stdout, /^WARNING: not valid JSON \(.+\) — both flags forced false$/m);

    const fromEnv = cli(['banner'], { env: { CLAUDE_PROJECT_DIR: envDir }, cwd: cwdDir });
    assert.equal(fromEnv.status, 0);
    assert.equal(fromEnv.stdout, afkOnly);
    const blankArg = cli(['banner', '  '], { env: { CLAUDE_PROJECT_DIR: envDir }, cwd: cwdDir });
    assert.equal(blankArg.stdout, afkOnly);
    const argWins = cli(['banner', absentDir], { env: { CLAUDE_PROJECT_DIR: envDir }, cwd: cwdDir });
    assert.equal(argWins.stdout, absent);
    const fromCwd = cli(['banner'], { env: { CLAUDE_PROJECT_DIR: '' }, cwd: cwdDir });
    assert.equal(fromCwd.status, 0);
    assert.equal(fromCwd.stdout, lines('TeamKit config v1 · afk=false · autoRun=true', 'source: .claude/team-kit.local.json', INTERACTIVE_SEALED));

    for (const args of [[], ['nope']]) {
      const other = cli(args, { cwd: envDir });
      assert.equal(other.status, 0);
      assert.equal(other.stdout, '');
    }
  });
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)}); process.stdout.write('IMPORTED')`], { env: baseEnv(), encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, 'IMPORTED');
});

test('ask-gate: afk=true denies with the DOC-D2 reason naming the absolute afk.md path and the date', async () => {
  const afkMd = afkMdPath();
  const date = '2026-11-01';
  assert.equal(denyReason(afkMd, date), docDeny(afkMd, date));
  assert.doesNotMatch(denyReason(afkMd, date), /\n/);
  const config = resolveConfigFrom('{"afk": true}');
  const expected = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: docDeny(afkMd, date) } };
  for (const input of [{ tool_name: 'AskUserQuestion' }, {}, null]) {
    const out = askGateOutput(config, input, afkMd, date);
    assert.ok(out.endsWith('}\n'));
    assert.deepEqual(JSON.parse(out), expected);
  }
  await withDir(async (dir) => {
    await writeConfig(dir, '{"afk": true}');
    const run = cli(['ask-gate'], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' }), env: { CLAUDE_PROJECT_DIR: dir } });
    assert.equal(run.status, 0);
    const reason = JSON.parse(run.stdout).hookSpecificOutput.permissionDecisionReason;
    const today = localDate(new Date());
    assert.ok(isAbsolute(afkMd));
    assert.ok(reason === docDeny(afkMd, today) || reason === docDeny(afkMd, localDate(new Date(Date.now() - 60_000))), reason);
    assert.ok(reason.includes(`${afkMd} §Record — UNRATIFIED (afk, `));
  });
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('ask-gate: afk false, absent, malformed, or a non-AskUserQuestion tool emits nothing', async () => {
  const afkMd = afkMdPath();
  const absent = { afk: false, autoRun: false, file: 'absent', missing: [], warnings: [] };
  for (const config of [absent, resolveConfigFrom('{"afk": false, "autoRun": true}'), resolveConfigFrom('{"afk": true,}'), resolveConfigFrom('{"afk": "yes"}')]) {
    assert.equal(askGateOutput(config, { tool_name: 'AskUserQuestion' }, afkMd, '2026-11-01'), '');
  }
  assert.equal(askGateOutput(resolveConfigFrom('{"afk": true}'), { tool_name: 'Bash' }, afkMd, '2026-11-01'), '');
  await withDir(async (dir) => {
    const ask = JSON.stringify({ tool_name: 'AskUserQuestion' });
    assert.equal(cli(['ask-gate'], { input: ask, env: { CLAUDE_PROJECT_DIR: dir } }).stdout, '');
    for (const text of ['{"afk": false}', '{"afk": true,}']) {
      await writeConfig(dir, text);
      const run = cli(['ask-gate'], { input: ask, env: { CLAUDE_PROJECT_DIR: dir } });
      assert.equal(run.status, 0);
      assert.equal(run.stdout, '');
    }
    await writeConfig(dir, '{"afk": true}');
    assert.equal(cli(['ask-gate'], { input: JSON.stringify({ tool_name: 'Write' }), env: { CLAUDE_PROJECT_DIR: dir } }).stdout, '');
  });
});

test('ask-gate: reads the config live on every call', async () => {
  await withDir(async (dir) => {
    const ask = JSON.stringify({ tool_name: 'AskUserQuestion' });
    const gate = () => cli(['ask-gate'], { input: ask, env: { CLAUDE_PROJECT_DIR: dir } }).stdout;
    await writeConfig(dir, '{"afk": true}');
    assert.equal(JSON.parse(gate()).hookSpecificOutput.permissionDecision, 'deny');
    await writeConfig(dir, '{"afk": false}');
    assert.equal(gate(), '');
    await writeConfig(dir, '{"afk": true, "autoRun": false}');
    assert.equal(JSON.parse(gate()).hookSpecificOutput.permissionDecision, 'deny');
    await rm(join(dir, CONFIG_REL));
    assert.equal(gate(), '');
  });
});

test('stop-nudge: afk=true, no background task, stop_hook_active false, HITL_RELAY unset emits the DOC-D2 nudge', async () => {
  const afkMd = afkMdPath();
  assert.equal(nudgeText(afkMd), docNudge(afkMd));
  assert.doesNotMatch(nudgeText(afkMd), /\n/);
  const expected = { hookSpecificOutput: { hookEventName: 'Stop', additionalContext: docNudge(afkMd) } };
  const config = resolveConfigFrom('{"afk": true}');
  for (const input of [{ hook_event_name: 'Stop', stop_hook_active: false, background_tasks: [] }, {}, { background_tasks: 'none' }]) {
    const out = stopNudgeOutput(config, input, {}, afkMd);
    assert.ok(out.endsWith('}\n'));
    assert.deepEqual(JSON.parse(out), expected);
  }
  assert.deepEqual(JSON.parse(stopNudgeOutput(config, {}, { HITL_RELAY: '0' }, afkMd)), expected);
  await withDir(async (dir) => {
    await writeConfig(dir, '{"afk": true, "autoRun": true}');
    const run = cli(['stop-nudge'], { input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }), env: { CLAUDE_PROJECT_DIR: dir } });
    assert.equal(run.status, 0);
    assert.deepEqual(JSON.parse(run.stdout), expected);
  });
});

test('stop-nudge: silent when stop_hook_active, a background task is listed, HITL_RELAY=1, afk false, or stdin is unparsable', async () => {
  const afkMd = afkMdPath();
  const on = resolveConfigFrom('{"afk": true}');
  assert.equal(stopNudgeOutput(on, { stop_hook_active: true }, {}, afkMd), '');
  assert.equal(stopNudgeOutput(on, { background_tasks: [{ id: 'b1' }] }, {}, afkMd), '');
  assert.equal(stopNudgeOutput(on, {}, { HITL_RELAY: '1' }, afkMd), '');
  assert.equal(stopNudgeOutput(resolveConfigFrom('{"afk": false}'), {}, {}, afkMd), '');
  assert.equal(stopNudgeOutput({ afk: false, autoRun: false, file: 'absent', missing: [], warnings: [] }, {}, {}, afkMd), '');
  assert.equal(stopNudgeOutput(on, null, {}, afkMd), '');
  await withDir(async (dir) => {
    await writeConfig(dir, '{"afk": true}');
    const stop = (input, env = {}) => cli(['stop-nudge'], { input, env: { CLAUDE_PROJECT_DIR: dir, ...env } });
    for (const input of ['', 'not json', '[1]', '"x"', JSON.stringify({ stop_hook_active: true }), JSON.stringify({ background_tasks: [{}] })]) {
      const run = stop(input);
      assert.equal(run.status, 0);
      assert.equal(run.stdout, '', input);
    }
    assert.equal(stop('{}', { HITL_RELAY: '1' }).stdout, '');
    await writeConfig(dir, '{"afk": false}');
    assert.equal(stop('{}').stdout, '');
  });
});

test('cli hooks: exit 0 with valid JSON stdout; project dir from CLAUDE_PROJECT_DIR then stdin cwd', async () => {
  await withDir(async (root) => {
    const envDir = join(root, 'env');
    const stdinDir = join(root, 'stdin');
    const cwdDir = join(root, 'cwd');
    for (const dir of [envDir, stdinDir, cwdDir]) await mkdir(dir, { recursive: true });
    await writeConfig(envDir, '{"afk": true}');
    await writeConfig(stdinDir, '{"afk": true}');
    await writeConfig(cwdDir, '{"afk": true}');
    const hook = (mode, input, env, cwd) => {
      const run = cli([mode], { input: JSON.stringify(input), env, cwd });
      assert.equal(run.status, 0, run.stderr);
      return run.stdout;
    };
    for (const [mode, input] of [['ask-gate', { tool_name: 'AskUserQuestion' }], ['stop-nudge', { stop_hook_active: false }]]) {
      const out = hook(mode, { ...input, cwd: join(root, 'missing') }, { CLAUDE_PROJECT_DIR: envDir }, root);
      assert.ok(out.endsWith('\n'));
      assert.ok(JSON.parse(out).hookSpecificOutput);
      assert.ok(JSON.parse(hook(mode, { ...input, cwd: stdinDir }, { CLAUDE_PROJECT_DIR: '' }, root)).hookSpecificOutput);
      assert.ok(JSON.parse(hook(mode, input, {}, cwdDir)).hookSpecificOutput);
      assert.equal(hook(mode, { ...input, cwd: envDir }, { CLAUDE_PROJECT_DIR: join(root, 'missing') }, cwdDir), '');
      assert.equal(hook(mode, { ...input, cwd: join(root, 'missing') }, {}, cwdDir), '');
    }
    await writeConfig(envDir, '{"afk": false}');
    assert.equal(hook('ask-gate', { tool_name: 'AskUserQuestion', cwd: stdinDir }, { CLAUDE_PROJECT_DIR: envDir }, root), '');
  });
});

test('debug log: TEAMKIT_CONFIG_LOG appends one JSON line per invocation without changing stdout or exit code', async () => {
  await withDir(async (dir) => {
    await writeConfig(dir, '{"afk": true}');
    const log = join(dir, 'log', 'teamkit-log.jsonl');
    await mkdir(dirname(log), { recursive: true });
    const calls = [
      [['banner', dir], ''],
      [['ask-gate'], JSON.stringify({ tool_name: 'AskUserQuestion', tool_use_id: 'tu-1', session_id: 's-1' })],
      [['stop-nudge'], JSON.stringify({ stop_hook_active: true, background_tasks: [], session_id: 's-1' })],
      [['stop-nudge'], JSON.stringify({ stop_hook_active: false, background_tasks: [{}, {}] })],
      [['stop-nudge'], 'garbage'],
      [['nope'], ''],
    ];
    for (const [args, input] of calls) {
      const plain = cli(args, { input, env: { CLAUDE_PROJECT_DIR: dir }, cwd: dir });
      const logged = cli(args, { input, env: { CLAUDE_PROJECT_DIR: dir, TEAMKIT_CONFIG_LOG: log }, cwd: dir });
      assert.equal(logged.status, 0);
      assert.equal(logged.status, plain.status);
      assert.equal(logged.stdout, plain.stdout);
    }
    const entries = (await readFile(log, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(entries.length, calls.length);
    const keys = ['t', 'mode', 'projectDir', 'afk', 'autoRun', 'emitted', 'stopHookActive', 'backgroundTasks', 'hitlRelay', 'toolUseId', 'sessionId', 'pid'];
    for (const entry of entries) {
      assert.deepEqual(Object.keys(entry), keys);
      assert.ok(!Number.isNaN(Date.parse(entry.t)));
      assert.equal(typeof entry.pid, 'number');
      assert.equal(entry.hitlRelay, false);
    }
    const pick = ({ mode, projectDir, afk, autoRun, emitted, stopHookActive, backgroundTasks, toolUseId, sessionId }) => ({ mode, projectDir, afk, autoRun, emitted, stopHookActive, backgroundTasks, toolUseId, sessionId });
    const base = { projectDir: dir, afk: true, autoRun: false, stopHookActive: null, backgroundTasks: null, toolUseId: null, sessionId: null };
    assert.deepEqual(entries.map(pick), [
      { ...base, mode: 'banner', emitted: 'banner' },
      { ...base, mode: 'ask-gate', emitted: 'deny', toolUseId: 'tu-1', sessionId: 's-1' },
      { ...base, mode: 'stop-nudge', emitted: 'none', stopHookActive: true, backgroundTasks: 0, sessionId: 's-1' },
      { ...base, mode: 'stop-nudge', emitted: 'none', stopHookActive: false, backgroundTasks: 2 },
      { ...base, mode: 'stop-nudge', emitted: 'none' },
      { ...base, projectDir: childCwd(dir), mode: 'unknown', emitted: 'none' },
    ]);
    const relay = cli(['stop-nudge'], { input: '{}', env: { CLAUDE_PROJECT_DIR: dir, TEAMKIT_CONFIG_LOG: log, HITL_RELAY: '1' } });
    assert.equal(relay.stdout, '');
    const last = JSON.parse((await readFile(log, 'utf8')).trim().split('\n').at(-1));
    assert.equal(last.hitlRelay, true);
    assert.equal(last.emitted, 'none');

    const relative = cli(['banner', dir], { env: { TEAMKIT_CONFIG_LOG: 'rel-log.jsonl' }, cwd: dir });
    assert.equal(relative.status, 0);
    assert.equal(existsSync(join(dir, 'rel-log.jsonl')), false);
    const unwritable = cli(['banner', dir], { env: { TEAMKIT_CONFIG_LOG: join(dir, 'no-such-dir', 'log.jsonl') } });
    assert.equal(unwritable.status, 0);
    assert.equal(unwritable.stdout, renderBanner(resolveConfig(dir)));
  });
});

test('afkMdPath resolves to team-kit-create/references/afk.md', () => {
  const path = afkMdPath();
  assert.ok(isAbsolute(path));
  assert.equal(path, resolve(here, '..', 'references', 'afk.md'));
  assert.ok(path.endsWith(join('team-kit-create', 'references', 'afk.md')));
});

test('symlinked run and resume readers print the same banner and resolve the same afk.md path', async () => {
  const afkMd = afkMdPath();
  await withDir(async (dir) => {
    await writeConfig(dir, '{"afk": true}');
    const env = { ...baseEnv(), CLAUDE_PROJECT_DIR: dir };
    const run = (file, args, input = '') => spawnSync(process.execPath, [file, ...args], { input, env, encoding: 'utf8' });
    const askInput = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' });
    for (const skill of ['team-kit-run', 'team-kit-resume']) {
      const link = join(here, '..', '..', skill, 'scripts', 'teamkit-config.mjs');
      assert.ok(lstatSync(link).isSymbolicLink(), link);
      assert.equal(readlinkSync(link), '../../team-kit-create/scripts/teamkit-config.mjs');

      const banner = run(link, ['banner', dir]);
      assert.equal(banner.status, 0, banner.stderr);
      assert.equal(banner.stdout, run(script, ['banner', dir]).stdout);
      assert.equal(banner.stdout, renderBanner(resolveConfig(dir)));

      // the deny reason carries the local date; a midnight rollover between the two runs gets one rerun of the real reader
      const realAsk = run(script, ['ask-gate'], askInput);
      const linkAsk = run(link, ['ask-gate'], askInput);
      const realAgain = linkAsk.stdout === realAsk.stdout ? realAsk : run(script, ['ask-gate'], askInput);
      assert.equal(linkAsk.status, 0, linkAsk.stderr);
      assert.equal(linkAsk.stdout, realAgain.stdout);
      const reason = JSON.parse(linkAsk.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.ok(reason.includes(`${afkMd} §Record — UNRATIFIED (afk, `), reason);
    }
  });
});

// entry keys follow a dry-run lead transcript (shape only): a skill load is an ismeta user text entry, a hook deny a tool_result with is_error
const BANNER_BLOCK = 'TeamKit config v1 · afk=true · autoRun=true\nsource: .claude/team-kit.local.json';
const SKILL_PROSE = 'Echo the block above verbatim as the first\nlines of your first message. It must start `TeamKit config v1`; anything else means injection did not run.';
const GATE_DENY_REASON = 'TeamKit banner-gate: echo the injected banner verbatim as the first lines of your next text, then retry the tool.';

const entryBase = (id) => ({ parentUuid: 'p', isSidechain: false, uuid: id, timestamp: '2026-11-03T00:00:00.000Z', userType: 'external', entrypoint: 'cli', cwd: '/x', sessionId: 's', version: '2', gitBranch: 'main' });
const t = {
  prompt: (id, text) => ({ ...entryBase(id), promptId: 'q', type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: text } }),
  load: (id) => ({ ...entryBase(id), promptId: 'q', type: 'user', isMeta: true, turnCompanion: true, message: { role: 'user', content: [{ type: 'text', text: `Base directory for this skill: /x\n\n## Run configuration (Claude lane)\n\n${BANNER_BLOCK}\n\n${SKILL_PROSE}` }] } }),
  say: (id, text) => ({ ...entryBase(id), type: 'assistant', requestId: 'r', message: { role: 'assistant', content: [{ type: 'text', text }] } }),
  use: (id, name) => ({ ...entryBase(id), type: 'assistant', requestId: 'r', message: { role: 'assistant', content: [{ type: 'tool_use', id: `tu-${id}`, name, input: {} }] } }),
  result: (id, content, isError = false) => ({ ...entryBase(id), type: 'user', toolUseResult: content, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `tu-${id}`, is_error: isError, content }] } }),
  gateDeny: (id) => t.result(id, `PreToolUse:Bash hook error: ${GATE_DENY_REASON}`, true),
  blob: (block) => ({ type: 'api-request-blob', message: { role: 'user', content: [block] } }),
};
const jsonl = (...entries) => `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;

const withGate = (fn, configText = '{"afk": true, "autoRun": true}') => withDir(async (dir) => {
  await writeConfig(dir, configText);
  const transcript = join(dir, 'lead.jsonl');
  const input = (extra = {}) => JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's', transcript_path: transcript, cwd: dir, tool_name: 'Bash', tool_use_id: 'tu', tool_input: {}, ...extra });
  // tmpdir points inside the fixture so the deny markers die with it
  const env = { CLAUDE_PROJECT_DIR: dir, TMPDIR: dir };
  const gate = (extra) => {
    const run = cli(['banner-gate'], { input: input(extra), env });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  };
  await fn({ dir, transcript, gate, input, env, write: (...entries) => writeFile(transcript, jsonl(...entries)) });
});

const assertGateDeny = (out) => {
  assert.ok(out.endsWith('}\n'), out);
  assert.deepEqual(JSON.parse(out), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: GATE_DENY_REASON } });
};

test('banner-gate: the deny reason names echo + retry only, one line, no question', () => {
  assert.equal(bannerGateReason, GATE_DENY_REASON);
  assert.doesNotMatch(bannerGateReason, /\n|\?/);
});

test('banner-gate: denies a tool call when the latest load has no echo', async () => {
  await withGate(async ({ gate, write }) => {
    await write(t.prompt('u1', '/team-kit-create x'), t.load('l1'), t.use('a1', 'Bash'));
    assertGateDeny(gate());
  });
});

test('banner-gate: allows after the echo, whatever else the turn said first or later', async () => {
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.say('a1', `${BANNER_BLOCK}\n\nNext step.`), t.use('a2', 'Bash'));
    assert.equal(gate(), '');
  });
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.say('a0', 'Reading first.'), t.say('a1', BANNER_BLOCK), t.use('a2', 'Read'));
    assert.equal(gate(), '');
  });
});

test('banner-gate: text that only mentions the banner, or sits in a code fence, is not an echo', async () => {
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.say('a1', `Banner:\n${BANNER_BLOCK}`), t.use('a2', 'Bash'));
    assertGateDeny(gate());
  });
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.say('a1', `\`\`\`\n${BANNER_BLOCK}\n\`\`\``), t.use('a2', 'Bash'));
    assertGateDeny(gate());
  });
});

test('banner-gate: allows the second attempt after one deny, echo or not, so a run cannot wedge', async () => {
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.use('a1', 'Bash'));
    assertGateDeny(gate());
    assert.equal(gate(), '');
    await write(t.load('l1'), t.use('a1', 'Bash'), t.gateDeny('r1'), t.use('a2', 'Bash'));
    assert.equal(gate(), '');
    assert.equal(gate({ tool_name: 'Edit' }), '');
  });
});

test('banner-gate: a deny the transcript records counts with no marker on disk', async () => {
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.use('a1', 'Bash'), t.gateDeny('r1'), t.use('a2', 'Bash'));
    assert.equal(gate(), '');
  });
  // the reason quoted in a successful read of this reader is no deny
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.use('a1', 'Read'), t.result('r1', `const reason = '${GATE_DENY_REASON}';`), t.use('a2', 'Bash'));
    assertGateDeny(gate());
  });
});

test('banner-gate: concurrent hook copies deny exactly once', async () => {
  await withGate(async ({ write, input, env }) => {
    await write(t.load('l1'), t.use('a1', 'Bash'));
    const once = () => new Promise((done) => {
      const child = spawn(process.execPath, [script, 'banner-gate'], { env: { ...baseEnv(), ...env } });
      let out = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.on('close', (status) => done({ status, out }));
      child.stdin.end(input());
    });
    const runs = await Promise.all([once(), once(), once(), once()]);
    assert.deepEqual(runs.map(({ status }) => status), [0, 0, 0, 0]);
    const denies = runs.filter(({ out }) => out !== '');
    assert.equal(denies.length, 1);
    assertGateDeny(denies[0].out);
  });
});

test('banner-gate: a run load after create needs its own echo and has its own deny', async () => {
  await withGate(async ({ gate, write }) => {
    const create = [t.prompt('u1', '/team-kit-create x'), t.load('l1'), t.say('a1', BANNER_BLOCK), t.use('a2', 'Bash')];
    await write(...create);
    assert.equal(gate(), '');
    const run = [...create, t.say('a3', '## Sealed'), t.use('a4', 'Skill'), t.result('r4', 'Launching skill: team-kit-run'), t.load('l2'), t.use('a5', 'Read')];
    await write(...run);
    assertGateDeny(gate());
    assert.equal(gate(), '');
    await write(...run, t.say('a6', BANNER_BLOCK), t.use('a7', 'Read'));
    assert.equal(gate(), '');
  });
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.use('a1', 'Bash'));
    assertGateDeny(gate());
    await write(t.load('l1'), t.use('a1', 'Bash'), t.gateDeny('r1'), t.load('l2'), t.use('a2', 'Bash'));
    assertGateDeny(gate());
  });
});

test('banner-gate: afk off, absent or malformed config is silent', async () => {
  for (const text of ['{"afk": false, "autoRun": true}', '{"afk": true,}', '{"afk": "yes"}']) {
    await withGate(async ({ gate, write }) => {
      await write(t.load('l1'), t.use('a1', 'Bash'));
      assert.equal(gate(), '', text);
    }, text);
  }
  await withGate(async ({ dir, gate, write }) => {
    await rm(join(dir, CONFIG_REL));
    await write(t.load('l1'), t.use('a1', 'Bash'));
    assert.equal(gate(), '');
  });
});

test('banner-gate: a subagent call is silent and spends no deny', async () => {
  await withGate(async ({ gate, write }) => {
    await write(t.load('l1'), t.use('a1', 'Bash'));
    assert.equal(gate({ agent_id: 'a123' }), '');
    assert.equal(gate({ agent_type: 'team-coder' }), '');
    assert.equal(gate({ agent_id: 'a123', agent_type: 'team-coder' }), '');
    assertGateDeny(gate());
  });
});

test('banner-gate: exempt tools are silent and spend no deny; ask-gate alone answers AskUserQuestion', async () => {
  assert.deepEqual(BANNER_GATE_EXEMPT, ['AskUserQuestion', 'Skill', 'Workflow']);
  await withGate(async ({ gate, write, input, env }) => {
    await write(t.load('l1'), t.use('a1', 'Bash'));
    for (const tool_name of BANNER_GATE_EXEMPT) assert.equal(gate({ tool_name }), '', tool_name);
    const ask = cli(['ask-gate'], { input: input({ tool_name: 'AskUserQuestion' }), env });
    assert.equal(ask.status, 0);
    assert.equal(JSON.parse(ask.stdout).hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(JSON.parse(ask.stdout).hookSpecificOutput.permissionDecisionReason.startsWith('TeamKit afk=true (.claude/team-kit.local.json): no questions this session.'));
    assertGateDeny(gate());
  });
});

test('banner-gate: unreadable transcript, parse failure, missing field or no load fails open', async () => {
  await withGate(async ({ dir, gate, write, transcript, input, env }) => {
    assert.equal(gate(), '', 'missing transcript');
    assert.equal(gate({ transcript_path: dir }), '', 'directory');
    assert.equal(gate({ transcript_path: null }), '');
    assert.equal(gate({ transcript_path: 7 }), '');
    assert.equal(gate({ transcript_path: '' }), '');
    assert.equal(gate({ tool_name: null }), '');
    assert.equal(gate({ tool_name: '' }), '');
    for (const raw of ['', 'not json', '[1]', '"x"']) {
      const run = cli(['banner-gate'], { input: raw, env });
      assert.equal(run.status, 0);
      assert.equal(run.stdout, '', raw);
    }
    await writeFile(transcript, `${jsonl(t.load('l1'), t.use('a1', 'Bash'))}{"type":"user","mess`);
    assert.equal(gate(), '', 'corrupt line');
    await write(t.prompt('u1', 'hello'), t.use('a1', 'Bash'));
    assert.equal(gate(), '', 'no load');
    await write();
    assert.equal(gate(), '', 'empty transcript');
    // an unwritable marker dir fails open too
    await write(t.load('l1'), t.use('a1', 'Bash'));
    await writeFile(join(dir, 'teamkit-banner-gate'), 'not a dir');
    const run = cli(['banner-gate'], { input: input(), env });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
  });
});

test('banner-gate: only the injected line 1 in a main-thread meta entry is a load; only main-thread text is an echo', () => {
  const load = t.load('l1');
  const asJson = (entry, extra) => JSON.stringify({ ...entry, ...extra });
  assert.equal(pendingBannerLoad(jsonl(load)), 'l1');
  assert.equal(pendingBannerLoad(`${JSON.stringify({ ...load, uuid: undefined })}\n`), 'line-0');
  // injection did not run: the prose stays, the banner line never appears
  assert.equal(pendingBannerLoad(jsonl({ ...load, message: { role: 'user', content: [{ type: 'text', text: SKILL_PROSE }] } })), null);
  assert.equal(pendingBannerLoad(jsonl(t.prompt('u1', BANNER_BLOCK))), null);
  assert.equal(pendingBannerLoad(jsonl(t.result('r1', `${BANNER_BLOCK}\n`))), null);
  assert.equal(pendingBannerLoad(`${asJson(load, { isSidechain: true })}\n`), null);
  assert.equal(pendingBannerLoad(`${asJson(load, { isCompactSummary: true })}\n`), null);
  assert.equal(pendingBannerLoad(jsonl(t.blob({ type: 'text', text: BANNER_BLOCK }))), null);
  assert.equal(pendingBannerLoad(jsonl(load, { ...t.say('a1', BANNER_BLOCK), isSidechain: true })), 'l1');
  assert.equal(pendingBannerLoad(jsonl(load, t.blob({ type: 'text', text: BANNER_BLOCK }))), 'l1');
  assert.equal(pendingBannerLoad(jsonl(t.say('a0', BANNER_BLOCK), load)), 'l1');
  assert.equal(pendingBannerLoad(jsonl({ ...load, message: { role: 'user', content: `x\n${BANNER_BLOCK}` } })), 'l1');
  assert.throws(() => pendingBannerLoad('{bad\n'));
});

test('banner-gate: logs through TEAMKIT_CONFIG_LOG with the shared keys and leaves stdout unchanged', async () => {
  await withGate(async ({ dir, write, input, env }) => {
    const log = join(dir, 'teamkit-log.jsonl');
    await write(t.load('l1'), t.use('a1', 'Bash'));
    const first = cli(['banner-gate'], { input: input({ session_id: 's-9' }), env: { ...env, TEAMKIT_CONFIG_LOG: log } });
    assertGateDeny(first.stdout);
    assert.equal(cli(['banner-gate'], { input: input({ session_id: 's-9' }), env: { ...env, TEAMKIT_CONFIG_LOG: log } }).stdout, '');
    const entries = (await readFile(log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(entries.map(({ mode, emitted, afk, toolUseId, sessionId }) => ({ mode, emitted, afk, toolUseId, sessionId })), [
      { mode: 'banner-gate', emitted: 'deny', afk: true, toolUseId: 'tu', sessionId: 's-9' },
      { mode: 'banner-gate', emitted: 'none', afk: true, toolUseId: 'tu', sessionId: 's-9' },
    ]);
    assert.deepEqual(Object.keys(entries[0]), ['t', 'mode', 'projectDir', 'afk', 'autoRun', 'emitted', 'stopHookActive', 'backgroundTasks', 'hitlRelay', 'toolUseId', 'sessionId', 'pid']);
  });
});

test('banner-gate: the symlinked run and resume readers answer the same', async () => {
  for (const skill of ['team-kit-run', 'team-kit-resume']) {
    await withGate(async ({ write, input, env }) => {
      await write(t.load('l1'), t.use('a1', 'Bash'));
      const link = join(here, '..', '..', skill, 'scripts', 'teamkit-config.mjs');
      const run = spawnSync(process.execPath, [link, 'banner-gate'], { input: input(), env: { ...baseEnv(), ...env }, encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      assertGateDeny(run.stdout);
    });
  }
});

test('banner-gate: registered in every banner skill frontmatter beside an unchanged ask-gate entry, never in settings.json', () => {
  const askEntry = '    - matcher: AskUserQuestion\n      hooks:\n        - type: command\n          command: node "${CLAUDE_PLUGIN_ROOT}/skills/team-kit-create/scripts/teamkit-config.mjs" ask-gate\n';
  const gateEntry = '    - matcher: "*"\n      hooks:\n        - type: command\n          command: node "${CLAUDE_PLUGIN_ROOT}/skills/team-kit-create/scripts/teamkit-config.mjs" banner-gate\n';
  for (const skill of ['team-kit-create', 'team-kit-run', 'team-kit-resume']) {
    const text = readFileSync(join(here, '..', '..', skill, 'SKILL.md'), 'utf8');
    const front = text.slice(0, text.indexOf('\n---\n', 4));
    assert.ok(front.includes(`  PreToolUse:\n${askEntry}${gateEntry}  Stop:\n`), skill);
  }
  assert.ok(!readFileSync(join(here, '../../../settings.json'), 'utf8').includes('banner-gate'));
});
