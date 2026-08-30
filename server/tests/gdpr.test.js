const jwt = require('jsonwebtoken');
const {
  request,
  createApp,
  registerUser,
  authHeader,
  getStepUpToken,
  seedUserFinanceData,
  User,
  Conto,
  Movimento,
} = require('./setup');

describe('GDPR API', () => {
  let app;

  beforeEach(() => {
    app = createApp({ enableRateLimit: false });
  });

  const createTwoUsers = async () => {
    const { res: resA, payload: userA } = await registerUser(app, { nome: 'Utente A' });
    const { res: resB, payload: userB } = await registerUser(app, { nome: 'Utente B' });

    const dataA = await seedUserFinanceData(resA.body.user.id, 'A');
    const dataB = await seedUserFinanceData(resB.body.user.id, 'B');

    return {
      tokenA: resA.body.token,
      tokenB: resB.body.token,
      userA,
      userB,
      dataA,
      dataB,
    };
  };

  it('export restituisce solo i dati dell\'utente loggato', async () => {
    const { tokenA, tokenB, userA, userB, dataA, dataB } = await createTwoUsers();

    const stepUpA = await getStepUpToken(app, tokenA, userA.password);
    const exportA = await request(app)
      .post('/api/impostazioni/esporta')
      .set({
        ...authHeader(tokenA),
        'X-Step-Up-Token': stepUpA,
      });

    expect(exportA.status).toBe(200);

    const exported = JSON.parse(exportA.text);
    expect(exported.utente.email).toBe(userA.email);
    expect(exported.conti).toHaveLength(1);
    expect(exported.conti[0].nome).toBe(dataA.conto.nome);
    expect(exported.movimenti).toHaveLength(1);
    expect(exported.movimenti[0].descrizione).toBe(dataA.movimento.descrizione);

    expect(exported.conti.some((c) => c.nome === dataB.conto.nome)).toBe(false);
    expect(exported.movimenti.some((m) => m.id === dataB.movimento.id)).toBe(false);

    const stepUpB = await getStepUpToken(app, tokenB, userB.password);
    const exportB = await request(app)
      .post('/api/impostazioni/esporta')
      .set({
        ...authHeader(tokenB),
        'X-Step-Up-Token': stepUpB,
      });

    const exportedB = JSON.parse(exportB.text);
    expect(exportedB.utente.email).toBe(userB.email);
    expect(exportedB.conti[0].nome).toBe(dataB.conto.nome);
  });

  it('cancellazione account richiede step-up', async () => {
    const { res, payload } = await registerUser(app);
    const token = res.body.token;

    const withoutStepUp = await request(app)
      .delete('/api/impostazioni/account')
      .set(authHeader(token))
      .send({ password: payload.password });

    expect(withoutStepUp.status).toBe(403);
    expect(withoutStepUp.body.message).toMatch(/autenticazione aggiuntiva/i);
  });

  it('dopo cancellazione i dati non sono più accessibili', async () => {
    const { res, payload } = await registerUser(app);
    const token = res.body.token;
    const userId = res.body.user.id;

    await seedUserFinanceData(userId, 'DeleteMe');

    const stepUpToken = await getStepUpToken(app, token, payload.password);

    const deleteRes = await request(app)
      .delete('/api/impostazioni/account')
      .set({
        ...authHeader(token),
        'X-Step-Up-Token': stepUpToken,
      })
      .send({ password: payload.password });

    expect(deleteRes.status).toBe(200);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(meRes.status).toBe(401);

    const user = await User.findByPk(userId);
    expect(user).toBeNull();

    const movimenti = await Movimento.findAll({ where: { user_id: userId } });
    expect(movimenti).toHaveLength(0);
  });

  it('utente A non può vedere o modificare dati utente B', async () => {
    const { tokenA, tokenB, dataB } = await createTwoUsers();

    const listA = await request(app)
      .get('/api/movimenti')
      .set(authHeader(tokenA));

    expect(listA.status).toBe(200);
    const idsA = listA.body.gruppi.flatMap((g) => g.movimenti.map((m) => m.id));
    expect(idsA).not.toContain(dataB.movimento.id);

    const updateAsB = await request(app)
      .put(`/api/movimenti/${dataB.movimento.id}`)
      .set(authHeader(tokenA))
      .send({ descrizione: 'Tentativo accesso' });

    expect(updateAsB.status).toBe(404);

    const deleteAsB = await request(app)
      .delete(`/api/movimenti/${dataB.movimento.id}`)
      .set(authHeader(tokenA));

    expect(deleteAsB.status).toBe(404);

    const listB = await request(app)
      .get('/api/movimenti')
      .set(authHeader(tokenB));

    const idsB = listB.body.gruppi.flatMap((g) => g.movimenti.map((m) => m.id));
    expect(idsB).toContain(dataB.movimento.id);
  });

  describe('reset-account richiede step-up', () => {
    it('rifiuta la richiesta se l\'utente non è autenticato', async () => {
      const res = await request(app)
        .post('/api/impostazioni/reset-account')
        .send({ password: 'Password1!' });

      expect(res.status).toBe(401);
    });

    it('rifiuta la richiesta con JWT valido ma senza step-up recente', async () => {
      const { res, payload } = await registerUser(app);
      const token = res.body.token;

      const withoutStepUp = await request(app)
        .post('/api/impostazioni/reset-account')
        .set(authHeader(token))
        .send({ password: payload.password });

      expect(withoutStepUp.status).toBe(403);
      expect(withoutStepUp.body.message).toMatch(/autenticazione aggiuntiva/i);
    });

    it('rifiuta un token di step-up scaduto', async () => {
      const { res, payload } = await registerUser(app);
      const token = res.body.token;
      const userId = res.body.user.id;

      const expiredStepUpToken = jwt.sign(
        { userId, type: 'step_up' },
        process.env.JWT_SECRET,
        { expiresIn: -10 },
      );

      const resetRes = await request(app)
        .post('/api/impostazioni/reset-account')
        .set({ ...authHeader(token), 'X-Step-Up-Token': expiredStepUpToken })
        .send({ password: payload.password });

      expect(resetRes.status).toBe(403);
    });

    it('rifiuta un token di step-up non valido', async () => {
      const { res, payload } = await registerUser(app);
      const token = res.body.token;

      const resetRes = await request(app)
        .post('/api/impostazioni/reset-account')
        .set({ ...authHeader(token), 'X-Step-Up-Token': 'token-manomesso' })
        .send({ password: payload.password });

      expect(resetRes.status).toBe(403);
    });

    it('con JWT valido e step-up valido elimina i movimenti e azzera il saldo dei conti', async () => {
      const { res, payload } = await registerUser(app);
      const token = res.body.token;
      const userId = res.body.user.id;

      const { conto } = await seedUserFinanceData(userId, 'Reset');

      const stepUpToken = await getStepUpToken(app, token, payload.password);

      const resetRes = await request(app)
        .post('/api/impostazioni/reset-account')
        .set({ ...authHeader(token), 'X-Step-Up-Token': stepUpToken })
        .send({ password: payload.password });

      expect(resetRes.status).toBe(200);

      const remainingMovimenti = await Movimento.findAll({ where: { user_id: userId } });
      expect(remainingMovimenti).toHaveLength(0);

      const contoAggiornato = await Conto.findByPk(conto.id);
      expect(Number(contoAggiornato.saldo)).toBe(0);
      expect(contoAggiornato.attivo).toBe(true);
    });
  });
});
