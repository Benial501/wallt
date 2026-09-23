// Classificazione strutturata dell'essenzialità delle spese: essenziale,
// semi_essenziale, discrezionale. Sostituisce l'euristica hardcoded
// "svago + acquisti_vari + abbigliamento" con un campo sul catalogo.
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');
const { list } = require('../services/categorie.service');
const { ESSENZIALITA_VALUES, CATEGORIE_DEFAULT } = require('../constants/categorie');

describe('Classificazione essenzialità', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  it('ogni categoria predefinita di uscita ha una essenzialita valida', () => {
    const uscite = CATEGORIE_DEFAULT.filter((c) => c.tipo === 'uscita');
    expect(uscite.length).toBeGreaterThan(0);
    uscite.forEach((c) => {
      expect(ESSENZIALITA_VALUES).toContain(c.essenzialita);
    });
  });

  it('le categorie di entrata non hanno essenzialita (non applicabile)', () => {
    const entrate = CATEGORIE_DEFAULT.filter((c) => c.tipo === 'entrata');
    entrate.forEach((c) => expect(c.essenzialita).toBeNull());
  });

  it('affitto è essenziale, svago è discrezionale', () => {
    const affitto = CATEGORIE_DEFAULT.find((c) => c.id === 'affitto' && c.tipo === 'uscita');
    const svago = CATEGORIE_DEFAULT.find((c) => c.id === 'svago' && c.tipo === 'uscita');
    expect(affitto.essenzialita).toBe('essenziale');
    expect(svago.essenzialita).toBe('discrezionale');
  });

  it('una categoria personale di uscita riceve discrezionale come default', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mia categoria', tipo: 'uscita' });

    expect(res.status).toBe(201);
    expect(res.body.categoria.essenzialita).toBe('discrezionale');
  });

  it('una categoria personale di uscita può dichiarare essenziale esplicitamente', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Rata prestito personale', tipo: 'uscita', essenzialita: 'essenziale' });

    expect(res.body.categoria.essenzialita).toBe('essenziale');
  });

  it('una categoria personale di entrata ha essenzialita null indipendentemente dal body', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mia entrata', tipo: 'entrata', essenzialita: 'essenziale' });

    expect(res.body.categoria.essenzialita).toBeNull();
  });

  it('PUT senza essenzialita nel body preserva quella esistente (non la resetta a discrezionale)', async () => {
    const createRes = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mutuo personale extra', tipo: 'uscita', essenzialita: 'essenziale' });
    expect(createRes.body.categoria.essenzialita).toBe('essenziale');
    const id = createRes.body.categoria.id;

    // Il form di modifica del frontend invia solo nome/tipo/icona/colore.
    const updateRes = await request(app)
      .put(`/api/categorie/${id}`)
      .set(authHeader(token))
      .send({ nome: 'Mutuo personale extra rinominato', tipo: 'uscita', icona: 'Tag', colore: '#3498DB' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.categoria.essenzialita).toBe('essenziale');
  });

  it('POST con essenzialita non valida viene rifiutato con 400', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Categoria strana', tipo: 'uscita', essenzialita: 'molto_essenziale' });

    expect(res.status).toBe(400);
  });

  it('PUT con essenzialita non valida viene rifiutato con 400 e non altera il valore salvato', async () => {
    const createRes = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Bollette secondarie extra', tipo: 'uscita', essenzialita: 'semi_essenziale' });
    const id = createRes.body.categoria.id;

    const updateRes = await request(app)
      .put(`/api/categorie/${id}`)
      .set(authHeader(token))
      .send({ nome: 'Bollette secondarie extra', tipo: 'uscita', essenzialita: 'molto_essenziale' });

    expect(updateRes.status).toBe(400);

    const categorie = await list(userId);
    const invariata = categorie.find((c) => c.id === id);
    expect(invariata.essenzialita).toBe('semi_essenziale');
  });

  it('list(userId) restituisce essenzialita sia per predefinite sia per personali', async () => {
    await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Extra', tipo: 'uscita', essenzialita: 'semi_essenziale' });

    const categorie = await list(userId);
    const predefinita = categorie.find((c) => c.id === 'cibo_spesa' && c.tipo === 'uscita');
    const personale = categorie.find((c) => c.nome === 'Extra');

    expect(predefinita.essenzialita).toBe('essenziale');
    expect(personale.essenzialita).toBe('semi_essenziale');
  });
});

