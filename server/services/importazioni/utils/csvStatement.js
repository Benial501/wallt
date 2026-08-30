const stripBom = (text) => String(text ?? '').replace(/^\uFEFF/, '');

const detectDelimiter = (line) => (
  (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ';' : ','
);

const findHeaderLineIndex = (lines) => {
  for (let i = 0; i < Math.min(lines.length, 50); i += 1) {
    const line = String(lines[i] ?? '').trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    const hasDesc = lower.includes('description') || lower.includes('descrizione');
    const hasAmount = lower.includes('amount') || lower.includes('importo');
    const hasDate = lower.includes('date') || lower.includes('data');
    const hasBalance = lower.includes('balance') || lower.includes('saldo');
    if (!hasDesc || (!hasAmount && !hasBalance) || !hasDate) continue;

    const delimiter = detectDelimiter(line);
    const cols = line.split(delimiter).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 3) continue;
    return i;
  }
  return 0;
};

const sliceCsvFromHeader = (buffer) => {
  const csv = stripBom(buffer.toString('utf8'));
  const lines = csv.split(/\r?\n/);
  const headerIndex = findHeaderLineIndex(lines);
  return lines.slice(headerIndex).join('\n');
};

const looksLikeRevolutCsv = (buffer) => {
  const csv = stripBom(buffer?.slice(0, 8000)?.toString('utf8') || '');
  const lower = csv.toLowerCase();
  if (lower.includes('revolut')) return true;

  const headerLine = csv.split(/\r?\n/)[findHeaderLineIndex(csv.split(/\r?\n/))] || '';
  const header = headerLine.toLowerCase();
  if (!header) return false;

  const hasDesc = header.includes('description') || header.includes('descrizione');
  const hasAmount = header.includes('amount') || header.includes('importo');
  const hasCompletedDate = header.includes('completed date') || header.includes('date completed');
  const hasType = header.includes('type') || header.includes('tipo');

  return hasDesc && hasAmount && (hasCompletedDate || hasType);
};

module.exports = {
  stripBom,
  detectDelimiter,
  findHeaderLineIndex,
  sliceCsvFromHeader,
  looksLikeRevolutCsv,
};
