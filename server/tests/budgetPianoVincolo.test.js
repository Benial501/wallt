// Il piano del budget sta sul profilo, e il database rifiuta un piano che non
// fa 100 o che è a metà: il vincolo è un CHECK, non solo la validazione
// dell'API (Coding Rule 22).
const { registerUser, createApp } = require('./setup');
const { ProfiloUtente } = require('../models');

describe('piano del budget sul profilo', () => {
  let profilo;

  beforeEach(async () => {
    const app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    profilo = await ProfiloUtente.findOne({ where: { user_id: res.body.user.id } });
  });

  it('un profilo nuovo non ha un piano', () => {
    expect(profilo.budget_modello).toBeNull();
    expect(profilo.budget_pct_bisogni).toBeNull();
  });

  it('il piano valido si salva', async () => {
    await profilo.update({
      budget_modello: 'equilibrato', budget_pct_bisogni: 50, budget_pct_desideri: 30, budget_pct_futuro: 20,
    });
    await profilo.reload();
    expect(profilo.budget_modello).toBe('equilibrato');
    expect([profilo.budget_pct_bisogni, profilo.budget_pct_desideri, profilo.budget_pct_futuro]).toEqual([50, 30, 20]);
  });

  it('il database rifiuta una somma diversa da 100', async () => {
    await expect(profilo.update({
      budget_modello: 'personalizzato', budget_pct_bisogni: 50, budget_pct_desideri: 30, budget_pct_futuro: 19,
    })).rejects.toThrow();
  });

  it('il database rifiuta un piano a metà', async () => {
    await expect(profilo.update({ budget_modello: 'equilibrato' })).rejects.toThrow();
  });

  it('il database rifiuta un modello sconosciuto', async () => {
    await expect(profilo.update({
      budget_modello: 'aggressivo', budget_pct_bisogni: 50, budget_pct_desideri: 30, budget_pct_futuro: 20,
    })).rejects.toThrow();
  });

  it('il database rifiuta una percentuale negativa', async () => {
    await expect(profilo.update({
      budget_modello: 'personalizzato', budget_pct_bisogni: 110, budget_pct_desideri: -10, budget_pct_futuro: 0,
    })).rejects.toThrow();
  });
});
