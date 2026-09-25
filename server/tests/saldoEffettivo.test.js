// Schema e semantica di base delle due colonne introdotte dal saldo effettivo:
// conti.nascosto (un conto che resta nel patrimonio ma non fra i soldi
// spendibili) e movimenti.ricorrente_data (la data di una spesa programmata
// una tantum).
const { registerUser, createApp, Conto, Movimento } = require('./setup');
const { Obiettivo } = require('../models');
const { calcolaLiquidita } = require('../services/liquidita.service');

describe('Colonne del saldo effettivo', () => {
  let userId;
  let conto;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('un conto nasce visibile: nascosto è false, mai null', async () => {
    expect(conto.nascosto).toBe(false);
  });

  it('un conto può essere nascosto e resta tale dopo il reload', async () => {
    await conto.update({ nascosto: true });
    const riletto = await Conto.findByPk(conto.id);
    expect(riletto.nascosto).toBe(true);
  });

  it('una spesa programmata salva frequenza una_tantum e la sua data', async () => {
    const spesa = await Movimento.create({
      user_id: userId,
      conto_id: conto.id,
      tipo: 'uscita',
      importo: 300,
      categoria: 'altro_uscita',
      descrizione: 'Concerto',
      data: '2026-09-25',
      ricorrente: true,
      ricorrente_frequenza: 'una_tantum',
      ricorrente_data: '2026-10-10',
    });
    const riletta = await Movimento.findByPk(spesa.id);
    expect(riletta.ricorrente_frequenza).toBe('una_tantum');
    expect(riletta.ricorrente_data).toBe('2026-10-10');
  });
});

describe('Saldo effettivo: conti nascosti', () => {
  let userId;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
    await Conto.create({
      user_id: userId, nome: 'Quotidiano', tipo: 'banca', saldo: 1000, attivo: true,
    });
    await Conto.create({
      user_id: userId, nome: 'Risparmi', tipo: 'risparmio', saldo: 5000, attivo: true, nascosto: true,
    });
  });

  it('il conto nascosto resta nel saldo conti ma esce dal saldo effettivo', async () => {
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_conti).toBe(6000);
    expect(r.saldo_conti_nascosti).toBe(5000);
    expect(r.saldo_effettivo).toBe(1000);
  });

  it('un obiettivo non completato abbassa il saldo effettivo', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 800, importo_attuale: 200, completato: false,
    });
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.saldo_effettivo).toBe(800);
  });

  it('i conti nascosti escono anche dal capitale allocabile di Piano Smart', async () => {
    const r = await calcolaLiquidita(userId, { data: '2026-09-25' });
    expect(r.liquidita_allocabile).toBe(1000);
    // liquidita_libera conserva il significato di prima: tutti i conti attivi.
    expect(r.liquidita_libera).toBe(6000);
  });
});
