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

test('cataloghi distribuiti frontend e backend sono identici', () => {
  expect(require('../../client/src/data/categorie.generated.json')).toEqual(require('../constants/catalogoCategorie.json'));
});
