/**
 * API di Piano Smart contro il database reale: readiness, preview,
 * salvataggio, elenco, dettaglio, PATCH, capitale zero.
 *
 * Qui il FinancialContext è quello vero (non una fixture): serve a verificare
 * che la catena regga end-to-end, compreso il fatto che salvare un piano NON
 * muova denaro.
 */
const {
  request, createApp, registerUser, authHeader,
  Conto, Movimento, sequelize,
} = require('./setup');
const { Obiettivo, Debito, PianoSmart } = require('../models');

const app = createApp({ enableRateLimit: false });

const CATEGORIE = ['needs', 'safety', 'goals', 'future', 'freedom'];

const nuovoUtente = async () => {
  const { res } = await registerUser(app);
  return { token: res.body.token, userId: res.body.user.id };
};

/** Utente con storico: conto, entrate e uscite su mesi civili completi. */
const utenteConStorico = async ({ conObiettivo = true } = {}) => {
  const { token, userId } = await nuovoUtente();
  const conto = await Conto.create({
    user_id: userId, nome: 'Principale', tipo: 'banca', saldo: 3000, attivo: true,
  });

  const oggi = new Date();
  const mese = (indietro) => {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() - indietro, 10);
    return d.toISOString().slice(0, 10);
  };
  // Primo movimento al giorno 1 del mese più vecchio: senza questo il primo
  // mese sarebbe scartato come parziale (vedi finestraMesi.service.js).
  const primoGiorno = (indietro) => {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() - indietro, 1);
    return d.toISOString().slice(0, 10);
  };

  for (let i = 5; i >= 1; i -= 1) {
    const data = i === 5 ? primoGiorno(i) : mese(i);
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'entrata', importo: 2000,
      categoria: 'stipendio', descrizione: `Stipendio ${i}`, data,
      periodicita_entrata: 'ricorrente', ricorrente: false,
    });
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 800,
      categoria: 'casa_affitto', descrizione: `Affitto ${i}`, data: mese(i), ricorrente: false,
    });
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300,
      categoria: 'svago_ristoranti', descrizione: `Svago ${i}`, data: mese(i), ricorrente: false,
    });
  }

  if (conObiettivo) {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 2000, importo_attuale: 500,
      tipo_obiettivo: 'generico', priorita: 'media', completato: false,
    });
  }
  return { token, userId, conto };
};

const inputBase = (over = {}) => ({
  amount: '800.00',
  sourceType: 'regalo',
  recurring: false,
  mandatoryExpenses: '0.00',
  ...over,
});

const decimale = /^-?\d+\.\d{2}$/;

describe('GET /api/piano-smart/readiness', () => {
  test('richiede autenticazione', async () => {
    const res = await request(app).get('/api/piano-smart/readiness');
    expect(res.status).toBe(401);
  });

  test('un utente nuovo riceve domande e confidenza insufficiente', async () => {
    const { token } = await nuovoUtente();
    const res = await request(app).get('/api/piano-smart/readiness').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.dataConfidence).toBe('INSUFFICIENT');
    expect(res.body.questions.length).toBeGreaterThan(0);
    expect(res.body.missingFields).toContain('essential_monthly_expenses');
    // Nessuna domanda blocca il piano.
    res.body.questions.forEach((d) => expect(d.required).toBe(false));
  });

  test('ogni domanda ha la forma dichiarata nel contratto', async () => {
    const { token } = await nuovoUtente();
    const res = await request(app).get('/api/piano-smart/readiness').set(authHeader(token));
    res.body.questions.forEach((d) => {
      expect(d).toEqual(expect.objectContaining({
        key: expect.any(String),
        type: 'currency',
        label: expect.any(String),
        description: expect.any(String),
        required: false,
        impact: expect.stringMatching(/^(alto|medio)$/),
        validation: expect.objectContaining({ min: 0, decimals: 2 }),
      }));
    });
  });

  test('un utente con storico non viene interrogato su ciò che WALLT già sa', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).get('/api/piano-smart/readiness').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.missingFields).not.toContain('monthly_income_average');
    expect(res.body.missingFields).not.toContain('essential_monthly_expenses');
    expect(res.body.contextSummary.income.recurringMonthlyAverage).toMatch(decimale);
  });

  test('senza ricorrenze non suggerisce spese obbligatorie', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).get('/api/piano-smart/readiness').set(authHeader(token));
    expect(res.body.suggestedMandatoryExpenses.supported).toBe(false);
    expect(res.body.suggestedMandatoryExpenses.amount).toBeNull();
    expect(res.body.suggestedMandatoryExpenses.appliedAutomatically).toBe(false);
  });

  test('con una ricorrenza attiva non addebitata suggerisce un importo reale', async () => {
    const { token, userId, conto } = await utenteConStorico();
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 120,
      categoria: 'casa_utenze', descrizione: 'Luce', data: new Date().toISOString().slice(0, 10),
      ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 28,
      stato_ricorrenza: 'attiva',
    });
    const res = await request(app).get('/api/piano-smart/readiness').set(authHeader(token));
    expect(res.body.suggestedMandatoryExpenses.supported).toBe(true);
    expect(res.body.suggestedMandatoryExpenses.amount).toMatch(decimale);
    expect(res.body.suggestedMandatoryExpenses.source).toBe('impegni_ricorrenti_non_addebitati');
    expect(res.body.suggestedMandatoryExpenses.appliedAutomatically).toBe(false);
  });

  test('il corpo non ha una chiave data di primo livello', async () => {
    const { token } = await nuovoUtente();
    const res = await request(app).get('/api/piano-smart/readiness').set(authHeader(token));
    expect(res.body.data).toBeUndefined();
  });
});

