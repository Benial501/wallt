const {
  createApp, request, registerUser, authHeader, Conto, Movimento,
} = require('./setup');

const app = createApp();
let token; let userId; let contoId;

beforeEach(async () => {
  const account = (await registerUser(app)).res.body;
  token = account.token;
  userId = account.user.id;
  const conto = await Conto.create({
    user_id: userId, nome: 'Principale', tipo: 'conto_corrente', saldo: 0, attivo: true,
  });
  contoId = conto.id;
});

const creaMovimento = (tipo, categoria, importo) => Movimento.create({
  user_id: userId, conto_id: contoId, tipo, categoria, importo, data: '2026-09-01', descrizione: `${categoria} test`,
});

describe('GET /api/analisi/distribuzione-entrate', () => {
  it('aggrega le entrate per categoria e ignora le uscite', async () => {
    await creaMovimento('entrata', 'stipendio', 1500);
    await creaMovimento('entrata', 'stipendio', 500);
    await creaMovimento('entrata', 'rimborso', 500);
    await creaMovimento('uscita', 'supermercato', 300);

    const res = await request(app)
      .get('/api/analisi/distribuzione-entrate')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totale).toBe(2500);
    expect(res.body.distribuzione).toHaveLength(2);
    // Ordinate per importo decrescente, con percentuale sul totale entrate.
    expect(res.body.distribuzione[0]).toMatchObject({ categoria: 'stipendio', importo: 2000, percentuale: 80 });
    expect(res.body.distribuzione[1]).toMatchObject({ categoria: 'rimborso', importo: 500, percentuale: 20 });
    expect(res.body.distribuzione.map(d => d.categoria)).not.toContain('supermercato');
  });

  it('rispetta il filtro di periodo', async () => {
    await creaMovimento('entrata', 'stipendio', 1000);
    await Movimento.create({
      user_id: userId, conto_id: contoId, tipo: 'entrata', categoria: 'rimborso', importo: 999, data: '2026-01-15', descrizione: 'vecchio',
    });

    const res = await request(app)
      .get('/api/analisi/distribuzione-entrate')
      .query({ da: '2026-08-01', a: '2026-09-30' })
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totale).toBe(1000);
  });

  it('non espone le entrate di un altro utente', async () => {
    await creaMovimento('entrata', 'stipendio', 1000);
    const altro = (await registerUser(app)).res.body;

    const res = await request(app)
      .get('/api/analisi/distribuzione-entrate')
      .set(authHeader(altro.token));

    expect(res.status).toBe(200);
    expect(res.body.distribuzione).toEqual([]);
    expect(res.body.totale).toBe(0);
  });

  it('richiede autenticazione', async () => {
    const res = await request(app).get('/api/analisi/distribuzione-entrate');
    expect(res.status).toBe(401);
  });

  it('rifiuta un intervallo di date non valido', async () => {
    const res = await request(app)
      .get('/api/analisi/distribuzione-entrate')
      .query({ da: 'non-una-data', a: '2026-13-45' })
      .set(authHeader(token));
    expect(res.status).toBe(400);
  });
});
