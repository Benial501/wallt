// Confronto e andamento patrimonio: i due endpoint che seguono il periodo
// scelto nella pagina Analisi. Il calcolo degli intervalli e' testato da solo
// in confrontoPeriodi.test.js; qui si verifica che l'API li usi davvero, che
// i totali finiscano nel periodo giusto e che i parametri della versione
// precedente continuino a funzionare durante un rilascio.
const {
  createApp, request, registerUser, authHeader, Conto, Movimento,
} = require('./setup');

const app = createApp();
let token; let userId; let contoId;

// Le date si costruiscono a partire da oggi: i periodi sono relativi al
// momento della richiesta, quindi fissare una data qui li farebbe cadere
// fuori dalla finestra restituita dall'API.
const oggi = new Date();
const annoCorrente = oggi.getFullYear();
const meseCorrente = oggi.getMonth() + 1;

const iso = (anno, mese, giorno) => (
  `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
);

beforeEach(async () => {
  const account = (await registerUser(app)).res.body;
  token = account.token;
  userId = account.user.id;
  const conto = await Conto.create({
    user_id: userId, nome: 'Principale', tipo: 'conto_corrente', saldo: 1000, attivo: true,
  });
  contoId = conto.id;
});

const creaMovimento = (tipo, importo, data) => Movimento.create({
  user_id: userId,
  conto_id: contoId,
  tipo,
  categoria: tipo === 'entrata' ? 'stipendio' : 'supermercato',
  importo,
  data,
  descrizione: 'test',
});

describe('GET /api/analisi/confronto-mesi', () => {
  it('confronta i mesi per impostazione predefinita', async () => {
    const res = await request(app)
      .get('/api/analisi/confronto-mesi')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.unita).toBe('mese');
    expect(res.body.mesi).toHaveLength(6);
  });

  it('confronta le settimane quando richiesto, con un periodo per settimana', async () => {
    const res = await request(app)
      .get('/api/analisi/confronto-mesi?unita=settimana&quantita=4')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.unita).toBe('settimana');
    expect(res.body.mesi).toHaveLength(4);
    // Sette giorni per periodo, senza buchi né sovrapposizioni fra uno e l'altro.
    res.body.mesi.forEach((p) => {
      const giorni = (new Date(p.a) - new Date(p.da)) / 86400000;
      expect(giorni).toBe(6);
    });
  });

  it('confronta gli anni quando richiesto', async () => {
    const res = await request(app)
      .get('/api/analisi/confronto-mesi?unita=anno&quantita=3')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.unita).toBe('anno');
    expect(res.body.mesi.map((p) => p.label)).toEqual([
      String(annoCorrente - 2), String(annoCorrente - 1), String(annoCorrente),
    ]);
  });

  it('somma entrate e uscite nel periodo che le contiene', async () => {
    await creaMovimento('entrata', 1500, iso(annoCorrente, meseCorrente, 3));
    await creaMovimento('uscita', 200, iso(annoCorrente, meseCorrente, 4));

    const res = await request(app)
      .get('/api/analisi/confronto-mesi?unita=mese&quantita=2')
      .set(authHeader(token));

    const corrente = res.body.mesi[res.body.mesi.length - 1];
    expect(corrente).toMatchObject({ entrate: 1500, uscite: 200, saldo: 1300 });
  });

  it('esclude i trasferimenti, che non sono né spesa né entrata', async () => {
    await Movimento.create({
      user_id: userId,
      conto_id: contoId,
      tipo: 'trasferimento',
      categoria: null,
      importo: 999,
      data: iso(annoCorrente, meseCorrente, 5),
      descrizione: 'giro interno',
    });

    const res = await request(app)
      .get('/api/analisi/confronto-mesi?unita=mese&quantita=2')
      .set(authHeader(token));

    const corrente = res.body.mesi[res.body.mesi.length - 1];
    expect(corrente).toMatchObject({ entrate: 0, uscite: 0 });
  });

  it('con da e a copre i mesi dell’intervallo, ignorando unita e quantita', async () => {
    const res = await request(app)
      .get(`/api/analisi/confronto-mesi?unita=anno&quantita=12&da=${iso(annoCorrente, 1, 10)}&a=${iso(annoCorrente, 3, 5)}`)
      .set(authHeader(token));

    expect(res.body.unita).toBe('mese');
    expect(res.body.mesi).toHaveLength(3);
  });

  it('accetta ancora il parametro `mesi` del client precedente', async () => {
    const res = await request(app)
      .get('/api/analisi/confronto-mesi?mesi=3')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.mesi).toHaveLength(3);
  });

  it('rifiuta un’unità sconosciuta e una quantità fuori scala', async () => {
    const unita = await request(app)
      .get('/api/analisi/confronto-mesi?unita=decennio')
      .set(authHeader(token));
    expect(unita.status).toBe(400);

    const quantita = await request(app)
      .get('/api/analisi/confronto-mesi?unita=mese&quantita=99')
      .set(authHeader(token));
    expect(quantita.status).toBe(400);
  });

  it('non è raggiungibile senza autenticazione', async () => {
    const res = await request(app).get('/api/analisi/confronto-mesi');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/analisi/andamento-patrimonio', () => {
  it('restituisce un punto per periodo, con la stessa unità del confronto', async () => {
    const res = await request(app)
      .get('/api/analisi/andamento-patrimonio?unita=settimana&quantita=5')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.unita).toBe('settimana');
    expect(res.body.punti).toHaveLength(5);
  });

  it('l’ultimo punto vale il patrimonio di oggi', async () => {
    const res = await request(app)
      .get('/api/analisi/andamento-patrimonio?unita=mese&quantita=3')
      .set(authHeader(token));

    const ultimo = res.body.punti[res.body.punti.length - 1];
    expect(ultimo.patrimonio).toBe(1000);
    expect(res.body.fine).toBe(1000);
  });

  it('ricostruisce a ritroso il patrimonio prima dei movimenti del periodo', async () => {
    // Il saldo del conto (1000) e' quello di adesso e comprende gia' questa
    // entrata: il mese precedente deve quindi valere 1000 - 400.
    await creaMovimento('entrata', 400, iso(annoCorrente, meseCorrente, 2));

    const res = await request(app)
      .get('/api/analisi/andamento-patrimonio?unita=mese&quantita=2')
      .set(authHeader(token));

    expect(res.body.punti.map((p) => p.patrimonio)).toEqual([600, 1000]);
    expect(res.body.variazione_importo).toBe(400);
  });

  it('accetta ancora il parametro `periodo` del client precedente', async () => {
    const res = await request(app)
      .get('/api/analisi/andamento-patrimonio?periodo=3m')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.punti).toHaveLength(3);
  });

  it('non è raggiungibile senza autenticazione', async () => {
    const res = await request(app).get('/api/analisi/andamento-patrimonio');
    expect(res.status).toBe(401);
  });
});
