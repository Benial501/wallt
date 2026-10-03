/**
 * Il motore di sincronizzazione: idempotenza, resistenza agli errori,
 * concorrenza e normalizzazione.
 *
 * Qui il provider viene INIETTATO, al contrario di `bankSyncApi.test.js`:
 * serve a controllare esattamente cosa risponde la banca (un errore, una
 * valuta diversa, una transazione senza identificatore) e a verificare cosa
 * fa WALLT in quel caso. Le due suite sono complementari: quella API prova il
 * percorso reale, questa prova i casi che la banca produce raramente e che
 * sono esattamente quelli in cui si perdono dati.
 */

const request = require('supertest');
const { createApp } = require('../app');
const {
  Conto, Movimento, BankConnection, UserEntitlement, CategorieRegola,
} = require('../models');
const SandboxBankProvider = require('../services/bankSync/providers/SandboxBankProvider');
const { sincronizza, acquisisciLock } = require('../services/bankSync/syncEngine.service');
const { normalizzaTransazioni } = require('../services/bankSync/normalizer');
const {
  processaSincronizzazioniPianificate, backoffOre, selezionaDaSincronizzare,
} = require('../services/bankSync/cronSync.service');
const {
  TX_BOOKED, TX_PENDING, ERR_BANK_UNAVAILABLE, ERR_CONSENT_EXPIRED,
  ERR_RATE_LIMIT, ERR_SYNC_IN_CORSO, ERR_COOLDOWN, STATO_ATTIVA,
  STATO_ERRORE, STATO_CONSENSO_SCADUTO, ORIGINE_OPEN_BANKING,
} = require('../constants/bankSync');
const {
  BANK_SYNC_COOLDOWN_SECONDI, BANK_SYNC_CRON_ENABLED, BANK_SYNC_CRON_ORE_MINIME,
} = require('../constants/appConfig');
const appConfig = require('../services/appConfig.service');
const { SOURCE_BETA_25 } = require('../constants/entitlements');
const {
  azzeraConfigurazione, abilitaSandbox, creaUtente, concediEntitlement, collegaBanca,
} = require('./helpers/premium');

const app = createApp({ enableRateLimit: false });

const oggi = () => new Date().toISOString().slice(0, 10);

const tx = (over = {}) => ({
  providerTransactionId: 'tx-1',
  status: TX_BOOKED,
  importo: -10,
  valuta: 'EUR',
  bookingDate: oggi(),
  valueDate: oggi(),
  descrizione: 'ACQUISTO GENERICO',
  merchantName: null,
  controparte: null,
  categoriaProvider: null,
  ...over,
});

/** Un utente con la banca già collegata e il provider pronto all'uso. */
const preparaCollegato = async () => {
  azzeraConfigurazione();
  await abilitaSandbox();
  const utente = await creaUtente(app);
  await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
  await collegaBanca(app, utente.headers);
  const connessione = await BankConnection.findOne({
    where: { user_id: utente.userId, status: STATO_ATTIVA },
  });
  return { utente, connessione };
};

