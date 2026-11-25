#!/usr/bin/env node
// read-only scoreboard: one row per team-kit effort under <root>/team-session/, so the toolkit's outcomes
// can be compared across efforts. it writes nothing. a cell reads '-' when the effort has no such file or
// record, and '?' when the value cannot be derived: no usage log, a contract without an ac table, a ledger
// the parser does not cover, a span that runs backwards. a number is never a guess.
// node scoreboard.mjs [--root <abs repo root>] [--since YYYY-MM-DD] [--effort <id>] [--json]
// exit 0 printed, 2 usage

import { createReadStream, existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { countBudgetAcs, parseAcs, parseShape, splitCells } from './check-contract.mjs';

export const USAGE = 'usage: scoreboard.mjs [--root <abs repo root>] [--since YYYY-MM-DD] [--effort <id>] [--json]';
export const COLUMNS = ['effort', 'shape', 'rigor', 'start', 'seal_h', 'first_run_h', 'create_mtok', 'plan_kb', 'dod_kb', 'blocking_acs', 'acs_passed', 'asks', 'phase'];
export const ABSENT = '-';
export const UNKNOWN = '?';
const MEDIAN_COLUMNS = ['seal_h', 'first_run_h', 'create_mtok', 'plan_kb', 'blocking_acs'];
const DEFAULT_SINCE_DAYS = 21;
const EXIT = { OK: 0, USAGE: 2 };
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
// scripts/ → team-kit-create/ → skills/ → .claude/ → repo root
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const LOG_REL = join('_observability', 'plan-usage.ndjson');
const RUN_DIRS = /^(coder|verifier|measurer|tester|runtime|experiments)/;
const WALK_DEPTH = 3;
const WALK_FILES = 2000;
const PHASE_CHARS = 40;
const AC_ID = /^AC-\d+/;
const LEDGER_STATE = /^(passed|pass|failed|fail|pending|needs-human)\b/i;
const TEXT_COLUMNS = new Set(['effort', 'shape', 'rigor', 'start', 'phase']);
const ONE_DECIMAL = new Set(['seal_h', 'first_run_h', 'create_mtok']);

const usage = (why) => ({ code: EXIT.USAGE, lines: [`USAGE: ${why}`, USAGE] });
const round1 = (n) => Math.round(n * 10) / 10;
const bare = (s) => s.replace(/[*`]/g, '').trim();
const isRow = (line) => line.trim().startsWith('|');
const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};
const statOf = (path, stat) => {
  try {
    return stat(path);
  } catch {
    return null;
  }
};
const entriesOf = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  } catch {
    return [];
  }
};

// the `Rigor:` and `Phase:` lines of the map header, which ends at the first `## `, and the shape the
// seal gate reads from the same header: parseShape knows build, experiment, campaign and pending, so any
// other word reads as no shape
export const parseHeader = (mapText) => {
  const lines = mapText.split('\n');
  const end = lines.findIndex((line) => line.startsWith('## '));
  const header = end < 0 ? lines : lines.slice(0, end);
  const pick = (pattern) => header.map((line) => pattern.exec(line)).find(Boolean)?.[1] ?? null;
  // cut by code point, so a cut never leaves half a surrogate pair
  const phase = [...(pick(/^Phase: (.*)/) ?? '').trim()].slice(0, PHASE_CHARS).join('').trim();
  return { shape: parseShape(mapText), rigor: pick(/^Rigor: (\w+)/), phase: phase || null };
};

export const countAsks = (mapText) => mapText.split('Source: user').length - 1;

// blocking acs as the seal gate counts them against the slice budget (check-contract.mjs): the rows
// parseAcs yields from every table whose header names id, kind and blocking, whatever the id looks like,
// counted by countBudgetAcs, which sets the grade-seal-gate row aside. null when no table has that header
export const countBlockingAcs = (dodText) => {
  const acs = parseAcs(dodText);
  return acs ? countBudgetAcs(acs) : null;
};

// a table starts at a header row directly above a separator row. gives the header cells with the rows
// under the separator, or null when line `at` is no header
const tableAt = (lines, at) => {
  const under = isRow(lines[at]) && isRow(lines[at + 1] ?? '') ? splitCells(lines[at + 1]) : [];
  if (!under.length || !under.every((cell) => /^:?-+:?$/.test(cell))) return null;
  const rows = [];
  for (let i = at + 2; i < lines.length && isRow(lines[i]); i += 1) rows.push(splitCells(lines[i]));
  return { header: splitCells(lines[at]), rows };
};

// the common build-state ledger: one table with a state column, one ac per row. null for anything else:
// no such table or several, an id that is not a plain `AC-<n>`, a range or list row (`AC-1..AC-27` hides
// how many acs it stands for), a repeated id, or a state outside passed / failed / pending / needs-human
export const parseAcLedger = (ledgerText) => {
  const lines = ledgerText.split('\n');
  const ledgers = [];
  for (let i = 0; i < lines.length; i += 1) {
    const table = tableAt(lines, i);
    const stateAt = table ? table.header.findIndex((cell) => /^(state|status)$/i.test(bare(cell))) : -1;
    if (stateAt < 0) continue;
    const acs = table.rows.filter((cells) => bare(cells[0] ?? '').startsWith('AC-'));
    if (acs.length) ledgers.push(acs.map((cells) => ({ id: cells[0], state: LEDGER_STATE.exec(bare(cells[stateAt] ?? ''))?.[1].toLowerCase() ?? null })));
  }
  if (ledgers.length !== 1) return null;
  const [rows] = ledgers;
  const ids = new Set(rows.map(({ id }) => id.split(/\s/)[0]));
  if (ids.size !== rows.length || rows.some(({ id, state }) => !AC_ID.test(id) || id.match(/\bAC-/g).length > 1 || state === null)) return null;
  return { passed: rows.filter(({ state }) => state.startsWith('pass')).length, total: rows.length };
};

// rows logged before the hook read the dispatch header fall back to the lead's description
const AUDITOR_STEPS = [
  [/^revise contract|\bdefine\b/i, 'define'],
  [/\bSAT\b/, 'sat'],
  [/grade/i, 'grade'],
  [/audit/i, 'audit'],
  [/approach/i, 'approach'],
  [/contract/i, 'define'],
];
const ROLE_STEPS = { 'team-design-critic': 'design-critique', 'team-plan-reviewer': 'plan-review' };
const CREATE_ROLES = /(^|:)team-(designer|researcher|planner|goal-auditor|design-critic|plan-reviewer)$/;
const RUN_STEPS = new Set(['grade', 'persona', 'triage']);
const stepOf = (row) => {
  const role = String(row.role).replace(/^.*:/, '');
  const desc = row.desc ?? '';
  const step =
    row.phase ??
    (role === 'team-planner' ? (/revision/i.test(desc) ? 'revision' : 'plan') : null) ??
    (role === 'team-goal-auditor' ? AUDITOR_STEPS.find(([pattern]) => pattern.test(desc))?.[1] : null) ??
    ROLE_STEPS[role] ??
    role.replace(/^team-/, '');
  return String(step).split(' ')[0];
};

// whether an agent row of plan-usage.ndjson is create-lane work. source: the `create steps` block of
// .claude/hooks/plan-usage-report.mjs (its CREATE_ROLES, RUN_STEPS and stepOf, copied above): change both together
export const isCreateRow = (row) => {
  const role = String(row.role);
  // a planner prompt that names one task id gets tagged with it; the planner is create work regardless
  return CREATE_ROLES.test(role) && (!row.task || /team-planner$/.test(role)) && !RUN_STEPS.has(stepOf(row));
};

// cached-input tokens the create lane spent per effort, as a map of session → tokens; null when there is
// no log to read. streamed line by line: the log runs to tens of megabytes
export const readCreateTokens = async (logFile) => {
  if (!existsSync(logFile)) return null;
  const agents = new Map();
  const input = createReadStream(logFile, 'utf8');
  try {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      // last row wins: a resumed or blocked agent logs again at each stop
      if (row?.type === 'agent') agents.set(row.agent, row);
    }
  } catch {
    return null;
  } finally {
    input.destroy();
  }
  const tokens = new Map();
  for (const row of agents.values()) {
    if (isCreateRow(row)) tokens.set(row.session, (tokens.get(row.session) ?? 0) + (row.cache_read ?? 0));
  }
  return tokens;
};

export const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// when a file came to be. a filesystem without birth times reports 0, and a copy that kept its mtime
// reports a birth later than it: both fall back to the mtime
export const bornMs = (st) => (st.birthtimeMs > 0 && st.birthtimeMs <= st.mtimeMs ? st.birthtimeMs : st.mtimeMs);

// when the effort began: the birth of prompt.md, or of map.md when there is no prompt. null: not an effort
export const startMs = (dir, stat = statSync) => {
  const st = statOf(join(dir, 'prompt.md'), stat) ?? statOf(join(dir, 'map.md'), stat);
  return st ? bornMs(st) : null;
};

// earliest birth among build-state.md and the files of the run-lane directories. each is walked level by
// level in name order, WALK_DEPTH levels down and WALK_FILES files in all, so a huge evidence tree costs
// a bounded number of stats; null when there is no such file
export const firstRunMs = (dir, stat = statSync) => {
  const births = [];
  const note = (path) => {
    const st = statOf(path, stat);
    if (st) births.push(bornMs(st));
  };
  note(join(dir, 'build-state.md'));
  let folders = entriesOf(dir)
    .filter((entry) => entry.isDirectory() && RUN_DIRS.test(entry.name))
    .map((entry) => join(dir, entry.name));
  let budget = WALK_FILES;
  for (let depth = 1; depth <= WALK_DEPTH && budget > 0; depth += 1) {
    const deeper = [];
    for (const folder of folders) {
      for (const entry of entriesOf(folder)) {
        if (entry.isDirectory()) deeper.push(join(folder, entry.name));
        else if (entry.isFile() && budget > 0) {
          budget -= 1;
          note(join(folder, entry.name));
        }
      }
    }
    folders = deeper;
  }
  return births.length ? Math.min(...births) : null;
};

const stamp = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
// hours from the start to an instant, one decimal. UNKNOWN when the instant comes first: a file older than
// the prompt was copied in, or the prompt was written again, and the birth times then give no span
const hoursBetween = (fromMs, toMs) => {
  const hours = round1((toMs - fromMs) / HOUR_MS);
  // abs: a span that rounds to -0 reads 0
  return hours < 0 ? UNKNOWN : Math.abs(hours);
};

// one row: numbers stay numbers, and a missing value is ABSENT or UNKNOWN. tokens is the map from
// readCreateTokens, or null when there is no log. null when dir holds neither prompt.md nor map.md
export const buildRow = (dir, { stat = statSync, tokens = null } = {}) => {
  const start = startMs(dir, stat);
  if (start === null) return null;
  const effort = basename(dir);
  // decimal kb, the unit of the slice budget (60000 bytes): in kib a plan just over it would read 59
  const kb = (name) => {
    const st = statOf(join(dir, name), stat);
    return st ? Math.round(st.size / 1000) : ABSENT;
  };
  const map = read(join(dir, 'map.md'));
  const header = map === null ? {} : parseHeader(map);
  const review = statOf(join(dir, 'plan-review.md'), stat);
  const firstRun = firstRunMs(dir, stat);
  const dod = read(join(dir, 'definition-of-done.md'));
  const ledger = read(join(dir, 'build-state.md'));
  const acs = ledger === null ? null : parseAcLedger(ledger);
  return {
    effort,
    shape: header.shape ?? ABSENT,
    rigor: header.rigor ?? ABSENT,
    start: stamp(start),
    seal_h: review ? hoursBetween(start, review.mtimeMs) : ABSENT,
    first_run_h: firstRun === null ? ABSENT : hoursBetween(start, firstRun),
    // an effort the log never saw (another lane, or older than the log) has no measured zero to show
    create_mtok: tokens === null ? UNKNOWN : tokens.has(effort) ? round1(tokens.get(effort) / 1e6) : ABSENT,
    plan_kb: kb('team-plan.md'),
    dod_kb: kb('definition-of-done.md'),
    blocking_acs: dod === null ? ABSENT : (countBlockingAcs(dod) ?? UNKNOWN),
    acs_passed: ledger === null ? ABSENT : acs ? `${acs.passed}/${acs.total}` : UNKNOWN,
    asks: map === null ? ABSENT : countAsks(map),
    phase: header.phase ?? ABSENT,
  };
};

// medians over the rows that carry a number, with the count behind each under n
export const summarize = (rows) => {
  const values = MEDIAN_COLUMNS.map((column) => rows.map((row) => row[column]).filter((value) => typeof value === 'number'));
  return {
    ...Object.fromEntries(MEDIAN_COLUMNS.map((column, i) => [column, values[i].length ? round1(median(values[i])) : null])),
    n: Object.fromEntries(MEDIAN_COLUMNS.map((column, i) => [column, values[i].length])),
  };
};

const show = (column, value) => (typeof value === 'number' && ONE_DECIMAL.has(column) ? value.toFixed(1) : String(value));

const renderTable = (rows) => {
  // a bare pipe in a phase or a name would open a new cell
  const body = rows.map((row) => COLUMNS.map((column) => show(column, row[column]).replaceAll('|', '\\|')));
  const widths = COLUMNS.map((column, i) => Math.max(3, column.length, ...body.map((cells) => cells[i].length)));
  const right = COLUMNS.map((column) => !TEXT_COLUMNS.has(column));
  const line = (cells) => `| ${cells.map((text, i) => (right[i] ? text.padStart(widths[i]) : text.padEnd(widths[i]))).join(' | ')} |`;
  return [line(COLUMNS), line(widths.map((width, i) => (right[i] ? `${'-'.repeat(width - 1)}:` : '-'.repeat(width)))), ...body.map(line)];
};

export const medianLine = (medians) => {
  const parts = MEDIAN_COLUMNS.map((column) => `${column} ${medians[column] === null ? ABSENT : show(column, medians[column])}`);
  return `median: ${parts.join(' · ')} (n=${MEDIAN_COLUMNS.map((column) => medians.n[column]).join('/')} each)`;
};

const toJson = (rows, medians) => ({
  rows: rows.map((row) => Object.fromEntries(COLUMNS.map((column) => [column, row[column] === ABSENT || row[column] === UNKNOWN ? null : row[column]]))),
  medians,
});

// a `YYYY-MM-DD` date as its utc midnight; null for anything else, a day that does not exist included
const dayMs = (text) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === text ? ms : null;
};

export const parseArgs = (argv, now = Date.now()) => {
  const opts = { root: DEFAULT_ROOT, sinceMs: null, effort: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--root' || arg === '--since' || arg === '--effort') {
      const value = argv[(i += 1)];
      if (value === undefined || value === '') return { error: `${arg} needs a value` };
      if (arg === '--root') opts.root = resolve(value);
      else if (arg === '--effort') opts.effort = value;
      else {
        opts.sinceMs = dayMs(value);
        if (opts.sinceMs === null) return { error: `bad date: ${value} (want YYYY-MM-DD)` };
      }
    } else return { error: `unknown ${arg.startsWith('-') ? 'flag' : 'argument'}: ${arg}` };
  }
  // the default window opens at a utc midnight, so it equals a --since date; a named effort is shown
  // whatever its age unless --since is given too
  if (opts.sinceMs === null) opts.sinceMs = opts.effort ? -Infinity : Math.floor(now / DAY_MS) * DAY_MS - DEFAULT_SINCE_DAYS * DAY_MS;
  return opts;
};

