const { createApp, registerUser, request, authHeader } = require('./setup');
const Matcher = require('../services/import/CategoryMatcherService');
const Learning = require('../services/import/CategoryLearningService');
const { CategorieRegola } = require('../models');
const app = createApp();
let userId; let token; let matcher;
beforeEach(async () => {
  const account = (await registerUser(app)).res.body;
  userId = account.user.id; token = account.token;
  Matcher.clearUserCache();
  matcher = new Matcher();
});
const match = (descrizione, tipo = 'uscita', extra = {}) => matcher.match({ userId, transaction: { descrizione, tipo, importo: 15, ...extra } });
test.each([
  ['PAYPAL *NETFLIX.COM', 'streaming'], ['POS 1234 AMAZON EU SARL 01/09', 'shopping_online'],
  ['AMZN MKTP IT', 'shopping_online'], ['ESSELUNGA', 'supermercato'], ['SPOTIFY', 'musica'],
  ['TIM', 'telefono'], ['ENI STAZIONE SERVIZIO', 'benzina'], ['ENI PLENITUDE BOLLETTA GAS', 'gas'],
])('merchant e contesto: %s', async (description, category) => {
  const result = await match(description);
  expect(result.categoria).toBe(category);
  expect(result.confidenza).toBeGreaterThanOrEqual(75);
});
test.each(['OPTIMUM SRL', 'ENI', 'XYZQ 91828', 'PAGAMENTO POS', ''])('ambiguità non forzata: %s', async description => {
  expect((await match(description)).categoria).toBe('da_verificare');
});
test('correzione personale ha precedenza anche su Revolut, aggiorna la stessa regola', async () => {
  const learned = new Learning();
  await learned.learnRule({ userId, descrizione: 'AMAZON PRIME', tipo: 'uscita', categoria: 'abbonamenti_digitali' });
  expect((await match('AMAZON PRIME 01/09', 'uscita', { revolutCategory: 'shopping' })).categoria).toBe('abbonamenti_digitali');
  expect((await match('AMAZON EU')).categoria).toBe('shopping_online');
  await learned.learnRule({ userId, descrizione: 'AMAZON PRIME', tipo: 'uscita', categoria: 'streaming' });
  expect(await CategorieRegola.count({ where: { user_id: userId } })).toBe(1);
  expect((await match('AMAZON PRIME')).categoria).toBe('streaming');
});
test('apprendimento categoria personale e isolamento utenti', async () => {
  const res = await request(app).post('/api/categorie').set(authHeader(token)).send({ nome: 'Formula 1', tipo: 'uscita' });
  expect(res.status).toBe(201);
  await new Learning().learnRule({ userId, descrizione: 'F1 TV PRO', tipo: 'uscita', categoria: res.body.categoria.id });
  expect((await match('F1 TV PRO')).categoria).toBe(res.body.categoria.id);
  const other = (await registerUser(app)).res.body.user.id;
  expect((await matcher.match({ userId: other, transaction: { tipo: 'uscita', descrizione: 'F1 TV PRO' } })).categoria).not.toBe(res.body.categoria.id);
});
test.each(['PRELIEVO ATM', 'VERSAMENTO CONTANTI', 'GIROCONTO TRA CONTI'])('movimenti di denaro richiedono verifica: %s', async description => {
  const result = await match(description);
  expect(result.categoria).toBe('da_verificare');
  expect(result.requiresTransferReview).toBe(true);
});
test('AI opzionale sceglie solo categorie disponibili e non forza bassa confidenza', async () => {
  const { User } = require('../models');
  await User.update({ use_ai_categorization: true }, { where: { id: userId } });
  const ai = { isEnabled: () => true, classifyBatch: async () => [
    { clientTxId: 'a', categoria: 'categoria_inventata', confidenza: 99 },
    { clientTxId: 'b', categoria: 'shopping_online', confidenza: 40 },
    { clientTxId: 'c', categoria: 'shopping_online', confidenza: 90, source: 'openai' },
  ] };
  const engine = new Matcher({ openAI: ai });
  const result = await engine.matchBatch({ userId, transactions: ['a','b','c'].map(clientTxId => ({ clientTxId, tipo: 'uscita', descrizione: 'XYZQ TESTQ', importo: 12 })) });
  expect(result.map(r => r.categoria)).toEqual(['da_verificare', 'da_verificare', 'shopping_online']);
});
test('archiviazione impedisce il riuso automatico della regola', async () => {
  const cat = (await request(app).post('/api/categorie').set(authHeader(token)).send({ nome: 'Formula 1', tipo: 'uscita' })).body.categoria;
  await new Learning().learnRule({ userId, descrizione: 'F1 TV PRO', categoria: cat.id, tipo: 'uscita' });
  await request(app).delete(`/api/categorie/${cat.id}`).set(authHeader(token));
  expect((await match('F1 TV PRO')).categoria).toBe('da_verificare');
});
test('correzioni concorrenti non duplicano regole personali', async () => {
  const learning = new Learning();
  await Promise.all(Array.from({ length: 4 }, () => learning.learnRule({ userId, descrizione: 'NETFLIX.COM', categoria: 'abbonamenti_digitali', tipo: 'uscita' })));
  expect(await CategorieRegola.count({ where: { user_id: userId, tipo: 'uscita' } })).toBe(1);
});
test('parser risposta OpenAI scarta ID e categorie non ammessi', async () => {
  const OpenAI = require('../services/import/category/OpenAICategoryClassifier');
  const ai = new OpenAI(); ai.enabled = true; ai.apiKey = 'test-key';
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [
    { id: 'a', categoria: 'foreign_custom', confidenza: 99 },
    { id: 'ghost', categoria: 'streaming', confidenza: 99 },
    { id: 'b', categoria: 'musica', confidenza: 20 },
  ] }) } }] }) }));
  try {
    const result = await ai.classifyBatch([{ clientTxId: 'a', tipo: 'uscita', descrizione: 'A' }, { clientTxId: 'b', tipo: 'uscita', descrizione: 'B' }], { useAiCategorization: true });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ categoria: 'da_verificare', confidenza: 0 });
    expect(result[1]).toMatchObject({ categoria: 'musica', confidenza: 20 });
    expect(await ai.classifyBatch([{ clientTxId: 'a' }], { useAiCategorization: false })).toEqual([]);
  } finally { global.fetch = originalFetch; }
});

