/**
 * Riconciliazione fra i movimenti di scommesse e il conto collegato via
 * Bank Sync.
 *
 * Il problema che queste prove presidiano è simmetrico, e in entrambi i versi
 * riguarda lo STESSO euro visto da due fonti:
 *
 *  • l'utente segna il deposito in Scommesse (un trasferimento conto → conto
 *    di gioco) e la notte dopo la banca porta la stessa operazione: senza
 *    riconciliazione sarebbero due righe per un solo movimento reale, e
 *    budget e analisi conterebbero il doppio;
 *
 *  • l'utente NON lo segna: la banca porta l'uscita, ma nessuno accredita la
 *    piattaforma, e il saldo di gioco in WALLT resta sbagliato.
 *
 * La riga adottata conserva `origine: 'manuale'`: l'ha scritta l'utente, ed è
 * `origine` che decide cosa cancella "elimina i dati importati".
 */

const { request, Conto, Movimento, User } = require('./setup');
const {
  ProfiloUtente, PiattaformaScommesse, MovimentoScommesse, BankConnection, Notifica,
} = require('../models');
const { createApp } = require('../app');
const { importaTransazioni, sincronizza } = require('../services/bankSync/syncEngine.service');
const { eliminaDatiImportati } = require('../services/bankSync/connections.service');
const {
  TX_BOOKED, STATO_ATTIVA, ORIGINE_MANUALE, ORIGINE_OPEN_BANKING,
} = require('../constants/bankSync');
const { SOURCE_BETA_25 } = require('../constants/entitlements');
const {
  azzeraConfigurazione, abilitaSandbox, creaUtente, concediEntitlement, collegaBanca,
} = require('./helpers/premium');
const {
  notificaProposteAperte, TIPO_NOTIFICA_DA_CONFERMARE,
} = require('../services/riconciliazioneScommesse.service');
const { TESTI_PUSH_GENERICI } = require('../services/notifiche/PushService');
const SandboxBankProvider = require('../services/bankSync/providers/SandboxBankProvider');
const sinon = require('sinon');

const app = createApp({ enableRateLimit: false });

const giorno = (scostamento = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + scostamento);
  return d.toISOString().slice(0, 10);
};

const tx = (over = {}) => ({
  providerTransactionId: 'tx-dep-1',
  status: TX_BOOKED,
  importo: -50,
  valuta: 'EUR',
  bookingDate: giorno(),
  valueDate: giorno(),
  descrizione: 'SNAI SPA PAGAMENTO ONLINE',
  merchantName: null,
  controparte: null,
  categoriaProvider: null,
  ...over,
});

/**
 * Un utente con la banca collegata, le scommesse attive e una piattaforma.
 * Il conto collegato è quello creato dalla riconciliazione: è da lì che parte
 * il deposito, perché è il caso che genera il doppione.
 */
const preparaScenario = async () => {
  azzeraConfigurazione();
  await abilitaSandbox();
  const utente = await creaUtente(app);
  await concediEntitlement(utente.userId, { source: SOURCE_BETA_25 });
  await ProfiloUtente.upsert({
    user_id: utente.userId, fascia_eta: '25_34', fa_scommesse: 'si', onboarding_completato: true,
  });
  await User.update({ mostra_scommesse: true }, { where: { id: utente.userId } });

  await collegaBanca(app, utente.headers);
  const connessione = await BankConnection.findOne({
    where: { user_id: utente.userId, status: STATO_ATTIVA },
  });

  const contoCollegato = await Conto.findOne({ where: { id: connessione.conto_id } });
  await contoCollegato.update({ saldo: 1000 });

  const creata = await request(app)
    .post('/api/scommesse/piattaforme')
    .set(utente.headers)
    .send({ nome: 'SNAI', saldo_iniziale: 0 });

  return {
    utente,
    connessione,
    contoCollegato,
    piattaformaId: creata.body.piattaforma.id,
    contoGiocoId: creata.body.conto_id,
  };
};

