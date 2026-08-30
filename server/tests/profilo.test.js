const {
  request,
  createApp,
  registerUser,
  authHeader,
} = require('./setup');

describe('Profilo API', () => {
  let app;

  beforeEach(() => {
    app = createApp({ enableRateLimit: false });
  });

  it('abilita scommesse e investimenti al completamento onboarding', async () => {
    const { res: regRes } = await registerUser(app);
    const token = regRes.body.token;

    expect(regRes.body.user.mostra_scommesse).toBe(false);
    expect(regRes.body.user.mostra_investimenti).toBe(false);

    const updateRes = await request(app)
      .put('/api/profilo')
      .set(authHeader(token))
      .send({
        fascia_eta: '25_34',
        situazione_lavorativa: 'dipendente',
        entrata_mensile: 2500,
        situazione_abitativa: 'affitto',
        costo_abitazione: 800,
        risparmia: 'si_regolarmente',
        ha_investimenti: 'si_regolarmente',
        fa_scommesse: 'ogni_tanto',
        onboarding_completato: true,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.preferenze.mostra_scommesse).toBe(true);
    expect(updateRes.body.preferenze.mostra_investimenti).toBe(true);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.mostra_scommesse).toBe(true);
    expect(meRes.body.user.mostra_investimenti).toBe(true);
  });

  it('non abilita scommesse e investimenti se l\'utente risponde no', async () => {
    const { res: regRes } = await registerUser(app);
    const token = regRes.body.token;

    const updateRes = await request(app)
      .put('/api/profilo')
      .set(authHeader(token))
      .send({
        fascia_eta: '25_34',
        situazione_lavorativa: 'dipendente',
        entrata_mensile: 2500,
        risparmia: 'si_regolarmente',
        ha_investimenti: 'no',
        fa_scommesse: 'no',
        onboarding_completato: true,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.preferenze.mostra_scommesse).toBe(false);
    expect(updateRes.body.preferenze.mostra_investimenti).toBe(false);
  });

  it('non abilita scommesse e investimenti per utenti under 18', async () => {
    const { res: regRes } = await registerUser(app);
    const token = regRes.body.token;

    const updateRes = await request(app)
      .put('/api/profilo')
      .set(authHeader(token))
      .send({
        fascia_eta: 'under_18',
        situazione_lavorativa: 'studente',
        entrata_mensile: 200,
        risparmia: 'qualcosa',
        onboarding_completato: true,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.preferenze.mostra_scommesse).toBe(false);
    expect(updateRes.body.preferenze.mostra_investimenti).toBe(false);
  });
});
