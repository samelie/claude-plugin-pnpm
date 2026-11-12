import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONFIG_REL = '.claude/team-kit.local.json';

const KNOWN = ['afk', 'autoRun'];
const FORCED = 'both flags forced false';

const oneLine = (text) => String(text).replace(/\s+/g, ' ');
const typeName = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);
const nonEmpty = (value) => typeof value === 'string' && value.trim() !== '';

export const parseConfigText = (text) => {
  const forcedFalse = (warning) => ({ afk: false, autoRun: false, missing: [], warnings: [warning] });
  let parsed;
  try {
    parsed = JSON.parse(text.startsWith('﻿') ? text.slice(1) : text);
  } catch (error) {
    return forcedFalse(`WARNING: not valid JSON (${oneLine(error.message)}) — ${FORCED}`);
  }
  const kind = typeName(parsed);
  if (kind !== 'object') return forcedFalse(`WARNING: top level is ${kind}, expected an object — ${FORCED}`);
  const warnings = [];
  let forced = false;
  for (const key of Object.keys(parsed)) {
    if (key === '//') continue;
    if (KNOWN.includes(key)) {
      const value = parsed[key];
      if (typeof value !== 'boolean') {
        forced = true;
        warnings.push(`WARNING: ${JSON.stringify(key)} is ${JSON.stringify(value)} (${typeName(value)}), expected true or false — ${FORCED}`);
      }
      continue;
    }
    const known = KNOWN.find((name) => name.toLowerCase() === key.toLowerCase());
    warnings.push(`WARNING: unknown key ${JSON.stringify(key)} ignored${known ? ` — did you mean ${JSON.stringify(known)}?` : ''}`);
  }
  return {
    afk: !forced && parsed.afk === true,
    autoRun: !forced && parsed.autoRun === true,
    missing: KNOWN.filter((name) => !Object.hasOwn(parsed, name)),
    warnings,
  };
};

export const resolveConfig = (projectDir) => {
  let text;
  try {
    text = readFileSync(join(projectDir, CONFIG_REL), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { afk: false, autoRun: false, file: 'absent', missing: [], warnings: [] };
    return { afk: false, autoRun: false, file: 'present', missing: [], warnings: [`WARNING: unreadable (${error?.code ?? error?.name ?? 'unknown'}) — ${FORCED}`] };
  }
  return { ...parseConfigText(text), file: 'present' };
};

const sourceSuffix = ({ file, warnings, missing }) => {
  if (file === 'absent') return ' (absent — defaults)';
  if (warnings.length === 0 && missing.length > 0) return ` (${missing.join(', ')} absent — default false)`;
  return '';
};

const modeLine = ({ afk, autoRun, warnings }) => {
  if (afk && autoRun) return 'mode: AFK — every decision gate adopts the orchestrator recommendation, recorded UNRATIFIED (ratify later: /team-kit-resume R3); safety seams park; sealed plan enters /team-kit-run';
  if (afk) return 'mode: AFK — decision gates adopt the recommendation, recorded UNRATIFIED; create stops at the Step 7 seal';
  if (autoRun) return 'mode: interactive — gates ask you; sealed plan enters /team-kit-run without a launch prompt';
  if (warnings.length > 0) return 'mode: interactive — gates ask you';
  return 'mode: interactive — gates ask you; Step 7 ends with the launch handoff';
};

export const renderBanner = (config) => {
  const lines = [
    `TeamKit config v1 · afk=${config.afk} · autoRun=${config.autoRun}`,
    `source: ${CONFIG_REL}${sourceSuffix(config)}`,
    ...config.warnings,
    modeLine(config),
  ];
  if (config.afk && config.warnings.length === 0) lines.push('note: afk removes TeamKit questions, not permission prompts — unattended runs need auto mode + one earlier approved Workflow launch');
  return `${lines.join('\n')}\n`;
};

// import.meta.url is the symlink target, so run/resume links resolve to the create skill's afk.md
export const afkMdPath = () => fileURLToPath(new URL('../../team-kit-create/references/afk.md', import.meta.url));

export const localDate = (now) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const denyReason = (afkMd, date) => `TeamKit afk=true (.claude/team-kit.local.json): no questions this session. If this session's banner line 1 showed afk=false, or the banner did not run, this does not apply: ask in plain text and end the turn. Inside a TeamKit pipeline: adopt your recommended option (none marked → the option you would recommend), record it per ${afkMd} §Record — UNRATIFIED (afk, ${date}) — and continue. Never pick a missing target (no task, ambiguous session dir, unresolved run field): end with the notice ${afkMd} defines. Safety seams park (${afkMd} §Seams); never present-and-wait. Outside a TeamKit pipeline: ask in plain text and end the turn. To restore questions: set afk=false (read live) or open a new session.`;

export const nudgeText = (afkMd) => `TeamKit afk=true: if this session's banner line 1 showed afk=false, or the banner did not run, this does not apply: ask in plain text (if not yet asked) and end the turn. Otherwise, if this turn ended awaiting a human decision inside a TeamKit pipeline, adopt your recommendation (none marked → the option you would recommend) per ${afkMd} and continue. Stopping is correct when the plan is sealed, the run ended, the remainder is parked in Blocked on you, a missing-target notice ended the turn, or this turn was not TeamKit pipeline work.`;

export const askGateOutput = (config, input, afkMd, date) => {
  if (input?.tool_name != null && input.tool_name !== 'AskUserQuestion') return '';
  if (!config.afk) return '';
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denyReason(afkMd, date) } })}\n`;
};

export const stopNudgeOutput = (config, input, env, afkMd) => {
  if (input === null || input === undefined) return '';
  if (!config.afk) return '';
  if (env?.HITL_RELAY === '1') return '';
  if (input.stop_hook_active === true) return '';
  if (Array.isArray(input.background_tasks) && input.background_tasks.length > 0) return '';
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: nudgeText(afkMd) } })}\n`;
};

