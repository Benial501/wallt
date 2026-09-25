// Schema e semantica di base delle due colonne introdotte dal saldo effettivo:
// conti.nascosto (un conto che resta nel patrimonio ma non fra i soldi
// spendibili) e movimenti.ricorrente_data (la data di una spesa programmata
// una tantum).
const {
  registerUser, createApp, Conto, Movimento, request, authHeader,
} = require('./setup');
const { Obiettivo } = require('../models');
const { calcolaLiquidita } = require('../services/liquidita.service');
const { processaRicorrenti } = require('../services/ricorrenti.service');

describe('Colonne del saldo effettivo', () => {
  let userId;
  let conto;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('un conto nasce visibile: nascosto è false, mai null', async () => {
    expect(conto.nascosto).toBe(false);
  });

  it('un conto può essere nascosto e resta tale dopo il reload', async () => {
    await conto.update({ nascosto: true });
    const riletto = await Conto.findByPk(conto.id);
    expect(riletto.nascosto).toBe(true);
  });

  it('una spesa programmata salva frequenza una_tantum e la sua data', async () => {
    const spesa = await Movimento.create({
      user_id: userId,
      conto_id: conto.id,
      tipo: 'uscita',
      importo: 300,
      categoria: 'altro_uscita',
      descrizione: 'Concerto',
      data: '2026-09-25',
      ricorrente: true,
      ricorrente_frequenza: 'una_tantum',
      ricorrente_data: '2026-10-10',
    });
    const riletta = await Movimento.findByPk(spesa.id);
    expect(riletta.ricorrente_frequenza).toBe('una_tantum');
    expect(riletta.ricorrente_data).toBe('2026-10-10');
  });
});

describe('Saldo effettivo: conti nascosti', () => {
  let userId;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    await Conto.create({
      user_id: userId, nome: 'Quotidiano', tipo: 'banca', saldo: 1000, attivo: true,
    });
    await Conto.create({
      user_id: userId, nome: 'Risparmi', tipo: 'risparmio', saldo: 5000, attivo: true, nascosto: true,
    });
  });

  it('il conto nascosto resta nel saldo conti ma esce dal saldo effettivo', async () => {
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_conti).toBe(6000);
    expect(r.saldo_conti_nascosti).toBe(5000);
    expect(r.saldo_effettivo).toBe(1000);
  });

  it('un obiettivo non completato abbassa il saldo effettivo', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 800, importo_attuale: 200, completato: false,
    });
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_effettivo).toBe(800);
  });

  it('i conti nascosti escono anche dal capitale allocabile di Piano Smart', async () => {
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.liquidita_allocabile).toBe(1000);
    // liquidita_libera conserva il significato di prima: tutti i conti attivi.
    expect(r.liquidita_libera).toBe(6000);
  });
});

describe('Saldo effettivo: spese programmate', () => {
  let userId;
  let conto;

  const programmata = (data, importo = 300) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo,
    categoria: 'altro_uscita',
    descrizione: 'Concerto',
    data: '2026-09-25',
    ricorrente: true,
    stato_ricorrenza: 'attiva',
    ricorrente_frequenza: 'una_tantum',
    ricorrente_data: data,
  });

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('una spesa programmata entro 30 giorni abbassa il saldo effettivo', async () => {
    await programmata('2026-10-10');
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.impegni_pertinenti).toBe(300);
    expect(r.saldo_effettivo).toBe(700);
    expect(r.impegni[0].tipo).toBe('programmata');
    expect(r.impegni[0].data).toBe('2026-10-10');
  });

  it('una spesa programmata oltre 30 giorni non pesa ancora', async () => {
    await programmata('2026-12-01');
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.impegni_pertinenti).toBe(0);
    expect(r.saldo_effettivo).toBe(1000);
  });

  it('una spesa programmata con data passata e mai addebitata pesa comunque', async () => {
    await programmata('2026-09-20');
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_effettivo).toBe(700);
  });

  it('una spesa programmata già addebitata non pesa due volte', async () => {
    const spesa = await programmata('2026-10-10');
    await Movimento.create({
      user_id: userId,
      conto_id: conto.id,
      tipo: 'uscita',
      importo: 300,
      categoria: 'altro_uscita',
      descrizione: 'Concerto (automatico)',
      data: '2026-10-10',
      ricorrente: false,
      ricorrenza_origine_id: spesa.id,
      ricorrenza_periodo: '2026-10-10',
    });
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.impegni_pertinenti).toBe(0);
  });

  it('una spesa programmata terminata non blocca più denaro', async () => {
    const spesa = await programmata('2026-10-10');
    await spesa.update({ stato_ricorrenza: 'terminata' });
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_effettivo).toBe(1000);
  });
});