describe('Personalizzazione essenzialità delle categorie predefinite (per utente)', () => {
  let app;
  let tokenA;
  let tokenB;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const a = await registerUser(app);
    tokenA = a.res.body.token;
    const b = await registerUser(app);
    tokenB = b.res.body.token;
  });

  it('personalizza l\'essenzialità di una predefinita solo per chi la modifica', async () => {
    const res = await request(app)
      .put('/api/categorie/default/svago/essenzialita')
      .set(authHeader(tokenA))
      .send({ essenzialita: 'essenziale' });

    expect(res.status).toBe(200);
    expect(res.body.categoria.essenzialita).toBe('essenziale');
    expect(res.body.categoria.essenzialitaPersonalizzata).toBe(true);

    const listaA = await request(app).get('/api/categorie').set(authHeader(tokenA));
    const listaB = await request(app).get('/api/categorie').set(authHeader(tokenB));
    const svagoA = listaA.body.categorie.find((c) => c.id === 'svago' && c.tipo === 'uscita');
    const svagoB = listaB.body.categorie.find((c) => c.id === 'svago' && c.tipo === 'uscita');

    expect(svagoA.essenzialita).toBe('essenziale');
    expect(svagoB.essenzialita).toBe('discrezionale'); // valore di catalogo, invariato
  });

  it('il catalogo globale non cambia: una nuova registrazione vede ancora il default', async () => {
    await request(app)
      .put('/api/categorie/default/svago/essenzialita')
      .set(authHeader(tokenA))
      .send({ essenzialita: 'essenziale' });

    const svago = CATEGORIE_DEFAULT.find((c) => c.id === 'svago' && c.tipo === 'uscita');
    expect(svago.essenzialita).toBe('discrezionale');
  });

  it('essenzialita: null rimuove la personalizzazione e torna al valore di catalogo', async () => {
    await request(app)
      .put('/api/categorie/default/svago/essenzialita')
      .set(authHeader(tokenA))
      .send({ essenzialita: 'essenziale' });

    const res = await request(app)
      .put('/api/categorie/default/svago/essenzialita')
      .set(authHeader(tokenA))
      .send({ essenzialita: null });

    expect(res.status).toBe(200);
    expect(res.body.categoria.essenzialita).toBe('discrezionale');
    expect(res.body.categoria.essenzialitaPersonalizzata).toBeUndefined();
  });

  it('un valore non valido viene rifiutato con 400', async () => {
    const res = await request(app)
      .put('/api/categorie/default/svago/essenzialita')
      .set(authHeader(tokenA))
      .send({ essenzialita: 'molto_essenziale' });

    expect(res.status).toBe(400);
  });

  it('404 su una categoria predefinita inesistente o di tipo entrata', async () => {
    const inesistente = await request(app)
      .put('/api/categorie/default/id_che_non_esiste/essenzialita')
      .set(authHeader(tokenA))
      .send({ essenzialita: 'essenziale' });
    expect(inesistente.status).toBe(404);

    const entrata = await request(app)
      .put('/api/categorie/default/stipendio/essenzialita')
      .set(authHeader(tokenA))
      .send({ essenzialita: 'essenziale' });
    expect(entrata.status).toBe(404);
  });

  it('la personalizzazione si propaga al fondo di sicurezza (svago riclassificato entra tra le essenziali)', async () => {
    const contoRes = await request(app).post('/api/conti').set(authHeader(tokenA)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 10000 });
    const contoId = contoRes.body.conto.id;
    const meseScorso = new Date();
    meseScorso.setMonth(meseScorso.getMonth() - 1);
    const data = `${meseScorso.toISOString().slice(0, 7)}-01`;

    await request(app)
      .put('/api/categorie/default/svago/essenzialita')
      .set(authHeader(tokenA))
      .send({ essenzialita: 'essenziale' });
    await request(app).post('/api/movimenti').set(authHeader(tokenA)).send({
      conto_id: contoId, tipo: 'uscita', importo: 300, categoria: 'svago', data,
    });

    const fondoRes = await request(app)
      .post('/api/obiettivi')
      .set(authHeader(tokenA))
      .send({ nome: 'Fondo', importo_target: 10000, tipo_obiettivo: 'fondo_sicurezza' });
    const copertura = await request(app)
      .get(`/api/obiettivi/${fondoRes.body.obiettivo.id}/copertura`)
      .set(authHeader(tokenA));

    // 300€ nell'unico mese completo osservato: senza la personalizzazione
    // 'svago' sarebbe discrezionale e spese_essenziali_mensili sarebbe 0.
    // (stato 'non_calcolabile').
    expect(copertura.body.stato).toBe('disponibile');
    expect(copertura.body.spese_essenziali_mensili).toBe(300);
  });
});

