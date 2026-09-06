const xlsx = require('xlsx');
const { isZip, isOle } = require('../../utils/fileMagicBytes');

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

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Le celle data di Excel non sono testo: leggendole con `raw: true` arrivano
 * come oggetti Date (o come seriale numerico se la cella non ha un formato
 * data). Le convertiamo qui in ISO usando i componenti locali: passare da
 * toISOString() sposterebbe la data di un giorno per i fusi a est di UTC.
 */
const normalizeCellDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100000) {
    const parsed = xlsx.SSF?.parse_date_code?.(value);
    if (parsed && parsed.y) return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
  }

  return value;
};

/** Rende negativo un importo di addebito senza raddoppiare un segno già presente. */
const asNegative = (value) => {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'))) return s;
  return `-${s}`;
};

// L'header non è quasi mai la prima riga: gli estratti conto premettono
// intestatario, IBAN, periodo e saldi. Fermarsi alle prime 30 righe lasciava
// fuori i file con preamboli lunghi, che finivano nel fallback posizionale e
// producevano righe senza senso.
const HEADER_SCAN_ROWS = 200;

/** Indice della riga di header, oppure null se in questo foglio non c'è. */
const findHeaderRowIndex = (grid) => {
  for (let i = 0; i < Math.min(grid.length, HEADER_SCAN_ROWS); i += 1) {
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
  return null;
};

const mapRowsWithHeaders = (rows, headerRow) => {
  const sampleKeys = headerRow.map((h, idx) => String(h ?? '').trim() || `__col_${idx}`);

  const dateKey = pickFirstMatchingKey(sampleKeys, [
    'data contabile', 'data operazione', 'data valuta', 'data', 'date', 'valuta', 'transaction date',
  ]);
  const descKey = pickFirstMatchingKey(sampleKeys, [
    'descrizione', 'description', 'causale', 'narration', 'motivo', 'dettaglio',
  ]);
  const accountKey = pickFirstMatchingKey(sampleKeys, ['conto', 'account', 'iban', 'c/c']);

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

    const data = dateKey ? normalizeCellDate(rowObj[dateKey]) : null;
    const descrizione = descKey ? rowObj[descKey] : null;
    const contoHint = accountKey ? rowObj[accountKey] : null;

    let importo = null;
    if (creditKey && debitKey) {
      const accredito = rowObj[creditKey];
      const addebito = rowObj[debitKey];
      if (isNonZeroCell(accredito)) {
        importo = accredito;
      } else if (isNonZeroCell(addebito)) {
        importo = asNegative(addebito);
      }
    } else if (creditKey && isNonZeroCell(rowObj[creditKey])) {
      importo = rowObj[creditKey];
    } else if (debitKey && isNonZeroCell(rowObj[debitKey])) {
      importo = asNegative(rowObj[debitKey]);
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
 * Fallback per file senza header riconoscibile: mappatura posizionale.
 * Se ci sono 4+ colonne tipiche Poste: [data, causale, dare, avere, saldo?]
 */
const mapRowsPositionally = (rows) => rows.map((r, idx) => {
  const dare = r[2];
  const avere = r[3];
  let importo = r[2];
  if (isNonZeroCell(avere) && !isNonZeroCell(dare)) importo = avere;
  else if (isNonZeroCell(dare) && !isNonZeroCell(avere)) importo = asNegative(dare);
  else if (isNonZeroCell(avere) && isNonZeroCell(dare)) importo = asNegative(dare);

  return {
    rowIndex: idx,
    data: normalizeCellDate(r[0]),
    descrizione: r[1],
    importo,
    contoHint: r[4] ?? r[3],
  };
}).filter((x) => x.data || x.descrizione || x.importo);

const dataRowsFrom = (grid, headerRowIndex) => grid
  .slice(headerRowIndex + 1)
  .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''));

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
      // Su un vero XLS/XLSX le date sono seriali numerici con un formato
      // dichiarato: `cellDates` le restituisce come oggetti Date, che sappiamo
      // convertire senza ambiguità.
      //
      // Su un file di testo travestito da Excel (tabella HTML o CSV esportati
      // dalla banca) invece SheetJS *indovina* le date dalle stringhe, e le
      // indovina all'americana: "01/09/2026" diventerebbe il 9 gennaio. Lì
      // conviene tenere il testo originale e lasciare l'interpretazione a
      // TransactionNormalizer, che conosce l'ordine italiano.
      //
      // Per i file testuali serve `raw: true` già in lettura: senza, SheetJS
      // tipizza le celle e trasforma "-25,40" nel numero -2540.
      const isBinaryWorkbook = isZip(buffer) || isOle(buffer);
      workbook = xlsx.read(buffer, isBinaryWorkbook
        ? { type: 'buffer', sheetRows: MAX_ROWS, cellDates: true }
        : { type: 'buffer', sheetRows: MAX_ROWS, raw: true });
    } catch (e) {
      throw new Error(`Impossibile leggere il file Excel: ${e.message}`);
    }

    const sheetNames = workbook.SheetNames || [];
    if (!sheetNames.length) throw new Error('File Excel senza fogli validi');

    // I movimenti non sono sempre sul primo foglio: molti export mettono
    // davanti un foglio di riepilogo.
    const grids = [];
    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;

      const grid = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!Array.isArray(grid) || grid.length <= 1) continue;
      if (grid.length >= MAX_ROWS) {
        throw new Error(`File Excel troppo grande: superate ${MAX_ROWS} righe. Dividi l'estratto conto in file più piccoli.`);
      }
      grids.push(grid);
    }

    if (!grids.length) throw new Error('File Excel senza contenuto adeguato');

    // Primo passaggio: fogli con un header riconoscibile, che è il caso affidabile.
    for (const grid of grids) {
      const headerRowIndex = findHeaderRowIndex(grid);
      if (headerRowIndex === null) continue;

      const mapped = mapRowsWithHeaders(dataRowsFrom(grid, headerRowIndex), grid[headerRowIndex]);
      if (mapped && mapped.length > 0) return mapped;
    }

    // Secondo passaggio: nessun header riconosciuto da nessuna parte.
    for (const grid of grids) {
      const positional = mapRowsPositionally(dataRowsFrom(grid, 0));
      if (positional.length > 0) return positional;
    }

    throw new Error('Impossibile interpretare il file Excel: colonne non riconosciute');
  }
}

module.exports = ExcelParserService;
