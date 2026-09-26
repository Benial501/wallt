// Test del cron delle spese ricorrenti (server/services/ricorrenti.service.js).
// Sono processate le frequenze 'mensile', 'settimanale', 'annuale' e
// 'una_tantum' (spesa programmata, si esegue una volta sola e chiude il
// promemoria portandolo a 'terminata'): verifica idempotenza (nessun doppio
// movimento se il job gira più volte lo stesso giorno/settimana/anno/data),
// corretto aggiornamento saldo, gestione saldo insufficiente, e correttezza
// del calcolo di fine mese/anno bisestile usato per il check "già creato".
const {
  request, registerUser, authHeader, Conto, Movimento, createApp,
} = require('./setup');
const { processaRicorrenti } = require('../services/ricorrenti.service');

describe('Spese ricorrenti (cron mensile)', () => {
  let userId;
  let conto;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;

    conto = await Conto.create({
      user_id: userId, nome: 'Conto ricorrenti', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const creaRicorrente = (overrides = {}) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 50,
    categoria: 'bollette',
    descrizione: 'Abbonamento mensile',
    data: '2026-01-01',
    ricorrente: true,
    ricorrente_frequenza: 'mensile',
    ricorrente_giorno: 5,
    ...overrides,
  });

  it('crea il movimento automatico quando oggi corrisponde al giorno configurato', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5)); // 5 marzo 2026
    await creaRicorrente();

    const result = await processaRicorrenti();

    await conto.reload();
    expect(Number(conto.saldo)).toBe(950);

    const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
    expect(automatici).toHaveLength(1);
    expect(automatici[0].descrizione).toContain('automatico');
    expect(automatici[0].ricorrenza_origine_id).not.toBeNull();
    expect(automatici[0].ricorrenza_periodo).toBe('2026-03');
    expect(result).toEqual({ processed: 1, skipped: 0, failed: 0 });
  });

  it('addebita una ricorrenza al giorno configurato o all’ultimo giorno disponibile del mese', async () => {
    await creaRicorrente({ ricorrente_giorno: 31 });

    const result = await processaRicorrenti(new Date('2026-04-30T12:00:00Z'));
    const secondaEsecuzione = await processaRicorrenti(new Date('2026-04-30T12:00:00Z'));

    expect(result).toEqual({ processed: 1, skipped: 0, failed: 0 });
    expect(secondaEsecuzione).toEqual({ processed: 0, skipped: 1, failed: 0 });
    const automatico = await Movimento.findOne({
      where: { user_id: userId, ricorrente: false },
    });
    expect(automatico.ricorrenza_periodo).toBe('2026-04');
    await conto.reload();
    expect(Number(conto.saldo)).toBe(950);
  });

  it('addebita al 28 febbraio una ricorrenza configurata al 31', async () => {
    await creaRicorrente({ ricorrente_giorno: 31 });

    const result = await processaRicorrenti(new Date('2026-02-28T12:00:00Z'));

    expect(result.processed).toBe(1);
    const automatico = await Movimento.findOne({
      where: { user_id: userId, ricorrente: false },
    });
    expect(automatico.ricorrenza_periodo).toBe('2026-02');
  });

  it('non anticipa al 30 l’addebito configurato al 31 quando il mese ha 31 giorni', async () => {
    await creaRicorrente({ ricorrente_giorno: 31 });

    const result = await processaRicorrenti(new Date('2026-05-30T12:00:00Z'));

    expect(result.processed).toBe(0);
    const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
    expect(automatici).toHaveLength(0);
  });

  it('NON crea nulla prima del giorno configurato', async () => {
    // Prima del suo giorno la mensile non è ancora dovuta. Dal giorno in poi
    // invece lo è, anche a giorno passato: vedi il commento su valutaOccorrenza
    // (una regola creata dopo le 09:00 non deve perdere il mese) e il test
    // «il cron recupera il mese di una regola nata dopo il suo giorno».
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 3)); // giorno 3, target è 5
    await creaRicorrente();

    await processaRicorrenti();

    await conto.reload();
    expect(Number(conto.saldo)).toBe(1000);
    const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
    expect(automatici).toHaveLength(0);
  });

  it('è idempotente: eseguito due volte lo stesso giorno non crea un doppio movimento', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
    await creaRicorrente();

    await processaRicorrenti();
    await processaRicorrenti();

    await conto.reload();
    expect(Number(conto.saldo)).toBe(950); // scalato una sola volta
    const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
    expect(automatici).toHaveLength(1);
  });

  it('usa sempre il giorno Europe/Rome anche quando il runtime è ancora al giorno UTC precedente', async () => {
    await creaRicorrente();

    const result = await processaRicorrenti(new Date('2026-03-04T23:30:00.000Z'));

    expect(result.processed).toBe(1);
    const automatico = await Movimento.findOne({
      where: { user_id: userId, ricorrente: false },
    });
    expect(automatico.data).toBe('2026-03-05');
    expect(automatico.ricorrenza_periodo).toBe('2026-03');
  });

  it('non crea il movimento se il saldo è insufficiente e non tocca il saldo del conto', async () => {
    await conto.update({ saldo: 10 }); // meno dei 50 richiesti
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
    await creaRicorrente();

    await processaRicorrenti();

    await conto.reload();
    expect(Number(conto.saldo)).toBe(10);
    const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
    expect(automatici).toHaveLength(0);
  });

  it('un\'entrata ricorrente aumenta correttamente il saldo', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
    await creaRicorrente({
      tipo: 'entrata', categoria: 'stipendio', descrizione: 'Stipendio', importo: 1500,
    });

    await processaRicorrenti();

    await conto.reload();
    expect(Number(conto.saldo)).toBe(2500);
  });

  it('gestisce correttamente fine febbraio in un anno bisestile (idempotenza a cavallo di mese)', async () => {
    // 2028 è bisestile: 29 febbraio esiste.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2028, 1, 5)); // 5 febbraio 2028
    await creaRicorrente();
    await processaRicorrenti();

    await conto.reload();
    expect(Number(conto.saldo)).toBe(950);

    // Il giorno successivo (6 febbraio) non deve ricreare nulla: check "già
    // creato nel mese corrente" deve coprire correttamente l'intero mese di
    // febbraio bisestile (29 giorni), non sforare in marzo o fermarsi al 28.
    jest.setSystemTime(new Date(2028, 1, 6));
    await processaRicorrenti();
    await conto.reload();
    expect(Number(conto.saldo)).toBe(950);

    const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
    expect(automatici).toHaveLength(1);
  });

  it('ignora esecuzioni sovrapposte (due chiamate concorrenti processano una sola volta)', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
    await creaRicorrente();

    // Due chiamate avviate senza attendere la prima: la guardia di
    // rientranza deve far sì che solo una venga effettivamente eseguita.
    await Promise.all([processaRicorrenti(), processaRicorrenti()]);

    await conto.reload();
    expect(Number(conto.saldo)).toBe(950);
    const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
    expect(automatici).toHaveLength(1);
  });

  it('non blocca gli altri utenti se un movimento ricorrente fallisce (conto non trovato)', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
    const ricorrenteOrfano = await creaRicorrente({ conto_id: 999999 });
    const ricorrenteValido = await creaRicorrente({ descrizione: 'Abbonamento valido' });

    await processaRicorrenti();

    await conto.reload();
    expect(Number(conto.saldo)).toBe(950); // solo il movimento valido applicato

    const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
    expect(automatici).toHaveLength(1);
    expect(automatici[0].descrizione).toContain('Abbonamento valido');

    await ricorrenteOrfano.destroy();
    await ricorrenteValido.destroy();
  });

  describe('frequenza settimanale', () => {
    // 5 marzo 2026 è un giovedì (ISO weekday 4).
    it('crea il movimento quando oggi è il giorno della settimana configurato', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
      await creaRicorrente({ ricorrente_frequenza: 'settimanale', ricorrente_giorno: 4, importo: 30 });

      const result = await processaRicorrenti();

      await conto.reload();
      expect(Number(conto.saldo)).toBe(970);
      expect(result).toEqual({ processed: 1, skipped: 0, failed: 0 });

      const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
      expect(automatici).toHaveLength(1);
      expect(automatici[0].ricorrenza_periodo).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('NON crea nulla se oggi non è il giorno della settimana configurato', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
      await creaRicorrente({ ricorrente_frequenza: 'settimanale', ricorrente_giorno: 1 }); // lunedì, oggi è giovedì

      await processaRicorrenti();

      await conto.reload();
      expect(Number(conto.saldo)).toBe(1000);
    });

    it('è idempotente nella stessa settimana', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
      await creaRicorrente({ ricorrente_frequenza: 'settimanale', ricorrente_giorno: 4 });

      await processaRicorrenti();
      await processaRicorrenti();

      const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
      expect(automatici).toHaveLength(1);
    });
  });

  describe('frequenza annuale', () => {
    it('crea il movimento quando oggi combacia con giorno e mese configurati', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
      await creaRicorrente({
        ricorrente_frequenza: 'annuale', ricorrente_giorno: 5, ricorrente_mese: 3, importo: 200,
      });

      const result = await processaRicorrenti();

      await conto.reload();
      expect(Number(conto.saldo)).toBe(800);
      expect(result).toEqual({ processed: 1, skipped: 0, failed: 0 });

      const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
      expect(automatici[0].ricorrenza_periodo).toBe('2026');
    });

    it('NON crea nulla se il mese non combacia, anche col giorno giusto', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
      await creaRicorrente({ ricorrente_frequenza: 'annuale', ricorrente_giorno: 5, ricorrente_mese: 4 });

      await processaRicorrenti();

      await conto.reload();
      expect(Number(conto.saldo)).toBe(1000);
    });

    it('è idempotente nello stesso anno', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 5));
      await creaRicorrente({ ricorrente_frequenza: 'annuale', ricorrente_giorno: 5, ricorrente_mese: 3 });

      await processaRicorrenti();
      await processaRicorrenti();

      const automatici = await Movimento.findAll({ where: { user_id: userId, ricorrente: false } });
      expect(automatici).toHaveLength(1);
    });
  });

  const creaProgrammata = (overrides = {}) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 300,
    categoria: 'altro_uscita',
    descrizione: 'Concerto',
    data: '2026-03-01',
    ricorrente: true,
    ricorrente_frequenza: 'una_tantum',
    ricorrente_data: '2026-03-15',
    ...overrides,
  });

  const conOggi = async (anno, meseZeroBased, giorno, fn) => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] })
      .setSystemTime(new Date(anno, meseZeroBased, giorno));
    try { return await fn(); } finally { jest.useRealTimers(); }
  };

  it('addebita la spesa programmata alla sua data e chiude il promemoria', async () => {
    const spesa = await creaProgrammata();

    await conOggi(2026, 2, 15, () => processaRicorrenti());

    const generato = await Movimento.findOne({ where: { ricorrenza_origine_id: spesa.id } });
    expect(generato).not.toBeNull();
    expect(generato.ricorrenza_periodo).toBe('2026-03-15');
    expect(Number(generato.importo)).toBe(300);

    await conto.reload();
    expect(Number(conto.saldo)).toBe(700);

    await spesa.reload();
    expect(spesa.stato_ricorrenza).toBe('terminata');
  });

  it('non addebita prima della data programmata', async () => {
    const spesa = await creaProgrammata();

    await conOggi(2026, 2, 14, () => processaRicorrenti());

    const generato = await Movimento.findOne({ where: { ricorrenza_origine_id: spesa.id } });
    expect(generato).toBeNull();
    await conto.reload();
    expect(Number(conto.saldo)).toBe(1000);
  });

  it('recupera una data saltata invece di perderla', async () => {
    const spesa = await creaProgrammata();

    await conOggi(2026, 2, 20, () => processaRicorrenti());

    const generati = await Movimento.findAll({ where: { ricorrenza_origine_id: spesa.id } });
    expect(generati).toHaveLength(1);
    expect(generati[0].ricorrenza_periodo).toBe('2026-03-15');
  });

  it('non addebita due volte se il job gira di nuovo', async () => {
    const spesa = await creaProgrammata();

    await conOggi(2026, 2, 15, async () => {
      await processaRicorrenti();
      // La prima passata ha già chiuso il promemoria ('terminata'), quindi
      // la seconda lo scarterebbe comunque per quel motivo, senza mai
      // arrivare alla deduplica sul periodo. Per esercitare davvero
      // l'indice unico (ricorrenza_origine_id, ricorrenza_periodo) — quello
      // che deve impedire il doppio addebito se il job gira due volte
      // insieme, prima che la chiusura sia visibile — riportiamo lo stato
      // ad 'attiva' con un update diretto sul record, bypassando l'istanza
      // in memoria.
      await Movimento.update({ stato_ricorrenza: 'attiva' }, { where: { id: spesa.id } });
      await processaRicorrenti();
    });

    const generati = await Movimento.findAll({ where: { ricorrenza_origine_id: spesa.id } });
    expect(generati).toHaveLength(1);
    await conto.reload();
    expect(Number(conto.saldo)).toBe(700);
  });
});

