const {
  request,
  createApp,
  registerUser,
  authHeader,
} = require('./setup');
const { OnboardingSession, ProfiloUtente } = require('../models');

async function registerLegacyUser(app) {
  const result = await registerUser(app);
  // Questi casi verificano il questionario già in uso dagli account precedenti.
  await OnboardingSession.destroy({ where: { user_id: result.res.body.user.id } });
  return result;
}

describe('Profilo API', () => {
  let app;

  beforeEach(() => {
    app = createApp({ enableRateLimit: false });
  });

  it('abilita scommesse e investimenti al completamento onboarding', async () => {
    const { res: regRes } = await registerLegacyUser(app);
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
    const { res: regRes } = await registerLegacyUser(app);
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
    const { res: regRes } = await registerLegacyUser(app);
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

  describe('orizzonte di spesa', () => {
    it('salva un orizzonte a data futura', async () => {
      const { res: regRes } = await registerUser(app);
      const token = regRes.body.token;
      const userId = regRes.body.user.id;

      const res = await request(app)
        .put('/api/profilo')
        .set(authHeader(token))
        .send({ orizzonte_tipo: 'data', orizzonte_data: '2027-06-30' });

      expect(res.status).toBe(200);
      const profilo = await ProfiloUtente.findOne({ where: { user_id: userId } });
      expect(profilo.orizzonte_tipo).toBe('data');
      expect(String(profilo.orizzonte_data)).toBe('2027-06-30');
    });

    it('rifiuta un tipo sconosciuto', async () => {
      const { res: regRes } = await registerUser(app);
      const token = regRes.body.token;

      const res = await request(app)
        .put('/api/profilo')
        .set(authHeader(token))
        .send({ orizzonte_tipo: 'settimanale' });

      expect(res.status).toBe(400);
    });

    it('rifiuta una data nel passato', async () => {
      const { res: regRes } = await registerUser(app);
      const token = regRes.body.token;

      const res = await request(app)
        .put('/api/profilo')
        .set(authHeader(token))
        .send({ orizzonte_tipo: 'data', orizzonte_data: '2020-01-01' });

      expect(res.status).toBe(400);
    });

    it('rifiuta una data oltre il tetto di 36 mesi', async () => {
      const { res: regRes } = await registerUser(app);
      const token = regRes.body.token;

      const res = await request(app)
        .put('/api/profilo')
        .set(authHeader(token))
        .send({ orizzonte_tipo: 'data', orizzonte_data: '2040-01-01' });

      expect(res.status).toBe(400);
    });

    it('il tipo data senza data viene rifiutato', async () => {
      const { res: regRes } = await registerUser(app);
      const token = regRes.body.token;

      const res = await request(app)
        .put('/api/profilo')
        .set(authHeader(token))
        .send({ orizzonte_tipo: 'data', orizzonte_data: null });

      expect(res.status).toBe(400);
    });

    it('un update parziale non bypassa il controllo sul passato', async () => {
      const { res: regRes } = await registerUser(app);
      const token = regRes.body.token;
      const userId = regRes.body.user.id;

      const salvataggio = await request(app)
        .put('/api/profilo')
        .set(authHeader(token))
        .send({ orizzonte_tipo: 'data', orizzonte_data: '2027-06-30' });
      expect(salvataggio.status).toBe(200);

      // PUT parziale: manda SOLO orizzonte_data, senza orizzonte_tipo. Il
      // controllo "nel futuro" deve applicarsi comunque, perché updateProfilo
      // applica solo i campi presenti nel body e la condizione sul tipo non
      // deve poter saltare la validazione della data.
      const res = await request(app)
        .put('/api/profilo')
        .set(authHeader(token))
        .send({ orizzonte_data: '2020-01-01' });

      expect(res.status).toBe(400);
      const profilo = await ProfiloUtente.findOne({ where: { user_id: userId } });
      expect(String(profilo.orizzonte_data)).toBe('2027-06-30');
    });
  });
});