describe('aggregaPerEssenzialita — non_classificata invece del fallback a discrezionale', () => {
  const { aggregaPerEssenzialita, getEssenzialita, NON_CLASSIFICATA } = require('../services/essenzialita.service');

  const categorieUscita = [
    { id: 'affitto', tipo: 'uscita', essenzialita: 'essenziale' },
    { id: 'svago', tipo: 'uscita', essenzialita: 'discrezionale' },
    { id: 'corrotta', tipo: 'uscita', essenzialita: 'valore_non_valido' },
    { id: 'null_esplicito', tipo: 'uscita', essenzialita: null },
  ];

  it('una categoria non trovata (id orfano) è non_classificata, non discrezionale', () => {
    expect(getEssenzialita('id_inesistente', categorieUscita)).toBe(NON_CLASSIFICATA);
  });

  it('una categoria trovata ma con essenzialita non valida è non_classificata', () => {
    expect(getEssenzialita('corrotta', categorieUscita)).toBe(NON_CLASSIFICATA);
  });

  it('una categoria trovata con essenzialita null è non_classificata', () => {
    expect(getEssenzialita('null_esplicito', categorieUscita)).toBe(NON_CLASSIFICATA);
  });

  it('una categoria valida resta classificata normalmente', () => {
    expect(getEssenzialita('affitto', categorieUscita)).toBe('essenziale');
    expect(getEssenzialita('svago', categorieUscita)).toBe('discrezionale');
  });

  it('i quattro gruppi si riconciliano sempre con il totale', () => {
    const totali = {
      affitto: 800, svago: 120, corrotta: 50, null_esplicito: 30, id_inesistente: 15,
    };
    const risultato = aggregaPerEssenzialita(totali, categorieUscita);

    expect(risultato).toEqual({
      essenziale: 800,
      semi_essenziale: 0,
      discrezionale: 120,
      non_classificata: 95, // 50 + 30 + 15: mai silenziosamente in discrezionale
      totale: 1015,
    });
  });

  it('nessuna categoria non classificata: il quarto gruppo resta a zero, non manca', () => {
    const risultato = aggregaPerEssenzialita({ affitto: 800, svago: 120 }, categorieUscita);
    expect(risultato.non_classificata).toBe(0);
    expect(risultato.totale).toBe(920);
  });
});

describe('Sostituzione euristica hardcoded in getSuggerimenti', () => {
  let app;
  let token;
  const oggi = () => new Date().toISOString().split('T')[0];

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('una categoria personale discrezionale entra nel calcolo esattamente come le predefinite', async () => {
    const { Conto, Movimento } = require('./setup');
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 1000 });
    const contoId = contoRes.body.conto.id;

    const catRes = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mio hobby', tipo: 'uscita', essenzialita: 'discrezionale' });
    const categoriaId = catRes.body.categoria.id;

    // 40% del totale in una categoria discrezionale personale, sopra la soglia del 30%.
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 40, categoria: categoriaId, data: oggi(),
    });
    await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 60, categoria: 'affitto', data: oggi(),
    });

    const res = await request(app).get('/api/analisi/suggerimenti').set(authHeader(token));
    const info = res.body.suggerimenti.find((s) => s.tipo === 'info' && s.messaggio?.includes('non essenziale'));

    expect(info).toBeDefined();
    expect(info.messaggio).toContain('40%');
  });
});