describe('POST /api/piano-smart/preview', () => {
  test('richiede autenticazione', async () => {
    const res = await request(app).post('/api/piano-smart/preview').send(inputBase());
    expect(res.status).toBe(401);
  });

  test('restituisce cinque categorie con importi come stringhe decimali', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase());

    expect(res.status).toBe(200);
    expect(res.body.engineVersion).toBe('smart-v1');
    expect(res.body.allocations.map((a) => a.category)).toEqual(CATEGORIE);
    expect(res.body.incomingAmount).toBe('800.00');
    expect(res.body.allocatableCapital).toBe('800.00');
    res.body.allocations.forEach((a) => {
      expect(a.recommendedAmount).toMatch(decimale);
      expect(a.finalAmount).toMatch(decimale);
      expect(typeof a.recommendedPercentage).toBe('number');
    });
  });

  test('la somma delle quote è esattamente il capitale allocabile', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase({ amount: '1000.00', mandatoryExpenses: '400.00' }));

    const somma = res.body.allocations
      .reduce((s, a) => s + Math.round(Number(a.recommendedAmount) * 100), 0);
    expect(somma).toBe(60000);
    expect(res.body.allocatableCapital).toBe('600.00');
  });

  test('include profilo, motivazioni e riepilogo del contesto', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase());

    expect(res.body.financialProfile).toEqual(expect.objectContaining({
      incomeStability: expect.any(String),
      dataConfidence: expect.any(String),
      unknownBands: expect.any(Array),
    }));
    expect(res.body.reasonCodes.length).toBeGreaterThan(0);
    expect(res.body.reasons.length).toBeGreaterThan(0);
    expect(res.body.reasons.length).toBeLessThanOrEqual(5);
    res.body.reasons.forEach((r) => {
      expect(r).toEqual(expect.objectContaining({
        code: expect.any(String), titolo: expect.any(String), testo: expect.any(String),
      }));
    });
    expect(res.body.contextSummary.period.averageMonths).toBeDefined();
  });

  test('non salva niente', async () => {
    const { token, userId } = await utenteConStorico();
    await request(app).post('/api/piano-smart/preview').set(authHeader(token)).send(inputBase());
    expect(await PianoSmart.count({ where: { user_id: userId } })).toBe(0);
  });

  test('un utente nuovo ottiene comunque un piano', async () => {
    const { token } = await nuovoUtente();
    const res = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase());
    expect(res.status).toBe(200);
    expect(res.body.allocations).toHaveLength(5);
    expect(res.body.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });

  test('capitale zero: stato esplicito, nessuna percentuale', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase({ amount: '500.00', mandatoryExpenses: '500.00' }));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('capitale_zero');
    expect(res.body.allocatableCapital).toBe('0.00');
    res.body.allocations.forEach((a) => {
      expect(a.recommendedAmount).toBe('0.00');
      expect(a.recommendedPercentage).toBeNull();
    });
    expect(res.body.reasonCodes).toContain('ZERO_ALLOCATABLE_CAPITAL');
    expect(res.body.warnings.length).toBeGreaterThan(0);
  });

  test('le risposte manuali valgono per il piano e non scrivono nulla', async () => {
    const { token, userId } = await nuovoUtente();
    const res = await request(app).post('/api/piano-smart/preview').set(authHeader(token))
      .send(inputBase({
        manualContextAnswers: { essential_monthly_expenses: '700.00', monthly_income_average: '1600.00' },
      }));

    expect(res.status).toBe(200);
    expect(res.body.reasonCodes).toContain('MANUAL_CONTEXT_USED');
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);
    expect(await Conto.count({ where: { user_id: userId } })).toBe(0);
    expect(await Obiettivo.count({ where: { user_id: userId } })).toBe(0);
  });

  test.each([
    ['importo assente', { amount: undefined }],
    ['importo zero', { amount: '0.00' }],
    ['importo negativo', { amount: '-100.00' }],
    ['importo con tre decimali', { amount: '100.005' }],
    ['importo non numerico', { amount: 'abc' }],
    ['importo in notazione esponenziale', { amount: '8e3' }],
    ['origine non valida', { sourceType: 'crypto' }],
    ['origine assente', { sourceType: undefined }],
    ['ricorrenza assente', { recurring: undefined }],
    ['ricorrenza non booleana', { recurring: 'si' }],
    ['spese obbligatorie negative', { mandatoryExpenses: '-1.00' }],
    ['risposta di contesto non riconosciuta', { manualContextAnswers: { qualcosa: 1 } }],
  ])('rifiuta con 400: %s', async (_nome, over) => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase(over));
    expect(res.status).toBe(400);
  });

  test('NaN e Infinity sono rifiutati', async () => {
    const { token } = await utenteConStorico();
    for (const amount of ['NaN', 'Infinity', '-Infinity']) {
      const res = await request(app).post('/api/piano-smart/preview')
        .set(authHeader(token)).send(inputBase({ amount }));
      expect(res.status).toBe(400);
    }
  });

  test('è deterministica a contesto invariato', async () => {
    const { token } = await utenteConStorico();
    const primo = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase());
    const secondo = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase());
    expect(secondo.body.allocations).toEqual(primo.body.allocations);
    expect(secondo.body.reasonCodes).toEqual(primo.body.reasonCodes);
  });
});