describe('normalizzazione: ProviderTransaction → movimento WALLT', () => {
  const normalizza = (transazioni, valutaConto = 'EUR') => normalizzaTransazioni({
    transazioni, contoId: 7, connectionId: 3, valutaConto,
  });

  it('il segno della banca diventa tipo più importo positivo', () => {
    const { movimenti } = normalizza([
      tx({ providerTransactionId: 'a', importo: -42.5 }),
      tx({ providerTransactionId: 'b', importo: 1850 }),
    ]);

    expect(movimenti[0].tipo).toBe('uscita');
    expect(movimenti[0].importo).toBe(42.5);
    expect(movimenti[1].tipo).toBe('entrata');
    expect(movimenti[1].importo).toBe(1850);
  });

  it('una transazione in attesa non diventa un movimento, ed è contata', () => {
    const { movimenti, scartate } = normalizza([tx({ status: TX_PENDING })]);
    expect(movimenti).toHaveLength(0);
    expect(scartate.non_contabilizzate).toBe(1);
  });

  it('scarta e conta gli importi nulli, le date assenti e le valute diverse', () => {
    const { movimenti, scartate } = normalizza([
      tx({ providerTransactionId: 'a', importo: 0 }),
      tx({ providerTransactionId: 'b', importo: null }),
      tx({ providerTransactionId: 'c', bookingDate: null, valueDate: null }),
      tx({ providerTransactionId: 'd', valuta: 'USD' }),
      tx({ providerTransactionId: 'e' }),
    ]);

    expect(movimenti).toHaveLength(1);
    expect(movimenti[0].external_transaction_id).toBe('e');
    expect(scartate.importo_non_valido).toBe(2);
    expect(scartate.data_assente).toBe(1);
    // Convertire 50 USD in 50 EUR corromperebbe i dati finanziari: senza
    // tassi di cambio l'unica scelta onesta è scartare e dirlo.
    expect(scartate.valuta_diversa).toBe(1);
  });

  it('senza identificatore del provider non ne inventa uno da persistere', () => {
    const { movimenti } = normalizza([tx({ providerTransactionId: null })]);
    expect(movimenti[0].external_transaction_id).toBeNull();
    // Esiste una chiave di batch, ma non finisce nel database: una UNIQUE su
    // un id instabile lo tratterebbe come affidabile.
    expect(movimenti[0].clientTxId).toMatch(/^fp-/);
  });

  it('due operazioni identiche nello stesso giorno restano DUE', () => {
    // Il caso che un'impronta "data + importo" fonderebbe in una, perdendo
    // denaro dell'utente.
    const { movimenti } = normalizza([
      tx({ providerTransactionId: null, importo: -1.2, descrizione: 'BAR' }),
      tx({ providerTransactionId: null, importo: -1.2, descrizione: 'BAR' }),
    ]);
    expect(movimenti).toHaveLength(2);
    expect(movimenti[0].clientTxId).not.toBe(movimenti[1].clientTxId);
  });

  it('se il conto non dichiara una valuta non scarta nulla per valuta', () => {
    const { movimenti, scartate } = normalizza([tx({ valuta: 'USD' })], null);
    expect(movimenti).toHaveLength(1);
    expect(scartate.valuta_diversa).toBe(0);
  });
});

describe('idempotenza della sincronizzazione', () => {
  it('ripetuta molte volte non duplica nulla', async () => {
    const { utente, connessione } = await preparaCollegato();
    const provider = new SandboxBankProvider();

    for (let i = 0; i < 4; i += 1) {
      await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });
    }

    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
    // Il provider è stato interrogato tutte le volte: la deduplica avviene
    // in WALLT, non perché il provider abbia risposto meno.
    expect(provider.chiamate.getTransactions).toBe(4);
  });

  it('una transazione senza identificatore stabile viene deduplicata dal confronto storico', async () => {
    const { utente, connessione } = await preparaCollegato();
    const provider = new SandboxBankProvider({
      transazioni: [tx({ providerTransactionId: null, descrizione: 'PANIFICIO DA MARIO' })],
    });

    const prima = await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });
    const seconda = await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });

    expect(prima.importati).toBe(1);
    expect(seconda.importati).toBe(0);
    expect(seconda.duplicati_evitati).toBe(1);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(1);
  });

  it('due transazioni distinte CON identificatore non vengono fuse, nemmeno se identiche', async () => {
    // Con un id stabile la deduplica per somiglianza non si applica: due
    // acquisti identici legittimi devono restare due movimenti.
    const { utente, connessione } = await preparaCollegato();
    const provider = new SandboxBankProvider({
      transazioni: [
        tx({ providerTransactionId: 'caffe-1', importo: -1.2, descrizione: 'BAR CENTRALE' }),
        tx({ providerTransactionId: 'caffe-2', importo: -1.2, descrizione: 'BAR CENTRALE' }),
      ],
    });

    const esito = await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });
    expect(esito.importati).toBe(2);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(2);
  });

  it('il doppione dentro lo stesso batch viene scartato una volta sola', async () => {
    const { utente, connessione } = await preparaCollegato();
    const provider = new SandboxBankProvider({
      transazioni: [tx({ providerTransactionId: 'ripetuta' }), tx({ providerTransactionId: 'ripetuta' })],
    });

    const esito = await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });
    expect(esito.importati).toBe(1);
    expect(esito.duplicati_evitati).toBe(1);
  });

  it('l\'indice UNIQUE del database impedisce il doppione anche a chi scrive diretto', async () => {
    const { utente, connessione } = await preparaCollegato();
    const provider = new SandboxBankProvider({ transazioni: [tx({ providerTransactionId: 'unica' })] });
    await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });

    // Scrittura che salta ogni controllo applicativo: solo l'indice parziale
    // può fermarla. Se passasse, l'idempotenza dipenderebbe soltanto dalla
    // logica, e qualunque percorso futuro potrebbe aggirarla.
    await expect(Movimento.create({
      user_id: utente.userId,
      conto_id: connessione.conto_id,
      tipo: 'uscita',
      importo: 10,
      categoria: 'altro_uscita',
      descrizione: 'duplicato a mano',
      data: oggi(),
      ricorrente: false,
      origine: ORIGINE_OPEN_BANKING,
      bank_connection_id: connessione.id,
      external_transaction_id: 'unica',
    })).rejects.toThrow();
  });
});