const segnaMovimentoScommesse = (utente, piattaformaId, tipo, importo, extra = {}) => request(app)
  .post('/api/scommesse/movimenti')
  .set(utente.headers)
  .send({
    piattaforma_id: piattaformaId, tipo, importo, data: giorno(), ...extra,
  });

const importa = ({ connessione, utente, transazioni, saldo = null }) => importaTransazioni({
  userId: utente.userId,
  connessione,
  risposta: { booked: transazioni, pending: [], saldo },
});

describe('adozione: la banca ridice un deposito già segnato a mano', () => {
  it('non crea un secondo movimento e attacca l’id bancario a quello esistente', async () => {
    const {
      utente, connessione, contoCollegato, piattaformaId,
    } = await preparaScenario();

    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });

    const esito = await importa({ connessione, utente, transazioni: [tx()] });

    const movimenti = await Movimento.findAll({ where: { user_id: utente.userId } });
    expect(movimenti).toHaveLength(1);

    const riga = movimenti[0];
    expect(riga.tipo).toBe('trasferimento');
    expect(riga.categoria).toBe('deposito_scommesse');
    expect(riga.external_transaction_id).toBe('tx-dep-1');
    expect(riga.bank_connection_id).toBe(connessione.id);
    expect(riga.stato_banca).toBe(TX_BOOKED);
    // L'ha scritta l'utente: `eliminaDatiImportati` filtra per `origine` e
    // non deve poterla cancellare.
    expect(riga.origine).toBe(ORIGINE_MANUALE);

    expect(esito.importati).toBe(0);
    expect(esito.riconciliati).toBe(1);
  });

  it('un importo diverso non viene adottato: sono due operazioni distinte', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });

    const esito = await importa({
      connessione, utente, transazioni: [tx({ importo: -30 })],
    });

    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(2);
    expect(esito.riconciliati).toBe(0);
    expect(esito.importati).toBe(1);
  });

  it('un movimento segnato fuori dalla finestra non viene adottato', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
      data: giorno(-20),
    });

    const esito = await importa({ connessione, utente, transazioni: [tx()] });

    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(2);
    expect(esito.riconciliati).toBe(0);
  });

  it('il verso deve combaciare: un’entrata non adotta un deposito', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });

    // +50 sul conto: un accredito, non il deposito appena segnato.
    const esito = await importa({
      connessione, utente, transazioni: [tx({ importo: 50 })],
    });

    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(2);
    expect(esito.riconciliati).toBe(0);
  });

  it('il verso deve combaciare: un’uscita non adotta un prelievo', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 60, {
      conto_collegato_id: contoCollegato.id,
    });
    await Movimento.destroy({ where: { user_id: utente.userId } });
    await segnaMovimentoScommesse(utente, piattaformaId, 'prelievo', 50, {
      conto_collegato_id: contoCollegato.id,
    });

    const esito = await importa({ connessione, utente, transazioni: [tx()] });

    expect(esito.riconciliati).toBe(0);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(2);
  });

  it('una riga segnata a mano è adottata da una sola transazione', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    // Un solo deposito segnato, due uscite vere dello stesso importo: la
    // seconda è un'operazione reale in più, non un doppione.
    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });

    const esito = await importa({
      connessione,
      utente,
      transazioni: [tx(), tx({ providerTransactionId: 'tx-dep-2' })],
    });

    expect(esito.riconciliati).toBe(1);
    expect(esito.importati).toBe(1);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(2);
  });

  it('il prelievo è trattato allo stesso modo del deposito', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 80, {
      conto_collegato_id: contoCollegato.id,
    });
    await Movimento.destroy({ where: { user_id: utente.userId } });
    await segnaMovimentoScommesse(utente, piattaformaId, 'prelievo', 80, {
      conto_collegato_id: contoCollegato.id,
    });

    const esito = await importa({
      connessione,
      utente,
      transazioni: [tx({ providerTransactionId: 'tx-pre-1', importo: 80, descrizione: 'SNAI VINCITA' })],
    });

    expect(esito.riconciliati).toBe(1);
    const righe = await Movimento.findAll({ where: { user_id: utente.userId } });
    expect(righe).toHaveLength(1);
    expect(righe[0].categoria).toBe('prelievo_scommesse');
    expect(righe[0].external_transaction_id).toBe('tx-pre-1');
  });

  it('risincronizzare dopo l’adozione non crea un doppione', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });

    await importa({ connessione, utente, transazioni: [tx()] });
    const secondo = await importa({ connessione, utente, transazioni: [tx()] });

    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(1);
    expect(secondo.riconciliati).toBe(0);
    expect(secondo.duplicati_evitati).toBe(1);
  });

  it('la finestra vale per la singola transazione, non per il lotto', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    // Il lotto copre dal -25 a oggi, quindi il movimento segnato 12 giorni fa
    // cade nell'intervallo complessivo interrogato; non è però vicino a
    // NESSUNA delle due transazioni, e non deve essere adottato da nessuna.
    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
      data: giorno(-12),
    });

    const esito = await importa({
      connessione,
      utente,
      transazioni: [
        tx(),
        tx({ providerTransactionId: 'tx-dep-vecchia', bookingDate: giorno(-25), valueDate: giorno(-25) }),
      ],
    });

    expect(esito.riconciliati).toBe(0);
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(3);
  });

  it('"elimina i dati importati" non cancella la riga adottata', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });
    await importa({ connessione, utente, transazioni: [tx()] });

    await eliminaDatiImportati({ userId: utente.userId });

    // La riga l'ha scritta l'utente: è l'unica che accredita la piattaforma.
    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(1);
  });
});

