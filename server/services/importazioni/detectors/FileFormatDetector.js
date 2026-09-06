/**
 * Responsabilità: rilevare il formato file (csv/xls/xlsx/pdf).
 * Non contiene logica specifica di banca.
 */
class FileFormatDetector {
  detect({ fileName, buffer }) {
    const name = String(fileName ?? '').toLowerCase();
    const ext = name.slice(name.lastIndexOf('.'));

    const head = buffer?.slice(0, 2000)?.toString('utf8') || '';

    // I PDF non sono supportati: vengono già respinti all'upload, qui si
    // evita solo che un file rinominato finisca nei parser testuali.
    if (head.startsWith('%PDF')) return 'unknown';

    // Molte banche italiane esportano una tabella HTML con estensione .xls.
    // È testo, ma non è un CSV: SheetJS la legge come foglio, il parser CSV no.
    if (/<\s*(table|html|!doctype\s+html)/i.test(head)) return 'excel';

    // Revolut esporta spesso CSV anche quando l'estensione è .xlsx
    const looksLikeZip = buffer?.slice(0, 2)?.equals?.(Buffer.from([0x50, 0x4B]));
    if ((ext === '.xls' || ext === '.xlsx') && !looksLikeZip) {
      if (head.includes(',') || head.includes(';')) return 'csv';
    }

    if (ext === '.csv') return 'csv';
    if (ext === '.xls' || ext === '.xlsx') return 'excel';

    // fallback: prova a capire se è csv “testuale”
    if (head.includes(',') || head.includes(';')) return 'csv';

    return 'unknown';
  }
}

module.exports = FileFormatDetector;