describe('un errore del provider non distrugge i dati precedenti', () => {
  it('i movimenti, il saldo e l\'ultimo aggiornamento riuscito restano intatti', async () => {
    const { utente, connessione } = await preparaCollegato();

    await sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: new SandboxBankProvider(),
    });
    await connessione.reload();
    const riuscitaPrima = connessione.last_successful_sync_at;
    const conto = await Conto.findByPk(connessione.conto_id);
    const saldoPrima = Number(conto.saldo);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);

    const rotto = new SandboxBankProvider({ errore: { codice: ERR_BANK_UNAVAILABLE } });
    await expect(sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: rotto,
    })).rejects.toMatchObject({ codice: ERR_BANK_UNAVAILABLE });

    // INVARIANTE: niente di finanziario è stato toccato.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
    const contoDopo = await Conto.findByPk(connessione.conto_id);
    expect(Number(contoDopo.saldo)).toBe(saldoPrima);

    await connessione.reload();
    // È il dato che permette alla UI di dire "ultimo aggiornamento riuscito
    // ieri alle 22:10" invece di svuotare la pagina.
    expect(connessione.last_successful_sync_at.getTime()).toBe(riuscitaPrima.getTime());
    expect(connessione.status).toBe(STATO_ERRORE);
    expect(connessione.error_code).toBe(ERR_BANK_UNAVAILABLE);
    expect(connessione.last_error_at).not.toBeNull();
    expect(connessione.sync_errori_totali).toBe(1);
    // Il lock viene rilasciato anche in caso di errore.
    expect(connessione.sync_started_at).toBeNull();
  });

  it('dopo un errore la connessione resta sincronizzabile e si riprende', async () => {
    const { utente, connessione } = await preparaCollegato();
    const rotto = new SandboxBankProvider({ errore: { codice: ERR_RATE_LIMIT } });

    await expect(sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: rotto,
    })).rejects.toMatchObject({ codice: ERR_RATE_LIMIT });

    await connessione.reload();
    expect(connessione.status).toBe(STATO_ERRORE);

    const esito = await sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: new SandboxBankProvider(),
    });
    expect(esito.importati).toBe(3);
    await connessione.reload();
    expect(connessione.status).toBe(STATO_ATTIVA);
    expect(connessione.error_code).toBeNull();
  });

  it('un consenso scaduto porta allo stato che richiede la riconnessione, e blocca la sync', async () => {
    const { utente, connessione } = await preparaCollegato();
    const scaduto = new SandboxBankProvider({ errore: { codice: ERR_CONSENT_EXPIRED } });

    await expect(sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: scaduto,
    })).rejects.toMatchObject({ codice: ERR_CONSENT_EXPIRED });

    await connessione.reload();
    expect(connessione.status).toBe(STATO_CONSENSO_SCADUTO);

    // Un consenso scaduto non si ripara riprovando: serve un'azione
    // dell'utente, e insistere brucerebbe quota per lo stesso errore.
    await expect(sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: new SandboxBankProvider(),
    })).rejects.toMatchObject({ codice: ERR_CONSENT_EXPIRED });

    const stato = await request(app).get('/api/bank-sync/status')
      .set(utente.headers).expect(200);
    expect(stato.body.connessione.richiede_riconnessione).toBe(true);
    expect(stato.body.connessione.sincronizzabile).toBe(false);
  });

  it('un errore senza transazioni non lascia il conto a zero', async () => {
    // Il caso peggiore immaginabile: se il motore allineasse il saldo prima
    // di sapere se la lettura è andata a buon fine, un errore azzererebbe il
    // conto dell'utente.
    const { utente, connessione } = await preparaCollegato();
    const conto = await Conto.findByPk(connessione.conto_id);
    const saldoIniziale = Number(conto.saldo);
    expect(saldoIniziale).toBeGreaterThan(0);

    const rotto = new SandboxBankProvider({ errore: { codice: ERR_BANK_UNAVAILABLE } });
    await expect(sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: rotto,
    })).rejects.toThrow();

    const dopo = await Conto.findByPk(connessione.conto_id);
    expect(Number(dopo.saldo)).toBe(saldoIniziale);
  });
});

