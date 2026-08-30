const xlsx = require('xlsx');

const normalizeKey = (k) => String(k ?? '').toLowerCase().trim();

const pickFirstMatchingKey = (keys, patterns) => {
  const normalized = keys.map((k) => ({ original: k, n: normalizeKey(k) }));
  for (const p of patterns) {
    const match = normalized.find(({ n }) => n.includes(p));
    if (match) return match.original;
  }
  return null;
};

const isNonZeroCell = (value) => {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return s !== '' && s !== '0' && s !== '0,00' && s !== '0.00';
};

const findHeaderRowIndex = (grid) => {
  for (let i = 0; i < Math.min(grid.length, 30); i += 1) {
    const row = grid[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => normalizeKey(c));
    const hasDate = cells.some((c) => c.includes('data') || c === 'date');
    const hasDesc = cells.some((c) => (
      c.includes('descrizione')
      || c.includes('causale')
      || c.includes('description')
      || c.includes('motivo')
    ));
    const hasAmount = cells.some((c) => (
      c.includes('importo')
      || c.includes('amount')
      || c.includes('dare')
      || c.includes('avere')
      || c.includes('addebito')
      || c.includes('accredito')
    ));
    if (hasDate && hasDesc && hasAmount) return i;
  }
  return 0;
};

const mapRowsWithHeaders = (rows, headerRow) => {
  const sampleKeys = headerRow.map((h, idx) => String(h ?? '').trim() || `__col_${idx}`);

  const dateKey = pickFirstMatchingKey(sampleKeys, [
    'data contabile', 'data operazione', 'data valuta', 'data', 'date', 'valuta', 'transaction date',
  ]);
  const descKey = pickFirstMatchingKey(sampleKeys, [
    'descrizione', 'description', 'causale', 'narration', 'motivo', 'dettaglio',
  ]);
  const accountKey = pickFirstMatchingKey(sampleKeys, ['conto', 'account', 'iban', 'cc', 'c/c']);

  // Poste/BancoPosta e molte banche italiane usano Dare/Avere.
  const creditKey = pickFirstMatchingKey(sampleKeys, ['avere', 'accredito', 'credit', 'credito', 'entrata']);
  const debitKey = pickFirstMatchingKey(sampleKeys, ['dare', 'addebito', 'debit', 'debi', 'uscita', 'spesa']);
  const amountKey = pickFirstMatchingKey(sampleKeys, ['importo', 'amount', 'valore']);

  const ok = dateKey && descKey && (creditKey || debitKey || amountKey);
  if (!ok) return null;

  return rows.map((r, idx) => {
    const rowObj = {};
    sampleKeys.forEach((key, colIdx) => {
      rowObj[key] = r[colIdx] ?? '';
    });

    const data = dateKey ? rowObj[dateKey] : null;
    const descrizione = descKey ? rowObj[descKey] : null;
    const contoHint = accountKey ? rowObj[accountKey] : null;

    let importo = null;
    if (creditKey && debitKey) {
      const accredito = rowObj[creditKey];
      const addebito = rowObj[debitKey];
      if (isNonZeroCell(accredito)) {
        importo = accredito;
      } else if (isNonZeroCell(addebito)) {
        importo = `-${addebito}`;
      }
    } else if (creditKey && isNonZeroCell(rowObj[creditKey])) {
      importo = rowObj[creditKey];
    } else if (debitKey && isNonZeroCell(rowObj[debitKey])) {
      importo = `-${rowObj[debitKey]}`;
    } else if (amountKey) {
      importo = rowObj[amountKey];
    }

    return {
      rowIndex: idx,
      data,
      descrizione,
      importo,
      contoHint,
    };
  }).filter((x) => x.data || x.descrizione || x.importo);
};

/**
 * Responsabilità: leggere un XLS/XLSX e trasformarlo in una lista di raw transactions.
 * Non normalizza date/importo: demandato a TransactionNormalizer.
 */
// La libreria xlsx (SheetJS) ha vulnerabilità note senza fix pubblicato su
// npm oltre 0.18.5 (ReDoS in number-format, prototype pollution — vedi
// docs/SECURITY.md, rischio accettato e mitigato). Limitare esplicitamente
// righe/celle lette riduce la superficie di un file .xlsx malevolo o
// abnormemente grande (oltre al cap di 5MB già applicato all'upload), senza
// eliminare del tutto il rischio residuo della libreria stessa.
const MAX_ROWS = 20000;

class ExcelParserService {
  parse(buffer) {
    let workbook;
    try {
      workbook = xlsx.read(buffer, { type: 'buffer', sheetRows: MAX_ROWS });
    } catch (e) {
      throw new Error(`Impossibile leggere XLSX: ${e.message}`);
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error('XLSX senza fogli validi');

    const grid = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (!Array.isArray(grid) || grid.length <= 1) throw new Error('XLSX senza contenuto adeguato');
    if (grid.length >= MAX_ROWS) {
      throw new Error(`File XLSX troppo grande: superate ${MAX_ROWS} righe. Dividi l'estratto conto in file più piccoli.`);
    }

    const headerRowIndex = findHeaderRowIndex(grid);
    const headerRow = grid[headerRowIndex];
    const dataRows = grid.slice(headerRowIndex + 1).filter((row) => (
      Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
    ));

    const mapped = mapRowsWithHeaders(dataRows, headerRow);
    if (mapped && mapped.length > 0) return mapped;

    // Fallback: nessun header riconosciuto, mappatura posizionale.
    // Se ci sono 4+ colonne tipiche Poste: [data, causale, dare, avere, saldo?]
    const positionalRows = dataRows.map((r, idx) => {
      const dare = r[2];
      const avere = r[3];
      let importo = r[2];
      if (isNonZeroCell(avere) && !isNonZeroCell(dare)) importo = avere;
      else if (isNonZeroCell(dare) && !isNonZeroCell(avere)) importo = `-${dare}`;
      else if (isNonZeroCell(avere) && isNonZeroCell(dare)) importo = `-${dare}`;

      return {
        rowIndex: idx,
        data: r[0],
        descrizione: r[1],
        importo,
        contoHint: r[4] ?? r[3],
      };
    }).filter((x) => x.data || x.descrizione || x.importo);

    if (positionalRows.length > 0) return positionalRows;

    throw new Error('Impossibile interpretare il file Excel: colonne non riconosciute');
  }
}

module.exports = ExcelParserService;

