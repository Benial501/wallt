// La migrazione di riconciliazione dei conti di gioco. Verifica sui dati veri
// (PostgreSQL di test), non su un queryInterface finto: quello che conta qui è
// che le condizioni SQL selezionino le righe giuste.
const { registerUser, createApp, sequelize, Conto, Movimento } = require('./setup');
const { PiattaformaScommesse } = require('../models');

const migration = require('../migrations/20260914000021-riallinea-conti-di-gioco');

describe('Migrazione — riallinea i conti di gioco alla piattaforma', () => {
  let userId;
  const queryInterface = { sequelize };

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;
  });

  const creaCoppia = async (saldoConto, saldoPiattaforma, nome = 'Piattaforma X') => {
    const conto = await Conto.create({
      user_id: userId, nome, tipo: 'scommesse', saldo: saldoConto, attivo: true,
    });
    const piattaforma = await PiattaformaScommesse.create({
      user_id: userId, nome, saldo: saldoPiattaforma, conto_id: conto.id, attiva: true,
    });
    return { conto, piattaforma };
  };

  it('riallinea il conto divergente al saldo della piattaforma', async () => {
    // Il caso di produzione: piattaforma coerente col proprio ledger, conto
    // rimasto indietro per un movimento eliminato.
    const { conto, piattaforma } = await creaCoppia(-11, 0, 'Snai');

    await migration.up(queryInterface);

    await conto.reload();
    await piattaforma.reload();
    expect(Number(conto.saldo)).toBe(0);
    expect(Number(piattaforma.saldo)).toBe(0);
  });

  it('non tocca le coppie già allineate', async () => {
    const { conto } = await creaCoppia(250, 250);

    await migration.up(queryInterface);

    await conto.reload();
    expect(Number(conto.saldo)).toBe(250);
  });

  it('lascia intatto il conto che ha trasferimenti dalla schermata Conti', async () => {
    // Qui il ledger scommesse non è completo: nessuno dei due lati è
    // dimostrabilmente corretto, quindi la migrazione si ferma.
    const { conto, piattaforma } = await creaCoppia(80, 100);
    const altro = await Conto.create({
      user_id: userId, nome: 'Conto banca', tipo: 'banca', saldo: 500, attivo: true,
    });
    await Movimento.create({
      user_id: userId,
      conto_id: altro.id,
      conto_destinazione_id: conto.id,
      tipo: 'trasferimento',
      categoria: 'trasferimento',
      importo: 20,
      data: new Date().toISOString().split('T')[0],
      descrizione: 'Trasferimento',
      ricorrente: false,
    });

    await migration.up(queryInterface);

    await conto.reload();
    await piattaforma.reload();
    expect(Number(conto.saldo)).toBe(80);
    expect(Number(piattaforma.saldo)).toBe(100);
  });

  it('un deposito fatto dalla schermata Scommesse non blocca il riallineamento', async () => {
    // I depositi/prelievi di gioco sono già rappresentati nella piattaforma:
    // non rendono ambigua la riga.
    const { conto } = await creaCoppia(-11, 0);
    const altro = await Conto.create({
      user_id: userId, nome: 'Conto banca', tipo: 'banca', saldo: 500, attivo: true,
    });
    await Movimento.create({
      user_id: userId,
      conto_id: altro.id,
      conto_destinazione_id: conto.id,
      tipo: 'trasferimento',
      categoria: 'deposito_scommesse',
      importo: 11,
      data: new Date().toISOString().split('T')[0],
      descrizione: 'Deposito',
      ricorrente: false,
    });

    await migration.up(queryInterface);

    await conto.reload();
    expect(Number(conto.saldo)).toBe(0);
  });

  it('è idempotente: la seconda esecuzione non cambia più nulla', async () => {
    const { conto } = await creaCoppia(-11, 0);

    await migration.up(queryInterface);
    await conto.reload();
    const dopoPrima = Number(conto.saldo);

    await migration.up(queryInterface);
    await conto.reload();
    expect(Number(conto.saldo)).toBe(dopoPrima);
    expect(dopoPrima).toBe(0);
  });

  it('non tocca le piattaforme disattivate', async () => {
    const { conto, piattaforma } = await creaCoppia(-11, 0);
    await piattaforma.update({ attiva: false });

    await migration.up(queryInterface);

    await conto.reload();
    expect(Number(conto.saldo)).toBe(-11);
  });
});
