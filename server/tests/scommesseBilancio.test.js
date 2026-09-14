// Verifica end-to-end che depositi e prelievi siano trattati come semplici
// trasferimenti di denaro e non inquinino il bilancio di vincite e perdite
// del conto scommesse.
const {
  request, registerUser, createApp, authHeader, Conto, User,
} = require('./setup');
const { ProfiloUtente } = require('../models');

describe('Bilancio scommesse: depositi e prelievi sono trasferimenti', () => {
  let app;
  let token;
  let contoBanca;
  let piattaformaId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    const userId = res.body.user.id;

    // La sezione scommesse è accessibile solo a maggiorenni che l'hanno attivata.
    await ProfiloUtente.upsert({
      user_id: userId, fascia_eta: '25_34', fa_scommesse: 'si', onboarding_completato: true,
    });
    await User.update({ mostra_scommesse: true }, { where: { id: userId } });

    contoBanca = await Conto.create({
      user_id: res.body.user.id, nome: 'Conto banca', tipo: 'banca', saldo: 1000, attivo: true,
    });

    const creata = await request(app)
      .post('/api/scommesse/piattaforme')
      .set(authHeader(token))
      .send({ nome: 'Piattaforma test', saldo_iniziale: 0 });
    expect(creata.status).toBe(201);
    piattaformaId = creata.body.piattaforma.id;
  });

  const movimento = (tipo, importo, extra = {}) => request(app)
    .post('/api/scommesse/movimenti')
    .set(authHeader(token))
    .send({
      piattaforma_id: piattaformaId, tipo, importo, data: '2026-03-10', ...extra,
    });

  test('un deposito di 11 € non crea una perdita', async () => {
    const res = await movimento('deposito', 11, { conto_collegato_id: contoBanca.id });
    expect(res.status).toBe(201);

    const pan = await request(app).get('/api/scommesse/panoramica').set(authHeader(token));
    expect(pan.status).toBe(200);
    expect(pan.body.totale_depositato).toBe(11);
    expect(pan.body.bilancio_netto).toBe(0);
    expect(pan.body.bilancio).toBe(0);

    // Il denaro si è spostato: fuori dal conto banca, dentro al conto di gioco.
    await contoBanca.reload();
    expect(parseFloat(contoBanca.saldo)).toBe(989);
  });

  test('deposito 11 e perdita 11 danno -11, non -22', async () => {
    await movimento('deposito', 11, { conto_collegato_id: contoBanca.id });
    await movimento('perdita', 11);

    const pan = await request(app).get('/api/scommesse/panoramica').set(authHeader(token));
    expect(pan.body.bilancio_netto).toBe(-11);
    expect(pan.body.piattaforme[0].bilancio_reale).toBe(-11);

    const analisi = await request(app).get('/api/scommesse/analisi').set(authHeader(token));
    expect(analisi.body.bilancio_netto).toBe(-11);
    expect(analisi.body.per_piattaforma[0].bilancio_netto).toBe(-11);
  });

  test('deposito, vincita e prelievo integrale danno un risultato pari alla sola vincita', async () => {
    await movimento('deposito', 100, { conto_collegato_id: contoBanca.id });
    await movimento('vincita', 30);
    await movimento('prelievo', 130, { conto_collegato_id: contoBanca.id });

    const pan = await request(app).get('/api/scommesse/panoramica').set(authHeader(token));
    expect(pan.body.bilancio_netto).toBe(30);
    expect(pan.body.saldo_trasferimenti).toBe(30);

    await contoBanca.reload();
    expect(parseFloat(contoBanca.saldo)).toBe(1030);
  });
});
