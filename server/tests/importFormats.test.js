// Formati di import: gli Excel "reali" delle banche.
//
// Copre le rotture osservate su estratti conto veri:
// - molti .xls/.xlsx delle banche italiane non sono binari OLE/ZIP ma
//   tabelle HTML o CSV rinominati, e venivano rifiutati all'upload;
// - header preceduto da un preambolo lungo, o movimenti su un foglio
//   diverso dal primo;
// - celle data vere di Excel convertite in date sbagliate.
//
// I PDF non sono più un formato accettato: qui si verifica solo che vengano
// respinti con un messaggio chiaro.
require('./setup');
const xlsx = require('xlsx');

const { validateImportFileBuffer } = require('../utils/fileMagicBytes');
const ExcelParserService = require('../services/import/ExcelParserService');
const FileFormatDetector = require('../services/importazioni/detectors/FileFormatDetector');

const buildXlsx = (sheets, opts = {}) => {
  const workbook = xlsx.utils.book_new();
  sheets.forEach(([name, rows]) => {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows, opts), name);
  });
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx', ...opts });
};

const MOVIMENTI = [
  ['01/09/2026', 'PAGAMENTO POS SUPERMERCATO', '-25,40'],
  ['02/09/2026', 'ADDEBITO BOLLETTA ENEL', '-78,90'],
  ['03/09/2026', 'BONIFICO STIPENDIO', '1500,00'],
];

describe('Import PDF — non più supportati', () => {
  const finoPdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from('contenuto qualsiasi di un documento'.repeat(4), 'latin1'),
  ]);

  it('rifiuta un .pdf con un messaggio che dice cosa caricare al suo posto', () => {
    expect(() => validateImportFileBuffer(finoPdf, 'estratto.pdf'))
      .toThrow(/Usa \.csv o \.xls/i);
  });

  it('rifiuta un PDF anche se rinominato in .csv o .xls', () => {
    expect(() => validateImportFileBuffer(finoPdf, 'estratto.csv')).toThrow(/PDF non sono supportati/i);
    expect(() => validateImportFileBuffer(finoPdf, 'estratto.xls')).toThrow(/PDF non sono supportati/i);
  });

  it('non instrada un PDF verso i parser testuali', () => {
    expect(new FileFormatDetector().detect({ fileName: 'estratto.csv', buffer: finoPdf })).toBe('unknown');
  });
});

describe('Import Excel — file che le banche chiamano .xls ma non lo sono', () => {
  const htmlXls = Buffer.from(
    `<html><head><meta charset="utf-8"></head><body><table>
      <tr><th>Data</th><th>Descrizione</th><th>Importo</th></tr>
      <tr><td>01/09/2026</td><td>PAGAMENTO POS SUPERMERCATO</td><td>-25,40</td></tr>
      <tr><td>03/09/2026</td><td>BONIFICO STIPENDIO</td><td>1500,00</td></tr>
    </table></body></html>`,
    'utf8',
  );

  const csvXls = Buffer.from(
    'Data;Descrizione;Importo\n01/09/2026;PAGAMENTO POS SUPERMERCATO;-25,40\n03/09/2026;BONIFICO STIPENDIO;1500,00\n',
    'utf8',
  );

  it('accetta un .xls che è in realtà una tabella HTML', () => {
    expect(() => validateImportFileBuffer(htmlXls, 'movimenti.xls')).not.toThrow();
  });

  it('accetta un .xlsx che è in realtà un CSV', () => {
    expect(() => validateImportFileBuffer(csvXls, 'movimenti.xlsx')).not.toThrow();
  });

  it('continua a rifiutare un .xls che non è interpretabile', () => {
    expect(() => validateImportFileBuffer(Buffer.from([0x00, 0x01, 0x02, 0x00]), 'rotto.xls'))
      .toThrow(/Excel/i);
  });

  it('legge la tabella HTML senza corrompere gli importi', () => {
    const rows = new ExcelParserService().parse(htmlXls);

    expect(rows.length).toBe(2);
    expect(rows[0].data).toBe('01/09/2026');
    // -25,40 non deve diventare -2540
    expect(String(rows[0].importo).replace(',', '.')).toBe('-25.40');
  });

  it('instrada il .xls testuale al parser giusto', () => {
    expect(new FileFormatDetector().detect({ fileName: 'movimenti.xls', buffer: csvXls })).toBe('csv');
  });
});