// askuserquestion has ask-gate; a denied skill call or workflow launch would read as a real denial and break ac-35 / ac-42
export const BANNER_GATE_EXEMPT = ['AskUserQuestion', 'Skill', 'Workflow'];

export const bannerGateReason = 'TeamKit banner-gate: echo the injected banner verbatim as the first lines of your next text, then retry the tool.';

// the skill text also names the banner in prose, so only the injected line 1 marks a load
const BANNER_LOAD = /^TeamKit config v1 · afk=/m;
const BANNER_ECHO = 'TeamKit config v1';

const textsOf = (entry) => {
  const content = entry?.message?.content;
  if (typeof content === 'string') return [content];
  return Array.isArray(content) ? content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text) : [];
};

const isBannerLoad = (entry) => entry?.type === 'user' && entry.isMeta === true && entry.isCompactSummary !== true && entry.isSidechain !== true && textsOf(entry).some((text) => BANNER_LOAD.test(text));

const isBannerEcho = (entry) => entry?.type === 'assistant' && entry.isSidechain !== true && textsOf(entry).some((text) => text.trimStart().startsWith(BANNER_ECHO));

const isGateDeny = (entry) => {
  const content = entry?.message?.content;
  if (entry?.type !== 'user' || entry.isSidechain === true || !Array.isArray(content)) return false;
  return content.some((block) => block?.type === 'tool_result' && block.is_error === true && JSON.stringify(block.content ?? '').includes(bannerGateReason));
};

// the id of the latest load still owed a deny, else null; a bad line throws and the caller fails open
export const pendingBannerLoad = (transcript) => {
  const entries = transcript.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
  const at = entries.findLastIndex(isBannerLoad);
  if (at === -1) return null;
  const later = entries.slice(at + 1);
  if (later.some(isBannerEcho) || later.some(isGateDeny)) return null;
  return nonEmpty(entries[at].uuid) ? entries[at].uuid : `line-${at}`;
};

// the transcript records a deny only after the tool_result lands: parallel tool calls and the create + run hook copies fire before that, so an exclusive marker holds the once
const claimBannerDeny = (transcriptPath, loadId) => {
  const dir = join(tmpdir(), 'teamkit-banner-gate');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, createHash('sha256').update(`${transcriptPath}\0${loadId}`).digest('hex')), '', { flag: 'wx' });
};

