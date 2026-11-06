const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Abbonamento, BankConnection, Notifica } = require('../models');
const { STATO_ATTIVA } = require('../constants/bankSync');
const { generaPerUtente } = require('../services/notifiche/NotificheGenerator');
const { prossimoRinnovo } = require('../services/abbonamentiRilevamento');

// Giorno del rinnovo, addebito automatico e avviso a 5 giorni (CLAUDE.md Regola 28).
describe('Abbonamenti: rinnovo e addebito', () => {
  let app;
  let token;
  let userId;
  let conto;

  const payload = (altro = {}) => ({
    nome: 'Netflix', servizio_id: 'netflix', icona: 'netflix', costo: '13.99', periodo_mesi: 1, durata_mesi: null, data_inizio: null, ...altro,
  });
  const crea = (corpo) => request(app).post('/api/abbonamenti').set(authHeader(token)).send(corpo);
  const modifica = (id, corpo) => request(app).put(`/api/abbonamenti/${id}`).set(authHeader(token)).send(corpo);
  const saldo = async () => Number((await Conto.findByPk(conto.id)).saldo);

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('senza addebito automatico salva giorno e conto e non tocca il saldo', async () => {
    const res = await crea(payload({ giorno_rinnovo: 15, conto_id: conto.id }));
    expect(res.status).toBe(201);
    expect(res.body.abbonamento).toMatchObject({
      giorno_rinnovo: 15, conto_id: conto.id, addebito_automatico: false, movimento_ricorrente_id: null,
    });
    expect(res.body.abbonamento.prossimo_rinnovo).toMatch(/-15$/);
    expect(await saldo()).toBe(1000);
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);
  });

  it('con addebito automatico crea una programmazione mensile e non scala nulla adesso', async () => {
    const res = await crea(payload({ giorno_rinnovo: 3, conto_id: conto.id, addebito_automatico: true }));
    expect(res.status).toBe(201);
    expect(res.body.abbonamento.addebito_automatico).toBe(true);

    const programmazione = await Movimento.findByPk(res.body.abbonamento.movimento_ricorrente_id);
    expect(programmazione).toMatchObject({
      ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 3, tipo: 'uscita', conto_id: conto.id,
    });
    expect(Number(programmazione.importo)).toBe(13.99);
    expect(await saldo()).toBe(1000);

    // La lettura non crea una seconda riga per la stessa programmazione.
    const elenco = await request(app).get('/api/abbonamenti').set(authHeader(token));
    expect(elenco.body.attivi).toHaveLength(1);
  });

  it('rifiuta l\'addebito automatico su un conto collegato alla banca', async () => {
    await BankConnection.create({
      user_id: userId,
      provider: 'sandbox',
      institution_id: 'FINTA_BANCA',
      provider_connection_id: 'sess-rinnovo',
      status: STATO_ATTIVA,
      conto_id: conto.id,
    });
    const res = await crea(payload({ giorno_rinnovo: 3, conto_id: conto.id, addebito_automatico: true }));
    expect(res.status).toBe(422);
    expect(await Abbonamento.count({ where: { user_id: userId } })).toBe(0);
    expect(await Movimento.count({ where: { user_id: userId } })).toBe(0);

    // Senza addebito resta possibile: il pagamento lo riporta la banca.
    expect((await crea(payload({ giorno_rinnovo: 3, conto_id: conto.id }))).status).toBe(201);
  });

  it('rifiuta l\'addebito automatico sui periodi non mensili e senza giorno', async () => {
    expect((await crea(payload({ periodo_mesi: 12, giorno_rinnovo: 3, conto_id: conto.id, addebito_automatico: true }))).status).toBe(422);
    expect((await crea(payload({ conto_id: conto.id, addebito_automatico: true }))).status).toBe(422);
  });

  it('non accetta il conto di un altro utente', async () => {
    const altro = await registerUser(app, { email: 'altro-rinnovo@example.com' });
    const suo = await Conto.create({
      user_id: altro.res.body.user.id, nome: 'Suo', tipo: 'banca', saldo: 10, attivo: true,
    });
    expect((await crea(payload({ giorno_rinnovo: 3, conto_id: suo.id }))).status).toBe(404);
  });

  it('spegnere l\'addebito o annullare l\'abbonamento termina la programmazione', async () => {
    const creato = (await crea(payload({ giorno_rinnovo: 3, conto_id: conto.id, addebito_automatico: true }))).body.abbonamento;
    const spento = await modifica(creato.id, payload({ giorno_rinnovo: 3, conto_id: conto.id, addebito_automatico: false }));
    expect(spento.status).toBe(200);
    expect(spento.body.abbonamento).toMatchObject({ addebito_automatico: false, movimento_ricorrente_id: null });
    expect((await Movimento.findByPk(creato.movimento_ricorrente_id)).stato_ricorrenza).toBe('terminata');

    const riacceso = await modifica(creato.id, payload({ giorno_rinnovo: 3, conto_id: conto.id, addebito_automatico: true }));
    const nuovaId = riacceso.body.abbonamento.movimento_ricorrente_id;
    expect(nuovaId).not.toBeNull();
    await request(app).patch(`/api/abbonamenti/${creato.id}/annulla`).set(authHeader(token)).expect(200);
    expect((await Movimento.findByPk(nuovaId)).stato_ricorrenza).toBe('terminata');
    expect(await saldo()).toBe(1000);
  });

  it('calcola il prossimo rinnovo rispettando periodo e fine mese', () => {
    expect(prossimoRinnovo({ giorno_rinnovo: 31, periodo_mesi: 1, ultimo_addebito_data: '2026-01-31' }, '2026-02-05')).toBe('2026-02-28');
    expect(prossimoRinnovo({ giorno_rinnovo: 10, periodo_mesi: 12, ultimo_addebito_data: '2025-03-10' }, '2026-11-06')).toBe('2027-03-10');
    expect(prossimoRinnovo({ giorno_rinnovo: 10, periodo_mesi: 1, data_inizio: '2026-01-10', durata_mesi: 2 }, '2026-03-11')).toBeNull();
    expect(prossimoRinnovo({ giorno_rinnovo: null }, '2026-11-06')).toBeNull();
  });

  describe('avviso a 5 giorni', () => {
    // 11:00 a Roma, fuori dalle ore di silenzio.
    const ADESSO = new Date('2026-03-10T10:00:00Z');
    const rinnovo = (altro = {}) => Abbonamento.create({
      user_id: userId,
      chiave: 'netflix',
      nome: 'Netflix',
      costo: '13.99',
      periodo_mesi: 1,
      giorno_rinnovo: 15,
      ultimo_addebito_data: '2026-02-15',
      ...altro,
    });
    const avvisi = () => Notifica.findAll({ where: { user_id: userId, tipo: 'abbonamento_rinnovo' } });

    it('parte una volta sola, senza importi nel testo', async () => {
      await rinnovo();
      await generaPerUtente({ userId, adesso: ADESSO });
      await generaPerUtente({ userId, adesso: ADESSO });
      const trovati = await avvisi();
      expect(trovati).toHaveLength(1);
      expect(trovati[0].messaggio).toMatch(/Netflix si rinnova/);
      expect(trovati[0].messaggio).not.toMatch(/13/);
    });

    it('non parte se mancano più o meno di 5 giorni, né per un abbonamento annullato', async () => {
      await rinnovo({ giorno_rinnovo: 16 });
      await rinnovo({ chiave: 'spotify', nome: 'Spotify', stato: 'annullato' });
      await generaPerUtente({ userId, adesso: ADESSO });
      expect(await avvisi()).toHaveLength(0);
    });

    it('sostituisce il promemoria della programmazione legata, invece di aggiungerne un secondo', async () => {
      const creato = (await crea(payload({ giorno_rinnovo: 15, conto_id: conto.id, addebito_automatico: true }))).body.abbonamento;
      await Abbonamento.update({ ultimo_addebito_data: '2026-02-15' }, { where: { id: creato.id } });
      // La programmazione creata prima del mese dell'avviso, come nella realtà.
      await Movimento.update({ createdAt: new Date('2026-02-01T10:00:00Z') }, { where: { id: creato.movimento_ricorrente_id } });
      await generaPerUtente({ userId, adesso: ADESSO });
      expect(await avvisi()).toHaveLength(1);
      expect(await Notifica.count({ where: { user_id: userId, tipo: 'ricorrente_imminente' } })).toBe(0);
    });
  });
});
