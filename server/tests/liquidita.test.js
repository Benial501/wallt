// Liquidità libera = saldo conti attivi - liquidità allocata (obiettivi
// attivi) - impegni pertinenti (ricorrenti mensili non ancora eseguiti).
// Nessun sottoconto reale: e' un overlay di sola lettura sullo stesso saldo.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Obiettivo } = require('../models');
const { calcolaLiquidita } = require('../services/liquidita.service');

describe('LiquiditaService.calcolaLiquidita', () => {
  let app;
  let token;
  let userId;
  let conto;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('senza obiettivi né ricorrenti, la liquidità libera coincide col saldo conti', async () => {
    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.saldo_conti).toBe(1000);
    expect(result.liquidita_allocata).toBe(0);
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.liquidita_libera).toBe(1000);
  });

  it('un obiettivo attivo riduce la liquidità libera del suo importo_attuale, uno completato no', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 500, importo_attuale: 200, completato: false,
    });
    await Obiettivo.create({
      user_id: userId, nome: 'Fatto', importo_target: 100, importo_attuale: 100, completato: true,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.liquidita_allocata).toBe(200);
    expect(result.liquidita_libera).toBe(800);
    expect(result.obiettivi_allocati).toHaveLength(1);
    expect(result.obiettivi_allocati[0].nome).toBe('Vacanza');
  });

  it('un ricorrente mensile non ancora scaduto questo mese conta come impegno', async () => {
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 25,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.impegni_pertinenti).toBe(300);
    expect(result.liquidita_libera).toBe(700);
  });

  it('un ricorrente già eseguito questo mese non viene contato due volte', async () => {
    const ricorrente = await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 10,
    });
    // Simula l'esecuzione del cron per il periodo corrente.
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto (automatico)', data: '2026-09-10', ricorrente: false,
      ricorrenza_origine_id: ricorrente.id, ricorrenza_periodo: '2026-09',
    });
    await conto.update({ saldo: 700 }); // il saldo riflette gia' l'addebito

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.saldo_conti).toBe(700);
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.liquidita_libera).toBe(700);
  });

  it('un ricorrente il cui giorno è già passato questo mese, ma non ancora eseguito, resta un impegno', async () => {
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 5,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    // Il cron non l'ha ancora eseguito (nessun Movimento con ricorrenza_periodo
    // '2026-09'): resta un impegno anche se il giorno target è passato, perché
    // il saldo del conto non riflette ancora l'addebito.
    expect(result.impegni_pertinenti).toBe(300);
  });

  it('senza `data` esplicita, usa il mese corrente a Roma, non quello UTC del processo', async () => {
    // Alle 22:30 UTC del 30 settembre, a Roma (CEST, +2h) è già il 1° ottobre:
    // il periodo corrente corretto è '2026-10'. Se il default troncasse
    // prima in UTC (new Date().toISOString().split('T')[0] => '2026-09-30'),
    // il periodo calcolato sarebbe '2026-09' invece di '2026-10'.
    //
    // Per distinguere i due esiti, simuliamo che il ricorrente sia GIA'
    // stato eseguito per settembre (ricorrenza_periodo: '2026-09'). Col
    // periodo corretto ('2026-10') quell'esecuzione di settembre non
    // "copre" ottobre, quindi il ricorrente resta un impegno pertinente.
    // Col bug (periodo '2026-09') l'esecuzione di settembre verrebbe
    // scambiata per quella del periodo corrente e l'impegno sparirebbe.
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'],
    }).setSystemTime(new Date('2026-09-30T22:30:00Z'));

    try {
      const ricorrente = await Movimento.create({
        user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
        descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
        ricorrente_giorno: 1,
      });
      await Movimento.create({
        user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
        descrizione: 'Affitto (automatico)', data: '2026-09-01', ricorrente: false,
        ricorrenza_origine_id: ricorrente.id, ricorrenza_periodo: '2026-09',
      });

      const result = await calcolaLiquidita(userId);
      expect(result.impegni_pertinenti).toBe(300);
      expect(result.liquidita_libera).toBe(700);
    } finally {
      jest.useRealTimers();
    }
  });

  it('un conto scommesse resta nel saldo complessivo ma si scompone in saldo_conti_speciali', async () => {
    await Conto.create({
      user_id: userId, nome: 'Bet365', tipo: 'scommesse', saldo: 250, attivo: true,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.saldo_conti).toBe(1250); // 1000 ordinario + 250 speciale: invariato (Regola 12)
    expect(result.saldo_ordinario).toBe(1000);
    expect(result.saldo_conti_speciali).toBe(250);
  });

  it('liquidita_allocabile sottrae allocato+impegni dal solo saldo ordinario, non dal saldo con lo scommesse incluso', async () => {
    await Conto.create({
      user_id: userId, nome: 'Bet365', tipo: 'scommesse', saldo: 250, attivo: true,
    });
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 500, importo_attuale: 400, completato: false,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    // saldo_conti (1250) - 400 darebbe 850: sbagliato, includerebbe lo
    // scommesse come se fosse disponibile per l'obiettivo.
    expect(result.liquidita_libera).toBe(850); // overlay "storica", sul totale
    expect(result.liquidita_allocabile).toBe(600); // 1000 ordinario - 400 allocato
  });

  it('liquidita_allocabile può essere negativa senza essere troncata a zero: è un segnale, non un errore', async () => {
    await Conto.create({
      user_id: userId, nome: 'Bet365', tipo: 'scommesse', saldo: 500, attivo: true,
    });
    await Obiettivo.create({
      user_id: userId, nome: 'Obiettivo grande', importo_target: 2000, importo_attuale: 1300, completato: false,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    // 1000 ordinario - 1300 allocato = -300: il progresso dell'obiettivo
    // supera quanto siede sui conti ordinari (verosimilmente maturato in
    // parte sul conto scommesse).
    expect(result.liquidita_allocabile).toBe(-300);
  });

  it('nessun doppio conteggio: saldo_ordinario + saldo_conti_speciali riconcilia sempre con saldo_conti', async () => {
    await Conto.create({
      user_id: userId, nome: 'Bet365', tipo: 'scommesse', saldo: 333.33, attivo: true,
    });
    await Conto.create({
      user_id: userId, nome: 'Risparmi', tipo: 'risparmio', saldo: 111.11, attivo: true,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(round2(result.saldo_ordinario + result.saldo_conti_speciali)).toBe(result.saldo_conti);

    function round2(v) { return Math.round(v * 100) / 100; }
  });

  it('GET /api/conti/liquidita espone lo stesso risultato del service', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 500, importo_attuale: 150, completato: false,
    });
    const res = await request(app).get('/api/conti/liquidita').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.saldo_conti).toBe(1000);
    expect(res.body.liquidita_allocata).toBe(150);
    expect(res.body.liquidita_libera).toBe(850);
  });
});