describe('Validazione delle spese programmate', () => {
  let app;
  let token;
  let conto;

  const corpo = (extra) => ({
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 300,
    categoria: 'altro_uscita',
    descrizione: 'Concerto',
    data: '2026-09-25',
    ricorrente: true,
    ...extra,
  });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    conto = await Conto.create({
      user_id: res.body.user.id, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('accetta una spesa programmata con la sua data', async () => {
    const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'una_tantum', ricorrente_data: domani }));
    expect(res.status).toBe(201);
    expect(res.body.movimento.ricorrente_data).toBe(domani);
  });

  it('rifiuta una spesa programmata senza data', async () => {
    const res = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'una_tantum' }));
    expect(res.status).toBe(400);
  });

  it('rifiuta una data programmata su una frequenza periodica', async () => {
    const res = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'mensile', ricorrente_giorno: 5, ricorrente_data: '2026-10-10' }));
    expect(res.status).toBe(400);
  });

  it('rifiuta una spesa programmata nel passato', async () => {
    const res = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'una_tantum', ricorrente_data: '2020-01-01' }));
    expect(res.status).toBe(400);
  });

  it('PUT accetta di spostare una spesa programmata a una data passata (corregge un promemoria non ancora chiuso)', async () => {
    const creato = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-10-10' }));
    const res = await request(app)
      .put(`/api/movimenti/${creato.body.movimento.id}`)
      .set(authHeader(token))
      .send({ ricorrente: true, ricorrente_frequenza: 'una_tantum', ricorrente_data: '2020-01-01' });
    expect(res.status).toBe(200);
    expect(res.body.movimento.ricorrente_data).toBe('2020-01-01');
  });

  it('PUT rifiuta di portare la frequenza a una_tantum senza ricorrente_data', async () => {
    const creato = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'mensile', ricorrente_giorno: 5 }));
    const res = await request(app)
      .put(`/api/movimenti/${creato.body.movimento.id}`)
      .set(authHeader(token))
      .send({ ricorrente: true, ricorrente_frequenza: 'una_tantum' });
    expect(res.status).toBe(400);
  });

  it('PUT pulisce il campo della frequenza abbandonata in entrambe le direzioni', async () => {
    const programmata = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-10-10' }));
    const resAMensile = await request(app)
      .put(`/api/movimenti/${programmata.body.movimento.id}`)
      .set(authHeader(token))
      .send({ ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 5 });
    expect(resAMensile.status).toBe(200);
    expect(resAMensile.body.movimento.ricorrente_data).toBeNull();

    const periodica = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'mensile', ricorrente_giorno: 5 }));
    const resAUnaTantum = await request(app)
      .put(`/api/movimenti/${periodica.body.movimento.id}`)
      .set(authHeader(token))
      .send({ ricorrente: true, ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-10-10' });
    expect(resAUnaTantum.status).toBe(200);
    expect(resAUnaTantum.body.movimento.ricorrente_giorno).toBeNull();
  });
});

