const { request, createApp, registerUser, authHeader } = require('./setup');
const { User, ProfiloUtente, OnboardingSession, Conto, Movimento, Obiettivo, Debito, CategoriaDefaultNascosta } = require('../models');

const app = createApp({ enableRateLimit: false });

test('la bozza resta disponibile dopo un nuovo accesso oltre i quindici minuti', async () => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const userId = res.body.user.id;

  const initial = await request(app).get('/api/onboarding').set(authHeader(token));
  expect(initial.status).toBe(200);
  expect(initial.body.session.schema_version).toBe(2);

  const saved = await request(app).put('/api/onboarding').set(authHeader(token)).send({
    current_step: 'categorie',
    answers: { utilizzi: ['risparmiare'], fascia_eta: '25_34' },
  });
  expect(saved.status).toBe(200);

  await User.update({ created_at: new Date(Date.now() - 60 * 60 * 1000) }, { where: { id: userId }, silent: true });
  const me = await request(app).get('/api/auth/me').set(authHeader(token));
  expect(me.status).toBe(200);
  expect(me.body.user.profilo.onboarding_completato).toBe(false);

  const resumed = await request(app).get('/api/onboarding').set(authHeader(token));
  expect(resumed.body.session.current_step).toBe('categorie');
  expect(resumed.body.session.answers.utilizzi).toEqual(['risparmiare']);
  expect(await OnboardingSession.count({ where: { user_id: userId } })).toBe(1);
  expect(await ProfiloUtente.count({ where: { user_id: userId, onboarding_completato: true } })).toBe(0);
});

test('una sessione guidata non si può completare dal vecchio endpoint profilo', async () => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const update = await request(app).put('/api/profilo').set(authHeader(token)).send({ fascia_eta: '25_34', onboarding_completato: true });
  expect(update.status).toBe(409);
  const skip = await request(app).post('/api/profilo/skip-onboarding').set(authHeader(token));
  expect(skip.status).toBe(409);
  expect((await ProfiloUtente.findOne({ where: { user_id: res.body.user.id } })).onboarding_completato).toBe(false);
});

test('il salvataggio rifiuta una revisione superata e l’ultimo completamento concorrente non duplica i dati', async () => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const answers = { fascia_eta: '25_34', conti: [{ key: 'principale', nome: 'Principale', tipo: 'banca', saldo: 13.99 }] };
  const firstSave = await request(app).put('/api/onboarding').set(authHeader(token)).send({ current_step: 'riepilogo', revision: 0, answers });
  expect(firstSave.status).toBe(200);
  const staleSave = await request(app).put('/api/onboarding').set(authHeader(token)).send({ current_step: 'riepilogo', revision: 0, answers });
  expect(staleSave.status).toBe(409);
  const [first, second] = await Promise.all([
    request(app).post('/api/onboarding/finalize').set(authHeader(token)),
    request(app).post('/api/onboarding/finalize').set(authHeader(token)),
  ]);
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(first.body).toEqual(second.body);
  expect(await Conto.count({ where: { user_id: res.body.user.id } })).toBe(1);
});

test('la finalizzazione crea dati reali una sola volta e conserva il saldo dichiarato', async () => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const userId = res.body.user.id;
  const answers = {
    fascia_eta: '25_34',
    utilizzi: ['controllare_spese'],
    categorie: { selected: [{ id: 'cibo_spesa', tipo: 'uscita' }, { id: 'stipendio', tipo: 'entrata' }], custom: [] },
    conti: [{ key: 'conto-casa', nome: 'Conto Casa', tipo: 'banca', saldo: 1450 }],
    entrate: [{ key: 'stipendio', nome: 'Stipendio', importo: 1800, frequenza: 'mensile', giorno: 27, categoria: 'stipendio', conto_key: 'conto-casa' }],
    spese: [{ key: 'spesa', nome: 'Spesa alimentare', importo: 200, frequenza: 'mensile', giorno: 5, categoria: 'cibo_spesa', conto_key: 'conto-casa' }],
    obiettivi: [{ nome: 'Viaggio', importo_target: 1000, importo_attuale: 100 }],
    preferenze: { riepilogo_settimanale_attivo: true },
  };
  const saved = await request(app).put('/api/onboarding').set(authHeader(token)).send({ current_step: 'riepilogo', answers });
  expect(saved.status).toBe(200);

  const first = await request(app).post('/api/onboarding/finalize').set(authHeader(token));
  expect(first.status).toBe(200);
  expect(first.body.riepilogo.conti).toBe(1);
  const second = await request(app).post('/api/onboarding/finalize').set(authHeader(token));
  expect(second.status).toBe(200);
  expect(second.body).toEqual(first.body);

  const conto = await Conto.findOne({ where: { user_id: userId } });
  expect(Number(conto.saldo)).toBe(1450);
  expect(await Movimento.count({ where: { user_id: userId, ricorrente: true } })).toBe(2);
  expect(await Movimento.count({ where: { user_id: userId, ricorrente: false } })).toBe(0);
  expect(await Obiettivo.count({ where: { user_id: userId } })).toBe(1);
  expect(await CategoriaDefaultNascosta.count({ where: { user_id: userId } })).toBeGreaterThan(0);
  expect((await ProfiloUtente.findOne({ where: { user_id: userId } })).onboarding_completato).toBe(true);
});

