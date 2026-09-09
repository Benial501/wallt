// Eliminazione per-utente delle categorie predefinite.
//
// Il punto delicato non è l'endpoint: è che una categoria eliminata non deve
// mai tornare da sola attraverso la cascata di categorizzazione, e che i
// movimenti già registrati devono restare leggibili. Entrambe le cose passano
// da `categorie.service.list()`, quindi i test verificano il comportamento
// osservabile ai due estremi (API e matcher), non l'implementazione in mezzo.
const {
  request,
  createApp,
  registerUser,
  authHeader,
  Conto,
  Movimento,
} = require('./setup');

const { list, assertCategory } = require('../services/categorie.service');
const { CategoriaDefaultNascosta } = require('../models');
const { CATEGORIE_SISTEMA_IDS } = require('../constants/categorie');
const CategoryMatcherService = require('../services/import/CategoryMatcherService');

const oggi = () => new Date().toISOString().split('T')[0];

describe('Categorie predefinite eliminabili', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  const elimina = (categorie, authToken = token) => request(app)
    .delete('/api/categorie/default')
    .set(authHeader(authToken))
    .send({ categorie });

  const ripristina = (categorie, authToken = token) => request(app)
    .post('/api/categorie/default/ripristina')
    .set(authHeader(authToken))
    .send({ categorie });

  const elenco = async (archiviate = false, authToken = token) => {
    const res = await request(app)
      .get(`/api/categorie${archiviate ? '?archiviate=true' : ''}`)
      .set(authHeader(authToken));
    return res.body.categorie;
  };

  describe('eliminazione', () => {
    it('toglie la categoria dall\'elenco attivo dell\'utente', async () => {
      expect((await elenco()).some(c => c.id === 'cibo_spesa')).toBe(true);

      const res = await elimina([{ id: 'cibo_spesa', tipo: 'uscita' }]);

      expect(res.status).toBe(200);
      expect((await elenco()).some(c => c.id === 'cibo_spesa')).toBe(false);
    });

    it('la conserva tra le archiviate, così lo storico resta leggibile', async () => {
      await elimina([{ id: 'cibo_spesa', tipo: 'uscita' }]);

      const archiviata = (await elenco(true)).find(c => c.id === 'cibo_spesa' && c.tipo === 'uscita');
      expect(archiviata).toMatchObject({ nome: 'Cibo e spesa', attiva: false });
    });

    it('elimina più categorie in una sola richiesta', async () => {
      const res = await elimina([
        { id: 'cibo_spesa', tipo: 'uscita' },
        { id: 'svago', tipo: 'uscita' },
        { id: 'entrata_extra', tipo: 'entrata' },
      ]);

      expect(res.status).toBe(200);
      expect(res.body.eliminate).toBe(3);
      const ids = (await elenco()).map(c => c.id);
      expect(ids).not.toContain('cibo_spesa');
      expect(ids).not.toContain('svago');
      expect(ids).not.toContain('entrata_extra');
    });

    it('è idempotente: rieliminare la stessa categoria non fallisce', async () => {
      await elimina([{ id: 'svago', tipo: 'uscita' }]);
      const res = await elimina([{ id: 'svago', tipo: 'uscita' }]);

      expect(res.status).toBe(200);
    });

    // `da_verificare` è oggi l'unico id presente su entrambi i versi, ed è
    // protetto: l'API non può arrivarci. La chiave resta però la coppia
    // (id, tipo), e questo test lo verifica scrivendo la riga direttamente.
    it('nasconde solo il verso indicato, non l\'id su entrambi i versi', async () => {
      await CategoriaDefaultNascosta.create({ user_id: userId, categoria_id: 'da_verificare', tipo: 'uscita' });

      const attive = await list(userId);

      expect(attive.some(c => c.id === 'da_verificare' && c.tipo === 'uscita')).toBe(false);
      expect(attive.some(c => c.id === 'da_verificare' && c.tipo === 'entrata')).toBe(true);
    });

    it('rifiuta un id che non esiste nel catalogo', async () => {
      const res = await elimina([{ id: 'categoria_inventata', tipo: 'uscita' }]);
      expect(res.status).toBe(404);
    });

    it('rifiuta un body senza categorie', async () => {
      const res = await elimina([]);
      expect(res.status).toBe(400);
    });
  });

  describe('nucleo protetto', () => {
    it.each(CATEGORIE_SISTEMA_IDS)('rifiuta di eliminare %s', async (id) => {
      const tipo = ['altro_entrata', 'rendimento_investimenti', 'prelievo_scommesse'].includes(id) ? 'entrata' : 'uscita';

      const res = await elimina([{ id, tipo }]);

      expect(res.status).toBe(409);
      expect((await elenco()).some(c => c.id === id)).toBe(true);
    });

    it('non elimina nulla se il batch contiene anche una sola categoria protetta', async () => {
      const res = await elimina([
        { id: 'svago', tipo: 'uscita' },
        { id: 'da_verificare', tipo: 'uscita' },
      ]);

      expect(res.status).toBe(409);
      expect((await elenco()).some(c => c.id === 'svago')).toBe(true);
    });
  });

  describe('effetti sui movimenti', () => {
    const creaConto = () => Conto.create({ user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true });

    it('rifiuta un nuovo movimento con una categoria eliminata', async () => {
      const conto = await creaConto();
      await elimina([{ id: 'cibo_spesa', tipo: 'uscita' }]);

      const res = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'uscita', importo: 10, categoria: 'cibo_spesa', data: oggi(),
      });

      expect(res.status).toBe(400);
    });

    it('conserva i movimenti già registrati e il loro saldo', async () => {
      const conto = await creaConto();
      const creato = await request(app).post('/api/movimenti').set(authHeader(token)).send({
        conto_id: conto.id, tipo: 'uscita', importo: 100, categoria: 'cibo_spesa', data: oggi(),
      });
      expect(creato.status).toBe(201);

      await elimina([{ id: 'cibo_spesa', tipo: 'uscita' }]);

      const movimento = await Movimento.findOne({ where: { user_id: userId } });
      expect(movimento.categoria).toBe('cibo_spesa');
      await conto.reload();
      expect(Number(conto.saldo)).toBe(900);
    });

    it('assertCategory rifiuta la eliminata ma la risolve ancora con allowArchived', async () => {
      await elimina([{ id: 'cibo_spesa', tipo: 'uscita' }]);

      await expect(assertCategory(userId, 'cibo_spesa', 'uscita')).rejects.toThrow();
      await expect(assertCategory(userId, 'cibo_spesa', 'uscita', { allowArchived: true }))
        .resolves.toMatchObject({ nome: 'Cibo e spesa' });
    });
  });

  describe('cascata di categorizzazione', () => {
    it('non riassegna in automatico una categoria eliminata', async () => {
      const matcher = new CategoryMatcherService();
      const transazione = { tipo: 'uscita', descrizione: 'PAGAMENTO POS ESSELUNGA MILANO' };

      const prima = await matcher.match({ userId, transaction: transazione });
      expect(prima.categoria).toBe('supermercato');

      await elimina([{ id: 'supermercato', tipo: 'uscita' }]);
      matcher.invalidateCache(userId);

      const dopo = await matcher.match({ userId, transaction: transazione });
      expect(dopo.categoria).toBe('da_verificare');
      expect(dopo.requiresReview).toBe(true);
    });
  });

  describe('isolamento tra utenti', () => {
    it('l\'eliminazione di un utente non tocca gli altri', async () => {
      const { res: resB } = await registerUser(app, { nome: 'Utente B' });
      const tokenB = resB.body.token;

      await elimina([{ id: 'cibo_spesa', tipo: 'uscita' }]);

      expect((await elenco(false, tokenB)).some(c => c.id === 'cibo_spesa')).toBe(true);
    });
  });

  describe('ripristino', () => {
    it('rimette in elenco una predefinita eliminata', async () => {
      await elimina([{ id: 'cibo_spesa', tipo: 'uscita' }]);

      const res = await ripristina([{ id: 'cibo_spesa', tipo: 'uscita' }]);

      expect(res.status).toBe(200);
      expect((await elenco()).some(c => c.id === 'cibo_spesa')).toBe(true);
    });

    it('riattiva una categoria personale archiviata', async () => {
      const creata = await request(app).post('/api/categorie').set(authHeader(token))
        .send({ nome: 'Spese Formula 1', tipo: 'uscita', icona: 'Car', colore: '#ff0000' });
      const { id } = creata.body.categoria;

      await request(app).delete(`/api/categorie/${id}`).set(authHeader(token));
      expect((await elenco()).some(c => c.id === id)).toBe(false);

      const res = await request(app).post(`/api/categorie/${id}/ripristina`).set(authHeader(token));

      expect(res.status).toBe(200);
      expect((await elenco()).some(c => c.id === id)).toBe(true);
    });

    it('non ripristina la categoria personale di un altro utente', async () => {
      const creata = await request(app).post('/api/categorie').set(authHeader(token))
        .send({ nome: 'Solo mia', tipo: 'uscita' });
      const { id } = creata.body.categoria;
      await request(app).delete(`/api/categorie/${id}`).set(authHeader(token));

      const { res: resB } = await registerUser(app, { nome: 'Utente B' });
      const res = await request(app).post(`/api/categorie/${id}/ripristina`).set(authHeader(resB.body.token));

      expect(res.status).toBe(404);
    });
  });

  describe('list()', () => {
    it('esclude le eliminate di default e le include con includeArchived', async () => {
      await elimina([{ id: 'svago', tipo: 'uscita' }]);

      const attive = await list(userId);
      const complete = await list(userId, { includeArchived: true });

      expect(attive.some(c => c.id === 'svago')).toBe(false);
      expect(complete.find(c => c.id === 'svago')).toMatchObject({ attiva: false });
    });
  });
});
