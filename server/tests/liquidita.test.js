// Liquidità libera = saldo conti attivi - liquidità allocata (obiettivi
// attivi) - impegni pertinenti (ricorrenti mensili non ancora eseguiti).
// Nessun sottoconto reale: e' un overlay di sola lettura sullo stesso saldo.
const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Obiettivo } = require('../models');
const { calcolaLiquidita } = require('../services/liquidita.service');

describe('LiquiditaService.calcolaLiquidita', () => {
  let app;
  let token;
  let userId;
  let conto;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('senza obiettivi né ricorrenti, la liquidità libera coincide col saldo conti', async () => {
    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.saldo_conti).toBe(1000);
    expect(result.liquidita_allocata).toBe(0);
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.liquidita_libera).toBe(1000);
  });

  it('un obiettivo attivo riduce la liquidità libera del suo importo_attuale, uno completato no', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 500, importo_attuale: 200, completato: false,
    });
    await Obiettivo.create({
      user_id: userId, nome: 'Fatto', importo_target: 100, importo_attuale: 100, completato: true,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.liquidita_allocata).toBe(200);
    expect(result.liquidita_libera).toBe(800);
    expect(result.obiettivi_allocati).toHaveLength(1);
    expect(result.obiettivi_allocati[0].nome).toBe('Vacanza');
  });

  it('un ricorrente mensile non ancora scaduto questo mese conta come impegno', async () => {
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 25,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.impegni_pertinenti).toBe(300);
    expect(result.liquidita_libera).toBe(700);
  });

  it('un ricorrente già eseguito questo mese non viene contato due volte', async () => {
    const ricorrente = await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 10,
    });
    // Simula l'esecuzione del cron per il periodo corrente.
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto (automatico)', data: '2026-09-10', ricorrente: false,
      ricorrenza_origine_id: ricorrente.id, ricorrenza_periodo: '2026-09',
    });
    await conto.update({ saldo: 700 }); // il saldo riflette gia' l'addebito

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    expect(result.saldo_conti).toBe(700);
    expect(result.impegni_pertinenti).toBe(0);
    expect(result.liquidita_libera).toBe(700);
  });

  it('un ricorrente il cui giorno è già passato questo mese, ma non ancora eseguito, resta un impegno', async () => {
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 300, categoria: 'affitto',
      descrizione: 'Affitto', data: '2026-01-01', ricorrente: true, ricorrente_frequenza: 'mensile',
      ricorrente_giorno: 5,
    });

    const result = await calcolaLiquidita(userId, { data: '2026-09-17' });
    // Il cron non l'ha ancora eseguito (nessun Movimento con ricorrenza_periodo
    // '2026-09'): resta un impegno anche se il giorno target è passato, perché
    // il saldo del conto non riflette ancora l'addebito.
    expect(result.impegni_pertinenti).toBe(300);
  });

  it('GET /api/conti/liquidita espone lo stesso risultato del service', async () => {
    await Obiettivo.create({
      user_id: userId, nome: 'Vacanza', importo_target: 500, importo_attuale: 150, completato: false,
    });
    const res = await request(app).get('/api/conti/liquidita').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.saldo_conti).toBe(1000);
    expect(res.body.liquidita_allocata).toBe(150);
    expect(res.body.liquidita_libera).toBe(850);
  });
});
