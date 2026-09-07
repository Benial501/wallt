const { request, createApp, registerUser, authHeader, seedUserFinanceData } = require('./setup');
const app = createApp();
let a; let b;
beforeEach(async () => {
  a = (await registerUser(app)).res.body;
  b = (await registerUser(app)).res.body;
});
const create = (body) => request(app).post('/api/categorie').set(authHeader(a.token)).send(body);
const payload = { nome: 'Formula 1', tipo: 'uscita', icona: 'Tag', colore: '#123456' };
test('catalogo ampliato e default separati per tipo', async () => {
  const res = await request(app).get('/api/categorie').set(authHeader(a.token));
  expect(res.status).toBe(200);
  expect(res.body.categorie.filter(c => c.tipo === 'entrata').length).toBeGreaterThanOrEqual(15);
  expect(res.body.categorie.filter(c => c.tipo === 'uscita').length).toBeGreaterThan(60);
});
test('CRUD personale, unicità, isolamento e default immutabili', async () => {
  const res = await create(payload);
  expect(res.status).toBe(201);
  const id = res.body.categoria.id;
  expect((await create({ ...payload, nome: ' formula 1 ' })).status).toBe(409);
  const foreign = await request(app).get('/api/categorie').set(authHeader(b.token));
  expect(foreign.body.categorie.some(c => c.id === id)).toBe(false);
  expect((await request(app).put(`/api/categorie/${id}`).set(authHeader(b.token)).send({ ...payload, nome: 'Rubata' })).status).toBe(404);
  expect((await request(app).delete(`/api/categorie/${id}`).set(authHeader(b.token))).status).toBe(404);
  expect((await request(app).put(`/api/categorie/${id}`).set(authHeader(a.token)).send({ ...payload, nome: 'Motorsport' })).status).toBe(200);
  expect((await request(app).delete('/api/categorie/stipendio').set(authHeader(a.token))).status).toBe(404);
  expect((await request(app).delete(`/api/categorie/${id}`).set(authHeader(a.token))).status).toBe(200);
});
test('categorie personali nei movimenti: tipo, proprietà e storico archiviato', async () => {
  const cat = await create(payload);
  expect(cat.status).toBe(201);
  const id = cat.body.categoria.id;
  const { conto } = await seedUserFinanceData(a.user.id);
  const movimento = { tipo: 'uscita', categoria: id, importo: 10, conto_id: conto.id, data: '2026-09-07', descrizione: 'Formula 1' };
  const created = await request(app).post('/api/movimenti').set(authHeader(a.token)).send(movimento);
  expect(created.status).toBe(201);
  expect((await request(app).post('/api/movimenti').set(authHeader(a.token)).send({ ...movimento, tipo: 'entrata' })).status).toBe(400);
  await request(app).delete(`/api/categorie/${id}`).set(authHeader(a.token));
  expect((await request(app).post('/api/movimenti').set(authHeader(a.token)).send(movimento)).status).toBe(400);
  expect((await request(app).put(`/api/movimenti/${created.body.movimento.id}`).set(authHeader(a.token)).send({ descrizione: 'Storico conservato' })).status).toBe(200);
});
test('categoria entrata e validazione metadati non consentiti', async () => {
  expect((await create({ nome: 'YouTube', tipo: 'entrata' })).status).toBe(201);
  expect((await create({ ...payload, tipo: 'trasferimento' })).status).toBe(400);
  expect((await create({ ...payload, colore: 'red' })).status).toBe(400);
  expect((await create({ ...payload, icona: '<script>' })).status).toBe(400);
  expect((await request(app).post('/api/categorie').send(payload)).status).toBe(401);
});
test('non assegna categoria altrui né cambia tipo a categoria usata', async () => {
  const cat = (await create(payload)).body.categoria;
  const { conto } = await seedUserFinanceData(b.user.id);
  const body = { tipo: 'uscita', categoria: cat.id, importo: 1, conto_id: conto.id, data: '2026-09-07' };
  expect((await request(app).post('/api/movimenti').set(authHeader(b.token)).send(body)).status).toBe(400);
  const own = await seedUserFinanceData(a.user.id);
  expect((await request(app).post('/api/movimenti').set(authHeader(a.token)).send({ ...body, conto_id: own.conto.id })).status).toBe(201);
  expect((await request(app).put(`/api/categorie/${cat.id}`).set(authHeader(a.token)).send({ ...payload, tipo: 'entrata' })).status).toBe(409);
});
