const unresolvedMarker = /^(?:todo|tbd|tbc|unresolved|placeholder)(?:$|\s|[:.!?,])|^pending(?:$|[:,.!?]|\s+(?:implementation|fix|decision|approval|resolution|work)\b)|^not (?:yet )?(?:fixed|rejected|decided)\b|^to be (?:fixed|decided|determined)\b/i;
const templateMarker = /^(?:<|\{)(?:what(?: changed)?|why|rationale|concrete(?: change| reason)?|user(?: response)?|response|locator|reason|change|detail|text|value|fix)(?:>|\})$/i;

export const concrete = (text) => {
  const value = text.trim().replace(/^`+|`+$/g, '');
  return Boolean(value) && !unresolvedMarker.test(value) && !templateMarker.test(value);
};

export const section = (text, name, errors) => {
  const lines = text.split(/\r?\n/);
  const headings = lines.flatMap((line, index) => /^#{1,6} /.test(line) ? [{ line, index }] : []);
  const matches = headings.filter(({ line }) => line.replace(/^#+ /, '').trim() === name);
  if (matches.length !== 1) {
    errors.push(`expected exactly one ${name} section`);
    return '';
  }
  const { line, index } = matches[0];
  const level = line.match(/^#+/)[0].length;
  const end = headings.find((heading) => heading.index > index && heading.line.match(/^#+/)[0].length <= level)?.index;
  return lines.slice(index + 1, end).join('\n');
};

export const table = (text, columns, errors, label, allowProse = false) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = [];
  let headers = 0;
  for (const line of lines) {
    if (/^<!--.*-->$/.test(line.trim())) continue;
    if (!line.startsWith('|') || !line.endsWith('|')) {
      if (!allowProse || /\bDC-\d+\b/.test(line)) errors.push(`${label}: non-table content: ${line.slice(0, 90)}`);
      continue;
    }
    const cells = line.slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
    if (cells.length !== columns.length || cells.some((cell) => !cell)) {
      errors.push(`${label}: malformed or empty table cells`);
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    if (cells.every((cell, index) => cell === columns[index])) {
      headers += 1;
      continue;
    }
    rows.push(cells);
  }
  if (headers !== 1) errors.push(`${label}: expected exactly one table header`);
  return rows;
};

export const decisionRows = (text, heading, columns, errors) => table(section(text, heading, errors), columns, errors, heading);

export const parseFindings = (critique, errors) => {
  const columns = ['ID', 'Severity', 'Route', 'Clause', 'Location', 'Quote', 'Failure scenario', 'Recommendation — rationale', 'Proof checked'];
  const content = section(critique, 'Findings', errors);
  const rows = table(content, columns, errors, 'Findings', true);
  const allFindingRows = critique.match(/^\s*\|\s*DC-[^\n]*/gm) ?? [];
  const sectionFindingRows = content.match(/^\s*\|\s*DC-[^\n]*/gm) ?? [];
  if (allFindingRows.length !== sectionFindingRows.length) errors.push('finding rows outside Findings section are not allowed');
  const findings = [];
  const ids = new Set();
  for (const cells of rows) {
    const [name, severity, route, clause] = cells;
    const id = name.match(/^(DC-[1-9]\d*) \S.*$/)?.[1];
    if (!id || ids.has(id)) errors.push(`invalid or duplicate finding ID: ${name}`);
    if (id) ids.add(id);
    if (!['Blocker', 'Major', 'Nit'].includes(severity)) errors.push(`${name}: invalid severity ${severity}`);
    if (!['planner', 'human'].includes(route)) errors.push(`${name}: invalid route ${route}`);
    if (!/^C-[1-6](?:\s*[,;]\s*C-[1-6])*$/.test(clause)) errors.push(`${name}: invalid clause ${clause}`);
    if (cells.some((cell) => templateMarker.test(cell))) errors.push(`${name}: unfinished finding cells`);
    findings.push({ id, severity, route });
  }
  if (findings.some(({ id }, index) => id !== `DC-${index + 1}`)) errors.push('finding IDs must run DC-1, DC-2, … without gaps');
  return findings;
};

export const field = (text, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...text.matchAll(new RegExp(`(?:^|;\\s*)${escaped}:\\s*([^;]+)`, 'g'))];
  return matches.length === 1 ? matches[0][1].trim() : '';
};
