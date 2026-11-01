// Il testo libero si salva com'è, tranne `<` e `>`: «APPLE.COM/BILL» e «dell'angolo»
// devono tornare uguali, e nessun tag deve poter entrare nel database.
const {
  request, createApp, registerUser, authHeader, sequelize, Conto, Movimento,
} = require('./setup');
const {
  Abbonamento, CategorieRegola, Investimento, RegolaPersonaleMerchant, User,
} = require('../models');
const validazione = require('../middleware/validation.middleware');
const { giornoLocale, FUSO_DEFAULT } = require('../services/notifiche/notificheTime');
const DuplicateChecker = require('../services/import/DuplicateChecker');
const migrazione = require('../migrations/20261101000054-decodifica-testi-salvati');

const oggi = () => giornoLocale(new Date(), FUSO_DEFAULT);

const TESTO = 'APPLE.COM/BILL dell\'angolo "H&M" \\ `x`';

const sanifica = async (schema, body) => {
  const req = {
    body, params: {}, query: {}, headers: {}, cookies: {},
  };
  for (const anello of schema) {
    if (typeof anello.run === 'function') await anello.run(req);
  }
  return req.body;
};

describe('Testo libero: cosa si salva', () => {
  const CAMPI = [
    ['validateMovimento', 'descrizione'],
    ['validateUpdateMovimento', 'descrizione'],
    ['validateUpdateProfilo', 'nome'],
    ['validateContributo', 'nota'],
    ['validateInvestimento', 'note'],
    ['validateInvestimento', 'condizioni_disponibilita'],
    ['validateUpdateInvestimento', 'note'],
    ['validateUpdateInvestimento', 'condizioni_disponibilita'],
    ['validateMovimentoInvestimento', 'nota'],
    ['validateMovimentoScommesse', 'nota'],
  ];

  it.each(CAMPI)('%s.%s conserva la punteggiatura', async (schema, campo) => {
    const body = await sanifica(validazione[schema], { [campo]: TESTO });
    expect(body[campo]).toBe(TESTO);
  });

  it.each(CAMPI)('%s.%s non lascia entrare un tag', async (schema, campo) => {
    const body = await sanifica(validazione[schema], { [campo]: '<img src=x>' });
    expect(body[campo]).toBe('&lt;img src=x&gt;');
  });

  it('vale anche per le righe di un import', async () => {
    const body = await sanifica(validazione.validateImportConferma, {
      transactions: [{ descrizione: TESTO }, { descrizione: '<b>' }],
    });
    expect(body.transactions[0].descrizione).toBe(TESTO);
    expect(body.transactions[1].descrizione).toBe('&lt;b&gt;');
  });
});

