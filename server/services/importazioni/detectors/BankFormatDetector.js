const pdfParse = require('pdf-parse');
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

