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
const { looksLikeRevolutCsv } = require('../utils/csvStatement');

/**
 * Responsabilità: rilevare l’istituto bancario dal contenuto.
 * - Per ora usiamo euristiche testuali (PDF e, in parte, CSV).
 * - Non contiene logiche di parsing: restituisce solo una bankId.
 */
class BankFormatDetector {
  detectForCsv({ buffer }) {
    const head = buffer?.slice(0, 4000)?.toString('utf8') || '';
    const lower = head.toLowerCase();
    if (lower.includes('revolut') || looksLikeRevolutCsv(buffer)) return 'revolut';
    return 'generic';
  }

  async detectForPdf({ buffer }) {
    let text = '';
    try {
      const data = await pdfParse(buffer);
      text = data?.text || '';
    } catch {
      text = '';
    }

    const lower = text.toLowerCase();
    if (lower.includes('bancoposta') || lower.includes('poste') || lower.includes('postepay')) {
      return { bankId: 'poste', text };
    }
    if (lower.includes('intesa')) {
      return { bankId: 'intesa', text };
    }
    if (lower.includes('revolut')) {
      return { bankId: 'revolut', text };
    }

    return { bankId: 'generic', text };
  }

  /**
   * API unica per ImportService:
   * - per csv: restituisce una stringa bankId
   * - per pdf: restituisce { bankId, text } (così PDFParser può riusare il testo)
   */
  async detect({ fileFormat, buffer }) {
    if (fileFormat === 'csv') {
      return this.detectForCsv({ buffer });
    }

    if (fileFormat === 'pdf') {
      const result = await this.detectForPdf({ buffer });
      // Se già una stringa, normalizziamo
      if (typeof result === 'string') return { bankId: result, text: '' };
      return result;
    }

    // Per excel al momento usiamo generic (semplice e robusto).
    return 'generic';
  }
}

module.exports = BankFormatDetector;

