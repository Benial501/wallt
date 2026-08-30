// Step-up reale per utenti Google OAuth: JWT WALLT -> challenge/nonce ->
// Google Identity Services -> ID token -> verifica server-side (mock di
// google-auth-library) -> step_up_token. Verifica anche che le vecchie
// frasi pubbliche CONFERMA/ELIMINA/RESETTA NON producano più un token.
//
// google-auth-library viene mockato qui in cima al file (hoisted da Jest).
// L'OAuth2Client REALE nel service è però istanziato in modo lazy (dentro
// getGoogleClient(), non a livello di modulo): setupFilesAfterEnv carica
// app.js/il service PRIMA che questo mock diventi effettivo, quindi se
// l'import di google-auth-library fosse eager il mock non verrebbe mai
// applicato. Il mock qui sotto viene invece "visto" al primo utilizzo reale
// (durante la richiesta HTTP di un test), quando il mock è già registrato.
const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const {
  request, createApp, createGoogleUser, registerUser, authHeader, seedUserFinanceData,
  getStepUpToken, defaultRegisterPayload, User,
} = require('./setup');
const { generateToken } = require('../controllers/auth.controller');

describe('Step-up Google OAuth (challenge/nonce + ID token)', () => {
  let app;

  beforeEach(() => {
    app = createApp({ enableRateLimit: false });
    mockVerifyIdToken.mockReset();
  });

  const tokenFor = (user) => generateToken(user);

  const getChallenge = async (token) => request(app)
    .post('/api/auth/google/challenge')
    .set(authHeader(token));

  const setMockPayload = (payloadOverrides = {}) => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-default',
        iat: Math.floor(Date.now() / 1000),
        ...payloadOverrides,
      }),
    });
  };

  it('rifiuta google/challenge per un utente locale (non Google)', async () => {
    const { res: regRes } = await registerUser(app);
    const res = await getChallenge(regRes.body.token);
    expect(res.status).toBe(400);
  });

  it('genera un challenge valido per un utente Google (nonce + JWT firmato)', async () => {
    const googleUser = await createGoogleUser();
    const res = await getChallenge(tokenFor(googleUser));

    expect(res.status).toBe(200);
    expect(res.body.nonce).toBeTruthy();
    expect(res.body.challenge).toBeTruthy();
    expect(res.body.expires_in).toBe(120);
  });

  it('flusso completo: ID token valido con sub/nonce corretti produce uno step_up_token utilizzabile', async () => {
    const googleUser = await createGoogleUser();
    const token = tokenFor(googleUser);
    const { conto } = await seedUserFinanceData(googleUser.id, 'G');

    const challengeRes = await getChallenge(token);
    const { nonce, challenge } = challengeRes.body;
    setMockPayload({ sub: googleUser.google_id, nonce });

    const verifyRes = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(token))
      .send({ credential: 'fake-id-token', challenge });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.step_up_token).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/impostazioni/reset-account')
      .set(authHeader(token))
      .set('X-Step-Up-Token', verifyRes.body.step_up_token)
      .send({ conferma: 'RESETTA' });

    expect(resetRes.status).toBe(200);
    await conto.reload();
    expect(Number(conto.saldo)).toBe(0);
  });

  it('rifiuta un nonce non corrispondente (payload manomesso/replay parziale)', async () => {
    const googleUser = await createGoogleUser();
    const token = tokenFor(googleUser);
    const challengeRes = await getChallenge(token);
    const { challenge } = challengeRes.body;

    setMockPayload({ sub: googleUser.google_id, nonce: 'nonce-sbagliato' });

    const verifyRes = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(token))
      .send({ credential: 'fake-id-token', challenge });

    expect(verifyRes.status).toBe(401);
  });

  it('rifiuta un ID token con sub di un altro account Google', async () => {
    const googleUser = await createGoogleUser();
    const token = tokenFor(googleUser);
    const challengeRes = await getChallenge(token);
    const { nonce, challenge } = challengeRes.body;

    setMockPayload({ sub: 'sub-di-un-altro-utente-google', nonce });

    const verifyRes = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(token))
      .send({ credential: 'fake-id-token', challenge });

    expect(verifyRes.status).toBe(403);
  });

  it('rifiuta un ID token scaduto/non firmato correttamente (mockVerifyIdToken lancia)', async () => {
    const googleUser = await createGoogleUser();
    const token = tokenFor(googleUser);
    const challengeRes = await getChallenge(token);
    const { challenge } = challengeRes.body;

    mockVerifyIdToken.mockRejectedValue(new Error('Token used too late'));

    const verifyRes = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(token))
      .send({ credential: 'fake-id-token', challenge });

    expect(verifyRes.status).toBe(401);
  });

  it('rifiuta un ID token non recente (iat troppo vecchio)', async () => {
    const googleUser = await createGoogleUser();
    const token = tokenFor(googleUser);
    const challengeRes = await getChallenge(token);
    const { nonce, challenge } = challengeRes.body;

    setMockPayload({ sub: googleUser.google_id, nonce, iat: Math.floor(Date.now() / 1000) - 999 });

    const verifyRes = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(token))
      .send({ credential: 'fake-id-token', challenge });

    expect(verifyRes.status).toBe(401);
  });

  it('rifiuta un challenge scaduto', async () => {
    const jwt = require('jsonwebtoken');
    const googleUser = await createGoogleUser();
    const token = tokenFor(googleUser);

    const expiredChallenge = jwt.sign(
      { userId: googleUser.id, nonce: 'un-nonce', type: 'google_stepup_challenge' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' },
    );

    setMockPayload({ sub: googleUser.google_id, nonce: 'un-nonce' });

    const verifyRes = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(token))
      .send({ credential: 'fake-id-token', challenge: expiredChallenge });

    expect(verifyRes.status).toBe(403);
  });

  it('rifiuta un challenge emesso per un altro utente (userId binding)', async () => {
    const googleUserA = await createGoogleUser();
    const googleUserB = await createGoogleUser();

    const challengeResA = await getChallenge(tokenFor(googleUserA));
    const { nonce, challenge } = challengeResA.body;

    setMockPayload({ sub: googleUserB.google_id, nonce });

    // Il JWT è di userB ma il challenge era stato emesso per userA.
    const verifyRes = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(tokenFor(googleUserB)))
      .send({ credential: 'fake-id-token', challenge });

    expect(verifyRes.status).toBe(403);
  });

  it('rifiuta il riuso dello stesso challenge (single-use)', async () => {
    const googleUser = await createGoogleUser();
    const token = tokenFor(googleUser);
    const challengeRes = await getChallenge(token);
    const { nonce, challenge } = challengeRes.body;

    setMockPayload({ sub: googleUser.google_id, nonce });

    const first = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(token))
      .send({ credential: 'fake-id-token', challenge });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(token))
      .send({ credential: 'fake-id-token', challenge });
    expect(second.status).toBe(403);
  });

  it('le vecchie frasi CONFERMA/ELIMINA/RESETTA NON producono più uno step_up_token per un utente Google', async () => {
    const googleUser = await createGoogleUser();
    const token = tokenFor(googleUser);

    // eslint-disable-next-line no-restricted-syntax
    for (const phrase of ['CONFERMA', 'ELIMINA', 'RESETTA']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/auth/verify-password')
        .set(authHeader(token))
        .send({ password: phrase });
      expect(res.status).toBe(400);
      expect(res.body.step_up_token).toBeUndefined();
    }
  });

  it('rifiuta verify-google per un utente locale', async () => {
    const { res: regRes } = await registerUser(app);
    const res = await request(app)
      .post('/api/auth/verify-google')
      .set(authHeader(regRes.body.token))
      .send({ credential: 'fake-id-token', challenge: 'qualsiasi' });
    expect(res.status).toBe(400);
  });

  // Le due proprietà qui sotto valgono ora per gli account con password
  // locale, gli unici ancora soggetti a step-up dopo l'iterazione 4.

  it('un JWT normale (non step-up) non è accettato come X-Step-Up-Token (utente locale)', async () => {
    const { res: regRes } = await registerUser(app);
    const { token } = regRes.body;
    await seedUserFinanceData(regRes.body.user.id, 'L2');

    const res = await request(app)
      .post('/api/impostazioni/reset-account')
      .set(authHeader(token))
      .set('X-Step-Up-Token', token) // JWT normale riusato come step-up
      .send({ conferma: 'RESETTA' });

    expect(res.status).toBe(403);
  });

  it('lo step-up token di un utente non è utilizzabile da un altro utente (locali)', async () => {
    const payloadA = defaultRegisterPayload();
    const { res: regA } = await registerUser(app, payloadA);
    const { res: regB } = await registerUser(app);
    await seedUserFinanceData(regB.body.user.id, 'B');

    const stepUpTokenA = await getStepUpToken(app, regA.body.token, payloadA.password);
    expect(stepUpTokenA).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/impostazioni/reset-account')
      .set(authHeader(regB.body.token))
      .set('X-Step-Up-Token', stepUpTokenA)
      .send({ conferma: 'RESETTA' });

    expect(resetRes.status).toBe(403);
  });

  // --- Iterazione 4: rimozione della ri-autenticazione Google ---
  // Gli account OAuth non hanno più alcuno step-up sulle operazioni sensibili:
  // resta solo la conferma testuale. Vedi docs/DECISIONS.md e docs/SECURITY.md.

  it('un account Google resetta le transazioni con la sola conferma RESETTA, senza step-up', async () => {
    const googleUser = await createGoogleUser();
    await seedUserFinanceData(googleUser.id, 'G3');

    const res = await request(app)
      .post('/api/impostazioni/reset-account')
      .set(authHeader(tokenFor(googleUser)))
      .send({ conferma: 'RESETTA' });

    expect(res.status).toBe(200);
  });

  it('un account Google elimina l\'account con la sola conferma ELIMINA, senza step-up', async () => {
    const googleUser = await createGoogleUser();
    await seedUserFinanceData(googleUser.id, 'G4');

    const res = await request(app)
      .delete('/api/impostazioni/account')
      .set(authHeader(tokenFor(googleUser)))
      .send({ conferma: 'ELIMINA' });

    expect(res.status).toBe(200);
    expect(await User.findByPk(googleUser.id)).toBeNull();
  });

  it('un account Google senza la conferma corretta viene comunque rifiutato', async () => {
    const googleUser = await createGoogleUser();
    await seedUserFinanceData(googleUser.id, 'G5');

    const res = await request(app)
      .delete('/api/impostazioni/account')
      .set(authHeader(tokenFor(googleUser)))
      .send({ conferma: 'ELIMIN' });

    expect(res.status).toBe(400);
    expect(await User.findByPk(googleUser.id)).not.toBeNull();
  });

  it('un utente locale continua a richiedere lo step-up sulle operazioni sensibili', async () => {
    const { res: regRes } = await registerUser(app);
    await seedUserFinanceData(regRes.body.user.id, 'L3');

    const res = await request(app)
      .post('/api/impostazioni/reset-account')
      .set(authHeader(regRes.body.token))
      .send({ conferma: 'RESETTA' });

    expect(res.status).toBe(403);
  });
});
