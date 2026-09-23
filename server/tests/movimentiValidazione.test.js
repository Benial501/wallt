// Un movimento rappresenta un'operazione già avvenuta: rifiuta date future
// rispetto a Europe/Rome (Regola 13). La programmazione delle ricorrenti è
// un concetto separato e non è toccata qui.
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');
const {
  User, ProfiloUtente, Obiettivo, Investimento, PiattaformaScommesse,
} = require('../models');

const domaniIso = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2); // margine oltre il fuso, non solo +1 giorno
  return d.toISOString().slice(0, 10);
};

const abilitaScommesseInvestimenti = async (userId) => {
  await User.update({ mostra_scommesse: true, mostra_investimenti: true }, { where: { id: userId } });
  await ProfiloUtente.upsert({
    user_id: userId,
    onboarding_completato: true,
    fascia_eta: '25_34',
    fa_scommesse: 'si',
    ha_investimenti: 'si',
  });
};

describe('Validazione data movimento — rifiuta il futuro', () => {
  let app;
  let token;
  let contoId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C', tipo: 'banca', saldo_iniziale: 1000 });
    contoId = contoRes.body.conto.id;
  });

  it('POST rifiuta una data nel futuro', async () => {
    const res = await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 10, categoria: 'affitto', data: domaniIso(),
    });
    expect(res.status).toBe(400);
  });

  it('POST accetta la data di oggi', async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const res = await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 10, categoria: 'affitto', data: oggi,
    });
    expect(res.status).toBe(201);
  });

  it('PUT rifiuta di spostare un movimento esistente nel futuro', async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const created = await request(app).post('/api/movimenti').set(authHeader(token)).send({
      conto_id: contoId, tipo: 'uscita', importo: 10, categoria: 'affitto', data: oggi,
    });
    const res = await request(app)
      .put(`/api/movimenti/${created.body.movimento.id}`)
      .set(authHeader(token))
      .send({ data: domaniIso() });
    expect(res.status).toBe(400);
  });
});

describe('Validazione data trasferimento — rifiuta il futuro', () => {
  it('POST /api/conti/trasferimento rifiuta una data nel futuro', async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    const token = res.body.token;
    const c1 = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C1', tipo: 'banca', saldo_iniziale: 1000 });
    const c2 = await request(app).post('/api/conti').set(authHeader(token)).send({ nome: 'C2', tipo: 'banca', saldo_iniziale: 0 });

    const esito = await request(app).post('/api/conti/trasferimento').set(authHeader(token)).send({
      conto_origine_id: c1.body.conto.id, conto_destinazione_id: c2.body.conto.id, importo: 10, data: domaniIso(),
    });
    expect(esito.status).toBe(400);
  });
});

describe('Validazione data contributo obiettivo — rifiuta il futuro', () => {
  it('POST /api/obiettivi/:id/contributi rifiuta una data nel futuro', async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    const token = res.body.token;
    const obiettivo = await request(app).post('/api/obiettivi').set(authHeader(token)).send({ nome: 'Vacanza', importo_target: 500 });

    const esito = await request(app)
      .post(`/api/obiettivi/${obiettivo.body.obiettivo.id}/contributi`)
      .set(authHeader(token))
      .send({ importo: 50, data: domaniIso() });
    expect(esito.status).toBe(400);
  });
});

describe('Validazione data movimento investimento — rifiuta il futuro', () => {
  it('POST /api/investimenti/:id/movimenti rifiuta una data nel futuro', async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    const token = res.body.token;
    const userId = res.body.user.id;
    await abilitaScommesseInvestimenti(userId);
    const investimento = await Investimento.create({
      user_id: userId, nome_piattaforma: 'Test Invest', tipo: 'azioni', saldo_iniziale: 1000, saldo_attuale: 1000, attivo: true,
    });

    const esito = await request(app)
      .post(`/api/investimenti/${investimento.id}/movimenti`)
      .set(authHeader(token))
      .send({ tipo: 'versamento', importo: 100, data: domaniIso() });
    expect(esito.status).toBe(400);
  });
});

describe('Validazione data movimento scommesse — rifiuta il futuro', () => {
  it('POST /api/scommesse/movimenti rifiuta una data nel futuro', async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    const token = res.body.token;
    const userId = res.body.user.id;
    await abilitaScommesseInvestimenti(userId);
    const piattaforma = await PiattaformaScommesse.create({
      user_id: userId, nome: 'Test Bet', saldo: 200, attiva: true,
    });

    const esito = await request(app)
      .post('/api/scommesse/movimenti')
      .set(authHeader(token))
      .send({
        piattaforma_id: piattaforma.id, tipo: 'deposito', importo: 10, data: domaniIso(),
      });
    expect(esito.status).toBe(400);
  });
});