describe('proposte: la banca ha visto un deposito che l’utente non ha segnato', () => {
  /** Lo scenario di partenza: la riga bancaria è già stata importata e
   * nessuno le ha ancora detto su quale piattaforma è finito il denaro. */
  const preparaProposta = async (over = {}) => {
    const scenario = await preparaScenario();
    await importa({
      connessione: scenario.connessione,
      utente: scenario.utente,
      transazioni: [tx(over)],
    });
    const riga = await Movimento.findOne({
      where: { user_id: scenario.utente.userId, origine: ORIGINE_OPEN_BANKING },
    });
    return { ...scenario, riga };
  };

  const elenco = (utente) => request(app)
    .get('/api/scommesse/da-confermare')
    .set(utente.headers);

  it('la riga bancaria compare fra le proposte da confermare', async () => {
    const { utente, riga } = await preparaProposta();

    const res = await elenco(utente);

    expect(res.status).toBe(200);
    expect(res.body.proposte).toHaveLength(1);
    expect(res.body.proposte[0]).toMatchObject({
      id: riga.id,
      tipo: 'uscita',
      categoria: 'deposito_scommesse',
      importo: 50,
    });
  });

  it('confermare attribuisce il denaro alla piattaforma senza toccare il conto bancario', async () => {
    const {
      utente, riga, piattaformaId, contoGiocoId, contoCollegato,
    } = await preparaProposta();
    const saldoBancaPrima = Number((await Conto.findByPk(contoCollegato.id)).saldo);

    const res = await request(app)
      .post(`/api/scommesse/da-confermare/${riga.id}/conferma`)
      .set(utente.headers)
      .send({ piattaforma_id: piattaformaId });

    expect(res.status).toBe(200);

    // Una sola riga: quella della banca, diventata un trasferimento verso il
    // conto di gioco. Nessun movimento nuovo.
    const movimenti = await Movimento.findAll({ where: { user_id: utente.userId } });
    expect(movimenti).toHaveLength(1);
    expect(movimenti[0].tipo).toBe('trasferimento');
    expect(movimenti[0].conto_destinazione_id).toBe(contoGiocoId);
    expect(movimenti[0].origine).toBe(ORIGINE_OPEN_BANKING);

    // La piattaforma è accreditata e il suo conto specchio allineato.
    const piattaforma = await PiattaformaScommesse.findByPk(piattaformaId);
    expect(Number(piattaforma.saldo)).toBe(50);
    expect(Number((await Conto.findByPk(contoGiocoId)).saldo)).toBe(50);

    // Il saldo del conto collegato NON si tocca: la banca lo ha già
    // riportato scalato (Regola 24).
    expect(Number((await Conto.findByPk(contoCollegato.id)).saldo)).toBe(saldoBancaPrima);

    // E la proposta non si ripresenta.
    expect((await elenco(utente)).body.proposte).toHaveLength(0);
  });

  it('confermare registra il movimento anche nello storico delle scommesse', async () => {
    const { utente, riga, piattaformaId } = await preparaProposta();

    await request(app)
      .post(`/api/scommesse/da-confermare/${riga.id}/conferma`)
      .set(utente.headers)
      .send({ piattaforma_id: piattaformaId });

    const righe = await MovimentoScommesse.findAll({ where: { user_id: utente.userId } });
    expect(righe).toHaveLength(1);
    expect(righe[0].tipo).toBe('deposito');
    expect(Number(righe[0].importo)).toBe(50);
  });

  it('archiviare toglie la proposta ma conserva il movimento', async () => {
    const { utente, riga } = await preparaProposta();

    const res = await request(app)
      .post(`/api/scommesse/da-confermare/${riga.id}/archivia`)
      .set(utente.headers);

    expect(res.status).toBe(200);
    expect((await elenco(utente)).body.proposte).toHaveLength(0);
    expect(await Movimento.findByPk(riga.id)).not.toBeNull();
  });

  it('un movimento segnato a mano e poi adottato non diventa una proposta', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();
    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });
    await importa({ connessione, utente, transazioni: [tx()] });

    expect((await elenco(utente)).body.proposte).toHaveLength(0);
  });

  it('la proposta di un altro utente non è né visibile né confermabile', async () => {
    const { riga, piattaformaId } = await preparaProposta();
    const estraneo = await creaUtente(app);
    await ProfiloUtente.upsert({
      user_id: estraneo.userId, fascia_eta: '25_34', fa_scommesse: 'si', onboarding_completato: true,
    });
    await User.update({ mostra_scommesse: true }, { where: { id: estraneo.userId } });

    expect((await elenco(estraneo)).body.proposte).toHaveLength(0);

    const conferma = await request(app)
      .post(`/api/scommesse/da-confermare/${riga.id}/conferma`)
      .set(estraneo.headers)
      .send({ piattaforma_id: piattaformaId });

    expect(conferma.status).toBe(404);
  });

  it('un prelievo più grande del saldo registrato non viene accettato in silenzio', async () => {
    const { utente, riga, piattaformaId } = await preparaProposta({
      importo: 50, descrizione: 'SNAI ACCREDITO',
    });

    // La piattaforma risulta a zero: il prelievo è reale (la banca lo ha
    // visto) ma il saldo registrato in WALLT non lo giustifica. Accettarlo
    // produrrebbe un saldo di gioco negativo, che non esiste.
    const res = await request(app)
      .post(`/api/scommesse/da-confermare/${riga.id}/conferma`)
      .set(utente.headers)
      .send({ piattaforma_id: piattaformaId });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/saldo/i);
  });
});

