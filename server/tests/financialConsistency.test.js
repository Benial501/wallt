// Coerenza finanziaria: saldo, movimenti, trasferimenti, race condition.
// Non basta che build/test passino in astratto — qui si verifica che i
// numeri tornino, in scenari concreti e in scenari di concorrenza reale.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');

describe('Coerenza finanziaria', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  const creaConto = (saldo = 1000, overrides = {}) => Conto.create({
    user_id: userId, nome: 'Conto Test', tipo: 'banca', saldo, attivo: true, ...overrides,
  });

  const oggi = () => new Date().toISOString().split('T')[0];

  describe('Movimenti — create/update/delete', () => {
    it('un\'uscita di 100 su un conto da 1000 porta il saldo a 900', async () => {
      const conto = await creaConto(1000);

      const res = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'uscita', importo: 100, categoria: 'cibo_spesa', data: oggi(),
      });

      expect(res.status).toBe(201);
      await conto.reload();
      expect(Number(conto.saldo)).toBe(900);
    });

    it('un\'entrata di 250 su un conto da 900 porta il saldo a 1150', async () => {
      const conto = await creaConto(900);

      const res = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'entrata', importo: 250, categoria: 'stipendio', data: oggi(),
      });

      expect(res.status).toBe(201);
      await conto.reload();
      expect(Number(conto.saldo)).toBe(1150);
    });

    it('un\'uscita superiore al saldo disponibile viene rifiutata e il saldo non cambia', async () => {
      const conto = await creaConto(50);

      const res = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'uscita', importo: 100, categoria: 'cibo_spesa', data: oggi(),
      });

      expect(res.status).toBe(400);
      await conto.reload();
      expect(Number(conto.saldo)).toBe(50);
    });

    it('modificare l\'importo di un\'uscita da 100 a 150 applica solo la differenza al saldo', async () => {
      const conto = await creaConto(1000);
      const createRes = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'uscita', importo: 100, categoria: 'cibo_spesa', data: oggi(),
      });
      const movimentoId = createRes.body.movimento.id;
      await conto.reload();
      expect(Number(conto.saldo)).toBe(900);

      const updateRes = await request(app).put(`/api/movimenti/${movimentoId}`).set(authHeader(token)).send({
        importo: 150,
      });

      expect(updateRes.status).toBe(200);
      await conto.reload();
      expect(Number(conto.saldo)).toBe(850); // 1000 - 150, non 1000 - 100 - 150
    });

    it('cambiare il tipo di un movimento da uscita a entrata inverte correttamente l\'impatto sul saldo', async () => {
      const conto = await creaConto(1000);
      const createRes = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'uscita', importo: 100, categoria: 'cibo_spesa', data: oggi(),
      });
      const movimentoId = createRes.body.movimento.id;
      await conto.reload();
      expect(Number(conto.saldo)).toBe(900);

      const updateRes = await request(app).put(`/api/movimenti/${movimentoId}`).set(authHeader(token)).send({
        tipo: 'entrata',
      });

      expect(updateRes.status).toBe(200);
      await conto.reload();
      // Ripristina i 100 dell'uscita (->1000) e poi applica +100 di entrata (->1100).
      expect(Number(conto.saldo)).toBe(1100);
    });

    it('spostare un movimento su un altro conto aggiorna correttamente entrambi i saldi', async () => {
      const contoA = await creaConto(1000, { nome: 'Conto A' });
      const contoB = await creaConto(500, { nome: 'Conto B' });
      const createRes = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: contoA.id, tipo: 'uscita', importo: 100, categoria: 'cibo_spesa', data: oggi(),
      });
      const movimentoId = createRes.body.movimento.id;

      const updateRes = await request(app).put(`/api/movimenti/${movimentoId}`).set(authHeader(token)).send({
        conto_id: contoB.id,
      });

      expect(updateRes.status).toBe(200);
      await contoA.reload();
      await contoB.reload();
      expect(Number(contoA.saldo)).toBe(1000); // ripristinato
      expect(Number(contoB.saldo)).toBe(400); // 500 - 100
    });

    it('eliminare un\'uscita ripristina il saldo (+importo)', async () => {
      const conto = await creaConto(1000);
      const createRes = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'uscita', importo: 100, categoria: 'cibo_spesa', data: oggi(),
      });
      const movimentoId = createRes.body.movimento.id;
      await conto.reload();
      expect(Number(conto.saldo)).toBe(900);

      const delRes = await request(app).delete(`/api/movimenti/${movimentoId}`).set(authHeader(token));
      expect(delRes.status).toBe(200);
      await conto.reload();
      expect(Number(conto.saldo)).toBe(1000);

      const stillThere = await Movimento.findByPk(movimentoId);
      expect(stillThere).toBeNull();
    });

    it('eliminare un\'entrata ripristina il saldo (-importo)', async () => {
      const conto = await creaConto(1000);
      const createRes = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'entrata', importo: 300, categoria: 'stipendio', data: oggi(),
      });
      const movimentoId = createRes.body.movimento.id;
      await conto.reload();
      expect(Number(conto.saldo)).toBe(1300);

      const delRes = await request(app).delete(`/api/movimenti/${movimentoId}`).set(authHeader(token));
      expect(delRes.status).toBe(200);
      await conto.reload();
      expect(Number(conto.saldo)).toBe(1000);
    });
  });

  describe('Trasferimenti', () => {
    it('un trasferimento sposta il saldo tra conti mantenendo invariato il patrimonio totale', async () => {
      const contoA = await creaConto(1000, { nome: 'Conto A' });
      const contoB = await creaConto(500, { nome: 'Conto B' });
      const patrimonioPrima = 1500;

      const res = await request(app).post('/api/conti/trasferimento').set(authHeader(token)).send({
        conto_origine_id: contoA.id, conto_destinazione_id: contoB.id, importo: 200, data: oggi(),
      });

      expect(res.status).toBe(200);
      await contoA.reload();
      await contoB.reload();
      expect(Number(contoA.saldo)).toBe(800);
      expect(Number(contoB.saldo)).toBe(700);
      expect(Number(contoA.saldo) + Number(contoB.saldo)).toBe(patrimonioPrima);
    });

    it('un trasferimento con saldo insufficiente viene rifiutato e nessun conto viene toccato', async () => {
      const contoA = await creaConto(50, { nome: 'Conto A' });
      const contoB = await creaConto(500, { nome: 'Conto B' });

      const res = await request(app).post('/api/conti/trasferimento').set(authHeader(token)).send({
        conto_origine_id: contoA.id, conto_destinazione_id: contoB.id, importo: 200, data: oggi(),
      });

      expect(res.status).toBe(400);
      await contoA.reload();
      await contoB.reload();
      expect(Number(contoA.saldo)).toBe(50);
      expect(Number(contoB.saldo)).toBe(500);
    });

    it('eliminare un movimento di trasferimento ripristina i saldi di entrambi i conti', async () => {
      const contoA = await creaConto(1000, { nome: 'Conto A' });
      const contoB = await creaConto(500, { nome: 'Conto B' });

      await request(app).post('/api/conti/trasferimento').set(authHeader(token)).send({
        conto_origine_id: contoA.id, conto_destinazione_id: contoB.id, importo: 200, data: oggi(),
      });

      const trasferimentoMov = await Movimento.findOne({ where: { user_id: userId, tipo: 'trasferimento' } });
      expect(trasferimentoMov).not.toBeNull();

      const delRes = await request(app).delete(`/api/movimenti/${trasferimentoMov.id}`).set(authHeader(token));
      expect(delRes.status).toBe(200);

      await contoA.reload();
      await contoB.reload();
      expect(Number(contoA.saldo)).toBe(1000);
      expect(Number(contoB.saldo)).toBe(500);
    });

    it('un trasferimento non altera il patrimonio totale riportato da GET /api/conti/patrimonio', async () => {
      const contoA = await creaConto(1000, { nome: 'Conto A' });
      const contoB = await creaConto(500, { nome: 'Conto B' });

      const prima = await request(app).get('/api/conti/patrimonio').set(authHeader(token));
      await request(app).post('/api/conti/trasferimento').set(authHeader(token)).send({
        conto_origine_id: contoA.id, conto_destinazione_id: contoB.id, importo: 300, data: oggi(),
      });
      const dopo = await request(app).get('/api/conti/patrimonio').set(authHeader(token));

      expect(dopo.body.patrimonio_totale).toBe(prima.body.patrimonio_totale);
    });
  });

  describe('Race condition — richieste concorrenti sullo stesso conto', () => {
    it('due uscite concorrenti che insieme supererebbero il saldo: solo una deve riuscire, il saldo non deve mai andare sotto zero', async () => {
      const conto = await creaConto(100);

      const payload = {
        conto_id: conto.id, tipo: 'uscita', importo: 80, categoria: 'cibo_spesa', data: oggi(),
      };

      const [r1, r2] = await Promise.all([
        request(app).post('/api/movimenti').set(authHeader(token)).send(payload),
        request(app).post('/api/movimenti').set(authHeader(token)).send(payload),
      ]);

      const statuses = [r1.status, r2.status].sort();
      // Una deve riuscire (201) e l'altra deve essere rifiutata per saldo
      // insufficiente (400): il locking a livello di riga (SELECT ... FOR
      // UPDATE) deve serializzare le due transazioni, non farle leggere
      // entrambe il saldo iniziale di 100.
      expect(statuses).toEqual([201, 400]);

      await conto.reload();
      expect(Number(conto.saldo)).toBe(20); // 100 - 80, una sola volta
      expect(Number(conto.saldo)).toBeGreaterThanOrEqual(0);

      const movimenti = await Movimento.findAll({ where: { user_id: userId, conto_id: conto.id } });
      expect(movimenti).toHaveLength(1);
    });

    it('due trasferimenti concorrenti dallo stesso conto: il saldo non va mai sotto zero', async () => {
      const contoA = await creaConto(100, { nome: 'Conto A' });
      const contoB = await creaConto(0, { nome: 'Conto B' });
      const contoC = await creaConto(0, { nome: 'Conto C' });

      const [r1, r2] = await Promise.all([
        request(app).post('/api/conti/trasferimento').set(authHeader(token)).send({
          conto_origine_id: contoA.id, conto_destinazione_id: contoB.id, importo: 80, data: oggi(),
        }),
        request(app).post('/api/conti/trasferimento').set(authHeader(token)).send({
          conto_origine_id: contoA.id, conto_destinazione_id: contoC.id, importo: 80, data: oggi(),
        }),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([200, 400]);

      await contoA.reload();
      await contoB.reload();
      await contoC.reload();
      expect(Number(contoA.saldo)).toBeGreaterThanOrEqual(0);
      // Il patrimonio totale deve restare invariato (100): niente creato/perso dal nulla.
      expect(Number(contoA.saldo) + Number(contoB.saldo) + Number(contoC.saldo)).toBe(100);
    });
  });

  describe('Reset account', () => {
    it('azzera i saldi di TUTTI i conti dell\'utente ed elimina tutti i movimenti', async () => {
      const contoA = await creaConto(1000, { nome: 'Conto A' });
      const contoB = await creaConto(500, { nome: 'Conto B' });
      await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: contoA.id, tipo: 'uscita', importo: 50, categoria: 'cibo_spesa', data: oggi(),
      });

      const stepUpRes = await request(app).post('/api/auth/verify-password').set(authHeader(token)).send({ password: 'Password1!' });
      const stepUpToken = stepUpRes.body.step_up_token;

      const resetRes = await request(app)
        .post('/api/impostazioni/reset-account')
        .set(authHeader(token))
        .set('X-Step-Up-Token', stepUpToken)
        .send({ password: 'Password1!' });

      expect(resetRes.status).toBe(200);
      await contoA.reload();
      await contoB.reload();
      expect(Number(contoA.saldo)).toBe(0);
      expect(Number(contoB.saldo)).toBe(0);
      expect(contoA.attivo).toBe(true); // conti mantenuti, solo azzerati

      const movimenti = await Movimento.findAll({ where: { user_id: userId } });
      expect(movimenti).toHaveLength(0);
    });
  });
});
