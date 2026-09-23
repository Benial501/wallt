const { request, createApp, registerUser, authHeader, Conto, Movimento } = require('./setup');
const { processaRicorrenti } = require('../services/ricorrenti.service');

describe('API stati ricorrenza', () => {
  it('sospende, riprende senza arretrati, termina e isola gli utenti', async () => {
    const app = createApp({ enableRateLimit: false });
    const a = await registerUser(app);
    const b = await registerUser(app);
    const userId = a.res.body.user.id;
    const conto = await Conto.create({ user_id: userId, nome: 'Ricorrenti', tipo: 'banca', saldo: 500, attivo: true });
    const origine = await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: 50,
      categoria: 'bollette', descrizione: 'Mensile', data: '2026-01-05',
      ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 5,
    });
    const url = `/api/movimenti/${origine.id}/ricorrenza/stato`;
    const blocked = await request(app).patch(url).set(authHeader(b.res.body.token)).send({ stato: 'sospesa' });
    expect(blocked.status).toBe(404);
    const pause = await request(app).patch(url).set(authHeader(a.res.body.token)).send({ stato: 'sospesa' });
    expect(pause.status).toBe(200);
    await processaRicorrenti(new Date('2026-03-05T12:00:00Z'));
    expect(await Movimento.count({ where: { ricorrenza_origine_id: origine.id } })).toBe(0);
    const resume = await request(app).patch(url).set(authHeader(a.res.body.token)).send({ stato: 'attiva' });
    expect(resume.status).toBe(200);
    await processaRicorrenti(new Date('2026-04-05T12:00:00Z'));
    const generated = await Movimento.findAll({ where: { ricorrenza_origine_id: origine.id } });
    expect(generated.map((m) => m.ricorrenza_periodo)).toEqual(['2026-04']);
    const end = await request(app).patch(url).set(authHeader(a.res.body.token)).send({ stato: 'terminata' });
    expect(end.status).toBe(200);
    const forbidden = await request(app).patch(url).set(authHeader(a.res.body.token)).send({ stato: 'attiva' });
    expect(forbidden.status).toBe(409);
    const invalid = await request(app).patch(url).set(authHeader(a.res.body.token)).send({ stato: 'pausa' });
    expect(invalid.status).toBe(400);
    await processaRicorrenti(new Date('2026-05-05T12:00:00Z'));
    expect(await Movimento.count({ where: { ricorrenza_origine_id: origine.id } })).toBe(1);
  });
});
