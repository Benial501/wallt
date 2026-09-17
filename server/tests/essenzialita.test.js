// Classificazione strutturata dell'essenzialità delle spese: essenziale,
// semi_essenziale, discrezionale. Sostituisce l'euristica hardcoded
// "svago + acquisti_vari + abbigliamento" con un campo sul catalogo.
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');
const { list } = require('../services/categorie.service');
const { ESSENZIALITA_VALUES, CATEGORIE_DEFAULT } = require('../constants/categorie');

describe('Classificazione essenzialità', () => {
  let app;
  let token;
  let userId;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
  });

  it('ogni categoria predefinita di uscita ha una essenzialita valida', () => {
    const uscite = CATEGORIE_DEFAULT.filter((c) => c.tipo === 'uscita');
    expect(uscite.length).toBeGreaterThan(0);
    uscite.forEach((c) => {
      expect(ESSENZIALITA_VALUES).toContain(c.essenzialita);
    });
  });

  it('le categorie di entrata non hanno essenzialita (non applicabile)', () => {
    const entrate = CATEGORIE_DEFAULT.filter((c) => c.tipo === 'entrata');
    entrate.forEach((c) => expect(c.essenzialita).toBeNull());
  });

  it('affitto è essenziale, svago è discrezionale', () => {
    const affitto = CATEGORIE_DEFAULT.find((c) => c.id === 'affitto' && c.tipo === 'uscita');
    const svago = CATEGORIE_DEFAULT.find((c) => c.id === 'svago' && c.tipo === 'uscita');
    expect(affitto.essenzialita).toBe('essenziale');
    expect(svago.essenzialita).toBe('discrezionale');
  });

  it('una categoria personale di uscita riceve discrezionale come default', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mia categoria', tipo: 'uscita' });

    expect(res.status).toBe(201);
    expect(res.body.categoria.essenzialita).toBe('discrezionale');
  });

  it('una categoria personale di uscita può dichiarare essenziale esplicitamente', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Rata prestito personale', tipo: 'uscita', essenzialita: 'essenziale' });

    expect(res.body.categoria.essenzialita).toBe('essenziale');
  });

  it('una categoria personale di entrata ha essenzialita null indipendentemente dal body', async () => {
    const res = await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Mia entrata', tipo: 'entrata', essenzialita: 'essenziale' });

    expect(res.body.categoria.essenzialita).toBeNull();
  });

  it('list(userId) restituisce essenzialita sia per predefinite sia per personali', async () => {
    await request(app)
      .post('/api/categorie')
      .set(authHeader(token))
      .send({ nome: 'Extra', tipo: 'uscita', essenzialita: 'semi_essenziale' });

    const categorie = await list(userId);
    const predefinita = categorie.find((c) => c.id === 'cibo_spesa' && c.tipo === 'uscita');
    const personale = categorie.find((c) => c.nome === 'Extra');

    expect(predefinita.essenzialita).toBe('essenziale');
    expect(personale.essenzialita).toBe('semi_essenziale');
  });
});
