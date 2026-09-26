// Il fondo di emergenza è un CONTO (tipo 'emergenza', nascosto), non un
// obiettivo: vedi docs/superpowers/specs/2026-09-26-fondo-emergenza-design.md.
// Qui si verificano i vincoli che rendono quel conto una riserva invece di un
// conto come gli altri, e il confine fra Regola 12 (resta nel patrimonio) e
// Regola 20 (esce dai soldi spendibili).
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');

const meseScorso = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.toISOString().slice(0, 7)}-01`;
};

describe('Fondo di emergenza', () => {
  let app;
  let token;
  let userId;
  let contoId;

  const creaFondo = (body = {}) => request(app)
    .post('/api/fondo-emergenza').set(authHeader(token)).send(body);
  const leggiFondo = () => request(app)
    .get('/api/fondo-emergenza').set(authHeader(token));
  const uscita = (importo, categoria, data) => request(app)
    .post('/api/movimenti').set(authHeader(token))
    .send({ conto_id: contoId, tipo: 'uscita', importo, categoria, data });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    const contoRes = await request(app).post('/api/conti').set(authHeader(token))
      .send({ nome: 'Conto', tipo: 'banca', saldo_iniziale: 5000 });
    contoId = contoRes.body.conto.id;
  });

  describe('creazione', () => {
    it('senza fondo risponde 200 con esiste:false, non 404: la home deve sapere che non c\'è', async () => {
      const res = await leggiFondo();
      expect(res.status).toBe(200);
      expect(res.body.esiste).toBe(false);
      expect(res.body.importo).toBe(0);
      expect(res.body.conto).toBeNull();
    });

    it('nasce vuoto, nascosto e con la soglia scelta', async () => {
      const res = await creaFondo({ mesi_target: 6 });
      expect(res.status).toBe(201);
      expect(res.body.esiste).toBe(true);
      expect(res.body.importo).toBe(0);
      expect(res.body.mesi_target).toBe(6);
      expect(res.body.conto.nascosto).toBe(true);

      const conto = await Conto.findByPk(res.body.conto.id);
      expect(conto.tipo).toBe('emergenza');
      expect(conto.nascosto).toBe(true);
      expect(Number(conto.saldo)).toBe(0);
      expect(conto.mesi_sicurezza_target).toBe(6);
    });

    it('senza mesi_target usa il default di tre mesi', async () => {
      const res = await creaFondo();
      expect(res.body.mesi_target).toBe(3);
    });

    it('rifiuta una soglia fuori dall\'elenco ammesso', async () => {
      const res = await creaFondo({ mesi_target: 5 });
      expect(res.status).toBe(400);
    });

    it('il secondo fondo non viene creato: 409 con l\'id di quello che esiste', async () => {
      const primo = await creaFondo({ mesi_target: 3 });
      const secondo = await creaFondo({ mesi_target: 12 });
      expect(secondo.status).toBe(409);
      expect(secondo.body.conto_id).toBe(primo.body.conto.id);

      const fondi = await Conto.findAll({ where: { user_id: userId, tipo: 'emergenza', attivo: true } });
      expect(fondi).toHaveLength(1);
    });

    it('POST /api/conti non può creare un conto di tipo emergenza', async () => {
      const res = await request(app).post('/api/conti').set(authHeader(token))
        .send({ nome: 'Finto fondo', tipo: 'emergenza' });
      expect(res.status).toBe(400);
    });
  });

  describe('soglia', () => {
    it('PATCH cambia i mesi e la soglia in euro si ricalcola', async () => {
      await uscita(900, 'affitto', meseScorso());
      await creaFondo({ mesi_target: 3 });

      const tre = await leggiFondo();
      expect(tre.body.copertura.spese_essenziali_mensili).toBe(900);
      expect(tre.body.soglia_euro).toBe(2700);

      const sei = await request(app).patch('/api/fondo-emergenza')
        .set(authHeader(token)).send({ mesi_target: 6 });
      expect(sei.status).toBe(200);
      expect(sei.body.mesi_target).toBe(6);
      expect(sei.body.soglia_euro).toBe(5400);
    });

    it('PATCH senza fondo risponde 404', async () => {
      const res = await request(app).patch('/api/fondo-emergenza')
        .set(authHeader(token)).send({ mesi_target: 6 });
      expect(res.status).toBe(404);
    });

    it('rifiuta una soglia non ammessa anche in PATCH', async () => {
      await creaFondo();
      const res = await request(app).patch('/api/fondo-emergenza')
        .set(authHeader(token)).send({ mesi_target: 7 });
      expect(res.status).toBe(400);
    });
  });

  describe('i soldi si spostano solo con un trasferimento', () => {
    let fondoId;

    beforeEach(async () => {
      const res = await creaFondo({ mesi_target: 3 });
      fondoId = res.body.conto.id;
    });

    it('rifiuta un\'uscita diretta dal fondo', async () => {
      const res = await request(app).post('/api/movimenti').set(authHeader(token))
        .send({
          conto_id: fondoId, tipo: 'uscita', importo: 50, categoria: 'svago', data: '2026-09-20',
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/trasferimento/i);
    });

    it('rifiuta un\'entrata diretta sul fondo', async () => {
      const res = await request(app).post('/api/movimenti').set(authHeader(token))
        .send({
          conto_id: fondoId, tipo: 'entrata', importo: 50, categoria: 'altro_entrata', data: '2026-09-20',
        });
      expect(res.status).toBe(400);
    });

    it('rifiuta di spostare un movimento esistente sul fondo', async () => {
      const mov = await uscita(30, 'svago', '2026-09-20');
      const res = await request(app).put(`/api/movimenti/${mov.body.movimento.id}`)
        .set(authHeader(token)).send({ conto_id: fondoId });
      expect(res.status).toBe(400);

      const riletto = await Movimento.findByPk(mov.body.movimento.id);
      expect(riletto.conto_id).toBe(contoId);
    });

    it('accetta un trasferimento verso il fondo e uno dal fondo', async () => {
      const dentro = await request(app).post('/api/conti/trasferimento').set(authHeader(token))
        .send({
          conto_origine_id: contoId, conto_destinazione_id: fondoId, importo: 1200, data: '2026-09-20',
        });
      expect(dentro.status).toBeLessThan(300);
      expect(Number((await Conto.findByPk(fondoId)).saldo)).toBe(1200);

      const fuori = await request(app).post('/api/conti/trasferimento').set(authHeader(token))
        .send({
          conto_origine_id: fondoId, conto_destinazione_id: contoId, importo: 200, data: '2026-09-21',
        });
      expect(fuori.status).toBeLessThan(300);
      expect(Number((await Conto.findByPk(fondoId)).saldo)).toBe(1000);
    });
  });

  describe('confine fra patrimonio e soldi spendibili', () => {
    it('il fondo resta nel patrimonio totale ma esce dal saldo effettivo', async () => {
      const fondo = await creaFondo({ mesi_target: 3 });
      await request(app).post('/api/conti/trasferimento').set(authHeader(token))
        .send({
          conto_origine_id: contoId,
          conto_destinazione_id: fondo.body.conto.id,
          importo: 2000,
          data: '2026-09-20',
        });

      const res = await request(app).get('/api/conti/patrimonio').set(authHeader(token));
      // I 5000 iniziali sono ancora tutti dell'utente: 3000 sul conto, 2000 nel
      // fondo. Il patrimonio non cambia (Regola 12), lo spendibile sì.
      expect(Number(res.body.totale)).toBe(5000);
      expect(Number(res.body.saldo_effettivo)).toBe(3000);
    });

    it('non si può rendere spendibile: PUT nascosto=false viene rifiutato', async () => {
      const fondo = await creaFondo();
      const res = await request(app).put(`/api/conti/${fondo.body.conto.id}`)
        .set(authHeader(token)).send({ nascosto: false });
      expect(res.status).toBe(400);

      const riletto = await Conto.findByPk(fondo.body.conto.id);
      expect(riletto.nascosto).toBe(true);
    });

    it('resta modificabile in ciò che non tocca i vincoli: il nome', async () => {
      const fondo = await creaFondo();
      const res = await request(app).put(`/api/conti/${fondo.body.conto.id}`)
        .set(authHeader(token)).send({ nome: 'Paracadute' });
      expect(res.status).toBe(200);
      expect((await Conto.findByPk(fondo.body.conto.id)).nome).toBe('Paracadute');
    });
  });

  describe('copertura', () => {
    it('senza storico di spese: dati_insufficienti, nessun numero inventato', async () => {
      await creaFondo({ mesi_target: 3 });
      const res = await leggiFondo();
      expect(res.body.copertura.stato).toBe('dati_insufficienti');
      expect(res.body.copertura.mesi_copertura).toBeNull();
      expect(res.body.soglia_euro).toBeNull();
      expect(res.body.mancante).toBeNull();
    });

    it('con storico ma nessuna spesa essenziale: non_calcolabile', async () => {
      await uscita(100, 'svago', meseScorso());
      await creaFondo({ mesi_target: 3 });
      const res = await leggiFondo();
      expect(res.body.copertura.stato).toBe('non_calcolabile');
      expect(res.body.soglia_euro).toBeNull();
    });

    it('con spese essenziali calcola mesi coperti, soglia e quanto manca', async () => {
      await uscita(900, 'affitto', meseScorso());
      const fondo = await creaFondo({ mesi_target: 3 });
      await request(app).post('/api/conti/trasferimento').set(authHeader(token))
        .send({
          conto_origine_id: contoId,
          conto_destinazione_id: fondo.body.conto.id,
          importo: 1800,
          data: '2026-09-20',
        });

      const res = await leggiFondo();
      expect(res.body.importo).toBe(1800);
      expect(res.body.copertura.spese_essenziali_mensili).toBe(900);
      expect(res.body.copertura.mesi_copertura).toBe(2);
      expect(res.body.soglia_euro).toBe(2700);
      expect(res.body.mancante).toBe(900);
    });

    it('superata la soglia, mancante è zero e non negativo', async () => {
      await uscita(300, 'affitto', meseScorso());
      const fondo = await creaFondo({ mesi_target: 3 });
      await request(app).post('/api/conti/trasferimento').set(authHeader(token))
        .send({
          conto_origine_id: contoId,
          conto_destinazione_id: fondo.body.conto.id,
          importo: 2000,
          data: '2026-09-20',
        });

      const res = await leggiFondo();
      expect(res.body.soglia_euro).toBe(900);
      expect(res.body.mancante).toBe(0);
    });
  });

  describe('isolamento fra utenti', () => {
    it('il fondo di un altro utente non si vede e non blocca il proprio', async () => {
      await creaFondo({ mesi_target: 12 });

      const { res: altro } = await registerUser(app);
      const altroToken = altro.body.token;

      const suo = await request(app).get('/api/fondo-emergenza').set(authHeader(altroToken));
      expect(suo.body.esiste).toBe(false);

      const creato = await request(app).post('/api/fondo-emergenza')
        .set(authHeader(altroToken)).send({ mesi_target: 3 });
      expect(creato.status).toBe(201);
      expect(creato.body.mesi_target).toBe(3);

      // Il proprio è rimasto quello di prima.
      expect((await leggiFondo()).body.mesi_target).toBe(12);
    });

    it('le tre rotte richiedono autenticazione', async () => {
      const get = await request(app).get('/api/fondo-emergenza');
      const post = await request(app).post('/api/fondo-emergenza').send({ mesi_target: 3 });
      const patch = await request(app).patch('/api/fondo-emergenza').send({ mesi_target: 3 });
      [get, post, patch].forEach((res) => expect(res.status).toBe(401));
    });
  });
});