export const bannerGateOutput = (config, input) => {
  if (!config.afk || typeName(input) !== 'object') return '';
  if (input.agent_id != null || input.agent_type != null) return '';
  if (!nonEmpty(input.tool_name) || BANNER_GATE_EXEMPT.includes(input.tool_name)) return '';
  if (!nonEmpty(input.transcript_path)) return '';
  try {
    const loadId = pendingBannerLoad(readFileSync(input.transcript_path, 'utf8'));
    if (loadId === null) return '';
    claimBannerDeny(input.transcript_path, loadId);
  } catch {
    return '';
  }
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: bannerGateReason } })}\n`;
};

const readStdinJson = () => {
  try {
    const value = JSON.parse(readFileSync(0, 'utf8'));
    return typeName(value) === 'object' ? value : null;
  } catch {
    return null;
  }
};

const hookProjectDir = (input) => {
  if (nonEmpty(process.env.CLAUDE_PROJECT_DIR)) return process.env.CLAUDE_PROJECT_DIR;
  if (nonEmpty(input?.cwd)) return input.cwd;
  return process.cwd();
};

const stringOrNull = (value) => (typeof value === 'string' ? value : null);

const writeLog = (entry) => {
  const file = process.env.TEAMKIT_CONFIG_LOG;
  if (!nonEmpty(file) || !isAbsolute(file)) return;
  try {
    appendFileSync(file, `${JSON.stringify(entry)}\n`);
  } catch {
    // debug log must never change stdout or the exit code
  }
};

const run = (mode) => {
  if (mode === 'banner') {
    const arg = process.argv[3];
    const projectDir = nonEmpty(arg) ? arg : nonEmpty(process.env.CLAUDE_PROJECT_DIR) ? process.env.CLAUDE_PROJECT_DIR : process.cwd();
    const config = resolveConfig(projectDir);
    return { out: renderBanner(config), projectDir, config, emitted: 'banner', input: null };
  }
  if (mode === 'ask-gate' || mode === 'stop-nudge') {
    const input = readStdinJson();
    const projectDir = hookProjectDir(input);
    const config = resolveConfig(projectDir);
    const out = mode === 'ask-gate'
      ? askGateOutput(config, input, afkMdPath(), localDate(new Date()))
      : stopNudgeOutput(config, input, process.env, afkMdPath());
    return { out, projectDir, config, emitted: out === '' ? 'none' : mode === 'ask-gate' ? 'deny' : 'nudge', input };
  }
  if (mode === 'banner-gate') {
    const input = readStdinJson();
    const projectDir = hookProjectDir(input);
    const config = resolveConfig(projectDir);
    const out = bannerGateOutput(config, input);
    return { out, projectDir, config, emitted: out === '' ? 'none' : 'deny', input };
  }
  const projectDir = process.cwd();
  return { out: '', projectDir, config: resolveConfig(projectDir), emitted: 'none', input: null };
};

const main = () => {
  const mode = process.argv[2];
  const logMode = ['banner', 'ask-gate', 'stop-nudge', 'banner-gate'].includes(mode) ? mode : 'unknown';
  let result;
  try {
    result = run(mode);
  } catch (error) {
    const config = { afk: false, autoRun: false, file: 'present', missing: [], warnings: [`WARNING: reader error (${oneLine(error?.message ?? error)}) — ${FORCED}`] };
    result = mode === 'banner'
      ? { out: renderBanner(config), projectDir: '', config, emitted: 'banner', input: null }
      : { out: '', projectDir: '', config, emitted: 'none', input: null };
  }
  try {
    if (result.out) process.stdout.write(result.out);
  } catch {
    // a closed stdout must not turn into a non-zero exit
  }
  const { input } = result;
  const isStop = logMode === 'stop-nudge';
  writeLog({
    t: new Date().toISOString(),
    mode: logMode,
    projectDir: result.projectDir,
    afk: result.config.afk,
    autoRun: result.config.autoRun,
    emitted: result.emitted,
    stopHookActive: isStop && input ? input.stop_hook_active === true : null,
    backgroundTasks: isStop && Array.isArray(input?.background_tasks) ? input.background_tasks.length : null,
    hitlRelay: process.env.HITL_RELAY === '1',
    toolUseId: stringOrNull(input?.tool_use_id),
    sessionId: stringOrNull(input?.session_id),
    pid: process.pid,
  });
  process.exitCode = 0;
};

// argv[1] is the symlink path for run/resume while import.meta.url is the target; argv[1] is undefined on import
const isMain = () => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };

if (isMain()) main();