describe('notifica: la conferma viene chiesta anche fuori dall’app', () => {
  it('una sincronizzazione che lascia proposte aperte genera una notifica', async () => {
    const { utente, connessione } = await preparaScenario();

    await importa({ connessione, utente, transazioni: [tx()] });
    await notificaProposteAperte({ userId: utente.userId });

    const notifiche = await Notifica.findAll({ where: { user_id: utente.userId } });
    expect(notifiche).toHaveLength(1);
    expect(notifiche[0].tipo).toBe(TIPO_NOTIFICA_DA_CONFERMARE);
    // Nessun importo nel testo che può uscire dall'app (Regola 17).
    expect(TESTI_PUSH_GENERICI[TIPO_NOTIFICA_DA_CONFERMARE]).toBeDefined();
    expect(TESTI_PUSH_GENERICI[TIPO_NOTIFICA_DA_CONFERMARE]).not.toMatch(/\d/);
  });

  it('due sincronizzazioni nello stesso giorno non generano due notifiche', async () => {
    const { utente, connessione } = await preparaScenario();

    await importa({ connessione, utente, transazioni: [tx()] });
    await notificaProposteAperte({ userId: utente.userId });
    await importa({
      connessione, utente, transazioni: [tx({ providerTransactionId: 'tx-dep-9' })],
    });
    await notificaProposteAperte({ userId: utente.userId });

    expect(await Notifica.count({ where: { user_id: utente.userId } })).toBe(1);
  });

  it('senza proposte aperte non arriva nessuna notifica', async () => {
    const { utente, connessione, contoCollegato, piattaformaId } = await preparaScenario();

    // Deposito segnato a mano e poi adottato: non c'è niente da confermare.
    await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });
    await importa({ connessione, utente, transazioni: [tx()] });
    await notificaProposteAperte({ userId: utente.userId });

    expect(await Notifica.count({ where: { user_id: utente.userId } })).toBe(0);
  });
});

