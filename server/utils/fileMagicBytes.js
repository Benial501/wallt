const path = require('path');
const { BadRequestError } = require('./AppError');

const matchBytes = (buffer, offset, bytes) => {
  if (!buffer || buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
};

// I PDF non sono più accettati in import, ma il riconoscimento resta per
// poterli rifiutare con un messaggio comprensibile anche se rinominati.
const isPdf = (buffer) => matchBytes(buffer, 0, [0x25, 0x50, 0x44, 0x46]); // %PDF

const isZip = (buffer) => matchBytes(buffer, 0, [0x50, 0x4B, 0x03, 0x04]); // PK.. (XLSX)

const isOle = (buffer) => matchBytes(buffer, 0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]); // XLS

/**
 * Molte banche italiane esportano "Excel" che Excel non è: tabelle HTML o
 * CSV/TSV con estensione .xls/.xlsx. Sono file di testo, non binari OLE/ZIP,
 * e SheetJS li legge senza problemi — rifiutarli all'upload bloccava estratti
 * conto perfettamente validi. Accettiamo quindi anche il testo, mantenendo
 * fuori i binari di altro tipo (che contengono byte NUL).
 */
const isLikelyText = (buffer) => {
  if (!buffer || buffer.length === 0) return false;
  if (buffer.includes(0x00)) return false;

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
  if (!sample.trim()) return false;

  const replacementCount = (sample.match(/\uFFFD/g) || []).length;
  return replacementCount / sample.length < 0.05;
};

const isLikelyCsv = isLikelyText;

const validateImportFileBuffer = (buffer, filename) => {
  const ext = path.extname(filename || '').toLowerCase();

  if (!['.csv', '.xls', '.xlsx'].includes(ext)) {
    throw new BadRequestError('Formato file non supportato. Usa .csv o .xls/.xlsx');
  }

  if (isPdf(buffer)) {
    throw new BadRequestError('I PDF non sono supportati: esporta l\'estratto conto in CSV o Excel dalla tua banca.');
  }

  if (!buffer || buffer.length === 0) {
    throw new BadRequestError('File vuoto o non valido');
  }

  switch (ext) {
    case '.xlsx':
      if (!isZip(buffer) && !isLikelyText(buffer)) {
        throw new BadRequestError('Il file non è un Excel (.xlsx) valido');
      }
      break;
    case '.xls':
      if (!isOle(buffer) && !isLikelyText(buffer)) {
        throw new BadRequestError('Il file non è un Excel (.xls) valido');
      }
      break;
    case '.csv':
      if (!isLikelyCsv(buffer)) {
        throw new BadRequestError('Il file non è un CSV valido');
      }
      break;
    default:
      throw new BadRequestError('Formato file non supportato');
  }
};

module.exports = {
  validateImportFileBuffer,
  isPdf,
  isZip,
  isOle,
  isLikelyCsv,
  isLikelyText,
};