describe('API conti: nascondi conto', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('crea un conto nascosto e lo restituisce come tale', async () => {
    const creato = await request(app).post('/api/conti').set(authHeader(token))
      .send({ nome: 'Risparmi', tipo: 'risparmio', saldo_iniziale: 500, nascosto: true });
    expect(creato.status).toBe(201);
    expect(creato.body.conto.nascosto).toBe(true);

    const elenco = await request(app).get('/api/conti').set(authHeader(token));
    expect(elenco.body.conti.find((c) => c.nome === 'Risparmi').nascosto).toBe(true);
  });

  it('nasconde e riespone un conto esistente', async () => {
    const creato = await request(app).post('/api/conti').set(authHeader(token))
      .send({ nome: 'Quotidiano', tipo: 'banca', saldo_iniziale: 100 });
    const id = creato.body.conto.id;
    expect(creato.body.conto.nascosto).toBe(false);

    const nascosto = await request(app).put(`/api/conti/${id}`).set(authHeader(token))
      .send({ nascosto: true });
    expect(nascosto.status).toBe(200);
    expect(nascosto.body.conto.nascosto).toBe(true);

    const riesposto = await request(app).put(`/api/conti/${id}`).set(authHeader(token))
      .send({ nascosto: false });
    expect(riesposto.body.conto.nascosto).toBe(false);
  });

  it('rifiuta un valore non booleano', async () => {
    const res = await request(app).post('/api/conti').set(authHeader(token))
      .send({ nome: 'Strano', tipo: 'banca', nascosto: 'forse' });
    expect(res.status).toBe(400);
  });
});

describe('GET /conti/patrimonio: saldo effettivo', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  it('espone il saldo effettivo accanto al patrimonio, con il suo dettaglio', async () => {
    await Conto.create({ user_id: userId, nome: 'Quotidiano', tipo: 'banca', saldo: 1000, attivo: true });
    await Conto.create({ user_id: userId, nome: 'Risparmi', tipo: 'risparmio', saldo: 5000, attivo: true, nascosto: true });
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 800, importo_attuale: 200, completato: false,
    });

    const res = await request(app).get('/api/conti/patrimonio').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totale).toBe(6000);
    expect(res.body.saldo_effettivo).toBe(800);
    expect(res.body.saldo_effettivo_dettaglio).toEqual({
      conti_visibili: 1000,
      conti_nascosti: 5000,
      obiettivi: 200,
      impegni: 0,
    });
  });
});

