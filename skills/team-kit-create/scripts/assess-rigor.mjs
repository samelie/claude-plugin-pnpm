import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LEVELS = ['low', 'medium', 'high'];

// in-sample back-test over 27 sealed sessions (references/rigor.md → Evidence); recalibrate as efforts record a level
export const THRESHOLDS = { highPackages: 10, highRows: 50, lowPackages: 3, lowRows: 20 };

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
  const found = new Map(block.map((line) => line.match(SIGNAL)).filter(Boolean).map(([, key, value]) => [key, value]));
  const errors = [];
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

// floor is the lowest level a user pin can reach; anything unreadable fails closed to high
export const assess = (findings) => {
  const { signals, errors } = parseSignals(findings);
  if (errors.length) return { level: 'high', floor: 'high', reasons: errors };
  const rows = countRows(findings);
  if (rows === 0) return { level: 'high', floor: 'high', reasons: ['no rows in the Existing vs Build-New or Affected Areas sections'] };
  const size = `${signals.packages} packages, ${rows} rows`;
  const hazards = [...signals.risks.map((risk) => `risk class ${risk}`), ...(signals[WIRE_FLAG] ? ['unverified wire shape'] : [])];
  if (hazards.length) return { level: 'high', floor: 'high', reasons: [size, ...hazards] };
  const { highPackages, highRows, lowPackages, lowRows } = THRESHOLDS;
  if (signals.packages >= highPackages || rows >= highRows) return { level: 'high', floor: 'low', reasons: [size, 'no risk class'] };
  const surfaces = SURFACE_FLAGS.filter((flag) => signals[flag]);
  const narrow = signals.packages <= lowPackages && rows <= lowRows && surfaces.length === 0;
  return { level: narrow ? 'low' : 'medium', floor: 'low', reasons: [size, ...surfaces, 'no risk class'] };
};

export const recordedRigor = (map) => {
  const match = map.match(/^Rigor: (low|medium|high|pending)\b(.*)$/m);
  return match ? { level: match[1], pinned: match[2].includes('pinned') } : null;
};

const hasLatitude = (plan) => /^latitude:/m.test(plan);

export const checkRecorded = (findings, map, plan = '') => {
  const recorded = recordedRigor(map);
  if (hasLatitude(plan) && (!recorded || recorded.level === 'high')) return { ok: false, note: 'team-plan.md carries latitude: but the level is high or unrecorded, so zero-decision applies; revise the plan' };
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
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
