const {
  request,
  createApp,
  registerUser,
  authHeader,
  seedUserFinanceData,
} = require('./setup');

describe('Security API', () => {
  describe('Autenticazione obbligatoria', () => {
    let app;

    beforeEach(() => {
      app = createApp({ enableRateLimit: false });
    });

    const protectedEndpoints = [
      { method: 'get', path: '/api/auth/me' },
      { method: 'get', path: '/api/conti' },
      { method: 'get', path: '/api/movimenti' },
      { method: 'post', path: '/api/impostazioni/esporta' },
      { method: 'delete', path: '/api/impostazioni/account' },
    ];

    it.each(protectedEndpoints)('$method $path restituisce 401 senza token', async ({ method, path }) => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    });
  });

  describe('SQL injection', () => {
    let app;
    let token;

    beforeEach(async () => {
      app = createApp({ enableRateLimit: false });
      const { res } = await registerUser(app);
      token = res.body.token;
      await seedUserFinanceData(res.body.user.id);
    });

    it('blocca ID movimento non numerico (tentativo injection)', async () => {
      const maliciousId = "1; DROP TABLE movimenti;--";

      const res = await request(app)
        .put(`/api/movimenti/${encodeURIComponent(maliciousId)}`)
        .set(authHeader(token))
        .send({ descrizione: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.errori || res.body.error).toBeDefined();
    });

    it('parametri query malformati non causano errore 500', async () => {
      const res = await request(app)
        .get('/api/movimenti')
        .query({ conto_id: "' OR 1=1 --" })
        .set(authHeader(token));

      expect([200, 400]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });

  describe('XSS input sanitization', () => {
    let app;
    let token;
    let contoId;

    beforeEach(async () => {
      app = createApp({ enableRateLimit: false });
      const { res } = await registerUser(app);
      token = res.body.token;
      const { conto } = await seedUserFinanceData(res.body.user.id);
      contoId = conto.id;
    });

    it('sanitizza descrizione movimento con script HTML', async () => {
      const xssPayload = '<script>alert("xss")</script>';

      const createRes = await request(app)
        .post('/api/movimenti')
        .set(authHeader(token))
        .send({
          tipo: 'uscita',
          importo: '10.00',
          categoria: 'cibo_spesa',
          conto_id: contoId,
          data: new Date().toISOString().split('T')[0],
          descrizione: xssPayload,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.movimento.descrizione).not.toContain('<script>');
      expect(createRes.body.movimento.descrizione).toContain('&lt;script&gt;');
    });
  });

  describe('Rate limiting', () => {
    it('blocca login dopo troppi tentativi', async () => {
      const app = createApp({ enableRateLimit: true });
      const { payload } = await registerUser(app);

      let lastStatus = 200;
      for (let i = 0; i < 11; i += 1) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: payload.email, password: 'PasswordSbagliata1' });
        lastStatus = res.status;
      }

      expect(lastStatus).toBe(429);
    }, 30000);
  });
});