// an effort is a directory directly under team-session/ that holds prompt.md or map.md
const effortNames = (sessions) =>
  entriesOf(sessions)
    .filter((entry) => entry.isDirectory() && !/^[_.]/.test(entry.name))
    .map((entry) => entry.name);

export const scoreboard = async (argv, { now = Date.now(), stat = statSync } = {}) => {
  const args = parseArgs(argv, now);
  if (args.error) return usage(args.error);
  const sessions = join(args.root, 'team-session');
  if (!statOf(sessions, statSync)?.isDirectory()) return usage(`no team-session/ under ${args.root}`);
  // the start is two stats, a row is a tree walk: filter first
  const picked = effortNames(sessions)
    .filter((name) => !args.effort || name === args.effort)
    .map((name) => ({ name, start: startMs(join(sessions, name), stat) }))
    .filter(({ start }) => start !== null && start >= args.sinceMs)
    .sort((a, b) => a.start - b.start || (a.name < b.name ? -1 : 1));
  const tokens = await readCreateTokens(join(sessions, LOG_REL));
  const rows = picked.map(({ name }) => buildRow(join(sessions, name), { stat, tokens })).filter(Boolean);
  const medians = summarize(rows);
  // the blank line keeps a markdown renderer from reading the summary as one more table row
  return { code: EXIT.OK, lines: args.json ? [JSON.stringify(toJson(rows, medians), null, 2)] : [...renderTable(rows), '', medianLine(medians)] };
};

// realpath: node resolves the entry's symlinks in import.meta.url, and a mismatch would print nothing
// and exit 0
const isMain = () => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};

if (isMain()) {
  const result = await scoreboard(process.argv.slice(2));
  const out = result.code === EXIT.USAGE ? console.error : console.log;
  for (const line of result.lines) out(line);
  // exitCode, not exit(): exit() can cut a long table short when stdout is a pipe
  process.exitCode = result.code;
}
