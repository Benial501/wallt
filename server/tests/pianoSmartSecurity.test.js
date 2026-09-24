/**
 * Isolamento fra utenti su Piano Smart.
 *
 * Un piano contiene aggregati finanziari personali: medie di entrate e spese,
 * copertura del fondo, pressione debitoria. Leggerlo cambiando l'id nell'URL
 * sarebbe una fuga di dati, non un dettaglio di implementazione — per questo
 * ogni endpoint è verificato con l'id di un altro utente, e per ciascuno si
 * controlla anche che il dato NON sia stato modificato.
 *
 * La proprietà nel controller è espressa come `where: { id, user_id }` e non
 * come una findByPk seguita da un confronto: un confronto si può dimenticare in
 * un ramo, una WHERE no. Questi test sorvegliano quella scelta.
 */
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { PianoSmartAllocazione } = require('../models');

const app = createApp({ enableRateLimit: false });

const CATEGORIE = ['needs', 'safety', 'goals', 'future', 'freedom'];

const utenteConPiano = async (etichetta) => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const userId = res.body.user.id;

  const conto = await Conto.create({
    user_id: userId, nome: `Conto ${etichetta}`, tipo: 'banca', saldo: 2000, attivo: true,
  });
  await Movimento.create({
    user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 400,
    categoria: 'casa_affitto', descrizione: `Affitto ${etichetta}`,
    data: new Date().toISOString().slice(0, 10), ricorrente: false,
  });

  const piano = await request(app).post('/api/piano-smart').set(authHeader(token)).send({
    amount: etichetta === 'A' ? '800.00' : '1200.00',
    sourceType: 'regalo',
    recurring: false,
    mandatoryExpenses: '0.00',
  });

  return { token, userId, piano: piano.body };
};

let utenteA;
let utenteB;

beforeEach(async () => {
  utenteA = await utenteConPiano('A');
  utenteB = await utenteConPiano('B');
});

describe('GET /api/piano-smart — elenco', () => {
  test('ogni utente vede solo i propri piani', async () => {
    const risA = await request(app).get('/api/piano-smart').set(authHeader(utenteA.token));
    const risB = await request(app).get('/api/piano-smart').set(authHeader(utenteB.token));

    expect(risA.body.total).toBe(1);
    expect(risB.body.total).toBe(1);
    expect(risA.body.data[0].id).toBe(utenteA.piano.id);
    expect(risB.body.data[0].id).toBe(utenteB.piano.id);
    expect(risA.body.data.map((p) => p.id)).not.toContain(utenteB.piano.id);
    expect(risB.body.data.map((p) => p.id)).not.toContain(utenteA.piano.id);
  });

  test('gli importi di un utente non compaiono nell elenco dell altro', async () => {
    const risA = await request(app).get('/api/piano-smart').set(authHeader(utenteA.token));
    expect(JSON.stringify(risA.body)).not.toContain('1200.00');
  });
});