describe('una sola sincronizzazione per connessione alla volta', () => {
  it('il lock è preso con un UPDATE condizionale: il secondo tentativo non lo ottiene', async () => {
    const { utente, connessione } = await preparaCollegato();

    expect(await acquisisciLock(connessione.id, utente.userId)).toBe(true);
    expect(await acquisisciLock(connessione.id, utente.userId)).toBe(false);
  });

  it('una sync mentre un\'altra è in corso viene rifiutata, non accodata', async () => {
    const { utente, connessione } = await preparaCollegato();
    // Simula una sincronizzazione già in corso (il cron, per esempio).
    await connessione.update({ sync_started_at: new Date() });

    await expect(sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: new SandboxBankProvider(),
    })).rejects.toMatchObject({ codice: ERR_SYNC_IN_CORSO });

    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('un lock orfano scade da sé: un processo morto non blocca la connessione', async () => {
    const { utente, connessione } = await preparaCollegato();
    await connessione.update({ sync_started_at: new Date(Date.now() - 60 * 60 * 1000) });

    const esito = await sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider: new SandboxBankProvider(),
    });
    expect(esito.importati).toBe(3);
  });

  it('due sincronizzazioni lanciate insieme importano una sola volta', async () => {
    const { utente, connessione } = await preparaCollegato();
    const provider = new SandboxBankProvider();

    const esiti = await Promise.allSettled([
      sincronizza({ userId: utente.userId, connectionId: connessione.id, provider }),
      sincronizza({ userId: utente.userId, connectionId: connessione.id, provider }),
    ]);

    const riuscite = esiti.filter((e) => e.status === 'fulfilled');
    expect(riuscite.length).toBeGreaterThanOrEqual(1);
    // Qualunque sia l'esito delle singole chiamate, il database non contiene
    // doppioni.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
  });
});

describe('cooldown: la quota del provider va protetta', () => {
  it('una seconda sincronizzazione manuale ravvicinata viene rifiutata con il tempo di attesa', async () => {
    const { utente, connessione } = await preparaCollegato();
    await appConfig.setConfig(BANK_SYNC_COOLDOWN_SECONDI, 300);
    const provider = new SandboxBankProvider();

    await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });

    await expect(sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider,
    })).rejects.toMatchObject({ codice: ERR_COOLDOWN });

    // Il provider non è stato interrogato la seconda volta: è il punto del
    // cooldown, risparmiare una chiamata a pagamento.
    expect(provider.chiamate.getTransactions).toBe(1);
  });

  it('il cron ignora il cooldown, perché ha un criterio proprio', async () => {
    const { utente, connessione } = await preparaCollegato();
    await appConfig.setConfig(BANK_SYNC_COOLDOWN_SECONDI, 300);
    const provider = new SandboxBankProvider();

    await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });
    const esito = await sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider, ignoraCooldown: true,
    });
    expect(esito.esito).toBe('ok');
  });
});

