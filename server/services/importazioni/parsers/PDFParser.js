// pdf-parse tira dentro pdfjs-dist, che all'import pretende globali del
// browser (DOMMatrix, Path2D, ImageData) forniti dal binding nativo di
// @napi-rs/canvas. Sul runtime serverless di Vercel quel binding non li
// espone e l'import fa fallire l'intera funzione con "DOMMatrix is not
// defined" — anche per richieste che non toccano i PDF, come /api/health.
//
// Caricandolo alla prima chiamata reale, il costo e il rischio restano
// confinati all'unico caso d'uso che ne ha bisogno: il parsing di un PDF.
let pdfParseModule = null;
const pdfParse = (...args) => {
  if (!pdfParseModule) {
    // eslint-disable-next-line global-require
    pdfParseModule = require('pdf-parse');
  }
  return pdfParseModule(...args);
};

const toIsoDate = (value) => {
  const s = String(value ?? '').trim();
  const m1 = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m1) {
    const dd = m1[1];
    const mm = m1[2];
    const yyyy = m1[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const m2 = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
};

const extractAmounts = (line) => {
  // Importi tipici: 12,34 1.234,56 -12,34 (con o senza simbolo valuta)
  const regex = /(\(?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\)?|(\(?-?\d+(?:[.,]\d{2})\)?))/g;
  const matches = line.match(regex) || [];
  return matches
    .map((m) => m.replace(/\s/g, '').replace(/[€$£¥]/g, ''))
    .filter((m) => String(m).trim() !== '');
};

const cleanDescription = (line) => (
  line
    .replace(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*/i, '')
    .replace(/\b(data|causale|dare|avere|saldo)\b/gi, '')
    .replace(/\(?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\)?/g, '')
    .replace(/\(?-?\d+(?:[.,]\d{2})\)?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
);

const parseSignedFromDareAvere = (dare, avere) => {
  const debit = dare ? String(dare) : null;
  const credit = avere ? String(avere) : null;

  const debitNum = debit ? Number(String(debit).replace(/\./g, '').replace(',', '.').replace(/\(/g, '').replace(/\)/g, '').replace(/-/g, '-')) : null;
  const creditNum = credit ? Number(String(credit).replace(/\./g, '').replace(',', '.').replace(/\(/g, '').replace(/\)/g, '').replace(/-/g, '-')) : null;

  if (creditNum && Number.isFinite(creditNum) && Math.abs(creditNum) > 0) return { importo: credit };
  if (debitNum && Number.isFinite(debitNum) && Math.abs(debitNum) > 0) {
    // Dare => segno negativo
    return { importo: debit && (String(debit).includes('-') ? debit : `-${String(debit)}`) };
  }
  return { importo: null };
};

/**
 * PDFParser: estrazione testuale di righe “simili a transazioni”.
 * Nota: per PDF scansionati (senza testo) viene generato un errore chiaro.
 */
class PDFParser {
  constructor({ bankId = 'generic' } = {}) {
    this.bankId = bankId;
  }

  async parse(buffer, { text } = {}) {
    let extractedText = text;
    if (!extractedText) {
      const data = await pdfParse(buffer);
      extractedText = data?.text || '';
    }

    const normalized = extractedText.replace(/\s/g, '');
    if (!normalized || normalized.length < 80) {
      throw new Error('Questo documento non è leggibile automaticamente. Prova a caricare il formato Excel o CSV fornito dalla banca.');
    }

    const lines = extractedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const transactions = [];
    let rowIndex = 0;

    // Euristica: cerca righe che iniziano con una data.
    for (const line of lines) {
      const dateMatch = line.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (!dateMatch) continue;

      const isoDate = toIsoDate(dateMatch[0]);
      if (!isoDate) continue;

      const amounts = extractAmounts(line);
      const descrizione = cleanDescription(line);
      if (!descrizione) continue;

      if (amounts.length >= 2) {
        // Per Poste assumiamo ordine Dare/Avere; altrimenti usiamo generic (i due importi sono i candidati).
        if (this.bankId === 'poste') {
          const { importo } = parseSignedFromDareAvere(amounts[0], amounts[1]);
          if (importo) {
            transactions.push({
              rowIndex: rowIndex++,
              data: isoDate,
              descrizione,
              importo,
              contoHint: null,
            });
          }
        } else {
          // Generic: il secondo importo spesso è “credit”
          const debit = amounts[0];
          const credit = amounts[1];
          const parsed = parseSignedFromDareAvere(debit, credit);
          if (parsed.importo) {
            transactions.push({
              rowIndex: rowIndex++,
              data: isoDate,
              descrizione,
              importo: parsed.importo,
              contoHint: null,
            });
          }
        }
      } else if (amounts.length === 1) {
        const single = amounts[0];
        const signed = String(single).includes('-') ? single : single;
        transactions.push({
          rowIndex: rowIndex++,
          data: isoDate,
          descrizione,
          importo: signed,
          contoHint: null,
        });
      }
    }

    if (transactions.length === 0) {
      throw new Error('Impossibile estrarre automaticamente le transazioni dal PDF. Prova a caricare l’Excel o CSV fornito dalla banca.');
    }

    return transactions;
  }
}

module.exports = PDFParser;