describe('il sync completo avvisa da sé', () => {
  it('sincronizzare avvisa delle conferme in sospeso senza che nessuno lo chieda', async () => {
    const { utente, connessione } = await preparaScenario();
    const provider = new SandboxBankProvider({ transazioni: [tx()], saldo: 950 });

    const esito = await sincronizza({
      userId: utente.userId, connectionId: connessione.id, provider, ignoraCooldown: true,
    });

    expect(esito.importati).toBe(1);
    const notifiche = await Notifica.findAll({ where: { user_id: utente.userId } });
    expect(notifiche).toHaveLength(1);
    expect(notifiche[0].tipo).toBe(TIPO_NOTIFICA_DA_CONFERMARE);
  });

  it('una notifica che non parte non fa risultare fallita la sincronizzazione', async () => {
    const { utente, connessione } = await preparaScenario();
    const provider = new SandboxBankProvider({ transazioni: [tx()], saldo: 950 });
    // Si rompe la scrittura della notifica: un fallimento reale, e l'unico
    // punto del sync che la tocca (qui non ci sono budget da valutare).
    const rotta = sinon.stub(Notifica, 'create').rejects(new Error('notifiche giù'));

    try {
      const esito = await sincronizza({
        userId: utente.userId, connectionId: connessione.id, provider, ignoraCooldown: true,
      });
      expect(esito.importati).toBe(1);
    } finally {
      rotta.restore();
    }

    expect(await Movimento.count({ where: { user_id: utente.userId } })).toBe(1);
    expect(await Notifica.count({ where: { user_id: utente.userId } })).toBe(0);
  });
});

describe('avviso: segnare a mano su un conto collegato', () => {
  it('la risposta dice che la banca confermerà da sé l’operazione', async () => {
    const { utente, contoCollegato, piattaformaId } = await preparaScenario();

    const res = await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 50, {
      conto_collegato_id: contoCollegato.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.avviso).toBe('conto_collegato');
  });

  it('su un conto non collegato nessun avviso', async () => {
    const { utente, piattaformaId } = await preparaScenario();
    const altro = await Conto.create({
      user_id: utente.userId, nome: 'Contanti', tipo: 'contanti', saldo: 500, attivo: true,
    });

    const res = await segnaMovimentoScommesse(utente, piattaformaId, 'deposito', 20, {
      conto_collegato_id: altro.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.avviso).toBeUndefined();
  });
});
