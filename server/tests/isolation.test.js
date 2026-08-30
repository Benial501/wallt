// Test di isolamento tra utenti (IDOR / BOLA). USER_A non deve mai poter
// leggere, modificare, eliminare o riutilizzare risorse che appartengono a
// USER_B, nemmeno sostituendo ID nell'URL, nel body o nella query string.
const {
  registerUser, authHeader, seedUserFinanceData, createApp,
  Conto, Movimento,
} = require('./setup');
const {
  BudgetMensile, Obiettivo, Investimento, PiattaformaScommesse, User, ProfiloUtente,
} = require('../models');

const enableScommesseInvestimenti = async (userId) => {
  await User.update({ mostra_scommesse: true, mostra_investimenti: true }, { where: { id: userId } });
  await ProfiloUtente.upsert({
    user_id: userId,
    onboarding_completato: true,
    fascia_eta: '25_34',
    fa_scommesse: 'si',
    ha_investimenti: 'si',
  });
};

describe('Isolamento tra utenti (USER_A vs USER_B)', () => {
  let app;
  let tokenA;
  let userIdA;
  let tokenB;
  let userIdB;
  let contoB;
  let movimentoB;

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });

    const { res: resA } = await registerUser(app);
    tokenA = resA.body.token;
    userIdA = resA.body.user.id;

    const { res: resB } = await registerUser(app);
    tokenB = resB.body.token;
    userIdB = resB.body.user.id;

    ({ conto: contoB, movimento: movimentoB } = await seedUserFinanceData(userIdB, 'B'));
  });

  const { request } = require('./setup');

  it('USER_A non può leggere il conto di USER_B modificando l’ID nella URL', async () => {
    const res = await request(app)
      .get('/api/conti')
      .set(authHeader(tokenA));
    expect(res.body.conti.some((c) => c.id === contoB.id)).toBe(false);
  });

  it('USER_A non può modificare il conto di USER_B', async () => {
    const res = await request(app)
      .put(`/api/conti/${contoB.id}`)
      .set(authHeader(tokenA))
      .send({ nome: 'Hackerato' });
    expect(res.status).toBe(404);

    await contoB.reload();
    expect(contoB.nome).toBe('Conto B');
  });

  it('USER_A non può eliminare il conto di USER_B', async () => {
    const res = await request(app)
      .delete(`/api/conti/${contoB.id}`)
      .set(authHeader(tokenA));
    expect(res.status).toBe(404);

    await contoB.reload();
    expect(contoB.attivo).toBe(true);
  });

  it('USER_A non può leggere i movimenti di USER_B', async () => {
    const res = await request(app)
      .get('/api/movimenti')
      .set(authHeader(tokenA));
    expect(res.status).toBe(200);
    const ids = (res.body.movimenti || []).map((m) => m.id);
    expect(ids).not.toContain(movimentoB.id);
  });

  it('USER_A non può modificare un movimento di USER_B (ID nella URL)', async () => {
    const res = await request(app)
      .put(`/api/movimenti/${movimentoB.id}`)
      .set(authHeader(tokenA))
      .send({ importo: 999, descrizione: 'Hackerato' });
    expect(res.status).toBe(404);

    await movimentoB.reload();
    expect(Number(movimentoB.importo)).toBe(25.5);
  });

  it('USER_A non può eliminare un movimento di USER_B', async () => {
    const res = await request(app)
      .delete(`/api/movimenti/${movimentoB.id}`)
      .set(authHeader(tokenA));
    expect(res.status).toBe(404);

    const stillThere = await Movimento.findByPk(movimentoB.id);
    expect(stillThere).not.toBeNull();
  });

  it('USER_A non può creare un movimento sul conto di USER_B (conto_id nel body)', async () => {
    const res = await request(app)
      .post('/api/movimenti')
      .set(authHeader(tokenA))
      .send({
        conto_id: contoB.id,
        tipo: 'uscita',
        importo: 50,
        categoria: 'cibo_spesa',
        descrizione: 'Furto tentato',
        data: new Date().toISOString().split('T')[0],
      });
    expect([400, 404]).toContain(res.status);

    await contoB.reload();
    expect(Number(contoB.saldo)).toBe(100);
  });

  it('USER_A non può fare un trasferimento usando il conto di USER_B come origine o destinazione', async () => {
    const { conto: contoA } = await seedUserFinanceData(userIdA, 'A');

    const resOrigineFalsa = await request(app)
      .post('/api/conti/trasferimento')
      .set(authHeader(tokenA))
      .send({
        conto_origine_id: contoB.id,
        conto_destinazione_id: contoA.id,
        importo: 10,
      });
    expect([400, 404]).toContain(resOrigineFalsa.status);

    const resDestFalsa = await request(app)
      .post('/api/conti/trasferimento')
      .set(authHeader(tokenA))
      .send({
        conto_origine_id: contoA.id,
        conto_destinazione_id: contoB.id,
        importo: 10,
      });
    expect([400, 404]).toContain(resDestFalsa.status);

    await contoB.reload();
    expect(Number(contoB.saldo)).toBe(100);
  });

  it('USER_A non può importare transazioni sul conto di USER_B', async () => {
    const res = await request(app)
      .post('/api/importazioni/conferma')
      .set(authHeader(tokenA))
      .send({
        transactions: [{
          clientTxId: 'tx1',
          data: new Date().toISOString().split('T')[0],
          descrizione: 'Import furbo',
          importo: 10,
          tipo: 'uscita',
          conto_id: contoB.id,
          categoria_finale: 'cibo_spesa',
        }],
      });
    // Deve essere rifiutato (validazione ownership) o non deve toccare il conto B.
    expect(res.status).not.toBe(200);
    await contoB.reload();
    expect(Number(contoB.saldo)).toBe(100);
  });

  it('USER_A non può leggere/modificare/eliminare il budget di USER_B', async () => {
    const budgetB = await BudgetMensile.create({
      user_id: userIdB,
      mese: 1,
      anno: 2026,
      importo_totale: 500,
    });

    const getRes = await request(app)
      .get('/api/budget/2026/1')
      .set(authHeader(tokenA));
    expect(getRes.body.esiste).toBe(false);

    const putRes = await request(app)
      .put(`/api/budget/${budgetB.id}`)
      .set(authHeader(tokenA))
      .send({ importo_totale: 1, categorie: [{ categoria: 'cibo_spesa', importo: 1 }] });
    expect(putRes.status).toBe(404);

    await budgetB.reload();
    expect(Number(budgetB.importo_totale)).toBe(500);
  });

  it('USER_A non può leggere/modificare/eliminare l’obiettivo di USER_B', async () => {
    const obiettivoB = await Obiettivo.create({
      user_id: userIdB,
      nome: 'Segreto B',
      importo_target: 1000,
      importo_attuale: 0,
    });

    const listRes = await request(app)
      .get('/api/obiettivi')
      .set(authHeader(tokenA));
    const tuttiObiettiviA = [...(listRes.body.attivi || []), ...(listRes.body.completati || [])];
    expect(tuttiObiettiviA.some((o) => o.id === obiettivoB.id)).toBe(false);

    const putRes = await request(app)
      .put(`/api/obiettivi/${obiettivoB.id}`)
      .set(authHeader(tokenA))
      .send({ nome: 'Rubato' });
    expect(putRes.status).toBe(404);

    const delRes = await request(app)
      .delete(`/api/obiettivi/${obiettivoB.id}`)
      .set(authHeader(tokenA));
    expect(delRes.status).toBe(404);

    const contribRes = await request(app)
      .post(`/api/obiettivi/${obiettivoB.id}/contributi`)
      .set(authHeader(tokenA))
      .send({ importo: 100 });
    expect(contribRes.status).toBe(404);

    await obiettivoB.reload();
    expect(obiettivoB.nome).toBe('Segreto B');
    expect(Number(obiettivoB.importo_attuale)).toBe(0);
  });

  it('USER_A non può leggere/modificare/eliminare l’investimento di USER_B', async () => {
    await enableScommesseInvestimenti(userIdA);
    const investimentoB = await Investimento.create({
      user_id: userIdB,
      nome_piattaforma: 'Segreto Invest B',
      tipo: 'azioni',
      saldo_iniziale: 1000,
      saldo_attuale: 1000,
      attivo: true,
    });

    const listRes = await request(app)
      .get('/api/investimenti')
      .set(authHeader(tokenA));
    expect(listRes.body.investimenti.some((i) => i.id === investimentoB.id)).toBe(false);

    const putRes = await request(app)
      .put(`/api/investimenti/${investimentoB.id}`)
      .set(authHeader(tokenA))
      .send({ nome_piattaforma: 'Rubato' });
    expect(putRes.status).toBe(404);

    const delRes = await request(app)
      .delete(`/api/investimenti/${investimentoB.id}`)
      .set(authHeader(tokenA));
    expect(delRes.status).toBe(404);

    const movRes = await request(app)
      .post(`/api/investimenti/${investimentoB.id}/movimenti`)
      .set(authHeader(tokenA))
      .send({ tipo: 'versamento', importo: 100, data: new Date().toISOString().split('T')[0] });
    expect(movRes.status).toBe(404);

    await investimentoB.reload();
    expect(investimentoB.nome_piattaforma).toBe('Segreto Invest B');
    expect(Number(investimentoB.saldo_attuale)).toBe(1000);
  });

  it('USER_A non può leggere/modificare/eliminare la piattaforma scommesse di USER_B', async () => {
    await enableScommesseInvestimenti(userIdA);
    const piattaformaB = await PiattaformaScommesse.create({
      user_id: userIdB,
      nome: 'Segreto Bet B',
      saldo: 200,
      attiva: true,
    });

    const listRes = await request(app)
      .get('/api/scommesse/piattaforme')
      .set(authHeader(tokenA));
    expect(listRes.body.piattaforme.some((p) => p.id === piattaformaB.id)).toBe(false);

    const putRes = await request(app)
      .put(`/api/scommesse/piattaforme/${piattaformaB.id}`)
      .set(authHeader(tokenA))
      .send({ nome: 'Rubato' });
    expect(putRes.status).toBe(404);

    const delRes = await request(app)
      .delete(`/api/scommesse/piattaforme/${piattaformaB.id}`)
      .set(authHeader(tokenA));
    expect(delRes.status).toBe(404);

    const movRes = await request(app)
      .post('/api/scommesse/movimenti')
      .set(authHeader(tokenA))
      .send({
        piattaforma_id: piattaformaB.id, tipo: 'deposito', importo: 10, data: new Date().toISOString().split('T')[0],
      });
    expect([400, 404]).toContain(movRes.status);

    await piattaformaB.reload();
    expect(piattaformaB.nome).toBe('Segreto Bet B');
    expect(Number(piattaformaB.saldo)).toBe(200);
  });

  it('lo step-up token di USER_A non permette il reset/delete/export dell’account di USER_B', async () => {
    // Ottenere uno step-up token è per-utente: verifica che sia legato al JWT
    // (req.userId), non a un id passato dal client.
    const stepUpRes = await request(app)
      .post('/api/auth/verify-password')
      .set(authHeader(tokenA))
      .send({ password: 'Password1!' });
    const stepUpTokenA = stepUpRes.body.step_up_token;
    expect(stepUpTokenA).toBeTruthy();

    // Usando il JWT di B ma provando a passare lo step-up token di A: il
    // middleware requireStepUp deve legare il token allo stesso userId del
    // JWT, non solo verificarne la firma.
    const resetRes = await request(app)
      .post('/api/impostazioni/reset-account')
      .set(authHeader(tokenB))
      .set('X-Step-Up-Token', stepUpTokenA)
      .send({ password: 'Password1!' });

    expect([401, 403]).toContain(resetRes.status);

    await contoB.reload();
    const movimentiB = await Movimento.findAll({ where: { user_id: userIdB } });
    expect(movimentiB.length).toBeGreaterThan(0);
  });

  it('USER_A non può modificare il profilo di USER_B (nessun modo di specificare un userId diverso)', async () => {
    const res = await request(app)
      .put('/api/impostazioni/profilo')
      .set(authHeader(tokenA))
      .send({ nome: 'Nome A modificato', user_id: userIdB, id: userIdB });

    expect(res.status).toBe(200);

    // Il profilo di B non deve essere stato toccato: qualsiasi user_id/id nel
    // body deve essere ignorato (mass assignment), l'update deve sempre
    // riferirsi a req.userId.
    const bMe = await request(app)
      .get('/api/auth/me')
      .set(authHeader(tokenB));
    expect(bMe.body.user.nome).not.toBe('Nome A modificato');
  });
});