describe('POST /api/piano-smart', () => {
  test('salva il piano con recommended e final distinti', async () => {
    const { token } = await utenteConStorico();
    const preview = await request(app).post('/api/piano-smart/preview')
      .set(authHeader(token)).send(inputBase());

    // L'utente sposta 50 € da freedom a goals.
    const allocations = preview.body.allocations.map((a) => ({
      category: a.category,
      finalAmount: a.category === 'goals'
        ? (Number(a.recommendedAmount) + 50).toFixed(2)
        : a.category === 'freedom'
          ? (Number(a.recommendedAmount) - 50).toFixed(2)
          : a.recommendedAmount,
    }));

    const res = await request(app).post('/api/piano-smart')
      .set(authHeader(token)).send({ ...inputBase(), allocations });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('draft');
    expect(res.body.engineVersion).toBe('smart-v1');

    const goals = res.body.allocations.find((a) => a.category === 'goals');
    const previewGoals = preview.body.allocations.find((a) => a.category === 'goals');
    expect(goals.recommendedAmount).toBe(previewGoals.recommendedAmount);
    expect(Number(goals.finalAmount)).toBeCloseTo(Number(previewGoals.recommendedAmount) + 50, 2);
  });

  test('senza allocazioni salva le raccomandate come finali', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart')
      .set(authHeader(token)).send(inputBase());

    expect(res.status).toBe(201);
    res.body.allocations.forEach((a) => {
      expect(a.finalAmount).toBe(a.recommendedAmount);
    });
  });

  test('ignora le raccomandate inviate dal client e ricalcola', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart').set(authHeader(token)).send({
      ...inputBase(),
      // Un client malevolo dichiara che la raccomandazione era tutta su freedom.
      allocations: CATEGORIE.map((category) => ({
        category,
        recommendedAmount: category === 'freedom' ? '800.00' : '0.00',
        finalAmount: category === 'freedom' ? '800.00' : '0.00',
      })),
    });

    expect(res.status).toBe(201);
    const freedom = res.body.allocations.find((a) => a.category === 'freedom');
    // Le finali sono quelle scelte (valide: sommano a 800), le raccomandate no.
    expect(freedom.finalAmount).toBe('800.00');
    expect(freedom.recommendedAmount).not.toBe('800.00');
  });

  test('salvare un piano non muove denaro', async () => {
    const { token, userId, conto } = await utenteConStorico();
    const movimentiPrima = await Movimento.count({ where: { user_id: userId } });
    const obiettivoPrima = await Obiettivo.findOne({ where: { user_id: userId } });

    await request(app).post('/api/piano-smart').set(authHeader(token)).send(inputBase());

    const contoDopo = await Conto.findByPk(conto.id);
    const obiettivoDopo = await Obiettivo.findOne({ where: { user_id: userId } });
    expect(Number(contoDopo.saldo)).toBe(3000);
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(movimentiPrima);
    expect(Number(obiettivoDopo.importo_attuale)).toBe(Number(obiettivoPrima.importo_attuale));
  });

  test('salva cinque allocazioni, una per categoria', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart')
      .set(authHeader(token)).send(inputBase());
    expect(res.body.allocations).toHaveLength(5);
    expect(res.body.allocations.map((a) => a.category)).toEqual(CATEGORIE);
  });

  test('conserva lo snapshot del contesto e i reason code', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart')
      .set(authHeader(token)).send(inputBase());

    expect(res.body.contextSummary).toEqual(expect.objectContaining({
      period: expect.any(Object),
      dataQuality: expect.any(Object),
      income: expect.any(Object),
      profile: expect.any(Object),
    }));
    expect(res.body.reasonCodes.length).toBeGreaterThan(0);
    // Lo snapshot NON contiene una copia dei movimenti.
    expect(JSON.stringify(res.body.contextSummary)).not.toMatch(/Affitto|Stipendio 1/);
  });

  test('rifiuta allocazioni la cui somma non coincide', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart').set(authHeader(token)).send({
      ...inputBase(),
      allocations: CATEGORIE.map((category) => ({ category, finalAmount: '100.00' })),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non coincide/);
  });

  test('rifiuta una categoria mancante', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart').set(authHeader(token)).send({
      ...inputBase(),
      allocations: [{ category: 'needs', finalAmount: '800.00' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mancanti/);
  });

  test('rifiuta un importo negativo in una categoria', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart').set(authHeader(token)).send({
      ...inputBase(),
      allocations: [
        { category: 'needs', finalAmount: '-100.00' },
        { category: 'safety', finalAmount: '400.00' },
        { category: 'goals', finalAmount: '200.00' },
        { category: 'future', finalAmount: '200.00' },
        { category: 'freedom', finalAmount: '100.00' },
      ],
    });
    expect(res.status).toBe(400);
  });

  test('rifiuta una categoria sconosciuta', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart').set(authHeader(token)).send({
      ...inputBase(),
      allocations: [...CATEGORIE.map((category) => ({ category, finalAmount: '160.00' }))]
        .concat([{ category: 'crypto', finalAmount: '0.00' }]),
    });
    expect(res.status).toBe(400);
  });

  test('salva anche un piano a capitale zero', async () => {
    const { token } = await utenteConStorico();
    const res = await request(app).post('/api/piano-smart')
      .set(authHeader(token)).send(inputBase({ amount: '500.00', mandatoryExpenses: '500.00' }));

    expect(res.status).toBe(201);
    expect(res.body.allocatableCapital).toBe('0.00');
    res.body.allocations.forEach((a) => {
      expect(a.finalAmount).toBe('0.00');
      expect(a.finalPercentage).toBeNull();
    });
  });
});