// Una ricorrenza periodica creata dall'API reale: il difetto viveva nel
// controller (createMovimento scalava subito il conto) mentre i test qui sopra
// costruiscono l'origine con Movimento.create, quindi lo scavalcavano. Vedi
// muoveSaldo in ricorrenti.service.js: una ricorrenza è una regola, e solo le
// occorrenze che genera muovono denaro.
describe('Il saldo di una ricorrenza mensile si muove una volta sola', () => {
  let app;
  let token;
  let conto;

  const oggi = () => new Date().toISOString().slice(0, 10);

  const creaMensile = (giorno) => request(app).post('/api/movimenti').set(authHeader(token))
    .send({
      conto_id: conto.id,
      tipo: 'uscita',
      importo: 50,
      categoria: 'bollette',
      descrizione: 'Abbonamento',
      data: oggi(),
      ricorrente: true,
      ricorrente_frequenza: 'mensile',
      ricorrente_giorno: giorno,
    });

  const saldo = async () => {
    await conto.reload();
    return Number(conto.saldo);
  };

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    conto = await Conto.create({
      user_id: res.body.user.id, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('il salvataggio non addebita: lo fa il cron, una volta sola', async () => {
    const creato = await creaMensile(5);
    expect(creato.status).toBe(201);

    // Salvare la regola non muove denaro: il conto è ancora intero. Prima di
    // questa correzione qui si leggeva 950, e la passata del cron sotto
    // portava a 900 — la stessa uscita pagata due volte nello stesso mese.
    expect(await saldo()).toBe(1000);

    await processaRicorrenti(new Date('2026-03-05T12:00:00Z'));
    expect(await saldo()).toBe(950);

    // Il cron può girare più volte nello stesso giorno (Vercel Cron, il
    // workflow GitHub Actions ogni ora, il server locale): l'indice unico
    // (ricorrenza_origine_id, ricorrenza_periodo) tiene.
    await processaRicorrenti(new Date('2026-03-05T12:00:00Z'));
    expect(await saldo()).toBe(950);

    const generati = await Movimento.findAll({
      where: { ricorrenza_origine_id: creato.body.movimento.id },
    });
    expect(generati).toHaveLength(1);
    expect(generati[0].ricorrenza_periodo).toBe('2026-03');
  });

  it('il cron recupera il mese di una regola nata dopo il suo giorno', async () => {
    // Il cron gira alle 09:00: una regola creata dopo, in un giorno che
    // corrisponde già al suo ricorrente_giorno, non avrebbe mai l'addebito del
    // mese in corso. È dovuta dal suo giorno in poi, come una spesa
    // programmata, e il periodo (YYYY-MM) resta la chiave che la limita a uno.
    const creato = await creaMensile(5);
    expect(await saldo()).toBe(1000);

    await processaRicorrenti(new Date('2026-03-20T12:00:00Z'));

    expect(await saldo()).toBe(950);
    const generati = await Movimento.findAll({
      where: { ricorrenza_origine_id: creato.body.movimento.id },
    });
    expect(generati).toHaveLength(1);
    expect(generati[0].ricorrenza_periodo).toBe('2026-03');
  });
});