// Una spesa programmata (ricorrente + frequenza 'una_tantum') è una PROMESSA,
// non un movimento avvenuto: il denaro esce dal conto solo quando il cron la
// materializza alla sua data. Queste prove guardano il saldo attraverso
// l'API reale (POST/PUT/DELETE /api/movimenti), che è il punto in cui il
// difetto viveva: i test del cron in ricorrenti.test.js creano l'origine con
// Movimento.create e quindi scavalcavano il controller.
describe('Il saldo di una spesa programmata si muove una volta sola', () => {
  let app;
  let token;
  let conto;

  const fraGiorni = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  const corpo = (extra) => ({
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 300,
    categoria: 'altro_uscita',
    descrizione: 'Concerto',
    data: fraGiorni(0),
    ricorrente: true,
    ...extra,
  });

  const creaProgrammata = (data) => request(app).post('/api/movimenti').set(authHeader(token))
    .send(corpo({ ricorrente_frequenza: 'una_tantum', ricorrente_data: data }));

  const saldo = async () => {
    await conto.reload();
    return Number(conto.saldo);
  };

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    conto = await Conto.create({
      user_id: res.body.user.id, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('creare una spesa programmata non tocca il saldo del conto', async () => {
    const res = await creaProgrammata(fraGiorni(15));

    expect(res.status).toBe(201);
    expect(await saldo()).toBe(1000);
  });

  it('il saldo effettivo la conta una volta sola, non due', async () => {
    await creaProgrammata(fraGiorni(15));

    // 1000 sul conto, 300 promessi: 700 spendibili. Se la creazione avesse
    // già scalato il conto, qui si leggerebbe 400.
    const r = await calcolaLiquidita(conto.user_id);
    expect(r.saldo_conti).toBe(1000);
    expect(r.impegni_pertinenti).toBe(300);
    expect(r.saldo_effettivo).toBe(700);
  });

  it('il cron addebita alla data, una volta sola, e il saldo effettivo non cambia', async () => {
    const data = fraGiorni(15);
    await creaProgrammata(data);

    await processaRicorrenti(new Date(`${data}T12:00:00Z`));
    expect(await saldo()).toBe(700);

    // Il denaro è uscito davvero: l'impegno sparisce e lo spendibile resta 700.
    const dopo = await calcolaLiquidita(conto.user_id);
    expect(dopo.impegni_pertinenti).toBe(0);
    expect(dopo.saldo_effettivo).toBe(700);

    // Secondo passaggio dello stesso giorno: nessun doppio addebito.
    await processaRicorrenti(new Date(`${data}T12:00:00Z`));
    expect(await saldo()).toBe(700);
  });

  it('il patrimonio non cala e non inventa una variazione del mese', async () => {
    const prima = await request(app).get('/api/conti/patrimonio').set(authHeader(token));
    expect(prima.body.totale_conti).toBe(1000);
    expect(prima.body.variazione_importo).toBe(0);

    await creaProgrammata(fraGiorni(15));

    // È la lettura da cui il difetto era stato visto in browser: il conto
    // scendeva a 700 nel momento stesso in cui si programmava la spesa.
    const dopo = await request(app).get('/api/conti/patrimonio').set(authHeader(token));
    expect(dopo.body.totale_conti).toBe(1000);
    expect(dopo.body.totale).toBe(1000);
    // Solo lo spendibile scende: il patrimonio no, e il mese non registra
    // un calo per un'uscita che non è ancora avvenuta.
    expect(dopo.body.saldo_effettivo).toBe(700);
    expect(dopo.body.variazione_importo).toBe(0);
  });

  it('eliminare una spesa programmata non ancora addebitata non inventa denaro', async () => {
    const creato = await creaProgrammata(fraGiorni(15));

    const res = await request(app)
      .delete(`/api/movimenti/${creato.body.movimento.id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    // Il conto non era mai stato scalato: restituirgli 300 sarebbe denaro dal nulla.
    expect(await saldo()).toBe(1000);
  });

  // Le tre conversioni sotto sono l'altra faccia di muoveSaldo: quello che
  // conta non è la frequenza ma se la riga è una regola o un movimento
  // avvenuto. Se impattoVecchio e impattoNuovo non restassero bilanciati in
  // updateMovimento, una di queste inventerebbe o brucerebbe denaro.

  it('cambiare frequenza fra due ricorrenze non muove denaro', async () => {
    const creato = await creaProgrammata(fraGiorni(15));
    expect(await saldo()).toBe(1000);

    const res = await request(app)
      .put(`/api/movimenti/${creato.body.movimento.id}`)
      .set(authHeader(token))
      .send({ ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 5 });

    expect(res.status).toBe(200);
    // Da promessa per una data a promessa per ogni mese: resta una regola, e
    // una regola non ha ancora pagato niente.
    expect(await saldo()).toBe(1000);
  });

  it('togliere la ricorrenza addebita il conto: da regola a movimento avvenuto', async () => {
    const creato = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente_frequenza: 'mensile', ricorrente_giorno: 5 }));
    expect(await saldo()).toBe(1000);

    const res = await request(app)
      .put(`/api/movimenti/${creato.body.movimento.id}`)
      .set(authHeader(token))
      .send({ ricorrente: false });

    expect(res.status).toBe(200);
    // Ora la riga dice "questa uscita è avvenuta": il denaro si muove.
    expect(await saldo()).toBe(700);
  });

  it('rendere ricorrente un movimento già registrato restituisce il denaro al conto', async () => {
    const creato = await request(app).post('/api/movimenti').set(authHeader(token))
      .send(corpo({ ricorrente: false }));
    expect(await saldo()).toBe(700);

    const res = await request(app)
      .put(`/api/movimenti/${creato.body.movimento.id}`)
      .set(authHeader(token))
      .send({ ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 5 });

    expect(res.status).toBe(200);
    // Da movimento avvenuto a regola: l'uscita non è più registrata come
    // accaduta, quindi il conto torna intero e sarà il cron ad addebitarla.
    expect(await saldo()).toBe(1000);
  });
});
