// Icona scelta dall'utente per una categoria predefinita: vale solo per lui,
// non tocca il catalogo e si può togliere tornando a quella di catalogo.
const { request, createApp, registerUser, authHeader } = require('./setup');

describe('Icona delle categorie predefinite', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    ({ res: { body: { token } } } = await registerUser(app));
  });

  const imposta = (id, body, authToken = token) => request(app)
    .put(`/api/categorie/default/${id}/icona`).set(authHeader(authToken)).send(body);
  const trova = async (id, tipo, authToken = token) => {
    const res = await request(app).get('/api/categorie').set(authHeader(authToken));
    return res.body.categorie.find(c => c.id === id && c.tipo === tipo);
  };

  test('imposta e poi ripristina l\'icona di una predefinita', async () => {
    const res = await imposta('stipendio', { tipo: 'entrata', icona: 'Wallet' });
    expect(res.status).toBe(200);
    expect(await trova('stipendio', 'entrata')).toMatchObject({ icona: 'Wallet', iconaPersonalizzata: true });

    expect((await imposta('stipendio', { tipo: 'entrata', icona: null })).status).toBe(200);
    const ripristinata = await trova('stipendio', 'entrata');
    expect(ripristinata.icona).toBe('Tag');
    expect(ripristinata.iconaPersonalizzata).toBeUndefined();
  });

  test('l\'icona di un utente non cambia quella degli altri', async () => {
    await imposta('stipendio', { tipo: 'entrata', icona: 'Wallet' });
    const { res: altro } = await registerUser(app);
    expect((await trova('stipendio', 'entrata', altro.body.token)).icona).toBe('Tag');
  });

  test('rifiuta icone fuori elenco, tipi errati e categorie inesistenti', async () => {
    expect((await imposta('stipendio', { tipo: 'entrata', icona: 'NonEsiste' })).status).toBe(400);
    expect((await imposta('stipendio', { tipo: 'uscita', icona: 'Wallet' })).status).toBe(404);
    expect((await imposta('stipendio', { icona: 'Wallet' })).status).toBe(400);
    expect((await imposta('inesistente', { tipo: 'entrata', icona: 'Wallet' })).status).toBe(404);
  });
});

describe('Nome delle categorie predefinite', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    ({ res: { body: { token } } } = await registerUser(app));
  });

  const aspetto = body => request(app)
    .put('/api/categorie/default/stipendio/aspetto').set(authHeader(token)).send({ tipo: 'entrata', ...body });
  const stipendio = async () => {
    const res = await request(app).get('/api/categorie').set(authHeader(token));
    return res.body.categorie.find(c => c.id === 'stipendio' && c.tipo === 'entrata');
  };

  test('rinomina senza toccare l\'icona, poi torna al catalogo', async () => {
    await aspetto({ icona: 'Wallet' });
    expect((await aspetto({ nome: '  Busta   paga ' })).status).toBe(200);
    expect(await stipendio()).toMatchObject({ nome: 'Busta paga', nomeCatalogo: 'Stipendio', icona: 'Wallet' });

    await aspetto({ nome: null, icona: null });
    expect(await stipendio()).toMatchObject({ nome: 'Stipendio', icona: 'Tag' });
    expect((await stipendio()).nomePersonalizzato).toBeUndefined();
  });

  test('rifiuta nomi vuoti e nomi già usati da un\'altra categoria dello stesso tipo', async () => {
    expect((await aspetto({ nome: '   ' })).status).toBe(400);
    expect((await aspetto({ nome: 'Entrata extra' })).status).toBe(409);
    await request(app).post('/api/categorie').set(authHeader(token)).send({ nome: 'Paghetta', tipo: 'entrata' });
    expect((await aspetto({ nome: 'paghetta' })).status).toBe(409);
  });
});
