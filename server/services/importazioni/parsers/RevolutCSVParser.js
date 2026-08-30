const { parse } = require('csv-parse/sync');
const {
  detectDelimiter,
  sliceCsvFromHeader,
  looksLikeRevolutCsv,
} = require('../utils/csvStatement');

const normalizeKey = (k) => String(k ?? '').toLowerCase().trim();

const pickKey = (keys, patterns, { exclude = [], prefer = [] } = {}) => {
  const normalized = keys.map((k) => ({ original: k, n: normalizeKey(k) }));

  for (const p of prefer) {
    const match = normalized.find(({ n }) => n === p || n.includes(p));
    if (match) return match.original;
  }

  for (const p of patterns) {
    const match = normalized.find(({ n }) => {
      if (exclude.some((ex) => n.includes(ex))) return false;
      return n.includes(p);
    });
    if (match) return match.original;
  }

  return null;
};

const parseMoney = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().replace(/[€$£]/g, '').replace(/\s/g, '').replace(/'/g, '');
  if (!raw) return null;

  const hasMinus = raw.startsWith('-') || (raw.startsWith('(') && raw.endsWith(')'));
  const unsigned = raw.replace(/^[-+]/, '').replace(/^\(/, '').replace(/\)$/, '');

  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');
  let normalized = unsigned;
  if (lastComma > lastDot) {
    normalized = unsigned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = unsigned.replace(/,/g, '');
  }

  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return hasMinus ? -Math.abs(num) : num;
};

const parseDate = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
};

const SKIPPED_STATES = new Set(['PENDING', 'FAILED', 'REJECTED', 'DECLINED', 'CANCELLED', 'REVERTED']);

/**
 * Parser dedicato per export CSV Revolut (personale e business).
 */
class RevolutCSVParser {
  static isRevolutCsv(buffer) {
    return looksLikeRevolutCsv(buffer);
  }

  parse(buffer) {
    const csvBody = sliceCsvFromHeader(buffer);
    const firstLine = csvBody.split(/\r?\n/)[0] || '';
    const delimiter = detectDelimiter(firstLine);

    const records = parse(csvBody, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
    });

    if (!records.length) return [];

    const keys = Object.keys(records[0]);
    const dateKey = pickKey(keys, ['date', 'data'], {
      prefer: ['completed date', 'date completed', 'data completamento', 'data completata'],
      exclude: ['started', 'inizio', 'start'],
    }) || pickKey(keys, ['completed date', 'date completed', 'started date', 'date started', 'date', 'data']);
    const descKey = pickKey(keys, ['description', 'descrizione']);
    const amountKey = pickKey(keys, ['amount', 'importo'], { exclude: ['orig', 'original'] });
    const feeKey = pickKey(keys, ['fee', 'commissione']);
    const stateKey = pickKey(keys, ['state', 'status', 'stato']);
    const balanceKey = pickKey(keys, ['balance', 'saldo']);
    const typeKey = pickKey(keys, ['type', 'tipo'], { exclude: ['product', 'prodotto'] });
    const categoryKey = pickKey(keys, ['category', 'categoria']);

    const transactions = [];

    records.forEach((row, idx) => {
      const state = stateKey ? String(row[stateKey] || '').trim().toUpperCase() : '';
      if (state && state !== 'COMPLETED' && SKIPPED_STATES.has(state)) return;

      const data = parseDate(row[dateKey]);
      const descrizione = String(row[descKey] || row[typeKey] || '').trim();
      let amount = parseMoney(row[amountKey]);
      const fee = feeKey ? parseMoney(row[feeKey]) : 0;

      if (!data || !descrizione || amount === null) return;

      if (fee && fee > 0) {
        amount -= fee;
      }

      if (amount === 0) return;

      const revolutType = typeKey ? String(row[typeKey] || '').trim() : null;
      const revolutCategory = categoryKey ? String(row[categoryKey] || '').trim() : null;
      const balance = balanceKey ? parseMoney(row[balanceKey]) : null;

      transactions.push({
        rowIndex: idx,
        data,
        descrizione,
        importo: amount,
        revolutType,
        revolutCategory,
        balance,
        contoHint: null,
      });
    });

    return transactions;
  }
}

module.exports = RevolutCSVParser;
