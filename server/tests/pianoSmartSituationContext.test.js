const { createApp, registerUser, Conto, Movimento, request, authHeader } = require('./setup');
const { getFinancialContext } = require('../services/financialContext.service');
const app = createApp({ enableRateLimit: false });
let userId; let conto; let token;
beforeEach(async () => {
  const { res } = await registerUser(app);
  userId = res.body.user.id; token = res.body.token;
  conto = await Conto.create({ user_id: userId, nome: 'Test', tipo: 'banca', saldo: 1000, attivo: true });
});
const movement = (data) => Movimento.create({ user_id: userId, conto_id: conto.id, tipo: 'uscita', categoria: 'altro', importo: 40, descrizione: 'Test', data: '2026-09-01', ...data });

test('scadenze: oggi incluso, mesi corti, stati, addebiti eseguiti e frequenze del cron', async () => {
  const today = await movement({ ricorrente: true, stato_ricorrenza: 'attiva', ricorrente_frequenza: 'mensile', ricorrente_giorno: 25 });
  const paid = await movement({ ricorrente: true, stato_ricorrenza: 'attiva', ricorrente_frequenza: 'mensile', ricorrente_giorno: 27 });
  await movement({ ricorrenza_origine_id: paid.id, ricorrenza_periodo: '2026-09', data: '2026-09-25' });
  await movement({ ricorrente: true, stato_ricorrenza: 'sospesa', ricorrente_frequenza: 'mensile', ricorrente_giorno: 26 });
  await movement({ ricorrente: true, stato_ricorrenza: 'attiva', ricorrente_frequenza: 'mensile', ricorrente_giorno: 31 });
  const weekly = await movement({ ricorrente: true, stato_ricorrenza: 'attiva', ricorrente_frequenza: 'settimanale', ricorrente_giorno: 1 });
  const annual = await movement({ ricorrente: true, stato_ricorrenza: 'attiva', ricorrente_frequenza: 'annuale', ricorrente_giorno: 30, ricorrente_mese: 9 });
  const ctx = await getFinancialContext(userId, { referenceDate: new Date('2026-09-25T12:00:00Z') });
  expect(ctx.recurring.items.map(({ id, dueDate, reserved }) => ({ id, dueDate, reserved }))).toEqual([
    { id: today.id, dueDate: '2026-09-25', reserved: true },
    { id: weekly.id, dueDate: '2026-09-28', reserved: false },
    { id: annual.id, dueDate: '2026-09-30', reserved: true },
  ]);
});

test('ritmo osservato esclude ricorrenti, addebiti generati e date future', async () => {
  await movement({ importo: 25 });
  await movement({ importo: 900, data: '2026-09-30' });
  const recurring = await movement({ importo: 100, ricorrente: true, stato_ricorrenza: 'attiva', ricorrente_frequenza: 'mensile', ricorrente_giorno: 1 });
  await movement({ importo: 100, ricorrenza_origine_id: recurring.id, ricorrenza_periodo: '2026-09' });
  const ctx = await getFinancialContext(userId, { referenceDate: new Date('2026-09-25T12:00:00Z') });
  expect(ctx.expenses.variableCurrentMonth).toBe(25);
  expect(ctx.dataQuality.firstMovementDate).toBe('2026-09-01');
});

test('riepilogo autenticato, isolato e senza scritture', async () => {
  expect((await request(app).get('/api/piano-smart/v2/current-situation')).status).toBe(401);
  const before = await Movimento.count();
  const own = await request(app).get('/api/piano-smart/v2/current-situation').set(authHeader(token));
  expect(own.status).toBe(200);
  expect(own.body.current.liquidity).toBe('1000.00');
  expect(own.body.forecast.endOfMonthAvailable).toBeNull();
  const { res: other } = await registerUser(app);
  const foreign = await request(app).get('/api/piano-smart/v2/current-situation').set(authHeader(other.body.token));
  expect(foreign.body.current.liquidity).toBe('0.00');
  expect(await Movimento.count()).toBe(before);
  expect(Number((await conto.reload()).saldo)).toBe(1000);
});