// Regressione: una ricorrenza che il cron non processerà mai non è un impegno.
// La regola di "quali ricorrenze generano un addebito" vive in un solo posto
// (ricorrenti.service.js#whereRicorrenzaAttiva, la stessa usata dal cron):
// liquidita.service.js deve riusarla, non reimplementarne una più permissiva.
describe('LiquiditaService — solo le ricorrenze attive generano impegni', () => {
  let app;
  let userId;
  let conto;

  const creaRicorrente = (stato) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 300,
    categoria: 'affitto',
    descrizione: `Affitto ${stato}`,
    data: '2026-01-01',
    ricorrente: true,
    stato_ricorrenza: stato,
    ricorrente_frequenza: 'mensile',
    ricorrente_giorno: 25,
  });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('una ricorrenza attiva non ancora addebitata è un impegno', async () => {
    await creaRicorrente('attiva');
    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.impegni_pertinenti).toBe(300);
    expect(result.impegni).toHaveLength(1);
    expect(result.liquidita_libera).toBe(700);
  });

  it('una ricorrenza sospesa non è un impegno: il cron non la processa', async () => {
    await creaRicorrente('sospesa');
    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.impegni).toEqual([]);
    expect(result.liquidita_libera).toBe(1000);
  });

  it('una ricorrenza terminata non è un impegno', async () => {
    await creaRicorrente('terminata');
    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.liquidita_libera).toBe(1000);
  });

  it('una ricorrenza attiva già addebitata nel periodo corrente non viene sottratta di nuovo', async () => {
    const ricorrente = await creaRicorrente('attiva');
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto (automatico)', data: '2026-09-25', ricorrente: false,
      ricorrenza_origine_id: ricorrente.id, ricorrenza_periodo: '2026-09',
    });
    await conto.update({ saldo: 700 });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.liquidita_libera).toBe(700);
  });

  it('sospese e terminate non riducono la liquidità nemmeno insieme a una attiva', async () => {
    await creaRicorrente('attiva');
    await creaRicorrente('sospesa');
    await creaRicorrente('terminata');
    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.impegni_pertinenti).toBe(300);
    expect(result.liquidita_libera).toBe(700);
  });
});

// Coerenza fra i due punti che leggono le ricorrenze: l'API liquidità
// (impegni del solo periodo corrente non ancora addebitati) e
// FinancialContext.recurring.commitments (rata mensile equivalente di TUTTE
// le attive). Sono grandezze diverse per definizione, ma devono concordare
// su QUALI ricorrenze contano.
describe('liquidità e FinancialContext concordano su quali ricorrenze contano', () => {
  it('una sospesa è esclusa da entrambi; una attiva mensile è inclusa in entrambi', async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    const userId = res.body.user.id;
    const c = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
    const base = {
      user_id: userId,
      conto_id: c.id,
      tipo: 'uscita',
      categoria: 'affitto',
      data: '2026-01-01',
      ricorrente: true,
      ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 25,
    };
    await Movimento.create({
      ...base, importo: 300, descrizione: 'Attiva', stato_ricorrenza: 'attiva',
    });
    await Movimento.create({
      ...base, importo: 999, descrizione: 'Sospesa', stato_ricorrenza: 'sospesa',
    });

    const liquidita = await calcolaLiquidita(userId, { data: '2026-09-17' });
    const { getFinancialContext } = require('../services/financialContext.service');
    const ctx = await getFinancialContext(userId, { referenceDate: new Date('2026-09-17T10:00:00Z') });

    expect(liquidita.impegni_pertinenti).toBe(300);
    expect(ctx.recurring.commitments).toBe(300);
    expect(ctx.recurring.active).toBe(1);
    expect(ctx.recurring.paused).toBe(1);
    expect(ctx.liquidity.commitments).toBe(300);
  });
});
