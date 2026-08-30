// ExcelParserService: parsing XLSX di base + mitigazione contro file XLSX
// abnormemente grandi (difesa aggiuntiva oltre al cap di 5MB sull'upload,
// vista l'assenza di un fix pubblicato su npm per le vulnerabilità note
// della libreria xlsx — vedi docs/SECURITY.md).
require('./setup');
const xlsx = require('xlsx');
const ExcelParserService = require('../services/import/ExcelParserService');

const buildXlsxBuffer = (rows) => {
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, 'Movimenti');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

describe('ExcelParserService', () => {
  let parser;
  beforeEach(() => { parser = new ExcelParserService(); });

  it('estrae le righe da un XLSX valido con header riconosciuti', () => {
    const buffer = buildXlsxBuffer([
      ['Data', 'Descrizione', 'Importo'],
      ['01/03/2026', 'ESSELUNGA VIA ROMA', '-25,50'],
      ['05/03/2026', 'STIPENDIO', '1500,00'],
    ]);

    const rows = parser.parse(buffer);
    expect(rows.length).toBe(2);
    expect(rows[0].descrizione).toContain('ESSELUNGA');
  });

  it('rifiuta un XLSX con più righe del limite di sicurezza invece di provare a processarle tutte', () => {
    const header = ['Data', 'Descrizione', 'Importo'];
    const rows = [header];
    for (let i = 0; i < 20050; i += 1) {
      rows.push(['01/03/2026', `RIGA ${i}`, '-1,00']);
    }
    const buffer = buildXlsxBuffer(rows);

    expect(() => parser.parse(buffer)).toThrow(/troppo grande/i);
  });

  it('rifiuta un buffer che non è un XLSX valido con un errore leggibile', () => {
    const buffer = Buffer.from('questo non è un file excel');
    expect(() => parser.parse(buffer)).toThrow();
  });
});