describe('Import Excel — struttura dei file reali', () => {
  it('trova l’header anche dopo un preambolo lungo', () => {
    const preambolo = Array.from({ length: 34 }, (_, i) => [`riga di intestazione ${i + 1}`]);
    const buffer = buildXlsx([['Foglio1', [
      ...preambolo,
      ['Data', 'Descrizione', 'Importo'],
      ...MOVIMENTI,
    ]]]);

    const rows = new ExcelParserService().parse(buffer);

    expect(rows.length).toBe(3);
    expect(rows[0].descrizione).toContain('SUPERMERCATO');
  });

  it('trova i movimenti anche se non sono sul primo foglio', () => {
    const buffer = buildXlsx([
      ['Riepilogo', [['Riepilogo del conto'], ['Saldo', '1.000,00']]],
      ['Movimenti', [['Data', 'Descrizione', 'Importo'], ...MOVIMENTI]],
    ]);

    const rows = new ExcelParserService().parse(buffer);

    expect(rows.length).toBe(3);
    expect(rows[0].descrizione).toContain('SUPERMERCATO');
  });

  it('converte le celle data vere di Excel nel giorno giusto', () => {
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ['Data', 'Descrizione', 'Importo'],
      [new Date(2026, 8, 1), 'PAGAMENTO POS SUPERMERCATO', -25.4],
      [new Date(2026, 8, 3), 'BONIFICO STIPENDIO', 1500],
    ], { cellDates: true });
    xlsx.utils.book_append_sheet(workbook, sheet, 'Movimenti');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx', cellDates: true });

    const rows = new ExcelParserService().parse(buffer);

    expect(rows.length).toBe(2);
    expect(rows[0].data).toBe('2026-09-01');
    expect(rows[1].data).toBe('2026-09-03');
  });
});

describe('Interpretazione delle date degli estratti conto', () => {
  // eslint-disable-next-line global-require
  const { parseDateFlexible } = require('../services/import/TransactionNormalizer');

  it('legge i formati italiani, con qualunque separatore e anno a 2 o 4 cifre', () => {
    expect(parseDateFlexible('01/09/2026')).toBe('2026-09-01');
    expect(parseDateFlexible('01-09-2026')).toBe('2026-09-01');
    expect(parseDateFlexible('01.09.2026')).toBe('2026-09-01');
    expect(parseDateFlexible('1/9/2026')).toBe('2026-09-01');
    expect(parseDateFlexible('01/09/26')).toBe('2026-09-01');
  });

  it('legge il formato ISO', () => {
    expect(parseDateFlexible('2026-09-01')).toBe('2026-09-01');
    expect(parseDateFlexible('2026/09/01')).toBe('2026-09-01');
    expect(parseDateFlexible('2026-09-01T10:30:00Z')).toBe('2026-09-01');
  });

  it('riconosce l’ordine americano quando il giorno non può essere un mese', () => {
    expect(parseDateFlexible('09/21/2026')).toBe('2026-09-21');
  });

  it('non sposta il giorno per effetto del fuso orario', () => {
    expect(parseDateFlexible(new Date(2026, 8, 1))).toBe('2026-09-01');
    expect(parseDateFlexible(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('rifiuta i valori che non sono date invece di inventarne una', () => {
    expect(parseDateFlexible('')).toBeNull();
    expect(parseDateFlexible('descrizione qualsiasi')).toBeNull();
    expect(parseDateFlexible('32/13/2026')).toBeNull();
    expect(parseDateFlexible('31/02/2026')).toBeNull();
  });
});

describe('Instradamento dei file al parser giusto', () => {
  it('manda una tabella HTML travestita da .xls al parser Excel, non a quello CSV', () => {
    const html = Buffer.from('<html><body><table><tr><td>Data,Importo</td></tr></table></body></html>', 'utf8');

    expect(new FileFormatDetector().detect({ fileName: 'movimenti.xls', buffer: html })).toBe('excel');
  });

  it('riconosce l’HTML anche senza tag <html>', () => {
    const html = Buffer.from('<TABLE border="1"><TR><TD>01/09/2026</TD></TR></TABLE>', 'utf8');

    expect(new FileFormatDetector().detect({ fileName: 'estratto.xlsx', buffer: html })).toBe('excel');
  });
});
