const { parse } = require('csv-parse/sync');
const { sliceCsvFromHeader, detectDelimiter } = require('../importazioni/utils/csvStatement');

const normalizeKey = (k) => String(k ?? '').toLowerCase().trim();

const pickFirstMatchingKey = (keys, patterns) => {
  const normalized = keys.map((k) => ({ original: k, n: normalizeKey(k) }));
  for (const p of patterns) {
    const match = normalized.find(({ n }) => n.includes(p));
    if (match) return match.original;
  }
  return null;
};

const hasColumnMatch = (recordKeys, patterns) => pickFirstMatchingKey(recordKeys, patterns) !== null;

/**
 * Responsabilità: leggere un CSV e trasformarlo in una lista di raw transactions.
 * Non normalizza date/importo: demandato a TransactionNormalizer.
 */
class CSVParserService {
  parseBuffer(buffer) {
    const csv = sliceCsvFromHeader(buffer);
    const nonEmptyLines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!nonEmptyLines.length) {
      throw new Error('CSV vuoto');
    }

    const firstLine = nonEmptyLines[0];
    const delimiter = detectDelimiter(firstLine);

    return parse(csv, {
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
  }

  parse(buffer) {
    let records;
    try {
      records = this.parseBuffer(buffer);
    } catch (e) {
      throw new Error(`Impossibile leggere CSV: ${e.message}`);
    }

    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('CSV non contiene righe valide');
    }

    const sampleKeys = Object.keys(records[0] || {});

    const dateKey = pickFirstMatchingKey(sampleKeys, ['data', 'date', 'valuta', 'transaction date']);
    const descKey = pickFirstMatchingKey(sampleKeys, ['descrizione', 'description', 'causale', 'narration', 'motivo']);
    const accountKey = pickFirstMatchingKey(sampleKeys, ['conto', 'account', 'iban', 'cc', 'c/c']);

    const creditKey = pickFirstMatchingKey(sampleKeys, ['accredito', 'credit', 'credito', 'entrata']);
    const debitKey = pickFirstMatchingKey(sampleKeys, ['addebito', 'debit', 'debi', 'debit', 'uscita', 'spesa']);
    const amountKey = pickFirstMatchingKey(sampleKeys, ['importo', 'amount', 'valore', 'totale']);

    // Se non troviamo abbastanza colonne, proviamo euristica “posizionale”.
    const ok =
      dateKey && descKey && (creditKey || debitKey || amountKey);

    if (!ok) {
      const csv = sliceCsvFromHeader(buffer);
      const nonEmptyLines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const firstLine = nonEmptyLines[0] || '';
      const delimiter = detectDelimiter(firstLine);

      const rows = parse(csv, {
        delimiter,
        columns: false,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });

      return rows.slice(1).map((r, idx) => ({
        rowIndex: idx,
        data: r[0],
        descrizione: r[1],
        importo: r[2],
        contoHint: r[3],
      })).filter((x) => x.data || x.descrizione || x.importo);
    }

    return records.map((r, idx) => {
      const data = r[dateKey];
      const descrizione = r[descKey];
      const contoHint = accountKey ? r[accountKey] : null;

      let importo = null;
      if (creditKey && debitKey) {
        const accredito = r[creditKey];
        const addebito = r[debitKey];
        if (accredito !== null && accredito !== undefined && String(accredito).trim() !== '' && String(accredito).trim() !== '0') {
          importo = accredito;
        } else if (addebito !== null && addebito !== undefined && String(addebito).trim() !== '' && String(addebito).trim() !== '0') {
          importo = `-${addebito}`;
        }
      } else if (amountKey) {
        importo = r[amountKey];
      }

      return {
        rowIndex: idx,
        data,
        descrizione,
        importo,
        contoHint,
      };
    });
  }
}

module.exports = CSVParserService;