// L'asset frontend è generato da sync-category-catalog.js e distribuisce il
// catalogo già arricchito con il flag `sistema`, lo stesso che l'API serve.
// Il confronto con CATEGORIE_DEFAULT (non con il JSON grezzo) continua a
// fallire se qualcuno modifica il catalogo senza rigenerare l'asset.
test('cataloghi distribuiti frontend e backend sono identici', () => {
  expect(require('../../client/src/data/categorie.generated.json'))
    .toEqual(require('../constants/categorie').CATEGORIE_DEFAULT);
});

// L'AI locale e il matcher legacy avevano un tetto di confidenza sotto la
// soglia di accettazione: producevano una categoria che veniva poi sempre
// scartata, e quasi tutto finiva in "da verificare".
test.each([
  ['ADDEBITO SDD ENEL ENERGIA', 'bollette'],
  ['PAGAMENTO POS AUTOGRILL A1', 'benzina_trasporti'],
])('lo stadio AI locale puo assegnare una categoria: %s', async (descrizione, categoria) => {
  const result = await match(descrizione);
  expect(result.source).toBe('ai_local');
  expect(result.categoria).toBe(categoria);
  expect(result.confidenza).toBeGreaterThanOrEqual(75);
});

test('un match legacy debole non impedisce piu allo stadio successivo di decidere', async () => {
  const result = await match('ADDEBITO SDD ENEL ENERGIA');
  expect(result.source).toBe('ai_local');
  expect(result.categoria).not.toBe('da_verificare');
});

// Coda lunga degli estratti conto reali: marchi corti e inequivocabili, nomi
// di piccole attività italiane e pagamenti fra persone. Prima finivano quasi
// tutti in "da verificare".
test.each([
  ['Nivro', 'svago'], ['Tsf', 'svago'], ['Jmt', 'svago'], ['Duplex', 'svago'],
  ['Glass Globe', 'svago'], ['Mistic Sf', 'svago'], ['G&s Srls', 'svago'],
  ['SNAI', 'deposito_scommesse'], ['Sisal', 'deposito_scommesse'],
  ['Zara', 'abbigliamento'], ['Vinted', 'marketplace'], ['Temu', 'marketplace'],
  ['PlayStation', 'videogiochi'], ['Nintendo', 'videogiochi'],
  ['Anthropic', 'abbonamenti_digitali'], ['Aruba.it', 'abbonamenti_digitali'],
  ['Bolt', 'taxi'], ['UCI Cinemas', 'cinema'], ['BILLA', 'supermercato'],
  ['Risparmio Casa', 'prodotti_casa'], ['MYPROTEIN', 'benessere'],
  ['Gelateria Ballerini Snc', 'bar'], ['Gelatando', 'bar'],
  ['Pasticceria Catania', 'bar'], ['Cornetteria Notturna', 'bar'],
  ['Caffe Supreme', 'bar'], ['A Tutto Yogurt Di Pagno', 'bar'],
  ['Barberzone Di Rossi', 'parrucchiere'], ['Piscina Parco Dei Renai', 'sport'],
  ['A.s.d. Grevigiana', 'sport'], ['La Botteghina Di Lecor', 'supermercato'],
  ['Minimarket', 'supermercato'], ['Pagamento a favore di NICOLE B', 'trasferimento_denaro'],
])('coda lunga estratti conto: %s', async (descrizione, categoria) => {
  const result = await match(descrizione);
  expect(result.categoria).toBe(categoria);
  expect(result.confidenza).toBeGreaterThanOrEqual(75);
});

test('pagamenti ricevuti e ricariche sono entrate, non spese', async () => {
  expect((await match('Pagamento da parte di NICOLE B', 'entrata')).categoria).toBe('trasferimenti_ricevuti');
  expect((await match('Ricarica di Apple Pay con *0521', 'entrata')).categoria).toBe('trasferimenti_ricevuti');
  expect((await match('Ricompensa per la campagna di inviti', 'entrata')).categoria).toBe('cashback');
});

test('il giroconto verso il conto deposito resta un movimento fra conti', async () => {
  const result = await match('A EUR Conto deposito senza vincoli');
  expect(result.requiresTransferReview).toBe(true);
  expect(result.natura).toBe('deposito');
});

test('i nomi opachi non vengono forzati in una categoria', async () => {
  for (const d of ['Vezzosi S.n.c.', 'Idella S.n.c. Di Gioel', 'Original Souvenir', 'Xqz 8817']) {
    expect((await match(d)).categoria).toBe('da_verificare');
  }
});
