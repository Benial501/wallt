// Schema e semantica di base delle due colonne introdotte dal saldo effettivo:
// conti.nascosto (un conto che resta nel patrimonio ma non fra i soldi
// spendibili) e movimenti.ricorrente_data (la data di una spesa programmata
// una tantum).
const { registerUser, createApp, Conto, Movimento } = require('./setup');

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
