// Stato del mese del budget a tre voci, dal database: quali movimenti contano
// in quale voce, la frase del consulente e i casi che la spec chiede di
// sorvegliare (categoria archiviata con spese, entrata azzerata).
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { ProfiloUtente, CategoriaPersonale, CategoriaDefaultNascosta } = require('../models');
const { calcolaStatoBudget } = require('../services/budgetStato.service');

const OGGI = '2026-11-23';

describe('calcolaStatoBudget', () => {
  let app;
  let token;
  let userId;
  let banca;
  let fondo;
  let risparmio;

  const impostaPiano = (valori = {}) => ProfiloUtente.update({
    entrata_mensile: 2000,
    budget_modello: 'equilibrato',
    budget_pct_bisogni: 50,
    budget_pct_desideri: 30,
    budget_pct_futuro: 20,
    ...valori,
  }, { where: { user_id: userId } });

  const uscita = (categoria, importo, data = '2026-11-10', extra = {}) => Movimento.create({
    user_id: userId, conto_id: banca.id, tipo: 'uscita', importo, categoria, descrizione: categoria, data, ricorrente: false, ...extra,
  });

  const trasferimento = (da, a, importo, categoria = 'trasferimento', data = '2026-11-12') => Movimento.create({
    user_id: userId, conto_id: da.id, conto_destinazione_id: a.id, tipo: 'trasferimento', importo, categoria, descrizione: 'Trasferimento', data, ricorrente: false,
  });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    banca = await Conto.create({ user_id: userId, nome: 'Banca', tipo: 'banca', saldo: 5000, attivo: true });
    fondo = await Conto.create({ user_id: userId, nome: 'Fondo', tipo: 'emergenza', nascosto: true, saldo: 0, attivo: true });
    risparmio = await Conto.create({ user_id: userId, nome: 'Risparmio', tipo: 'risparmio', saldo: 0, attivo: true });
  });

  it('senza piano restituisce null', async () => {
    expect(await calcolaStatoBudget({ userId, oggi: OGGI })).toBeNull();
  });

  it('la bozza approvata: Bisogni 780, Desideri 640 oltre, Futuro 150', async () => {
    await impostaPiano();
    await uscita('affitto', 550);
    await uscita('supermercato', 160);
    await uscita('elettricita', 42);
    await uscita('internet', 28);
    await uscita('ristoranti', 300);
    await uscita('delivery', 180);
    await uscita('shopping_online', 160);
    await trasferimento(banca, fondo, 150);
    // Fuori dal mese: non conta.
    await uscita('ristoranti', 999, '2026-10-31');

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });

    expect(stato.modello).toBe('equilibrato');
    expect(stato.percentuali).toEqual({ bisogni: 50, desideri: 30, futuro: 20 });
    expect(stato.entrata).toBe(2000);
    expect(stato.mese).toBe('2026-11');
    expect(stato.giorni_rimanenti).toBe(7);
    expect(stato.voci.bisogni).toMatchObject({ obiettivo: 1000, usato: 780, restante: 220, percentuale_usata: 78 });
    expect(stato.voci.desideri).toMatchObject({ obiettivo: 600, usato: 640, restante: -40, percentuale_usata: 107 });
    expect(stato.voci.futuro).toMatchObject({ obiettivo: 400, usato: 150, restante: 250, percentuale_usata: 38 });
    expect(stato.voci.bisogni.categorie[0]).toEqual({
      categoria: 'affitto', importo: 550, spostabile: true, predefinita: true, essenzialita_catalogo: 'essenziale',
    });
    expect(stato.voci.desideri.categorie.map((c) => c.categoria)).toEqual(['ristoranti', 'delivery', 'shopping_online']);
    expect(stato.voci.bisogni.categorie_senza_spese).toContain('farmacia');
    expect(stato.voci.bisogni.categorie_senza_spese).not.toContain('affitto');
    expect(stato.voci.futuro.movimenti).toHaveLength(1);
    expect(stato.voci.futuro.movimenti[0]).toMatchObject({ importo: 150, conto_id: fondo.id });
    expect(stato.consiglio).toEqual({ codice: 'desideri_oltre', dati: { eccedenza: 40, categorie: ['ristoranti', 'delivery'] } });
  });

  it('l’origine di una ricorrenza non conta', async () => {
    await impostaPiano();
    await uscita('bollette', 50, '2026-11-05', { ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 5 });

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.voci.bisogni.usato).toBe(0);
  });

  it('un prelievo dal risparmio riduce il Futuro', async () => {
    await impostaPiano();
    await trasferimento(banca, risparmio, 200);
    await trasferimento(risparmio, banca, 50, 'trasferimento', '2026-11-15');

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.voci.futuro.usato).toBe(150);
    expect(stato.voci.futuro.movimenti.map((m) => m.importo)).toEqual([200, -50]);
  });

  it('un versamento in investimenti conta nel Futuro, non nei Desideri', async () => {
    await impostaPiano();
    await uscita('investimento', 100);

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.voci.futuro.usato).toBe(100);
    expect(stato.voci.desideri.usato).toBe(0);
  });

  it('il deposito scommesse conta nei Desideri e non è spostabile', async () => {
    await impostaPiano();
    const gioco = await Conto.create({ user_id: userId, nome: 'Gioco', tipo: 'scommesse', saldo: 0, attivo: true });
    await trasferimento(banca, gioco, 50, 'deposito_scommesse');

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.voci.desideri.usato).toBe(50);
    expect(stato.voci.desideri.categorie[0]).toMatchObject({ categoria: 'deposito_scommesse', spostabile: false });
  });

  it('una categoria personale archiviata con spese resta nella sua voce', async () => {
    await impostaPiano();
    const creata = await request(app).post('/api/categorie').set(authHeader(token))
      .send({ nome: 'Asilo nido', tipo: 'uscita', essenzialita: 'essenziale' });
    expect(creata.status).toBe(201);
    const id = creata.body.categoria.id;
    await uscita(id, 30);
    await CategoriaPersonale.update({ attiva: false }, { where: { id } });

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.voci.bisogni.categorie).toContainEqual({
      categoria: id, importo: 30, spostabile: false, predefinita: false, essenzialita_catalogo: null,
    });
    expect(stato.voci.bisogni.categorie_senza_spese).not.toContain(id);
    expect(stato.voci.desideri.usato).toBe(0);
  });

  it('una predefinita nascosta dall’utente non compare fra quelle senza spese', async () => {
    await impostaPiano();
    await CategoriaDefaultNascosta.create({ user_id: userId, categoria_id: 'farmacia', tipo: 'uscita' });

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.voci.bisogni.categorie_senza_spese).not.toContain('farmacia');
    expect(stato.voci.bisogni.categorie_senza_spese).toContain('medico');
  });

  it('le categorie a voce fissa non compaiono fra quelle senza spese', async () => {
    await impostaPiano();
    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.voci.desideri.categorie_senza_spese).not.toContain('investimento');
    expect(stato.voci.bisogni.categorie_senza_spese).not.toContain('investimento');
  });

  it('Bisogni oltre per tre mesi completi suggerisce il cambio modello', async () => {
    await impostaPiano();
    for (const mese of ['2026-08', '2026-09', '2026-10', '2026-11']) {
      await uscita('affitto', 1200, `${mese}-01`);
    }

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.consiglio).toEqual({ codice: 'bisogni_oltre', dati: { eccedenza: 200, suggerisci_modello: 'spese_fisse_alte' } });
  });

  it('con due soli mesi completi non suggerisce', async () => {
    await impostaPiano();
    for (const mese of ['2026-09', '2026-10', '2026-11']) {
      await uscita('affitto', 1200, `${mese}-01`);
    }

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.consiglio.codice).toBe('bisogni_oltre');
    expect(stato.consiglio.dati.suggerisci_modello).toBeNull();
  });

  it('un mese su tre sotto l’obiettivo non suggerisce', async () => {
    await impostaPiano();
    for (const [mese, importo] of [['2026-08', 1200], ['2026-09', 800], ['2026-10', 1200], ['2026-11', 1200]]) {
      await uscita('affitto', importo, `${mese}-01`);
    }

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.consiglio.dati.suggerisci_modello).toBeNull();
  });

  it('entrata azzerata → entrata_mancante e obiettivi a 0', async () => {
    await impostaPiano({ entrata_mensile: null });
    await uscita('ristoranti', 80);

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.consiglio).toEqual({ codice: 'entrata_mancante', dati: {} });
    expect(stato.entrata).toBeNull();
    expect(stato.voci.desideri).toMatchObject({ obiettivo: 0, usato: 80, percentuale_usata: 0 });
  });

  it('i movimenti di un altro utente non contano', async () => {
    await impostaPiano();
    const altro = (await registerUser(app)).res.body.user.id;
    const contoAltro = await Conto.create({ user_id: altro, nome: 'Altro', tipo: 'banca', saldo: 0, attivo: true });
    await Movimento.create({
      user_id: altro, conto_id: contoAltro.id, tipo: 'uscita', importo: 500, categoria: 'ristoranti', descrizione: 'x', data: '2026-11-10', ricorrente: false,
    });

    const stato = await calcolaStatoBudget({ userId, oggi: OGGI });
    expect(stato.voci.desideri.usato).toBe(0);
  });
});
