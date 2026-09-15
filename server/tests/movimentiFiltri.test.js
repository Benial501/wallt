// Ricerca e ordinamento sui movimenti. I casi che contano davvero sono quelli
// finali: un filtro che perde l'isolamento per utente e' un difetto di
// sicurezza, non di interfaccia, e non lo rivelerebbe un test solo funzionale.
const {
  createApp, request, registerUser, authHeader, Conto, Movimento,
} = require('./setup');

const app = createApp();
let token; let userId; let contoId;

const creaConto = async (uid) => (await Conto.create({
  user_id: uid, nome: 'Principale', tipo: 'conto_corrente', saldo: 1000, attivo: true,
})).id;

const creaMovimento = (uid, cid, descrizione, importo, overrides = {}) => Movimento.create({
  user_id: uid,
  conto_id: cid,
  tipo: 'uscita',
  categoria: 'supermercato',
  descrizione,
  importo,
  data: '2026-09-10',
  ...overrides,
});

beforeEach(async () => {
  const account = (await registerUser(app)).res.body;
  token = account.token;
  userId = account.user.id;
  contoId = await creaConto(userId);
});

const elenco = (body) => (body.gruppi || []).flatMap((g) => g.movimenti);

describe('GET /api/movimenti — ricerca testuale', () => {
  beforeEach(async () => {
    await creaMovimento(userId, contoId, 'Spesa Esselunga', 42);
    await creaMovimento(userId, contoId, 'Benzina Q8', 60);
    await creaMovimento(userId, contoId, 'Cena fuori', 35);
  });

  it('trova per sottostringa', async () => {
    const res = await request(app).get('/api/movimenti?cerca=esse').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(elenco(res.body)).toHaveLength(1);
    expect(elenco(res.body)[0].descrizione).toBe('Spesa Esselunga');
  });

  it('ignora maiuscole e minuscole', async () => {
    const res = await request(app).get('/api/movimenti?cerca=BENZINA').set(authHeader(token));
    expect(elenco(res.body)).toHaveLength(1);
  });

  it('senza risultati restituisce una lista vuota, non un errore', async () => {
    const res = await request(app).get('/api/movimenti?cerca=inesistente').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(elenco(res.body)).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('i caratteri jolly di LIKE non sono interpretati come jolly', async () => {
    // Un `%` cercato deve cercare un `%`, non "qualunque cosa".
    const res = await request(app).get('/api/movimenti?cerca=%25').set(authHeader(token));
    expect(elenco(res.body)).toHaveLength(0);
  });

  it('si combina con tipo, categoria e intervallo di date', async () => {
    await creaMovimento(userId, contoId, 'Aperitivo', 12, { categoria: 'bar_ristoranti' });
    await creaMovimento(userId, contoId, 'Spesa arretrata', 18, { data: '2026-08-31' });

    const res = await request(app)
      .get('/api/movimenti?cerca=a&tipo=uscita&categoria=supermercato&da=2026-09-01&a=2026-09-30')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(elenco(res.body).length).toBeGreaterThan(0);
    elenco(res.body).forEach((m) => {
      expect(m.tipo).toBe('uscita');
      expect(m.categoria).toBe('supermercato');
      expect(m.data >= '2026-09-01' && m.data <= '2026-09-30').toBe(true);
    });
  });
});

describe('GET /api/movimenti — ordinamento', () => {
  beforeEach(async () => {
    // Date volutamente in conflitto con gli importi: se il raggruppamento
    // riordina sempre per data, entrambi i test sotto devono accorgersene.
    await creaMovimento(userId, contoId, 'Piccola', 10, { data: '2026-09-11' });
    await creaMovimento(userId, contoId, 'Grande', 500, { data: '2026-09-12' });
    await creaMovimento(userId, contoId, 'Media', 100, { data: '2026-09-10' });
  });

  it('ordina per importo decrescente', async () => {
    const res = await request(app).get('/api/movimenti?ordine=importo_desc').set(authHeader(token));
    expect(elenco(res.body).map((m) => Number(m.importo))).toEqual([500, 100, 10]);
  });

  it('ordina per importo crescente', async () => {
    const res = await request(app).get('/api/movimenti?ordine=importo_asc').set(authHeader(token));
    expect(elenco(res.body).map((m) => Number(m.importo))).toEqual([10, 100, 500]);
  });

  it('ordine=caricamento continua a funzionare', async () => {
    const res = await request(app).get('/api/movimenti?ordine=caricamento').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(elenco(res.body)).toHaveLength(3);
  });
});

describe('GET /api/movimenti — validazione', () => {
  it('rifiuta un ordine fuori dalla whitelist', async () => {
    const res = await request(app).get('/api/movimenti?ordine=importo').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('rifiuta un tipo fuori dalla whitelist', async () => {
    const res = await request(app).get('/api/movimenti?tipo=regalo').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('rifiuta una ricerca più lunga del tetto', async () => {
    const res = await request(app)
      .get(`/api/movimenti?cerca=${'a'.repeat(101)}`)
      .set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('rifiuta una pagina non numerica', async () => {
    const res = await request(app).get('/api/movimenti?page=prima').set(authHeader(token));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/movimenti — isolamento fra utenti', () => {
  it('la ricerca non attraversa il confine fra due utenti', async () => {
    await creaMovimento(userId, contoId, 'Segreto di A', 999);

    const altro = (await registerUser(app, { email: `b${Date.now()}@example.com` })).res.body;
    const contoB = await creaConto(altro.user.id);
    await creaMovimento(altro.user.id, contoB, 'Roba di B', 1);

    const res = await request(app).get('/api/movimenti?cerca=Segreto').set(authHeader(altro.token));
    expect(res.status).toBe(200);
    expect(elenco(res.body)).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('l\'ordinamento per importo non mostra i movimenti di un altro utente', async () => {
    await creaMovimento(userId, contoId, 'Grosso di A', 10000);

    const altro = (await registerUser(app, { email: `c${Date.now()}@example.com` })).res.body;
    const contoB = await creaConto(altro.user.id);
    await creaMovimento(altro.user.id, contoB, 'Piccolo di B', 5);

    const res = await request(app)
      .get('/api/movimenti?ordine=importo_desc')
      .set(authHeader(altro.token));
    expect(elenco(res.body)).toHaveLength(1);
    expect(Number(elenco(res.body)[0].importo)).toBe(5);
  });
});
