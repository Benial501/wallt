// Depositi e prelievi scommesse sono spostamenti di denaro fra due conti
// dell'utente: non sono spese né entrate e non devono comparire nelle analisi.
// Restano però conteggiati nel budget "scommesse", che per definizione limita
// quanto si mette in gioco ogni mese.
const {
  request, registerUser, createApp, authHeader, Conto, Movimento, User,
} = require('./setup');
const { ProfiloUtente } = require('../models');

describe('Depositi e prelievi scommesse come trasferimenti', () => {
  let app;
  let token;
  let userId;
  let contoBanca;
  let piattaformaId;
  let contoScommesseId;

  const oggi = new Date();
  const anno = oggi.getFullYear();
  const mese = oggi.getMonth() + 1;
  const dataOggi = `${anno}-${String(mese).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;

    await ProfiloUtente.upsert({
      user_id: userId, fascia_eta: '25_34', fa_scommesse: 'si', onboarding_completato: true,
    });
    await User.update({ mostra_scommesse: true }, { where: { id: userId } });

    contoBanca = await Conto.create({
      user_id: userId, nome: 'Conto banca', tipo: 'banca', saldo: 1000, attivo: true,
    });

    const creata = await request(app)
      .post('/api/scommesse/piattaforme')
      .set(authHeader(token))
      .send({ nome: 'Piattaforma test', saldo_iniziale: 0 });
    piattaformaId = creata.body.piattaforma.id;
    contoScommesseId = creata.body.conto_id;
  });

  const movimento = (tipo, importo, extra = {}) => request(app)
    .post('/api/scommesse/movimenti')
    .set(authHeader(token))
    .send({
      piattaforma_id: piattaformaId, tipo, importo, data: dataOggi, ...extra,
    });

  test('il deposito genera un trasferimento fra conto banca e conto di gioco', async () => {
    await movimento('deposito', 50, { conto_collegato_id: contoBanca.id });

    const movimenti = await Movimento.findAll({ where: { user_id: userId } });
    expect(movimenti).toHaveLength(1);
    expect(movimenti[0].tipo).toBe('trasferimento');
    expect(movimenti[0].categoria).toBe('deposito_scommesse');
    expect(movimenti[0].conto_id).toBe(contoBanca.id);
    expect(movimenti[0].conto_destinazione_id).toBe(contoScommesseId);
  });

  test('il prelievo genera un trasferimento nella direzione opposta', async () => {
    await movimento('deposito', 50, { conto_collegato_id: contoBanca.id });
    await movimento('prelievo', 20, { conto_collegato_id: contoBanca.id });

    const prelievo = await Movimento.findOne({
      where: { user_id: userId, categoria: 'prelievo_scommesse' },
    });
    expect(prelievo.tipo).toBe('trasferimento');
    expect(prelievo.conto_id).toBe(contoScommesseId);
    expect(prelievo.conto_destinazione_id).toBe(contoBanca.id);
  });

  test('i saldi restano corretti: nessun doppio addebito', async () => {
    await movimento('deposito', 50, { conto_collegato_id: contoBanca.id });

    await contoBanca.reload();
    expect(parseFloat(contoBanca.saldo)).toBe(950);

    const contoGioco = await Conto.findByPk(contoScommesseId);
    expect(parseFloat(contoGioco.saldo)).toBe(50);
  });

  test('il deposito non compare fra le spese analizzate', async () => {
    await movimento('deposito', 50, { conto_collegato_id: contoBanca.id });

    const spese = await request(app)
      .get('/api/analisi/distribuzione-spese')
      .set(authHeader(token));

    expect(spese.status).toBe(200);
    expect(spese.body.totale).toBe(0);
    expect(spese.body.distribuzione.map((c) => c.categoria)).not.toContain('deposito_scommesse');
  });

  test('il prelievo non compare fra le entrate analizzate', async () => {
    await movimento('deposito', 50, { conto_collegato_id: contoBanca.id });
    await movimento('prelievo', 50, { conto_collegato_id: contoBanca.id });

    const entrate = await request(app)
      .get('/api/analisi/distribuzione-entrate')
      .set(authHeader(token));

    expect(entrate.body.totale).toBe(0);
    expect(entrate.body.distribuzione.map((c) => c.categoria)).not.toContain('prelievo_scommesse');
  });

  test('il budget "scommesse" continua a contare i depositi del mese', async () => {
    const creato = await request(app)
      .post('/api/budget')
      .set(authHeader(token))
      .send({
        mese,
        anno,
        importo_totale: '500.00',
        categorie: [{ categoria: 'scommesse', importo: '100.00', percentuale: '20.00' }],
      });
    expect(creato.status).toBe(201);

    await movimento('deposito', 50, { conto_collegato_id: contoBanca.id });

    const stato = await request(app)
      .get(`/api/budget/${anno}/${mese}/stato`)
      .set(authHeader(token));

    expect(stato.status).toBe(200);
    const scommesse = stato.body.stato.find((s) => s.categoria === 'scommesse');
    expect(scommesse.speso).toBe(50);
    expect(scommesse.percentuale_usata).toBe(50);
  });

  test('una spesa normale resta una spesa', async () => {
    await request(app)
      .post('/api/movimenti')
      .set(authHeader(token))
      .send({
        conto_id: contoBanca.id,
        tipo: 'uscita',
        importo: 30,
        categoria: 'cibo_spesa',
        descrizione: 'Spesa',
        data: dataOggi,
      });

    const spese = await request(app)
      .get('/api/analisi/distribuzione-spese')
      .set(authHeader(token));

    expect(spese.body.totale).toBe(30);
  });
});

// La correzione vale anche per i dati già registrati: la migrazione converte
// i vecchi depositi/prelievi da uscite ed entrate a trasferimenti.
describe('Migrazione dei movimenti scommesse già registrati', () => {
  const migrazione = require('../migrations/20260914000020-scommesse-movimenti-come-trasferimenti');
  const { sequelize, PiattaformaScommesse } = require('../models');
  const queryInterface = { sequelize };

  let app;
  let userId;
  let contoBanca;
  let contoGioco;
  let piattaforma;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;

    contoBanca = await Conto.create({
      user_id: userId, nome: 'Conto banca', tipo: 'banca', saldo: 1000, attivo: true,
    });
    contoGioco = await Conto.create({
      user_id: userId, nome: 'Bookmaker', tipo: 'scommesse', saldo: 0, attivo: true,
    });
    piattaforma = await PiattaformaScommesse.create({
      user_id: userId, nome: 'Bookmaker', saldo: 0, conto_id: contoGioco.id, attiva: true,
    });
  });

  test('un vecchio deposito diventa un trasferimento verso il conto di gioco', async () => {
    const vecchio = await Movimento.create({
      user_id: userId,
      conto_id: contoBanca.id,
      tipo: 'uscita',
      importo: 11,
      categoria: 'deposito_scommesse',
      descrizione: `Deposito ${piattaforma.nome}`,
      data: '2026-02-01',
      ricorrente: false,
    });

    await migrazione.up(queryInterface);
    await vecchio.reload();

    expect(vecchio.tipo).toBe('trasferimento');
    expect(vecchio.conto_id).toBe(contoBanca.id);
    expect(vecchio.conto_destinazione_id).toBe(contoGioco.id);
  });

  test('un vecchio prelievo diventa un trasferimento dal conto di gioco', async () => {
    const vecchio = await Movimento.create({
      user_id: userId,
      conto_id: contoBanca.id,
      tipo: 'entrata',
      importo: 40,
      categoria: 'prelievo_scommesse',
      descrizione: `Prelievo ${piattaforma.nome}`,
      data: '2026-02-02',
      ricorrente: false,
    });

    await migrazione.up(queryInterface);
    await vecchio.reload();

    expect(vecchio.tipo).toBe('trasferimento');
    expect(vecchio.conto_id).toBe(contoGioco.id);
    expect(vecchio.conto_destinazione_id).toBe(contoBanca.id);
  });

  test('un deposito di piattaforma ormai sconosciuta resta comunque fuori dalle analisi', async () => {
    const vecchio = await Movimento.create({
      user_id: userId,
      conto_id: contoBanca.id,
      tipo: 'uscita',
      importo: 25,
      categoria: 'deposito_scommesse',
      descrizione: 'Deposito piattaforma chiusa',
      data: '2026-02-03',
      ricorrente: false,
    });

    await migrazione.up(queryInterface);
    await vecchio.reload();

    expect(vecchio.tipo).toBe('trasferimento');
    expect(vecchio.conto_destinazione_id).toBeNull();
  });

  test('le spese normali non vengono toccate', async () => {
    const spesa = await Movimento.create({
      user_id: userId,
      conto_id: contoBanca.id,
      tipo: 'uscita',
      importo: 30,
      categoria: 'cibo_spesa',
      descrizione: 'Spesa',
      data: '2026-02-04',
      ricorrente: false,
    });

    await migrazione.up(queryInterface);
    await spesa.reload();

    expect(spesa.tipo).toBe('uscita');
    expect(spesa.conto_destinazione_id).toBeNull();
  });
});