describe('GET /api/piano-smart/:id — dettaglio', () => {
  test('il piano di un altro utente risponde 404, non 403 con i dati', async () => {
    const res = await request(app).get(`/api/piano-smart/${utenteB.piano.id}`)
      .set(authHeader(utenteA.token));
    expect(res.status).toBe(404);
    expect(res.body.allocations).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('1200.00');
  });

  test('vale nei due sensi', async () => {
    const res = await request(app).get(`/api/piano-smart/${utenteA.piano.id}`)
      .set(authHeader(utenteB.token));
    expect(res.status).toBe(404);
  });

  test('senza token nessun dettaglio', async () => {
    const res = await request(app).get(`/api/piano-smart/${utenteA.piano.id}`);
    expect(res.status).toBe(401);
  });

  test('con un token malformato nessun dettaglio', async () => {
    const res = await request(app).get(`/api/piano-smart/${utenteA.piano.id}`)
      .set({ Authorization: 'Bearer non-un-token' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/piano-smart/:id — allocazioni', () => {
  test('non si possono modificare le allocazioni di un altro utente', async () => {
    const prima = await PianoSmartAllocazione.findAll({
      where: { plan_id: utenteB.piano.id },
      order: [['category', 'ASC']],
    });

    const res = await request(app).patch(`/api/piano-smart/${utenteB.piano.id}`)
      .set(authHeader(utenteA.token)).send({
        allocations: CATEGORIE.map((category) => ({
          category, finalAmount: category === 'freedom' ? '1200.00' : '0.00',
        })),
      });

    expect(res.status).toBe(404);

    const dopo = await PianoSmartAllocazione.findAll({
      where: { plan_id: utenteB.piano.id },
      order: [['category', 'ASC']],
    });
    expect(dopo.map((a) => a.final_amount)).toEqual(prima.map((a) => a.final_amount));
  });

  test('il proprietario invece può', async () => {
    const res = await request(app).patch(`/api/piano-smart/${utenteB.piano.id}`)
      .set(authHeader(utenteB.token)).send({
        allocations: CATEGORIE.map((category) => ({
          category, finalAmount: category === 'freedom' ? '1200.00' : '0.00',
        })),
      });
    expect(res.status).toBe(200);
    expect(res.body.allocations.find((a) => a.category === 'freedom').finalAmount).toBe('1200.00');
  });
});

describe('PATCH /api/piano-smart/:id — stato', () => {
  test('non si può cambiare lo stato del piano di un altro utente', async () => {
    const res = await request(app).patch(`/api/piano-smart/${utenteB.piano.id}`)
      .set(authHeader(utenteA.token)).send({ status: 'archived' });

    expect(res.status).toBe(404);

    const controllo = await request(app).get(`/api/piano-smart/${utenteB.piano.id}`)
      .set(authHeader(utenteB.token));
    expect(controllo.body.status).toBe('draft');
  });

  test('non si può archiviare per rendere inaccessibile il piano di un altro', async () => {
    await request(app).patch(`/api/piano-smart/${utenteB.piano.id}`)
      .set(authHeader(utenteA.token)).send({ status: 'archived' });
    const proprietario = await request(app).get(`/api/piano-smart/${utenteB.piano.id}`)
      .set(authHeader(utenteB.token));
    expect(proprietario.status).toBe(200);
    expect(proprietario.body.status).toBe('draft');
  });
});

describe('POST /api/piano-smart — creazione', () => {
  test('il piano viene sempre intestato all utente del token', async () => {
    const res = await request(app).post('/api/piano-smart').set(authHeader(utenteA.token)).send({
      amount: '300.00',
      sourceType: 'bonus',
      recurring: false,
      mandatoryExpenses: '0.00',
      // Un client che prova a intestare il piano a un altro utente.
      user_id: utenteB.userId,
      userId: utenteB.userId,
    });

    expect(res.status).toBe(201);
    const elencoB = await request(app).get('/api/piano-smart').set(authHeader(utenteB.token));
    expect(elencoB.body.total).toBe(1);
    expect(elencoB.body.data.map((p) => p.incomingAmount)).not.toContain('300.00');

    const elencoA = await request(app).get('/api/piano-smart').set(authHeader(utenteA.token));
    expect(elencoA.body.data.map((p) => p.incomingAmount)).toContain('300.00');
  });

  test('un id inviato dal client non sovrascrive un piano esistente', async () => {
    const res = await request(app).post('/api/piano-smart').set(authHeader(utenteA.token)).send({
      id: utenteB.piano.id,
      amount: '450.00',
      sourceType: 'regalo',
      recurring: false,
      mandatoryExpenses: '0.00',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(utenteB.piano.id);

    const pianoB = await request(app).get(`/api/piano-smart/${utenteB.piano.id}`)
      .set(authHeader(utenteB.token));
    expect(pianoB.body.incomingAmount).toBe('1200.00');
  });
});

describe('readiness e preview', () => {
  test('la readiness riflette solo il contesto dell utente autenticato', async () => {
    const risA = await request(app).get('/api/piano-smart/readiness').set(authHeader(utenteA.token));
    expect(risA.status).toBe(200);
    expect(JSON.stringify(risA.body)).not.toContain('Affitto B');
  });

  test('la preview non accetta un utente diverso da quello del token', async () => {
    const res = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(utenteA.token))
      .send({
        amount: '100.00',
        sourceType: 'regalo',
        recurring: false,
        user_id: utenteB.userId,
      });
    expect(res.status).toBe(200);
    // Nessun piano salvato per nessuno dei due: la preview non persiste.
    const elencoB = await request(app).get('/api/piano-smart').set(authHeader(utenteB.token));
    expect(elencoB.body.total).toBe(1);
  });
});
