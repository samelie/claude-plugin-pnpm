import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LEVELS = ['low', 'medium', 'high'];

// back-tests in references/rigor.md → Evidence: rows left the high rule on 2026-11-18 (out of sample they
// tracked neither run rulings nor dispatches); recalibrate as efforts record a level
export const THRESHOLDS = { highPackages: 10, lowPackages: 3, lowRows: 20 };

// high matches SKILL.md → Loop budgets; a limit below high raises the level instead of asking
export const BUDGETS = {
  low: { rounds: 2, planRevisions: 1, dispatches: 16 },
  medium: { rounds: 4, planRevisions: 2, dispatches: 24 },
  high: { rounds: 6, planRevisions: 3, dispatches: 30 },
};

const RISK_CLASSES = ['frozen-artifact', 'unforgeable-witness', 'live-state', 'paid-irreversible'];
const SURFACE_FLAGS = ['cross-lane-seam', 'persisted-data', 'external-behavior'];
const WIRE_FLAG = 'unverified-wire-shape';
const SIGNAL = /^([a-z-]+): (\S+) — \S/;
const ROW = /^\s*(?:\||[-*]\s)/;

const sectionLines = (text, heading) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return end === -1 ? rest : rest.slice(0, end);
};

export const countRows = (findings) => [/^##.*Existing vs/i, /^##.*Affected Areas/i]
  .map((heading) => (sectionLines(findings, heading) ?? []).filter((line) => ROW.test(line)).length)
  .reduce((sum, count) => sum + count, 0);

export const parseSignals = (findings) => {
  const block = sectionLines(findings, /^## Rigor signals\s*$/);
  if (!block) return { signals: null, errors: ['missing ## Rigor signals section'] };
  const pairs = block.map((line) => line.match(SIGNAL)).filter(Boolean).map(([, key, value]) => [key, value]);
  const found = new Map(pairs);
  // a repeated signal or a second section would let the later line hide a hazard, so either fails closed
  const sections = findings.split(/\r?\n/).filter((line) => /^## Rigor signals\s*$/.test(line)).length;
  const errors = found.size === pairs.length && sections === 1 ? [] : ['a rigor signal or the Rigor signals section appears twice'];
  const packages = Number(found.get('packages'));
  if (!Number.isInteger(packages) || packages < 0) errors.push('packages needs a whole number and evidence');
  const riskValue = found.get('risk-class') ?? '';
  const risks = riskValue === 'none' ? [] : riskValue.split(',');
  if (riskValue === '' || !risks.every((risk) => RISK_CLASSES.includes(risk))) errors.push('risk-class needs none or known classes and evidence');
  const flags = [...SURFACE_FLAGS, WIRE_FLAG];
  for (const flag of flags) if (!['yes', 'no'].includes(found.get(flag))) errors.push(`${flag} needs yes or no and evidence`);
  if (errors.length) return { signals: null, errors };
  return { signals: { packages, risks, ...Object.fromEntries(flags.map((flag) => [flag, found.get(flag) === 'yes'])) }, errors };
};

// floor is the lowest level a user pin can reach; anything unreadable fails closed to high.
// a hazard marks its own lane and acs (rigor.md → Plan latitude, sat a–d), never the whole effort: it
// floors the level at medium so the design critique always runs, and only size reaches high
export const assess = (findings) => {
  const { signals, errors } = parseSignals(findings);
  if (errors.length) return { level: 'high', floor: 'high', reasons: errors };
  const rows = countRows(findings);
  if (rows === 0) return { level: 'high', floor: 'high', reasons: ['no rows in the Existing vs Build-New or Affected Areas sections'] };
  const size = `${signals.packages} packages, ${rows} rows`;
  const hazards = [...signals.risks.map((risk) => `risk class ${risk}`), ...(signals[WIRE_FLAG] ? ['unverified wire shape'] : [])];
  const floor = hazards.length ? 'medium' : 'low';
  const tail = hazards.length ? hazards : ['no risk class'];
  const { highPackages, lowPackages, lowRows } = THRESHOLDS;
  if (signals.packages >= highPackages) return { level: 'high', floor, reasons: [size, ...tail] };
  const surfaces = SURFACE_FLAGS.filter((flag) => signals[flag]);
  const narrow = hazards.length === 0 && signals.packages <= lowPackages && rows <= lowRows && surfaces.length === 0;
  return { level: narrow ? 'low' : 'medium', floor, reasons: [size, ...surfaces, ...tail] };
};

export const recordedRigor = (map) => {
  const match = map.match(/^Rigor: (low|medium|high|pending)\b(.*)$/m);
  return match ? { level: match[1], pinned: match[2].includes('pinned') } : null;
};

const hasLatitude = (plan) => /^latitude:/m.test(plan);

export const checkRecorded = (findings, map, plan = '') => {
  const recorded = recordedRigor(map);
  if (hasLatitude(plan) && !recorded) return { ok: false, note: 'team-plan.md carries latitude: but map.md has no Rigor line, so no level was assessed; record the level or revise the plan' };
  if (!recorded) return { ok: true, note: 'no Rigor line: every gate runs' };
  if (recorded.level === 'pending') return { ok: false, note: 'Rigor reads pending: Step 4a-b never ran' };
  const { level, floor, reasons } = assess(findings);
  const required = recorded.pinned ? floor : level;
  const ok = LEVELS.indexOf(recorded.level) >= LEVELS.indexOf(required);
  return { ok, note: ok ? `${recorded.level} meets required ${required}` : `${recorded.level} is below required ${required}: ${reasons.join('; ')}` };
};

const readOptional = async (path) => {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
};

// node resolves the main module to its real path, so a run through a symlink (the .agents skill path)
// must compare real paths: with a plain resolve() the cli exits 0 without checking anything
const isMain = () => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};

if (isMain()) {
  try {
    const [session, flag] = process.argv.slice(2);
    if (!session || !isAbsolute(session) || (flag !== undefined && flag !== '--check')) throw new Error('usage: node assess-rigor.mjs <absolute-session-path> [--check]');
    const findings = await readOptional(join(session, 'researcher/research-findings.md'));
    if (flag === '--check') {
      const { ok, note } = checkRecorded(findings, await readOptional(join(session, 'map.md')), await readOptional(join(session, 'team-plan.md')));
      process.stdout.write(`${ok ? 'PASS' : 'FAIL'}: ${note}\n`);
      process.exitCode = ok ? 0 : 1;
    } else {
      const { level, reasons } = assess(findings);
      const { rounds, planRevisions, dispatches } = BUDGETS[level];
      process.stdout.write(`RIGOR: ${level} — ${reasons.join('; ')}\nBUDGET: rounds ${rounds} · plan revisions ${planRevisions} · dispatches ${dispatches}\n`);
    }
  } catch (error) {
    process.stderr.write(`FAIL: ${error.message}\n`);
    process.exitCode = 1;
  }
}
