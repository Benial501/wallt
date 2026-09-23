const { request, createApp, registerUser, authHeader } = require('./setup');
const { User, ProfiloUtente, Investimento } = require('../models');

const enable = async (userId) => {
  await User.update({ mostra_investimenti: true }, { where: { id: userId } });
  await ProfiloUtente.upsert({ user_id: userId, onboarding_completato: true, fascia_eta: '25_34', ha_investimenti: 'si' });
};

describe('liquidabilità investimenti API', () => {
  it('espone valore e disponibilità, conserva sconosciuto legacy e isola gli utenti', async () => {
    const app = createApp({ enableRateLimit: false });
    const a = await registerUser(app);
    const b = await registerUser(app);
    await enable(a.res.body.user.id);
    await enable(b.res.body.user.id);
    const legacy = await Investimento.create({ user_id: a.res.body.user.id, nome_piattaforma: 'Legacy', tipo: 'etf', saldo_attuale: 100 });
    const list = await request(app).get('/api/investimenti').set(authHeader(a.res.body.token));
    expect(list.body.investimenti.find((i) => i.id === legacy.id).liquidabilita).toBe('sconosciuto');
    const changed = await request(app).put(`/api/investimenti/${legacy.id}`).set(authHeader(a.res.body.token)).send({
      liquidabilita: 'vincolato', condizioni_disponibilita: 'Scadenza contratto', data_apertura: '2025-05-10',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.investimento.valore).toBe(100);
    expect(changed.body.investimento.liquidabilita).toBe('vincolato');
    const blocked = await request(app).put(`/api/investimenti/${legacy.id}`).set(authHeader(b.res.body.token)).send({ liquidabilita: 'liquidabile' });
    expect(blocked.status).toBe(404);
  });
});