describe('categorizzazione: la cascata esistente, non una seconda', () => {
  it('una regola dell\'utente vince sulle regole globali', async () => {
    const { utente, connessione } = await preparaCollegato();
    // Una regola utente TIPIZZATA richiede la corrispondenza esatta della
    // descrizione normalizzata: è la forma in cui `CategoryLearningService`
    // registra una correzione dell'utente, e qui si usa quella vera invece di
    // inventarne una che la cascata non userebbe mai.
    await CategorieRegola.create({
      user_id: utente.userId,
      pattern: 'panificio da mario',
      categoria: 'cibo_spesa',
      tipo: 'uscita',
      priorita: 100,
      attiva: true,
    });

    const provider = new SandboxBankProvider({
      transazioni: [tx({ providerTransactionId: 'p1', descrizione: 'PANIFICIO DA MARIO' })],
    });
    await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });

    const movimento = await Movimento.findOne({ where: { user_id: utente.userId } });
    expect(movimento.categoria).toBe('cibo_spesa');
    expect(movimento.categoria_automatica).toBe(true);
    expect(movimento.categoria_modificata).toBe(false);
    expect(movimento.categoria_fonte).toBeTruthy();
    expect(movimento.categoria_confidenza).not.toBeNull();
  });

  it('ciò che la cascata non sa classificare finisce in da_verificare, non in una categoria a caso', async () => {
    const { utente, connessione } = await preparaCollegato();
    const provider = new SandboxBankProvider({
      transazioni: [tx({ providerTransactionId: 'x1', descrizione: 'ZZQQ 884412' })],
    });

    const esito = await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });
    expect(esito.da_verificare).toBe(1);
    const movimento = await Movimento.findOne({ where: { user_id: utente.userId } });
    expect(movimento.categoria).toBe('da_verificare');
  });

  it('una categoria eliminata dall\'utente non può rientrare dalla banca', async () => {
    // Regola 18: `categorie.service.list()` è l'unica giuntura, e il motore
    // di Bank Sync passa dalla stessa cascata. Se questo test fallisse,
    // esisterebbe una seconda strada per far riapparire una categoria che
    // l'utente ha eliminato.
    const { utente, connessione } = await preparaCollegato();
    // Senza eliminazione la cascata classifica questa descrizione come
    // `supermercato` con confidenza 89 (regola globale di contesto).
    await request(app).delete('/api/categorie/default')
      .set(utente.headers)
      .send({ categorie: [{ id: 'supermercato', tipo: 'uscita' }] })
      .expect(200);

    const provider = new SandboxBankProvider({
      transazioni: [tx({ providerTransactionId: 'p2', descrizione: 'PANIFICIO DA MARIO' })],
    });
    await sincronizza({ userId: utente.userId, connectionId: connessione.id, provider });

    const movimento = await Movimento.findOne({ where: { user_id: utente.userId } });
    expect(movimento.categoria).toBe('da_verificare');
  });
});

