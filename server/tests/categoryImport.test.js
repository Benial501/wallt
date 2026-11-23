const { createApp, registerUser, request, authHeader, seedUserFinanceData, Movimento } = require('./setup');
const ImportService = require('../services/import/ImportService');
const FileImport = require('../services/importazioni/services/ImportService');
const XLSX = require('xlsx');
const app = createApp();
let user; let conto;
beforeEach(async () => { user = (await registerUser(app)).res.body; conto = (await seedUserFinanceData(user.user.id)).conto; });
test.each(['csv', 'xlsx'])('preview %s, correzione personale e duplicati', async format => {
  const rows = [['Data', 'Descrizione', 'Importo'], ['07/09/2026', 'PAYPAL *NETFLIX.COM', '-12.99']];
  let buffer;
  if (format === 'csv') buffer = Buffer.from(rows.map(row => row.join(';')).join('\n'));
  else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Estratto');
    buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
  const engine = new FileImport();
  const preview = await engine.previewImport({ userId: user.user.id, buffer, fileName: `estratto.${format}` });
  expect(preview.items[0].categoria_suggerita).toBe('streaming');
  const cat = (await request(app).post('/api/categorie').set(authHeader(user.token)).send({ nome: 'Film personali', tipo: 'uscita' })).body.categoria;
  const row = { ...preview.items[0], conto_id: conto.id, categoria_finale: cat.id };
  const first = await engine.confirmImport({ userId: user.user.id, transactionsToImport: [row] });
  expect(first.importati).toBe(1);
  const second = await engine.confirmImport({ userId: user.user.id, transactionsToImport: [row] });
  expect(second.importati).toBe(0);
  expect(second.duplicateSaltati).toBe(1);
  const next = await new ImportService().previewImport(user.user.id, [{ data: '08/09/2026', descrizione: 'PAYPAL *NETFLIX.COM', importo: '-12.99' }]);
  expect(next.items[0].categoria_suggerita).toBe(cat.id);
});
test('conferma rifiuta categoria altrui senza creare movimenti', async () => {
  const other = (await registerUser(app)).res.body;
  const cat = (await request(app).post('/api/categorie').set(authHeader(other.token)).send({ nome: 'Privata', tipo: 'uscita' })).body.categoria;
  const engine = new ImportService();
  await expect(engine.confirmImport(user.user.id, [{ data: '2026-09-07', descrizione: 'Segreta', tipo: 'uscita', importo: 15, conto_id: conto.id, categoria_finale: cat.id }])).rejects.toMatchObject({ statusCode: 400 });
  expect(await Movimento.count({ where: { user_id: user.user.id, descrizione: 'Segreta' } })).toBe(0);
});
test('contanti non importati come spesa ordinaria', async () => {
  const engine = new ImportService();
  const preview = await engine.previewImport(user.user.id, [{ data: '2026-09-07', descrizione: 'PRELIEVO ATM', importo: '-50' }]);
  expect(preview.items[0].richiede_trasferimento).toBe(true);
  const result = await engine.confirmImport(user.user.id, [{ ...preview.items[0], categoria_finale: 'altro_uscita', conto_id: conto.id }]);
  expect(result.importati).toBe(0);
});