test('un debito con solo il residuo noto non richiede una rata o un conto', async () => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const userId = res.body.user.id;
  await request(app).put('/api/onboarding').set(authHeader(token)).send({
    current_step: 'riepilogo',
    answers: { fascia_eta: '25_34', impegni: [{ nome: 'Prestito personale', rata: '', saldo_residuo: 1234.56 }] },
  });

  const finalized = await request(app).post('/api/onboarding/finalize').set(authHeader(token));
  expect(finalized.status).toBe(200);
  const debt = await Debito.findOne({ where: { user_id: userId } });
  expect(Number(debt.saldo_residuo)).toBe(1234.56);
  expect(debt.rata_periodica).toBeNull();
  expect(debt.conto_id).toBeNull();
  expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);
});

test('l’estratto viene rivisto nella bozza e importato senza modificare il saldo attuale', async () => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const userId = res.body.user.id;
  await request(app).put('/api/onboarding').set(authHeader(token)).send({
    current_step: 'import',
    answers: {
      fascia_eta: '25_34',
      categorie: { selected: [{ id: 'cibo_spesa', tipo: 'uscita' }], custom: [] },
      conti: [{ key: 'conto-1', nome: 'Banca', tipo: 'banca', saldo: 100 }],
    },
  });
  const csv = Buffer.from('Data;Descrizione;Importo\n01/09/2026;NEGOZIO TEST;-12,50');
  const preview = await request(app).post('/api/onboarding/imports').set(authHeader(token))
    .field('account_key', 'conto-1').attach('file', csv, 'estratto.csv');
  expect(preview.status).toBe(200);
  expect(preview.body.items).toHaveLength(1);
  const importId = preview.body.import_id;
  const rowId = preview.body.items[0].clientTxId;
  const confirmed = await request(app).put(`/api/onboarding/imports/${importId}`).set(authHeader(token)).send({
    rows: [{ clientTxId: rowId, categoria_finale: 'cibo_spesa', includi: true }],
  });
  expect(confirmed.status).toBe(200);

  const finalized = await request(app).post('/api/onboarding/finalize').set(authHeader(token));
  expect(finalized.status).toBe(200);
  expect(finalized.body.riepilogo.movimenti_importati).toBe(1);
  expect(Number((await Conto.findOne({ where: { user_id: userId } })).saldo)).toBe(100);
  const movement = await Movimento.findOne({ where: { user_id: userId, ricorrente: false } });
  expect(movement.categoria).toBe('cibo_spesa');
  expect(movement.origine).toBe('import');
});

test('un errore durante la scrittura annulla ogni dato e consente un nuovo tentativo', async () => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const userId = res.body.user.id;
  await request(app).put('/api/onboarding').set(authHeader(token)).send({
    current_step: 'riepilogo',
    answers: {
      fascia_eta: '25_34',
      categorie: { selected: [{ id: 'cibo_spesa', tipo: 'uscita' }], custom: [] },
      conti: [{ key: 'c1', nome: 'Banca', tipo: 'banca', saldo: 40 }],
      obiettivi: [{ nome: 'Viaggio', importo_target: 500 }],
    },
  });
  const broken = jest.spyOn(Obiettivo, 'create').mockRejectedValueOnce(new Error('Errore simulato'));
  const failed = await request(app).post('/api/onboarding/finalize').set(authHeader(token));
  broken.mockRestore();
  expect(failed.status).toBe(500);
  expect(await Conto.count({ where: { user_id: userId } })).toBe(0);
  expect(await CategoriaDefaultNascosta.count({ where: { user_id: userId } })).toBe(0);
  expect((await OnboardingSession.findOne({ where: { user_id: userId } })).status).toBe('draft');
  expect((await request(app).post('/api/onboarding/finalize').set(authHeader(token))).status).toBe(200);
});

test('un utente non può confermare l’estratto di un altro', async () => {
  const first = (await registerUser(app)).res.body;
  const second = (await registerUser(app)).res.body;
  await request(app).put('/api/onboarding').set(authHeader(first.token)).send({
    current_step: 'import',
    answers: { fascia_eta: '25_34', conti: [{ key: 'c1', nome: 'Banca', tipo: 'banca', saldo: 0 }] },
  });
  const preview = await request(app).post('/api/onboarding/imports').set(authHeader(first.token))
    .field('account_key', 'c1').attach('file', Buffer.from('Data;Descrizione;Importo\n01/09/2026;NEGOZIO TEST;-12,50'), 'estratto.csv');
  expect(preview.status).toBe(200);
  const other = await request(app).put(`/api/onboarding/imports/${preview.body.import_id}`).set(authHeader(second.token)).send({ rows: [] });
  expect(other.status).toBe(404);
});

test('il percorso minimale completa il profilo senza creare dati fittizi', async () => {
  const { res } = await registerUser(app);
  const token = res.body.token;
  const userId = res.body.user.id;
  await request(app).put('/api/onboarding').set(authHeader(token)).send({ current_step: 'riepilogo', answers: { fascia_eta: 'under_18' } });
  const done = await request(app).post('/api/onboarding/finalize').set(authHeader(token));
  expect(done.status).toBe(200);
  expect(done.body.riepilogo.conti).toBe(0);
  expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);
  expect(await Conto.count({ where: { user_id: userId } })).toBe(0);
});
