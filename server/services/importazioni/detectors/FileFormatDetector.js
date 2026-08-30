/**
 * Responsabilità: rilevare il formato file (csv/xls/xlsx/pdf).
 * Non contiene logica specifica di banca.
 */
class FileFormatDetector {
  detect({ fileName, buffer }) {
    const name = String(fileName ?? '').toLowerCase();
    const ext = name.slice(name.lastIndexOf('.'));

    // Magic check per PDF: file di solito inizia con "%PDF"
    const head = buffer?.slice(0, 4)?.toString('utf8') || '';
    const looksLikePdf = head.startsWith('%PDF');

    if (looksLikePdf) return 'pdf';

    // Revolut exporta spesso CSV anche quando l'estensione è .xlsx
    const looksLikeZip = buffer?.slice(0, 2)?.equals?.(Buffer.from([0x50, 0x4B]));
    if ((ext === '.xls' || ext === '.xlsx') && !looksLikeZip) {
      const asText = buffer?.slice(0, 2000)?.toString('utf8') || '';
      if (asText.includes(',') || asText.includes(';')) return 'csv';
    }

    if (ext === '.csv') return 'csv';
    if (ext === '.xls' || ext === '.xlsx') return 'excel';

    // fallback: prova a capire se è csv “testuale”
    const asText = buffer?.slice(0, 2000)?.toString('utf8') || '';
    if (asText.includes(',') || asText.includes(';')) return 'csv';

    return 'unknown';
  }
}

module.exports = FileFormatDetector;

