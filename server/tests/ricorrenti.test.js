// Test del cron delle spese ricorrenti (server/services/ricorrenti.service.js).
// Attualmente SOLO la frequenza 'mensile' è processata: verifica idempotenza
// (nessun doppio movimento se il job gira più volte lo stesso giorno),
// corretto aggiornamento saldo, gestione saldo insufficiente, e correttezza
// del calcolo di fine mese/anno bisestile usato per il check "già creato".
const {
  registerUser, Conto, Movimento, createApp,
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

  it('NON crea nulla se oggi non corrisponde al giorno configurato', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'] }).setSystemTime(new Date(2026, 2, 10)); // giorno 10, target è 5
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
});
