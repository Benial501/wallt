// Aggregazioni centralizzate sui debiti: residuo totale, rate mensili
// totali (frequenze diverse convertite a un mensile equivalente) e
// pressione debitoria (rapporto puro, mai un giudizio creditizio).
const {
  request, createApp, registerUser, authHeader,
} = require('./setup');
const { rataMensileEquivalente, calcolaPressioneDebitoria } = require('../services/debiti.service');

describe('rataMensileEquivalente', () => {
  it('mensile: la rata resta invariata', () => {
    expect(rataMensileEquivalente({ rata_periodica: '300', frequenza: 'mensile' })).toBe(300);
  });

  it('settimanale: converte a mensile equivalente (52/12)', () => {
    expect(rataMensileEquivalente({ rata_periodica: '100', frequenza: 'settimanale' }))
      .toBeCloseTo(433.333, 2);
  });

  it('annuale: converte a mensile equivalente (1/12)', () => {
    expect(rataMensileEquivalente({ rata_periodica: '1200', frequenza: 'annuale' })).toBe(100);
  });

  it('unica: non ha un equivalente mensile (pagamento singolo, non ricorrente)', () => {
    expect(rataMensileEquivalente({ rata_periodica: '5000', frequenza: 'unica' })).toBe(0);
  });

  it('nessuna rata: 0, non NaN', () => {
    expect(rataMensileEquivalente({ rata_periodica: null, frequenza: 'mensile' })).toBe(0);
  });
});

describe('calcolaPressioneDebitoria', () => {
  it('rapporto normale', () => {
    expect(calcolaPressioneDebitoria(500, 2000)).toBe(0.25);
  });

  it('reddito affidabile zero: null, non Infinity', () => {
    expect(calcolaPressioneDebitoria(500, 0)).toBeNull();
  });

  it('reddito affidabile negativo: null', () => {
    expect(calcolaPressioneDebitoria(500, -100)).toBeNull();
  });

  it('reddito affidabile sconosciuto (null/undefined): null', () => {
    expect(calcolaPressioneDebitoria(500, null)).toBeNull();
    expect(calcolaPressioneDebitoria(500, undefined)).toBeNull();
  });

  it('nessuna rata mensile: pressione 0, non null (il debito esiste ma non pesa sul mese)', () => {
    expect(calcolaPressioneDebitoria(0, 2000)).toBe(0);
  });
});

describe('GET /api/debiti — aggregazioni', () => {
  let app;
  let token;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
  });

  it('somma il residuo e converte rate di frequenza diversa in un mensile equivalente', async () => {
    await request(app).post('/api/debiti').set(authHeader(token)).send({
      nome: 'Mutuo', saldo_residuo: '100000', rata_periodica: '800', frequenza: 'mensile',
    });
    await request(app).post('/api/debiti').set(authHeader(token)).send({
      nome: 'Prestito auto', saldo_residuo: '5000', rata_periodica: '1200', frequenza: 'annuale',
    });

    const res = await request(app).get('/api/debiti').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.numero_attivi).toBe(2);
    expect(res.body.totale_residuo).toBe(105000);
    expect(res.body.rate_mensili_totali).toBe(900); // 800 + (1200/12)
  });

  it('un debito eliminato (soft-delete) esce dalle aggregazioni', async () => {
    const created = await request(app).post('/api/debiti').set(authHeader(token)).send({
      nome: 'Prestito personale', saldo_residuo: '3000', rata_periodica: '250', frequenza: 'mensile',
    });
    await request(app).delete(`/api/debiti/${created.body.debito.id}`).set(authHeader(token));

    const res = await request(app).get('/api/debiti').set(authHeader(token));
    expect(res.body.numero_attivi).toBe(0);
    expect(res.body.totale_residuo).toBe(0);
    expect(res.body.rate_mensili_totali).toBe(0);
  });

  it('isolamento: le aggregazioni di un utente non includono i debiti di un altro', async () => {
    const other = await registerUser(app);
    await request(app).post('/api/debiti').set(authHeader(other.res.body.token)).send({
      nome: 'Debito altrui', saldo_residuo: '9999', rata_periodica: '500', frequenza: 'mensile',
    });

    const res = await request(app).get('/api/debiti').set(authHeader(token));
    expect(res.body.numero_attivi).toBe(0);
    expect(res.body.totale_residuo).toBe(0);
  });
});
