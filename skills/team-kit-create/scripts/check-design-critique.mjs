import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { concrete, decisionRows, field, parseFindings } from './check-design-critique-parse.mjs';
import { basename, dirname } from 'node:path';
import { resolveConfig } from './teamkit-config.mjs';

const skippedRunner = 'Runner: skipped — team-design-critic not installed';
const skippedStatus = 'STATUS: DONE_WITH_CONCERNS — design critique skipped: team-design-critic not installed';
const rigorRunner = 'Runner: skipped — rigor low: no cross-lane seam';
const rigorStatus = 'STATUS: DONE_WITH_CONCERNS — design critique skipped: rigor low, no cross-lane seam';

const disposition = (text, id) => {
  const match = text.match(new RegExp(`^${id} [^—]+ — (fixed: (.+)|rejected)$`));
  return match ? { action: match[1] === 'rejected' ? 'rejected' : 'fixed', change: match[2] } : null;
};

// afk acceptance (claude lane): Source: afk records pass only inside withAfk, entered by checkDesignCritique when the session's project config resolves afk=true
let afkActive = false;
const afkLocator = /^afk-adoptions\.md#a-[1-9]\d*-[a-z0-9]+(?:-[a-z0-9]+)* — UNRATIFIED \(afk, \d{4}-\d{2}-\d{2}\)$/;
const validateAfkDecision = (gist, detail, finding, errors) => {
  if (!concrete(field(gist, 'Rationale'))) errors.push(`${finding.id}: afk decision needs concrete Rationale`);
  if (!afkLocator.test(detail.trim())) errors.push(`${finding.id}: afk decision needs locator afk-adoptions.md#a-{n}-{slug} — UNRATIFIED (afk, {YYYY-MM-DD})`);
};
export const withAfk = (afk, run) => {
  afkActive = afk === true;
  try { return run(); } finally { afkActive = false; }
};
export const sessionAfk = (sessionPath) => {
  const session = resolve(sessionPath);
  return basename(dirname(session)) === 'team-session' && resolveConfig(dirname(dirname(session))).afk;
};

const validateUserDecision = (row, finding, errors) => {
  const [name, gist, detail] = row;
  const prefix = gist.split(';')[0].trim();
  const chosen = disposition(prefix, finding.id);
  if (!/^D-[1-9]\d* \S/.test(name) || !chosen || (chosen.action === 'fixed' && !concrete(chosen.change))) {
    errors.push(`${finding.id}: malformed user disposition`);
  }
  if (afkActive && field(gist, 'Source') === 'afk') {
    validateAfkDecision(gist, detail, finding, errors);
    return chosen;
  }
  if (field(gist, 'Source') !== 'user' || !concrete(field(gist, 'Rationale'))) {
    errors.push(`${finding.id}: user decision needs Source: user and concrete Rationale`);
  }
  if (!concrete(detail) || /^(?:design critique|design\.md|map\.md)\b/i.test(detail)) {
    errors.push(`${finding.id}: user decision needs a concrete user response locator`);
  }
  return chosen;
};