describe('Testo libero: dall\'API agli abbonamenti', () => {
  let app;
  let token;
  let conto;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    conto = await Conto.create({
      user_id: res.body.user.id, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  const crea = (descrizione) => request(app).post('/api/movimenti').set(authHeader(token)).send({
    tipo: 'uscita', importo: '9.99', categoria: 'abbonamenti', conto_id: conto.id, data: oggi(), descrizione,
  });

  it.each([[123], [['<b>']], [{ testo: '<b>' }]])('una descrizione %j risponde 400, non 500', async (descrizione) => {
    expect((await crea(descrizione)).status).toBe(400);
  });

  it('modificare un movimento più volte non codifica di nuovo la descrizione', async () => {
    const creato = await crea('APPLE.COM/BILL');
    expect(creato.status).toBe(201);
    expect(creato.body.movimento.descrizione).toBe('APPLE.COM/BILL');

    const id = creato.body.movimento.id;
    for (let giro = 0; giro < 2; giro += 1) {
      const { descrizione } = await Movimento.findByPk(id);
      const modificato = await request(app).put(`/api/movimenti/${id}`).set(authHeader(token))
        .send({ descrizione });
      expect(modificato.status).toBe(200);
    }
    expect((await Movimento.findByPk(id)).descrizione).toBe('APPLE.COM/BILL');
  });

  it('l\'abbonamento rilevato ha un nome leggibile', async () => {
    await crea('APPLE.COM/BILL');
    await crea('Palestra dell\'Arte');

    const { body } = await request(app).get('/api/abbonamenti').set(authHeader(token));
    const nomi = body.attivi.map((riga) => riga.nome).sort();
    expect(nomi).toEqual(['Apple Com Bill', 'Palestra Dell\'arte']);
  });
});

describe('Migrazione: riporta in chiaro i testi già salvati', () => {
  let app;
  let token;
  let userId;
  let conto;
  const queryInterface = { sequelize };

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  const movimento = (descrizione, altro = {}) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo: '9.99',
    categoria: 'abbonamenti',
    descrizione,
    data: oggi(),
    ricorrente: false,
    ...altro,
  });

  const abbonamento = (altro) => Abbonamento.create({
    user_id: userId,
    costo: '9.99',
    periodo_mesi: 1,
    origine: 'rilevato',
    stato: 'attivo',
    data_inizio: oggi(),
    ...altro,
  });

  it.each([
    ['APPLE.COM&#x2F;BILL', 'APPLE.COM/BILL'],
    ['Bar dell&#x27;angolo', 'Bar dell\'angolo'],
    ['H&amp;M', 'H&M'],
    ['&quot;Bar&quot;', '"Bar"'],
    ['Cane &#x5C; gatto', 'Cane \\ gatto'],
    ['back&#96;tick', 'back`tick'],
    ['Bar dell&amp;#x27;angolo', 'Bar dell\'angolo'],
    ['Bar dell&amp;amp;#x27;angolo', 'Bar dell\'angolo'],
    ['H&M già in chiaro', 'H&M già in chiaro'],
  ])('la descrizione %s diventa %s', async (salvata, attesa) => {
    const riga = await movimento(salvata);
    await migrazione.up(queryInterface);
    expect((await riga.reload()).descrizione).toBe(attesa);
  });

  it('un tag neutralizzato resta neutralizzato, anche se codificato due volte', async () => {
    const una = await movimento('&lt;script&gt;');
    const due = await movimento('&amp;lt;script&amp;gt;');
    await migrazione.up(queryInterface);
    expect((await una.reload()).descrizione).toBe('&lt;script&gt;');
    expect((await due.reload()).descrizione).toBe('&lt;script&gt;');
  });

  it('non tocca importo, saldo né data di aggiornamento del movimento', async () => {
    const riga = await movimento('H&amp;M');
    const prima = (await riga.reload()).updatedAt;
    const saldo = (await conto.reload()).saldo;
    await migrazione.up(queryInterface);
    await riga.reload();
    expect(riga.importo).toBe('9.99');
    expect(riga.updatedAt).toEqual(prima);
    expect((await conto.reload()).saldo).toBe(saldo);
  });

  it('ripara anche il nome dell\'utente e le note degli investimenti', async () => {
    await User.update({ nome: 'Anna D&#x27;Angelo' }, { where: { id: userId } });
    const investimento = await Investimento.create({
      user_id: userId,
      nome_piattaforma: 'Broker',
      tipo: 'etf',
      liquidabilita: 'sconosciuto',
      note: 'Piano dell&#x27;anno',
      condizioni_disponibilita: 'T&#x2F;2',
    });

    await migrazione.up(queryInterface);

    expect((await User.findByPk(userId)).nome).toBe('Anna D\'Angelo');
    await investimento.reload();
    expect(investimento.note).toBe('Piano dell\'anno');
    expect(investimento.condizioni_disponibilita).toBe('T/2');
  });

  it('un secondo passaggio non cambia nulla', async () => {
    const riga = await movimento('&lt;b&gt; H&amp;M');
    await migrazione.up(queryInterface);
    await migrazione.up(queryInterface);
    expect((await riga.reload()).descrizione).toBe('&lt;b&gt; H&M');
  });

  it('un import ripetuto riconosce il movimento riparato come doppione', async () => {
    await movimento('APPLE.COM&#x2F;BILL');
    await migrazione.up(queryInterface);
    const [esito] = await new DuplicateChecker().check(userId, [{
      data: oggi(), importo: '9.99', descrizione: 'APPLE.COM/BILL', conto_id: conto.id,
    }]);
    expect(esito.isDuplicate).toBe(true);
  });

  describe('abbonamenti rilevati da un testo codificato', () => {
    const riparati = () => Abbonamento.findAll({ where: { user_id: userId }, order: [['id', 'ASC']] });

    it.each([
      ['apple com& x2f;bill', 'Apple Com& X2f;bill', 'apple com bill', 'Apple Com Bill'],
      ['apple com&amp; x2f;bill', 'Apple Com&amp; X2f;bill', 'apple com bill', 'Apple Com Bill'],
      ['bar dell& x27;angolo', 'Bar Dell& X27;angolo', 'bar dell\'angolo', 'Bar Dell\'angolo'],
      ['h&amp;m club', 'H&amp;m Club', 'h&m club', 'H&m Club'],
      ['&quot;bar&quot;', '&quot;bar&quot;', '"bar"', '"bar"'],
      ['back& ;tick', 'Back& ;tick', 'backtick', 'Backtick'],
    ])('%s diventa %s', async (chiave, nome, chiaveAttesa, nomeAtteso) => {
      await abbonamento({ chiave, nome });
      await migrazione.up(queryInterface);
      const [riga] = await riparati();
      expect(riga.chiave).toBe(chiaveAttesa);
      expect(riga.nome).toBe(nomeAtteso);
    });

    it('dopo la riparazione lo stesso addebito non crea una seconda riga', async () => {
      await movimento('APPLE.COM&#x2F;BILL');
      await abbonamento({ chiave: 'apple com& x2f;bill', nome: 'Apple Com& X2f;bill' });
      await migrazione.up(queryInterface);

      const { body } = await request(app).get('/api/abbonamenti').set(authHeader(token));
      expect(body.attivi.map((riga) => riga.nome)).toEqual(['Apple Com Bill']);
    });

    it('«Non è un abbonamento» continua a valere sullo stesso servizio', async () => {
      await movimento('Palestra dell&#x27;Arte');
      await abbonamento({ chiave: 'palestra dell& x27;arte', nome: 'Palestra Dell& X27;arte', stato: 'escluso' });
      await migrazione.up(queryInterface);

      const { body } = await request(app).get('/api/abbonamenti').set(authHeader(token));
      expect(body.attivi).toEqual([]);
    });

    it('non tocca un nome scritto dall\'utente né la data della sua modifica', async () => {
      const toccato = new Date('2026-10-01T10:00:00Z');
      await abbonamento({
        chiave: 'apple com& x2f;bill', nome: 'Il mio iCloud', modificato_utente_il: toccato,
      });
      await migrazione.up(queryInterface);
      const [riga] = await riparati();
      expect(riga.nome).toBe('Il mio iCloud');
      expect(riga.chiave).toBe('apple com bill');
      expect(riga.modificato_utente_il).toEqual(toccato);
    });

    it('un nome scritto a mano con caratteri codificati torna in chiaro', async () => {
      await abbonamento({ chiave: 'mio servizio', nome: 'Bar dell&#x27;angolo', origine: 'manuale' });
      await migrazione.up(queryInterface);
      const [riga] = await riparati();
      expect(riga.nome).toBe('Bar dell\'angolo');
      expect(riga.chiave).toBe('mio servizio');
    });

    it('se la chiave pulita esiste già, le due righe convivono invece di far fallire la migrazione', async () => {
      await abbonamento({ chiave: 'apple com bill', nome: 'Apple Com Bill' });
      await abbonamento({ chiave: 'apple com& x2f;bill', nome: 'Apple Com& X2f;bill' });
      await abbonamento({ chiave: 'apple com&amp; x2f;bill', nome: 'Apple Com&amp; X2f;bill' });
      await migrazione.up(queryInterface);
      const righe = await riparati();
      expect(righe.map((riga) => riga.chiave)).toEqual(['apple com bill', 'apple com bill', 'apple com bill']);
      expect(righe.map((riga) => riga.ordine)).toEqual([0, 1, 2]);
    });
  });

  describe('regole imparate da un testo codificato', () => {
    const regola = (pattern, tipo = 'uscita') => CategorieRegola.create({
      user_id: userId, pattern, categoria: 'abbonamenti', tipo, priorita: 100, attiva: true,
    });

    it.each([
      ['apple com x2f bill', 'apple com bill'],
      ['bar dell x27 angolo', 'bar dell angolo'],
      ['quot bar quot srl', 'bar srl'],
      ['h amp m store', 'h m store'],
    ])('%s diventa %s', async (pattern, atteso) => {
      const categoria = await regola(pattern);
      const merchant = await RegolaPersonaleMerchant.create({
        user_id: userId, pattern, categoria: 'abbonamenti', attiva: true,
      });
      await migrazione.up(queryInterface);
      expect((await categoria.reload()).pattern).toBe(atteso);
      expect((await merchant.reload()).pattern).toBe(atteso);
    });

    it('«amp» all\'inizio o alla fine è una parola vera, non un resto di codifica', async () => {
      const inizio = await regola('amp energia');
      const fine = await regola('energia amp');
      await migrazione.up(queryInterface);
      expect((await inizio.reload()).pattern).toBe('amp energia');
      expect((await fine.reload()).pattern).toBe('energia amp');
    });

    it('se la regola pulita esiste già, l\'altra resta com\'è', async () => {
      await regola('apple com bill');
      const sporca = await regola('apple com x2f bill');
      await migrazione.up(queryInterface);
      expect((await sporca.reload()).pattern).toBe('apple com x2f bill');
    });

    it('una regola che resterebbe vuota non viene toccata', async () => {
      const sporca = await regola('x2f x27');
      await migrazione.up(queryInterface);
      expect((await sporca.reload()).pattern).toBe('x2f x27');
    });

    it('non tocca le regole globali', async () => {
      const globale = await CategorieRegola.create({
        user_id: null, pattern: 'zz x2f globale', categoria: 'abbonamenti', tipo: 'uscita', priorita: 100, attiva: true,
      });
      await migrazione.up(queryInterface);
      await globale.reload();
      expect(globale.pattern).toBe('zz x2f globale');
      await globale.destroy();
    });
  });
});
