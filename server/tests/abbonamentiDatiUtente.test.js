// Gli abbonamenti sono dati dell'utente come gli altri: devono seguire reset,
// cancellazione ed esportazione, altrimenti restano fuori senza che nessuno se
// ne accorga.
const {
  request, createApp, registerUser, authHeader, getStepUpToken,
} = require('./setup');
const { Abbonamento, sequelize } = require('../models');
const { deleteAllTransactions, deleteAllUserData } = require('../services/accountReset.service');

describe('Abbonamenti e dati dell\'utente', () => {
  let app;
  let utenteA;
  let utenteB;

  const riga = (userId, overrides = {}) => Abbonamento.create({
    user_id: userId,
    chiave: 'netflix',
    servizio_id: 'netflix',
    nome: 'Netflix',
    costo: '13.99',
    periodo_mesi: 1,
    stato: 'attivo',
    origine: 'manuale',
    ...overrides,
  });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const a = await registerUser(app, { nome: 'Utente A' });
    const b = await registerUser(app, { nome: 'Utente B' });
    utenteA = { id: a.res.body.user.id, token: a.res.body.token, password: a.payload.password };
    utenteB = { id: b.res.body.user.id };
  });

  it('il vincolo del database impedisce due righe per lo stesso rilevamento', async () => {
    await riga(utenteA.id, { origine: 'rilevato', ordine: 0 });
    await expect(riga(utenteA.id, { origine: 'rilevato', ordine: 0 })).rejects.toThrow();
    await expect(riga(utenteA.id, { chiave: 'apple', ordine: 0 })).resolves.toBeTruthy();
    await expect(riga(utenteB.id, { ordine: 0 })).resolves.toBeTruthy();
  });

  it('il database rifiuta periodo, stato e origine fuori elenco', async () => {
    await expect(riga(utenteA.id, { periodo_mesi: 2 })).rejects.toThrow();
    await expect(riga(utenteA.id, { stato: 'sconosciuto' })).rejects.toThrow();
    await expect(riga(utenteA.id, { origine: 'sconosciuta' })).rejects.toThrow();
  });

  it('la cancellazione dei dati toglie gli abbonamenti del solo utente', async () => {
    await riga(utenteA.id);
    await riga(utenteB.id);

    await sequelize.transaction((transaction) => deleteAllUserData(utenteA.id, transaction));

    expect(await Abbonamento.count({ where: { user_id: utenteA.id } })).toBe(0);
    expect(await Abbonamento.count({ where: { user_id: utenteB.id } })).toBe(1);
  });

  it('il reset dei movimenti toglie solo le righe nate dai movimenti e mai toccate', async () => {
    await riga(utenteA.id, { chiave: 'rilevata', origine: 'rilevato', ultimo_addebito_data: '2026-10-01', ultimo_addebito_importo: '13.99' });
    const toccata = await riga(utenteA.id, {
      chiave: 'toccata', origine: 'rilevato', modificato_utente_il: new Date(), ultimo_addebito_data: '2026-10-01', ultimo_addebito_importo: '13.99', movimento_ricorrente_id: 99,
    });
    const manuale = await riga(utenteA.id, { chiave: 'manuale' });
    const altrui = await riga(utenteB.id, { chiave: 'rilevata', origine: 'rilevato', ultimo_addebito_data: '2026-10-01' });

    await sequelize.transaction((transaction) => deleteAllTransactions(utenteA.id, transaction));

    const rimaste = await Abbonamento.findAll({ where: { user_id: utenteA.id } });
    expect(rimaste.map((r) => r.id).sort()).toEqual([toccata.id, manuale.id].sort());
    await toccata.reload();
    // Parlano di movimenti che non esistono più.
    expect(toccata.ultimo_addebito_data).toBeNull();
    expect(toccata.ultimo_addebito_importo).toBeNull();
    expect(toccata.movimento_ricorrente_id).toBeNull();
    await altrui.reload();
    expect(altrui.ultimo_addebito_data).toBe('2026-10-01');
  });

  it('l\'esportazione contiene gli abbonamenti del solo utente', async () => {
    await riga(utenteA.id, { nome: 'Il mio Netflix' });
    await riga(utenteB.id, { nome: 'Il Netflix altrui' });

    const stepUp = await getStepUpToken(app, utenteA.token, utenteA.password);
    const risposta = await request(app)
      .post('/api/impostazioni/esporta')
      .set({ ...authHeader(utenteA.token), 'X-Step-Up-Token': stepUp });

    expect(risposta.status).toBe(200);
    const nomi = JSON.parse(risposta.text).abbonamenti.map((a) => a.nome);
    expect(nomi).toEqual(['Il mio Netflix']);
  });
});