// this checks bound decision records; the orchestrator authenticates user authorization.
export const validateDesignCritique = ({ critique, design = '', map = '' }) => {
  const errors = [];
  const lines = critique.split(/\r?\n/).filter((line) => line.trim());
  const verdicts = lines.filter((line) => /^\s*(?:\*\*)?Critique:/.test(line));
  const statuses = lines.filter((line) => /^\s*(?:\*\*)?STATUS:/.test(line));
  const runners = lines.filter((line) => /^\s*(?:\*\*)?Runner:/.test(line));
  if (runners.length) {
    const shaped = lines.length === 3 && /^# Design Critique: \S/.test(lines[0]);
    // a raised level owes the real critique, so this form only holds while map.md still reads low
    if (shaped && lines[1] === rigorRunner && lines[2] === rigorStatus) {
      const low = /^Rigor: low\b/m.test(map);
      if (!low) errors.push('rigor skip form needs map.md Rigor: low; any other level owes the critique');
      return { ok: low, skipped: low, errors, findings: 0, skipReason: 'rigor low' };
    }
    const skipped = shaped && lines[1] === skippedRunner && lines[2] === skippedStatus;
    if (!skipped) errors.push('only the exact three-line role-not-installed or rigor-low skip form is allowed');
    return { ok: skipped, skipped, errors, findings: 0 };
  }
  if (verdicts.length !== 1 || !/^Critique: (?:CLEAR|BLOCKING)$/.test(verdicts[0])) errors.push('expected exactly one anchored Critique: CLEAR or BLOCKING verdict');
  if (statuses.length !== 1 || statuses[0] !== lines.at(-1)) errors.push('expected exactly one terminal anchored STATUS line');
  const findings = parseFindings(critique, errors);
  const required = findings.filter(({ severity }) => severity === 'Blocker' || severity === 'Major');
  const humanCount = required.filter(({ route }) => route === 'human').length;
  const expectedVerdict = required.length ? 'Critique: BLOCKING' : 'Critique: CLEAR';
  const expectedStatus = !required.length ? 'STATUS: CLEAN' : humanCount
    ? `STATUS: BLOCKED — ${humanCount} finding(s) need a human decision`
    : `STATUS: ERRORS_REMAINING: ${required.length}`;
  if (verdicts[0] !== expectedVerdict) errors.push(`finding count requires ${expectedVerdict}`);
  if (statuses[0] !== expectedStatus) errors.push(`finding count and routes require ${expectedStatus}`);
  if (!required.length) return { ok: !errors.length, skipped: false, errors, findings: findings.length };
  const needsDesign = required.some(({ route }) => route === 'planner') || /^#{1,6} Decisions Made\s*$/m.test(design);
  const designRows = needsDesign ? decisionRows(design, 'Decisions Made', ['Decision', 'Rationale', 'From'], errors) : [];
  const needsMap = required.some(({ id, route, severity }) => route === 'human' || (severity === 'Blocker'
    && designRows.some(([name]) => disposition(name, id)?.action === 'rejected')));
  const hasMapDecisions = /^#{1,6} Decisions so far\s*$/m.test(map);
  const mapRows = needsMap || hasMapDecisions ? decisionRows(map, 'Decisions so far', ['Decision', 'Gist', 'Detail in'], errors) : [];
  for (const finding of required) {
    const { id } = finding;
    const relatedDesign = designRows.filter(([name, , source]) => new RegExp(`\\b${id}\\b`).test(`${name} ${source}`));
    const relatedMap = mapRows.filter(([, gist]) => disposition(gist.split(';')[0].trim(), id));
    let chosen;
    if (finding.route === 'human') {
      if (relatedMap.length !== 1) errors.push(`${id}: expected exactly one linked user decision in map Decisions so far`);
      else chosen = validateUserDecision(relatedMap[0], finding, errors);
      if (relatedDesign.length) errors.push(`${id}: human disposition belongs in map only; remove duplicate/conflicting design disposition`);
    } else {
      if (relatedDesign.length !== 1) {
        errors.push(`${id}: expected exactly one disposition in design Decisions Made`);
        continue;
      }
      const [name, rationale, source] = relatedDesign[0];
      chosen = disposition(name, id);
      if (!chosen || (chosen.action === 'fixed' && !concrete(chosen.change)) || !concrete(rationale)) errors.push(`${id}: needs fixed: concrete change or rejected, with concrete rationale`);
      if (source !== `design critique ${id}`) errors.push(`${id}: disposition source must be exactly design critique ${id}`);
      if (relatedMap.length && !(finding.severity === 'Blocker' && chosen?.action === 'rejected')) errors.push(`${id}: duplicate/conflicting map disposition for a planner-routed finding`);
    }
    if (chosen?.action === 'rejected' && finding.severity === 'Blocker') {
      if (relatedMap.length !== 1) errors.push(`${id}: rejected Blocker needs exactly one material user acknowledgement in map`);
      else {
        const [, gist] = relatedMap[0];
        const acknowledgement = validateUserDecision(relatedMap[0], finding, errors);
        if (acknowledgement?.action !== 'rejected' || field(gist, 'Material acknowledgement') !== 'accepted'
          || !concrete(field(gist, 'Critic rationale')) || !concrete(field(gist, 'Rejection rationale'))) {
          errors.push(`${id}: rejected Blocker needs Material acknowledgement: accepted and both concrete rationales`);
        }
      }
    }
  }
  return { ok: !errors.length, skipped: false, errors, findings: findings.length };
};

export const checkDesignCritique = async (sessionPath) => {
  if (!isAbsolute(sessionPath)) throw new Error('session path must be absolute');
  const critique = await readFile(join(sessionPath, 'design-critic/design-critique.md'), 'utf8');
  const optional = async (name) => {
    try { return await readFile(join(sessionPath, name), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  };
  const [design, map] = await Promise.all([optional('design.md'), optional('map.md')]);
  if (sessionAfk(sessionPath)) return { ...withAfk(true, () => validateDesignCritique({ critique, design, map })), afk: true };
  return validateDesignCritique({ critique, design, map });
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('usage: node check-design-critique.mjs <absolute-session-path>');
    const result = await checkDesignCritique(process.argv[2]);
    for (const error of result.errors) process.stderr.write(`FAIL: ${error}\n`);
    if (result.afk) process.stdout.write('NOTE: afk=true (.claude/team-kit.local.json) — Source: afk UNRATIFIED records accepted\n');
    if (result.ok) process.stdout.write(result.skipped ? `SKIPPED: ${result.skipReason ?? 'team-design-critic not installed'} (recorded concern)\n` :`PASS: ${result.findings} findings have structurally valid dispositions; orchestrator must authenticate user decisions\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`FAIL: ${error.message}\n`);
    process.exitCode = 1;
  }
}