describe('sincronizzazione pianificata (cron)', () => {
  beforeEach(() => azzeraConfigurazione());

  it('sincronizza automaticamente quattro volte al giorno per default', async () => {
    const { utente, connessione } = await preparaCollegato();
    expect(await appConfig.getConfig(BANK_SYNC_CRON_ENABLED)).toBe(true);
    expect(await appConfig.getConfig(BANK_SYNC_CRON_ORE_MINIME)).toBe(6);

    const esito = await processaSincronizzazioniPianificate({ provider: new SandboxBankProvider() });
    expect(esito.saltato).toBe(false);
    expect(esito.riuscite).toBe(1);
    expect(esito.importati).toBe(3);

    await connessione.reload();
    expect(connessione.last_successful_sync_at).not.toBeNull();
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
  });

  it('accesa, sincronizza le connessioni arretrate', async () => {
    const { utente, connessione } = await preparaCollegato();
    await appConfig.setConfig(BANK_SYNC_CRON_ENABLED, true);
    await appConfig.setConfig(BANK_SYNC_CRON_ORE_MINIME, 1);

    const esito = await processaSincronizzazioniPianificate({ provider: new SandboxBankProvider() });
    expect(esito.saltato).toBe(false);
    expect(esito.riuscite).toBe(1);
    expect(esito.importati).toBe(3);

    await connessione.reload();
    expect(connessione.last_successful_sync_at).not.toBeNull();
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
  });

  it('non riprocessa una connessione sincronizzata nelle ultime sei ore', async () => {
    const { connessione } = await preparaCollegato();
    await appConfig.setConfig(BANK_SYNC_CRON_ENABLED, true);
    await appConfig.setConfig(BANK_SYNC_CRON_ORE_MINIME, 6);
    await connessione.update({ last_successful_sync_at: new Date() });

    const esito = await processaSincronizzazioniPianificate({ provider: new SandboxBankProvider() });
    expect(esito.processate).toBe(0);
  });

  it('un entitlement revocato ferma il cron, anche se la connessione è attiva', async () => {
    // La riverifica a ogni passaggio è la seconda barriera: anche se la
    // sospensione della connessione non fosse andata a buon fine, nessuna
    // sincronizzazione parte.
    const { utente, connessione } = await preparaCollegato();
    await appConfig.setConfig(BANK_SYNC_CRON_ENABLED, true);
    await appConfig.setConfig(BANK_SYNC_CRON_ORE_MINIME, 1);
    await UserEntitlement.update(
      { status: 'revoked' }, { where: { user_id: utente.userId } },
    );
    // La connessione resta deliberatamente `attiva`: è lo scenario peggiore.
    await connessione.update({ status: STATO_ATTIVA });

    const esito = await processaSincronizzazioniPianificate({ provider: new SandboxBankProvider() });
    expect(esito.senza_permesso).toBe(1);
    expect(esito.processate).toBe(0);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(0);
  });

  it('salta le connessioni che richiedono una riconnessione dell\'utente', async () => {
    const { connessione } = await preparaCollegato();
    await appConfig.setConfig(BANK_SYNC_CRON_ENABLED, true);
    await appConfig.setConfig(BANK_SYNC_CRON_ORE_MINIME, 1);
    await connessione.update({
      status: STATO_ERRORE, error_code: ERR_CONSENT_EXPIRED, last_error_at: new Date(),
    });

    const candidate = await selezionaDaSincronizzare({ oreMinime: 1, massimo: 10 });
    expect(candidate).toHaveLength(0);
  });

  it('il backoff cresce con i fallimenti e si ferma', () => {
    expect(backoffOre(0, 0)).toBe(0);
    expect(backoffOre(1, 0)).toBe(2);
    expect(backoffOre(3, 0)).toBe(8);
    // Nessun ciclo infinito e nessuna crescita illimitata.
    expect(backoffOre(99, 0)).toBe(32);
    // Un errore isolato dopo molti successi non rallenta nulla.
    expect(backoffOre(1, 10)).toBe(0);
  });

  it('un utente che fallisce non ferma il lotto', async () => {
    const primo = await preparaCollegato();
    const secondo = await preparaCollegato();
    await appConfig.setConfig(BANK_SYNC_CRON_ENABLED, true);
    await appConfig.setConfig(BANK_SYNC_CRON_ORE_MINIME, 1);

    // Il provider fallisce solo sulla prima chiamata: la seconda connessione
    // deve essere processata comunque.
    let chiamate = 0;
    const provider = new SandboxBankProvider();
    const originale = provider.getTransactions.bind(provider);
    provider.getTransactions = async (...args) => {
      chiamate += 1;
      if (chiamate === 1) {
        const { BankProviderError } = require('../services/bankSync/providers/BankProvider');
        throw new BankProviderError(ERR_BANK_UNAVAILABLE, 'banca giù');
      }
      return originale(...args);
    };

    const esito = await processaSincronizzazioniPianificate({ provider });
    expect(esito.processate).toBe(2);
    expect(esito.fallite).toBe(1);
    expect(esito.riuscite).toBe(1);

    const totali = await Movimento.count();
    expect(totali).toBe(3);
    expect([primo.utente.userId, secondo.utente.userId]).toHaveLength(2);
  });
});