describe('GET /api/piano-smart', () => {
  test('richiede autenticazione', async () => {
    expect((await request(app).get('/api/piano-smart')).status).toBe(401);
  });

  test('elenco vuoto per un utente senza piani', async () => {
    const { token } = await nuovoUtente();
    const res = await request(app).get('/api/piano-smart').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], total: 0 });
  });

  test('restituisce i piani in { data, total } dal più recente', async () => {
    const { token } = await utenteConStorico();
    await request(app).post('/api/piano-smart').set(authHeader(token)).send(inputBase({ amount: '100.00' }));
    await request(app).post('/api/piano-smart').set(authHeader(token)).send(inputBase({ amount: '200.00' }));

    const res = await request(app).get('/api/piano-smart').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].incomingAmount).toBe('200.00');
    expect(res.body.data[0].allocations).toHaveLength(5);
    expect(res.body.data[0].allocations[0].finalAmount).toMatch(decimale);
  });
});

describe('GET /api/piano-smart/:id', () => {
  test('dettaglio completo del proprietario', async () => {
    const { token } = await utenteConStorico();
    const creato = await request(app).post('/api/piano-smart')
      .set(authHeader(token)).send(inputBase());

    const res = await request(app).get(`/api/piano-smart/${creato.body.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      id: creato.body.id,
      status: 'draft',
      engineVersion: 'smart-v1',
      incomingAmount: '800.00',
      allocatableCapital: '800.00',
    }));
    expect(res.body.allocations).toHaveLength(5);
    expect(res.body.reasons.length).toBeGreaterThan(0);
    expect(res.body.contextSummary).not.toBeNull();
  });

  test('404 per un id inesistente', async () => {
    const { token } = await nuovoUtente();
    expect((await request(app).get('/api/piano-smart/999999').set(authHeader(token))).status).toBe(404);
  });

  test('400 per un id non numerico', async () => {
    const { token } = await nuovoUtente();
    expect((await request(app).get('/api/piano-smart/abc').set(authHeader(token))).status).toBe(400);
  });
});

describe('PATCH /api/piano-smart/:id', () => {
  const creaPiano = async (token) => {
    const res = await request(app).post('/api/piano-smart')
      .set(authHeader(token)).send(inputBase());
    return res.body;
  };

  test('aggiorna le allocazioni finali mantenendo le raccomandate', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);

    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({
        allocations: [
          { category: 'needs', finalAmount: '300.00' },
          { category: 'safety', finalAmount: '200.00' },
          { category: 'goals', finalAmount: '100.00' },
          { category: 'future', finalAmount: '150.00' },
          { category: 'freedom', finalAmount: '50.00' },
        ],
      });

    expect(res.status).toBe(200);
    const needs = res.body.allocations.find((a) => a.category === 'needs');
    const originale = piano.allocations.find((a) => a.category === 'needs');
    expect(needs.finalAmount).toBe('300.00');
    expect(needs.recommendedAmount).toBe(originale.recommendedAmount);
  });

  test('ricalcola le percentuali finali', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);
    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({
        allocations: [
          { category: 'needs', finalAmount: '400.00' },
          { category: 'safety', finalAmount: '200.00' },
          { category: 'goals', finalAmount: '100.00' },
          { category: 'future', finalAmount: '80.00' },
          { category: 'freedom', finalAmount: '20.00' },
        ],
      });
    const needs = res.body.allocations.find((a) => a.category === 'needs');
    expect(needs.finalPercentage).toBe(50);
  });

  test('rifiuta una somma diversa dal capitale allocabile', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);
    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({
        allocations: CATEGORIE.map((category) => ({ category, finalAmount: '100.00' })),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non coincide/);
  });

  test('rifiuta un importo negativo', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);
    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({
        allocations: [
          { category: 'needs', finalAmount: '-50.00' },
          { category: 'safety', finalAmount: '450.00' },
          { category: 'goals', finalAmount: '200.00' },
          { category: 'future', finalAmount: '150.00' },
          { category: 'freedom', finalAmount: '50.00' },
        ],
      });
    expect(res.status).toBe(400);
  });

  test('cambia stato secondo le transizioni ammesse', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);

    const attivo = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({ status: 'active' });
    expect(attivo.status).toBe(200);
    expect(attivo.body.status).toBe('active');

    const completato = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({ status: 'completed' });
    expect(completato.body.status).toBe('completed');

    const archiviato = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({ status: 'archived' });
    expect(archiviato.body.status).toBe('archived');
  });

  test('rifiuta una transizione non ammessa', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);
    await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({ status: 'archived' });

    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({ status: 'active' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Transizione non ammessa/);
  });

  test('rifiuta uno stato inesistente', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);
    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({ status: 'boh' });
    expect(res.status).toBe(400);
  });

  test('un PATCH vuoto è un errore, non un no-op silenzioso', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);
    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({});
    expect(res.status).toBe(400);
  });

  test('aggiorna allocazioni e stato nella stessa richiesta', async () => {
    const { token } = await utenteConStorico();
    const piano = await creaPiano(token);
    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({
        status: 'active',
        allocations: [
          { category: 'needs', finalAmount: '200.00' },
          { category: 'safety', finalAmount: '200.00' },
          { category: 'goals', finalAmount: '200.00' },
          { category: 'future', finalAmount: '150.00' },
          { category: 'freedom', finalAmount: '50.00' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.allocations.find((a) => a.category === 'needs').finalAmount).toBe('200.00');
  });

  test('modificare un piano non muove denaro', async () => {
    const { token, userId, conto } = await utenteConStorico();
    const piano = await creaPiano(token);
    const movimentiPrima = await Movimento.count({ where: { user_id: userId } });

    await request(app).patch(`/api/piano-smart/${piano.id}`).set(authHeader(token)).send({
      status: 'active',
      allocations: CATEGORIE.map((category, i) => ({
        category, finalAmount: i === 0 ? '800.00' : '0.00',
      })),
    });

    expect(Number((await Conto.findByPk(conto.id)).saldo)).toBe(3000);
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(movimentiPrima);
  });

  test('404 su un piano inesistente', async () => {
    const { token } = await nuovoUtente();
    const res = await request(app).patch('/api/piano-smart/999999')
      .set(authHeader(token)).send({ status: 'active' });
    expect(res.status).toBe(404);
  });
});

describe('il cap resta valido anche dopo che il contesto cambia', () => {
  test('un PATCH usa i cap conservati nello snapshot, non quelli di oggi', async () => {
    const { token, userId } = await utenteConStorico();
    await Obiettivo.create({
      user_id: userId, nome: 'Fondo', importo_target: 2400, importo_attuale: 100,
      tipo_obiettivo: 'fondo_sicurezza', completato: false,
    });

    const piano = (await request(app).post('/api/piano-smart')
      .set(authHeader(token)).send(inputBase({ amount: '200.00' }))).body;

    // L'utente completa il fondo DOPO aver creato il piano: il gap di oggi è 0,
    // ma le allocazioni del piano restano quelle valide quando è stato creato.
    await Obiettivo.update(
      { importo_attuale: 2400 },
      { where: { user_id: userId, tipo_obiettivo: 'fondo_sicurezza' } },
    );

    const safetyOriginale = piano.allocations.find((a) => a.category === 'safety');
    const res = await request(app).patch(`/api/piano-smart/${piano.id}`)
      .set(authHeader(token)).send({
        allocations: piano.allocations.map((a) => ({
          category: a.category,
          finalAmount: a.recommendedAmount,
        })),
      });

    expect(res.status).toBe(200);
    expect(res.body.allocations.find((a) => a.category === 'safety').finalAmount)
      .toBe(safetyOriginale.recommendedAmount);
  });
});

describe('cancellazione dei dati', () => {
  test('i piani seguono la cancellazione dei dati finanziari', async () => {
    const { token, userId } = await utenteConStorico();
    await request(app).post('/api/piano-smart').set(authHeader(token)).send(inputBase());
    expect(await PianoSmart.count({ where: { user_id: userId } })).toBe(1);

    const { deleteAllUserData } = require('../services/accountReset.service');
    await sequelize.transaction(async (transaction) => {
      await deleteAllUserData(userId, transaction);
    });
    expect(await PianoSmart.count({ where: { user_id: userId } })).toBe(0);
  });
});
