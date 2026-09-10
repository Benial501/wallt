// Sistema di notifiche: regole anti-spam, deduplica, fuso orario, isolamento
// fra utenti e degradazione corretta quando le push non sono attive.
//
// Le regole sono verificate chiamando il generatore con un istante iniettato
// (`adesso`), così i test non dipendono dall'ora in cui girano.
const {
  registerUser, authHeader, request, createApp, Conto, Movimento,
} = require('./setup');
const {
  Notifica, PreferenzeNotifiche, PushSubscription,
  BudgetMensile, BudgetCategoria, Obiettivo,
} = require('../models');
const { generaPerUtente, processaNotifiche } = require('../services/notifiche/NotificheGenerator');
const NotificheService = require('../services/notifiche/NotificheService');
const PushService = require('../services/notifiche/PushService');
const webpush = require('web-push');

// 20:30 a Roma (ora solare): dopo l'orario di promemoria di default (20:00)
// e fuori dalle ore di silenzio (22:00 → 08:00).
const SERA_ROMA = new Date('2026-03-10T19:30:00Z');
const GIORNO_SERA_ROMA = '2026-03-10';

describe('Sistema di notifiche', () => {
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
      user_id: userId, nome: 'Conto notifiche', tipo: 'banca', saldo: 5000, attivo: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const creaMovimento = (overrides = {}) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo: 10,
    categoria: 'cibo_spesa',
    descrizione: 'Spesa',
    data: '2026-03-02',
    ricorrente: false,
    ...overrides,
  });

  /** Budget di marzo 2026 con le categorie indicate. */
  const creaBudget = async (categorie) => {
    const budget = await BudgetMensile.create({
      user_id: userId, mese: 3, anno: 2026, importo_totale: 1000,
    });
    await Promise.all(categorie.map((cat) => BudgetCategoria.create({
      budget_id: budget.id, categoria: cat.categoria, importo: cat.importo,
    })));
    return budget;
  };

  const setPreferenze = async (valori) => {
    const preferenze = await NotificheService.getPreferenze(userId);
    await preferenze.update(valori);
    return preferenze;
  };

  const notifichePerTipo = (tipo) => Notifica.findAll({ where: { user_id: userId, tipo } });

  // ------------------------------------------------------------------
  // 1-2) Promemoria giornaliero
  // ------------------------------------------------------------------

  it('1) un utente senza movimenti riceve un solo promemoria', async () => {
    await generaPerUtente({ userId, adesso: SERA_ROMA });
    await generaPerUtente({ userId, adesso: SERA_ROMA });
    await generaPerUtente({ userId, adesso: new Date('2026-03-10T20:15:00Z') });

    const promemoria = await notifichePerTipo('promemoria_giornaliero');
    expect(promemoria).toHaveLength(1);
    expect(promemoria[0].titolo).toBe('Ricordati di aggiornare Wallt');
    expect(promemoria[0].link).toBe('/movimenti');
    expect(promemoria[0].giorno_riferimento).toBe(GIORNO_SERA_ROMA);
  });

  it('2) un utente che ha già registrato un movimento oggi non riceve il promemoria', async () => {
    await creaMovimento({ data: GIORNO_SERA_ROMA });

    await generaPerUtente({ userId, adesso: SERA_ROMA });

    expect(await notifichePerTipo('promemoria_giornaliero')).toHaveLength(0);
  });

  it('2b) il promemoria non parte prima dell’orario scelto dall’utente', async () => {
    await setPreferenze({ orario_promemoria: '21:00' });

    // 20:30 a Roma: ancora presto per un promemoria impostato alle 21:00.
    await generaPerUtente({ userId, adesso: SERA_ROMA });
    expect(await notifichePerTipo('promemoria_giornaliero')).toHaveLength(0);

    await generaPerUtente({ userId, adesso: new Date('2026-03-10T20:30:00Z') });
    expect(await notifichePerTipo('promemoria_giornaliero')).toHaveLength(1);
  });

  it('2c) segnare la giornata come controllata blocca il promemoria di quel giorno', async () => {
    await setPreferenze({ giornata_controllata_il: GIORNO_SERA_ROMA });

    await generaPerUtente({ userId, adesso: SERA_ROMA });
    expect(await notifichePerTipo('promemoria_giornaliero')).toHaveLength(0);

    // Il giorno dopo il promemoria torna a essere possibile.
    await generaPerUtente({ userId, adesso: new Date('2026-03-11T19:30:00Z') });
    const promemoria = await notifichePerTipo('promemoria_giornaliero');
    expect(promemoria).toHaveLength(1);
    expect(promemoria[0].giorno_riferimento).toBe('2026-03-11');
  });

  // ------------------------------------------------------------------
  // 3) Idempotenza del cron
  // ------------------------------------------------------------------

  it('3) l’esecuzione ripetuta del cron non crea duplicati', async () => {
    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 90, categoria: 'cibo_spesa' });
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 20,
      categoria: 'bollette', descrizione: 'Abbonamento', data: '2026-03-01',
      ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 11,
    });

    await processaNotifiche(SERA_ROMA);
    const dopoPrimaEsecuzione = await Notifica.count({ where: { user_id: userId } });

    await processaNotifiche(SERA_ROMA);
    await processaNotifiche(new Date('2026-03-10T20:45:00Z'));

    expect(await Notifica.count({ where: { user_id: userId } })).toBe(dopoPrimaEsecuzione);
    expect(dopoPrimaEsecuzione).toBeGreaterThan(0);

    // La dedupe_key è unica per utente: è il vincolo che rende il cron sicuro.
    const chiavi = (await Notifica.findAll({ where: { user_id: userId } }))
      .map((n) => n.dedupe_key);
    expect(new Set(chiavi).size).toBe(chiavi.length);
  });

  // ------------------------------------------------------------------
  // 4) Limite giornaliero
  // ------------------------------------------------------------------

  it('4) rispetta il limite di 2 notifiche al giorno (la seconda solo per avvisi importanti)', async () => {
    await creaBudget([
      { categoria: 'cibo', importo: 100 },
      { categoria: 'svago', importo: 100 },
    ]);
    await creaMovimento({ importo: 120, categoria: 'cibo_spesa' }); // 120% → superato
    await creaMovimento({ importo: 85, categoria: 'svago' }); // 85% → soglia 80
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 30,
      categoria: 'bollette', descrizione: 'Affitto', data: '2026-03-01',
      ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 11,
    });
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 1000, importo_attuale: 800,
    });

    await generaPerUtente({ userId, adesso: SERA_ROMA });

    const contate = await Notifica.count({
      where: { user_id: userId, giorno_riferimento: GIORNO_SERA_ROMA, conta_nel_limite: true },
    });
    const totali = await Notifica.count({ where: { user_id: userId } });

    // Al massimo 2 notifiche "vere" al giorno...
    expect(contate).toBe(2);
    // ...ma le altre non vengono perse: restano nel centro notifiche.
    expect(totali).toBeGreaterThan(contate);

    const contatePerTipo = await Notifica.findAll({
      where: { user_id: userId, conta_nel_limite: true },
      attributes: ['tipo', 'priorita'],
    });
    // Solo una notifica "normale" al giorno: il secondo slot va agli urgenti.
    expect(contatePerTipo.filter((n) => n.priorita === 'normale')).toHaveLength(0);
    expect(contatePerTipo.every((n) => n.priorita === 'urgente')).toBe(true);

    // Il promemoria non viene creato affatto quando il limite è saturo:
    // consegnarlo il giorno dopo non avrebbe senso.
    expect(await notifichePerTipo('promemoria_giornaliero')).toHaveLength(0);

    // Le notifiche oltre il limite non generano push.
    const oltreLimite = await Notifica.findAll({
      where: { user_id: userId, conta_nel_limite: false },
    });
    expect(oltreLimite.length).toBeGreaterThan(0);
    expect(oltreLimite.every((n) => n.canale === 'in_app')).toBe(true);
  });

  // ------------------------------------------------------------------
  // 5-6) Budget
  // ------------------------------------------------------------------

  it('5) il superamento dell’80% del budget genera un solo avviso', async () => {
    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 85, categoria: 'cibo_spesa' });

    await generaPerUtente({ userId, adesso: SERA_ROMA });
    await generaPerUtente({ userId, adesso: SERA_ROMA });
    // Spesa ulteriore, ma sempre sotto il 100%: nessun secondo avviso.
    await creaMovimento({ importo: 5, categoria: 'cibo_spesa' });
    await generaPerUtente({ userId, adesso: new Date('2026-03-11T19:30:00Z') });

    const avvisi = await notifichePerTipo('budget_80');
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0].titolo).toBe('Budget quasi raggiunto');
    expect(avvisi[0].messaggio).toContain('Cibo e spesa');
    expect(avvisi[0].link).toBe('/budget');
    expect(avvisi[0].priorita).toBe('normale');
  });

  it('6) il superamento del 100% del budget genera un solo avviso, non ripetuto ogni giorno', async () => {
    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 130, categoria: 'cibo_spesa' });

    await generaPerUtente({ userId, adesso: SERA_ROMA });
    await generaPerUtente({ userId, adesso: new Date('2026-03-11T19:30:00Z') });
    await generaPerUtente({ userId, adesso: new Date('2026-03-12T19:30:00Z') });

    const superati = await notifichePerTipo('budget_superato');
    expect(superati).toHaveLength(1);
    expect(superati[0].titolo).toBe('Budget superato');
    expect(superati[0].priorita).toBe('urgente');
    // Nessun avviso "80%" a posteriori quando la soglia è già stata sfondata.
    expect(await notifichePerTipo('budget_80')).toHaveLength(0);
  });

  it('6b) il budget del mese successivo genera un avviso nuovo (dedupe per periodo)', async () => {
    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 130, categoria: 'cibo_spesa' });
    await generaPerUtente({ userId, adesso: SERA_ROMA });

    const budgetAprile = await BudgetMensile.create({
      user_id: userId, mese: 4, anno: 2026, importo_totale: 1000,
    });
    await BudgetCategoria.create({ budget_id: budgetAprile.id, categoria: 'cibo', importo: 100 });
    await creaMovimento({ importo: 130, categoria: 'cibo_spesa', data: '2026-04-03' });

    await generaPerUtente({ userId, adesso: new Date('2026-04-10T19:30:00Z') });

    expect(await notifichePerTipo('budget_superato')).toHaveLength(2);
  });

  // ------------------------------------------------------------------
  // 7) Pagamenti ricorrenti
  // ------------------------------------------------------------------

  it('7) un pagamento ricorrente non genera avvisi duplicati', async () => {
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 12.99,
      categoria: 'abbonamenti', descrizione: 'Abbonamento streaming', data: '2026-02-11',
      ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 11,
    });

    await generaPerUtente({ userId, adesso: SERA_ROMA });
    await generaPerUtente({ userId, adesso: new Date('2026-03-10T20:45:00Z') });

    const avvisi = await notifichePerTipo('ricorrente_imminente');
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0].titolo).toBe('Pagamento in arrivo');
    expect(avvisi[0].priorita).toBe('urgente');
    // In app il dettaglio è ammesso, l'importo no.
    expect(avvisi[0].messaggio).toContain('Abbonamento streaming');
    expect(avvisi[0].messaggio).not.toContain('12.99');

    // Il mese dopo è una scadenza diversa: nuovo avviso.
    await generaPerUtente({ userId, adesso: new Date('2026-04-10T19:30:00Z') });
    expect(await notifichePerTipo('ricorrente_imminente')).toHaveLength(2);
  });

  it('7b) nessun avviso ricorrente se la scadenza non è domani', async () => {
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 20,
      categoria: 'abbonamenti', descrizione: 'Palestra', data: '2026-02-25',
      ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 25,
    });

    await generaPerUtente({ userId, adesso: SERA_ROMA });

    expect(await notifichePerTipo('ricorrente_imminente')).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // Obiettivi
  // ------------------------------------------------------------------

  it('notifica un traguardo di risparmio una sola volta per soglia', async () => {
    const obiettivo = await Obiettivo.create({
      user_id: userId, nome: 'Fondo emergenza', importo_target: 1000, importo_attuale: 550,
    });

    await generaPerUtente({ userId, adesso: SERA_ROMA });
    await generaPerUtente({ userId, adesso: new Date('2026-03-11T19:30:00Z') });

    const traguardi = await notifichePerTipo('obiettivo_traguardo');
    expect(traguardi).toHaveLength(1);
    expect(traguardi[0].messaggio).toContain('50%');

    // Superata la soglia successiva arriva un avviso nuovo, non un doppione.
    await obiettivo.update({ importo_attuale: 1000 });
    await generaPerUtente({ userId, adesso: new Date('2026-03-12T19:30:00Z') });

    const raggiunti = await notifichePerTipo('obiettivo_raggiunto');
    expect(raggiunti).toHaveLength(1);
    expect(await notifichePerTipo('obiettivo_traguardo')).toHaveLength(1);
  });

  // ------------------------------------------------------------------
  // 8-9) Ore di silenzio e fuso orario
  // ------------------------------------------------------------------

  it('8) una notifica generata nelle ore di silenzio è rinviata al primo orario utile', async () => {
    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 130, categoria: 'cibo_spesa' });

    // 23:30 a Roma: dentro la finestra di silenzio 22:00 → 08:00.
    await generaPerUtente({ userId, adesso: new Date('2026-03-10T22:30:00Z') });

    const [avviso] = await notifichePerTipo('budget_superato');
    expect(avviso).toBeDefined();
    // Consegna spostata alle 08:00 del giorno dopo (07:00 UTC in ora solare).
    expect(avviso.programmata_per.toISOString()).toBe('2026-03-11T07:00:00.000Z');
    expect(avviso.giorno_riferimento).toBe('2026-03-11');
  });

  it('8b) una notifica rinviata non è visibile nel centro notifiche prima dell’orario', async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'],
    }).setSystemTime(new Date('2026-03-10T22:30:00Z')); // 23:30 a Roma

    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 130, categoria: 'cibo_spesa' });
    await generaPerUtente({ userId, adesso: new Date('2026-03-10T22:30:00Z') });

    expect(await NotificheService.contaNonLette(userId)).toBe(0);
    const durante = await NotificheService.listNotifiche(userId);
    expect(durante.notifiche).toHaveLength(0);

    // Passate le ore di silenzio la notifica diventa visibile.
    jest.setSystemTime(new Date('2026-03-11T07:30:00Z')); // 08:30 a Roma
    const dopo = await NotificheService.listNotifiche(userId);
    expect(dopo.notifiche).toHaveLength(1);
    expect(await NotificheService.contaNonLette(userId)).toBe(1);
  });

  it('9) il fuso Europe/Rome determina il giorno di riferimento, non UTC', async () => {
    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 130, categoria: 'cibo_spesa' });

    // 22:30 UTC del 10 marzo = 23:30 del 10 marzo a Roma (ore di silenzio):
    // la consegna slitta all'11, che è anche il giorno che consuma il limite.
    await generaPerUtente({ userId, adesso: new Date('2026-03-10T22:30:00Z') });
    const [avviso] = await notifichePerTipo('budget_superato');
    expect(avviso.giorno_riferimento).toBe('2026-03-11');

    // Ora legale: 30 giugno 22:30 UTC = 1 luglio 00:30 a Roma. In UTC il
    // giorno sarebbe ancora il 30 giugno.
    const preferenze = await NotificheService.getPreferenze(userId);
    const risultato = await NotificheService.creaNotifica({
      userId,
      preferenze,
      adesso: new Date('2026-06-30T22:30:00Z'),
      tipo: 'sicurezza',
      dedupeKey: 'test:fuso-estate',
      titolo: 'Test',
      messaggio: 'Test fuso orario',
      priorita: 'urgente',
    });
    expect(risultato.creata).toBe(true);
    expect(risultato.notifica.giorno_riferimento).toBe('2026-07-01');
    // 08:00 a Roma in ora legale = 06:00 UTC.
    expect(risultato.notifica.programmata_per.toISOString()).toBe('2026-07-01T06:00:00.000Z');
  });

  it('9b) un fuso diverso da Roma sposta il giorno di riferimento di conseguenza', async () => {
    await setPreferenze({ timezone: 'Pacific/Auckland' });
    const preferenze = await NotificheService.getPreferenze(userId);

    // 10 marzo 12:00 UTC = 11 marzo 01:00 ad Auckland (ore di silenzio lì).
    const risultato = await NotificheService.creaNotifica({
      userId,
      preferenze,
      adesso: new Date('2026-03-10T12:00:00Z'),
      tipo: 'sicurezza',
      dedupeKey: 'test:fuso-auckland',
      titolo: 'Test',
      messaggio: 'Test fuso orario',
    });

    expect(risultato.notifica.giorno_riferimento).toBe('2026-03-11');
  });

  // ------------------------------------------------------------------
  // 10) Isolamento fra utenti
  // ------------------------------------------------------------------

  it('10) un utente non può vedere né modificare le notifiche di un altro', async () => {
    await generaPerUtente({ userId, adesso: SERA_ROMA });
    const [notificaA] = await notifichePerTipo('promemoria_giornaliero');
    expect(notificaA).toBeDefined();

    const { res: resB } = await registerUser(app);
    const tokenB = resB.body.token;
    const userIdB = resB.body.user.id;

    const lista = await request(app).get('/api/notifiche').set(authHeader(tokenB));
    expect(lista.status).toBe(200);
    expect(lista.body.notifiche).toHaveLength(0);
    expect(lista.body.non_lette).toBe(0);

    // Nessuna informazione sull'esistenza dell'ID altrui.
    const letta = await request(app)
      .put(`/api/notifiche/${notificaA.id}/letta`)
      .set(authHeader(tokenB));
    expect(letta.status).toBe(404);

    await request(app).put('/api/notifiche/lette').set(authHeader(tokenB)).expect(200);

    await notificaA.reload();
    expect(notificaA.letta).toBe(false);

    // E l'utente B non tocca nemmeno le preferenze di A.
    await request(app)
      .put('/api/notifiche/preferenze')
      .set(authHeader(tokenB))
      .send({ promemoria_giornaliero_attivo: false })
      .expect(200);

    const prefsA = await PreferenzeNotifiche.findOne({ where: { user_id: userId } });
    const prefsB = await PreferenzeNotifiche.findOne({ where: { user_id: userIdB } });
    expect(prefsA.promemoria_giornaliero_attivo).toBe(true);
    expect(prefsB.promemoria_giornaliero_attivo).toBe(false);
  });

  it('10b) le rotte delle notifiche richiedono autenticazione', async () => {
    await request(app).get('/api/notifiche').expect(401);
    await request(app).get('/api/notifiche/preferenze').expect(401);
    await request(app).put('/api/notifiche/lette').expect(401);
    await request(app).post('/api/notifiche/push').send({}).expect(401);
  });

  // ------------------------------------------------------------------
  // 11) Disattivazione per categoria
  // ------------------------------------------------------------------

  it('11) disattivare una categoria blocca solo quella notifica', async () => {
    await setPreferenze({ alert_budget_attivi: false });
    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 130, categoria: 'cibo_spesa' });

    await generaPerUtente({ userId, adesso: SERA_ROMA });

    expect(await notifichePerTipo('budget_superato')).toHaveLength(0);
    // Le altre categorie continuano a funzionare.
    expect(await notifichePerTipo('promemoria_giornaliero')).toHaveLength(1);

    await setPreferenze({ promemoria_giornaliero_attivo: false, alert_obiettivi_attivi: false });
    await Obiettivo.create({
      user_id: userId, nome: 'Auto', importo_target: 100, importo_attuale: 100,
    });
    await generaPerUtente({ userId, adesso: new Date('2026-03-11T19:30:00Z') });

    expect(await notifichePerTipo('obiettivo_raggiunto')).toHaveLength(0);
    expect(await notifichePerTipo('promemoria_giornaliero')).toHaveLength(1); // solo quella di ieri
  });

  it('11b) il riepilogo settimanale è disattivato di default e arriva solo il lunedì', async () => {
    // Settimana 2 → 8 marzo (quella "precedente" per il confronto) e
    // settimana 9 → 15 marzo, che è quella riepilogata lunedì 16.
    await creaMovimento({ importo: 40, categoria: 'svago', data: '2026-03-04' });
    await creaMovimento({ importo: 60, categoria: 'cibo_spesa', data: '2026-03-11' });
    await creaMovimento({
      tipo: 'entrata', importo: 500, categoria: 'stipendio', data: '2026-03-12',
    });

    // Lunedì 9 marzo 2026, riepilogo ancora spento.
    await generaPerUtente({ userId, adesso: new Date('2026-03-09T19:30:00Z') });
    expect(await notifichePerTipo('riepilogo_settimanale')).toHaveLength(0);

    await setPreferenze({ riepilogo_settimanale_attivo: true });

    // Martedì: non è il giorno del riepilogo.
    await generaPerUtente({ userId, adesso: SERA_ROMA });
    expect(await notifichePerTipo('riepilogo_settimanale')).toHaveLength(0);

    // Lunedì successivo: arriva, una sola volta.
    await generaPerUtente({ userId, adesso: new Date('2026-03-16T19:30:00Z') });
    await generaPerUtente({ userId, adesso: new Date('2026-03-16T20:30:00Z') });
    const riepiloghi = await notifichePerTipo('riepilogo_settimanale');
    expect(riepiloghi).toHaveLength(1);
    expect(riepiloghi[0].messaggio).toBe('Controlla come hai gestito le tue finanze questa settimana.');
    // I numeri restano nel metadata: la notifica di sistema non li mostra.
    expect(riepiloghi[0].metadata.settimana).toEqual(expect.objectContaining({
      entrate: 500,
      uscite: 60,
      risparmio_netto: 440,
      categoria_top: expect.objectContaining({ etichetta: 'Cibo e spesa', totale: 60 }),
    }));
    // Confronto con la settimana precedente, quando ci sono dati.
    expect(riepiloghi[0].metadata.settimana_precedente).toEqual(expect.objectContaining({
      uscite: 40,
    }));
  });

  // ------------------------------------------------------------------
  // 12-13) Notifiche push
  // ------------------------------------------------------------------

  describe('notifiche push', () => {
    let inviaSpy;

    beforeAll(() => {
      // Chiavi VAPID vere ma usa e getta: web-push valida il formato.
      const chiavi = webpush.generateVAPIDKeys();
      process.env.VAPID_PUBLIC_KEY = chiavi.publicKey;
      process.env.VAPID_PRIVATE_KEY = chiavi.privateKey;
      process.env.VAPID_SUBJECT = 'mailto:test@wallt.local';
      PushService.initPush();
    });

    beforeEach(() => {
      inviaSpy = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201 });
    });

    const registraSubscription = (endpoint = 'https://push.example.com/sub-1') => request(app)
      .post('/api/notifiche/push')
      .set(authHeader(token))
      .send({
        subscription: {
          endpoint,
          keys: { p256dh: 'chiave-p256dh-di-test', auth: 'chiave-auth-di-test' },
        },
      });

    it('12) non invia push senza consenso dell’utente', async () => {
      // Sottoscrizione presente ma consenso mai dato: nessun invio.
      await PushSubscription.create({
        user_id: userId,
        endpoint: 'https://push.example.com/senza-consenso',
        p256dh: 'p256dh',
        auth: 'auth',
      });

      await generaPerUtente({ userId, adesso: SERA_ROMA });
      const esito = await PushService.inviaNotifichePendenti({ userId, adesso: SERA_ROMA });

      expect(inviaSpy).not.toHaveBeenCalled();
      expect(esito.inviate).toBe(0);

      const [promemoria] = await notifichePerTipo('promemoria_giornaliero');
      expect(promemoria.canale).toBe('in_app');
      expect(promemoria.push_inviata_at).toBeNull();
    });

    it('12b) invia push dopo il consenso esplicito, con payload privo di dati finanziari', async () => {
      await registraSubscription().expect(201);

      const preferenze = await PreferenzeNotifiche.findOne({ where: { user_id: userId } });
      expect(preferenze.push_attive).toBe(true);

      await creaBudget([{ categoria: 'cibo', importo: 100 }]);
      await creaMovimento({ importo: 130, categoria: 'cibo_spesa' });
      await generaPerUtente({ userId, adesso: SERA_ROMA });
      await PushService.inviaNotifichePendenti({ userId, adesso: SERA_ROMA });

      expect(inviaSpy).toHaveBeenCalled();
      const [, payload] = inviaSpy.mock.calls[0];
      const corpo = JSON.parse(payload);
      expect(corpo.titolo).toBe('Budget superato');
      expect(corpo.url).toBe('/budget');
      // Nessun importo, nessun saldo, nessuna categoria nel payload.
      expect(payload).not.toMatch(/130|Cibo|saldo/i);

      const [avviso] = await notifichePerTipo('budget_superato');
      expect(avviso.push_inviata_at).not.toBeNull();
    });

    it('12c) revocare il consenso ferma gli invii anche per le notifiche già create', async () => {
      await registraSubscription().expect(201);
      await generaPerUtente({ userId, adesso: SERA_ROMA });

      const [promemoria] = await notifichePerTipo('promemoria_giornaliero');
      expect(promemoria.canale).toBe('push');

      await request(app)
        .put('/api/notifiche/preferenze')
        .set(authHeader(token))
        .send({ push_attive: false })
        .expect(200);

      await PushService.inviaNotifichePendenti({ userId, adesso: SERA_ROMA });

      expect(inviaSpy).not.toHaveBeenCalled();
      await promemoria.reload();
      expect(promemoria.canale).toBe('in_app');
      // Disattivare le push rimuove anche i dispositivi registrati.
      expect(await PushSubscription.count({ where: { user_id: userId } })).toBe(0);
    });

    it('13) una sottoscrizione non più valida viene disattivata', async () => {
      await registraSubscription('https://push.example.com/scaduta').expect(201);
      inviaSpy.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));

      await generaPerUtente({ userId, adesso: SERA_ROMA });
      const esito = await PushService.inviaNotifichePendenti({ userId, adesso: SERA_ROMA });

      expect(esito.disattivate).toBe(1);
      const subscription = await PushSubscription.findOne({ where: { user_id: userId } });
      expect(subscription.attiva).toBe(false);
      expect(subscription.ultimo_errore).toBe('HTTP 410');
      expect(subscription.disattivata_at).not.toBeNull();

      // Senza destinatari validi la notifica resta comunque nel centro notifiche.
      const [promemoria] = await notifichePerTipo('promemoria_giornaliero');
      expect(promemoria.canale).toBe('in_app');
      expect(promemoria.push_inviata_at).toBeNull();
    });

    it('13b) un errore temporaneo del push service non disattiva la sottoscrizione né fa fallire il job', async () => {
      await registraSubscription('https://push.example.com/instabile').expect(201);
      inviaSpy.mockRejectedValue(Object.assign(new Error('Service Unavailable'), { statusCode: 503 }));

      await generaPerUtente({ userId, adesso: SERA_ROMA });
      const esito = await PushService.inviaNotifichePendenti({ userId, adesso: SERA_ROMA });

      expect(esito.fallite).toBe(1);
      expect(esito.disattivate).toBe(0);
      const subscription = await PushSubscription.findOne({ where: { user_id: userId } });
      expect(subscription.attiva).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 14) Il centro notifiche funziona senza push
  // ------------------------------------------------------------------

  it('14) il centro notifiche funziona con le push disattivate', async () => {
    await creaBudget([{ categoria: 'cibo', importo: 100 }]);
    await creaMovimento({ importo: 130, categoria: 'cibo_spesa' });
    await generaPerUtente({ userId, adesso: SERA_ROMA });

    const preferenze = await PreferenzeNotifiche.findOne({ where: { user_id: userId } });
    expect(preferenze.push_attive).toBe(false);

    const lista = await request(app).get('/api/notifiche').set(authHeader(token)).expect(200);
    expect(lista.body.notifiche.length).toBeGreaterThan(0);
    expect(lista.body.non_lette).toBe(lista.body.notifiche.length);
    expect(lista.body.notifiche.every((n) => n.canale === 'in_app')).toBe(true);
    // La dedupe_key è un dettaglio interno: non esce dall'API.
    expect(lista.body.notifiche[0].dedupe_key).toBeUndefined();

    const nonLette = await request(app)
      .get('/api/notifiche/non-lette')
      .set(authHeader(token))
      .expect(200);
    expect(nonLette.body.non_lette).toBe(lista.body.non_lette);

    const primaId = lista.body.notifiche[0].id;
    const segnata = await request(app)
      .put(`/api/notifiche/${primaId}/letta`)
      .set(authHeader(token))
      .expect(200);
    expect(segnata.body.non_lette).toBe(lista.body.non_lette - 1);

    const tutte = await request(app)
      .put('/api/notifiche/lette')
      .set(authHeader(token))
      .expect(200);
    expect(tutte.body.non_lette).toBe(0);
    expect(await NotificheService.contaNonLette(userId)).toBe(0);
  });

  it('14c) la notifica di prova non consuma il limite giornaliero ed è limitata a una al minuto', async () => {
    const prima = await request(app)
      .post('/api/notifiche/prova')
      .set(authHeader(token))
      .expect(201);

    expect(prima.body.non_lette).toBe(1);

    const [prova] = await notifichePerTipo('test');
    expect(prova.titolo).toBe('Notifica di prova');
    // Non deve rubare uno dei due slot giornalieri a un avviso vero.
    expect(prova.conta_nel_limite).toBe(false);

    // Seconda richiesta ravvicinata: la dedupe_key al minuto la blocca.
    await request(app)
      .post('/api/notifiche/prova')
      .set(authHeader(token))
      .expect(429);

    expect(await notifichePerTipo('test')).toHaveLength(1);

    // E il promemoria della giornata resta possibile: il limite è intatto.
    await generaPerUtente({ userId, adesso: SERA_ROMA });
    expect(await notifichePerTipo('promemoria_giornaliero')).toHaveLength(1);
  });

  it('14b) preferenze: lettura, aggiornamento e giornata controllata via API', async () => {
    const iniziali = await request(app)
      .get('/api/notifiche/preferenze')
      .set(authHeader(token))
      .expect(200);

    expect(iniziali.body.preferenze).toEqual(expect.objectContaining({
      promemoria_giornaliero_attivo: true,
      alert_budget_attivi: true,
      alert_ricorrenti_attivi: true,
      riepilogo_settimanale_attivo: false,
      push_attive: false,
      orario_promemoria: '20:00',
      timezone: 'Europe/Rome',
      quiet_hours_inizio: '22:00',
      quiet_hours_fine: '08:00',
      max_notifiche_giornaliere: 2,
    }));

    const aggiornate = await request(app)
      .put('/api/notifiche/preferenze')
      .set(authHeader(token))
      .send({ orario_promemoria: '19:30', riepilogo_settimanale_attivo: true })
      .expect(200);
    expect(aggiornate.body.preferenze.orario_promemoria).toBe('19:30');
    expect(aggiornate.body.preferenze.riepilogo_settimanale_attivo).toBe(true);

    await request(app)
      .put('/api/notifiche/preferenze')
      .set(authHeader(token))
      .send({ orario_promemoria: '25:99' })
      .expect(400);

    await request(app)
      .put('/api/notifiche/preferenze')
      .set(authHeader(token))
      .send({ timezone: 'Marte/Olympus' })
      .expect(400);

    const controllata = await request(app)
      .post('/api/notifiche/giornata-controllata')
      .set(authHeader(token))
      .expect(200);
    expect(controllata.body.giorno).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const preferenze = await PreferenzeNotifiche.findOne({ where: { user_id: userId } });
    expect(preferenze.giornata_controllata_il).toBe(controllata.body.giorno);
  });
});
