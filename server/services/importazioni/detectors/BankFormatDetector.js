const { looksLikeRevolutCsv } = require('../utils/csvStatement');

/**
 * Responsabilità: rilevare l’istituto bancario dal contenuto.
 * - Per ora usiamo euristiche testuali sul contenuto CSV.
 * - Non contiene logiche di parsing: restituisce solo una bankId.
 */
class BankFormatDetector {
  detectForCsv({ buffer }) {
    const head = buffer?.slice(0, 4000)?.toString('utf8') || '';
    const lower = head.toLowerCase();
    if (lower.includes('revolut') || looksLikeRevolutCsv(buffer)) return 'revolut';
    return 'generic';
  }

  /** API unica per ImportService: restituisce una stringa bankId. */
  detect({ fileFormat, buffer }) {
    if (fileFormat === 'csv') {
      return this.detectForCsv({ buffer });
    }

    // Per excel al momento usiamo generic (semplice e robusto).
    return 'generic';
  }
}

module.exports = BankFormatDetector;

